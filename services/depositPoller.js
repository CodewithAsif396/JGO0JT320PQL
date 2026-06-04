const https = require('https');
const { PrismaClient } = require('@prisma/client');
const { TronWeb } = require('tronweb');

const prisma = new PrismaClient();

// USDT TRC20 contract addresses
const USDT_CONTRACT = {
  mainnet: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  shasta: 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs'
};

class DepositPoller {
  constructor() {
    this.polling = false;
    this.network = process.env.TRON_NETWORK || 'shasta';
    this.apiKey = process.env.TRON_API_KEY;
    this.baseHost = this.network === 'mainnet' ? 'api.trongrid.io' : 'api.shasta.trongrid.io';
    this.usdtContract = process.env.USDT_CONTRACT_ADDRESS || USDT_CONTRACT[this.network] || USDT_CONTRACT.mainnet;
  }

  start() {
    const intervalMs = parseInt(process.env.DEPOSIT_POLL_INTERVAL_MS) || 600000; // 10 minutes default
    setTimeout(() => {
      this.poll();
      setInterval(() => this.poll(), intervalMs);
    }, 10000);
    console.log(`Deposit poller started — checking every ${intervalMs / 1000}s on ${this.network}`);
  }

  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const wallets = await prisma.tronWallet.findMany({
        select: { userId: true, tronAddress: true, derivationIndex: true }
      });
      for (const wallet of wallets) {
        await this.checkAddressTRC20(wallet).catch(err =>
          console.error(`TRC20 poller error for ${wallet.tronAddress}:`, err.message)
        );
        
        // Sleep between requests to avoid 429 Too Many Requests limits (burst)
        await new Promise(resolve => setTimeout(resolve, 500));

        await this.checkAddressTRX(wallet).catch(err =>
          console.error(`TRX poller error for ${wallet.tronAddress}:`, err.message)
        );

        // Sleep between wallets to stretch out the checks over time safely
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } finally {
      this.polling = false;
    }
  }

  // ── TRC20 USDT deposits ────────────────────────────────────────────────────
  checkAddressTRC20(wallet) {
    return new Promise((resolve) => {
      const path = `/v1/accounts/${wallet.tronAddress}/transactions/trc20?limit=20&only_confirmed=true&contract_address=${this.usdtContract}`;
      const options = {
        hostname: this.baseHost,
        path,
        method: 'GET',
        headers: { 'TRON-PRO-API-KEY': this.apiKey, 'Accept': 'application/json' }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', async () => {
          try {
            if (res.statusCode !== 200) return resolve();
            const parsed = JSON.parse(body);
            if (!Array.isArray(parsed.data)) return resolve();
            for (const tx of parsed.data) {
              await this.processTRC20Tx(tx, wallet);
            }
          } catch {
            // Ignore parse errors
          } finally {
            resolve();
          }
        });
      });

      req.on('error', () => resolve());
      req.setTimeout(10000, () => { req.destroy(); resolve(); });
      req.end();
    });
  }

  async processTRC20Tx(tx, wallet) {
    // Only incoming transfers to this address
    if (tx.to !== wallet.tronAddress) return;
    if (tx.type !== 'Transfer') return;

    const txHash = tx.transaction_id;
    if (!txHash) return;

    const decimals = tx.token_info?.decimals ?? 6;
    const amountUsdt = parseInt(tx.value || '0') / Math.pow(10, decimals);
    if (amountUsdt <= 0) return;

    const fromAddress = tx.from;
    const symbol = tx.token_info?.symbol || 'USDT';

    // Idempotent: skip if already recorded
    const existing = await prisma.deposit.findUnique({ where: { txHash } });
    if (existing) return;

    await prisma.deposit.create({
      data: {
        userId: wallet.userId,
        txHash,
        fromAddress,
        amount: amountUsdt,
        currency: symbol || 'USDT',
        status: 'pending_approval',
        sweepStatus: 'pending'
      }
    });

    if (global.ns) {
      await global.ns.send(
        wallet.userId,
        'Deposit Detected',
        `We detected ${amountUsdt} ${symbol} sent to your wallet. Awaiting admin approval.`,
        'DEPOSIT'
      );
    }

    console.log(`[DepositPoller] New TRC20 deposit: ${amountUsdt} ${symbol} | user ${wallet.userId} | tx ${txHash}`);
  }

  // ── Native TRX deposits ────────────────────────────────────────────────────
  checkAddressTRX(wallet) {
    return new Promise((resolve) => {
      const path = `/v1/accounts/${wallet.tronAddress}/transactions?limit=20&only_confirmed=true&order_by=block_timestamp,desc`;
      const options = {
        hostname: this.baseHost,
        path,
        method: 'GET',
        headers: { 'TRON-PRO-API-KEY': this.apiKey, 'Accept': 'application/json' }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', async () => {
          try {
            if (res.statusCode !== 200) return resolve();
            const parsed = JSON.parse(body);
            if (!Array.isArray(parsed.data)) return resolve();
            for (const tx of parsed.data) {
              await this.processTRXTx(tx, wallet);
            }
          } catch {
            // Ignore parse errors
          } finally {
            resolve();
          }
        });
      });

      req.on('error', () => resolve());
      req.setTimeout(10000, () => { req.destroy(); resolve(); });
      req.end();
    });
  }

  async processTRXTx(tx, wallet) {
    if (!tx.ret || tx.ret[0]?.contractRet !== 'SUCCESS') return;

    const contract = tx.raw_data?.contract?.[0];
    if (contract?.type !== 'TransferContract') return;

    const value = contract.parameter?.value;
    if (!value || !value.to_address || !value.owner_address || !value.amount) return;

    const toAddress = TronWeb.address.fromHex(value.to_address);
    if (toAddress !== wallet.tronAddress) return;

    const txHash = tx.txID;
    const amountTrx = value.amount / 1_000_000;
    const fromAddress = TronWeb.address.fromHex(value.owner_address);

    const existing = await prisma.deposit.findUnique({ where: { txHash } });
    if (existing) return;

    await prisma.deposit.create({
      data: {
        userId: wallet.userId,
        txHash,
        fromAddress,
        amount: amountTrx,
        currency: 'TRX',
        status: 'pending_approval',
        sweepStatus: 'pending'
      }
    });

    if (global.ns) {
      await global.ns.send(
        wallet.userId,
        'Deposit Detected',
        `We detected ${amountTrx} TRX sent to your wallet. Awaiting admin approval.`,
        'DEPOSIT'
      );
    }

    console.log(`[DepositPoller] New TRX deposit: ${amountTrx} TRX | user ${wallet.userId} | tx ${txHash}`);
  }
}

module.exports = DepositPoller;
