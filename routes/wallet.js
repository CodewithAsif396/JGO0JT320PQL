const express = require('express');
const prisma = require('../prismaClient');
const QRCode = require('qrcode');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');

// ── TRX WALLET ADDRESS + QR CODE ──
router.get('/address', authMiddleware, async (req, res) => {
  try {
    const wallet = await prisma.tronWallet.findUnique({ where: { userId: req.user.userId } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not available. Please complete KYC verification first.' });

    const qr = await QRCode.toDataURL(wallet.tronAddress);
    res.json({ address: wallet.tronAddress, qr_code_base64: qr });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── BALANCE (balance + lockedBalance) ──
router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { balance: true, exchangeBalance: true, tradeBalance: true, perpetualBalance: true, lockedBalance: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ balance: user.balance, exchangeBalance: user.exchangeBalance, tradeBalance: user.tradeBalance, perpetualBalance: user.perpetualBalance, lockedBalance: user.lockedBalance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── TRX DEPOSIT HISTORY ──
router.get('/deposits', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const deposits = await prisma.deposit.findMany({
      where: { userId: req.user.userId },
      orderBy: { detectedAt: 'desc' },
      skip: (page - 1) * 20,
      take: 20
    });
    res.json(deposits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── TRX WITHDRAWAL HISTORY ──
router.get('/withdrawals', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const withdrawals = await prisma.withdrawal.findMany({
      where: { userId: req.user.userId },
      orderBy: { requestedAt: 'desc' },
      skip: (page - 1) * 20,
      take: 20
    });
    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── TRX WITHDRAWAL REQUEST ──
router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.boundAddress) return res.status(400).json({ error: 'Please bind a withdrawal address first' });

    if (user.withdrawFreezeUntil && new Date() < new Date(user.withdrawFreezeUntil)) {
      const remaining = Math.ceil((new Date(user.withdrawFreezeUntil) - new Date()) / 3600000);
      return res.status(403).json({ error: `Withdrawals frozen for ${remaining} more hour(s) after address change.` });
    }
    if (user.balance < amt) return res.status(400).json({ error: 'Insufficient balance' });

    // Lock balance: move from balance → lockedBalance (pending admin approval)
    const [withdrawal] = await prisma.$transaction([
      prisma.withdrawal.create({
        data: {
          userId: req.user.userId,
          toAddress: user.boundAddress,
          amount: amt,
          status: 'pending'
        }
      }),
      prisma.user.update({
        where: { id: req.user.userId },
        data: {
          balance: { decrement: amt },
          lockedBalance: { increment: amt }
        }
      })
    ]);

    if (global.ns) await global.ns.send(req.user.userId, 'Withdrawal Submitted', `Your withdrawal of ${amt} USDT to ${user.boundAddress} is pending admin approval.`, 'WITHDRAWAL');
    res.json(withdrawal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── BIND WITHDRAWAL ADDRESS ──
router.get('/bound-address', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { boundAddress: true, boundAddressChain: true, withdrawFreezeUntil: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      address: user.boundAddress || null,
      chain: user.boundAddressChain || null,
      freezeUntil: user.withdrawFreezeUntil || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bind-address', authMiddleware, async (req, res) => {
  try {
    const { address, chain } = req.body;
    if (!address || address.trim().length < 10) return res.status(400).json({ error: 'Valid wallet address required' });
    const chainType = chain || 'TRC20';
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { boundAddress: address.trim(), boundAddressChain: chainType }
    });
    res.json({ success: true, address: address.trim(), chain: chainType });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/unbind-address', authMiddleware, async (req, res) => {
  try {
    const freezeUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { boundAddress: null, boundAddressChain: null, withdrawFreezeUntil: freezeUntil }
    });
    res.json({ success: true, freezeUntil });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── EXISTING ROUTES (kept for backward compatibility) ──

router.get('/info', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { walletAddresses: true, tronWallet: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const addresses = {};
    user.walletAddresses.forEach(w => { addresses[w.network] = w.address; });
    if (user.tronWallet) {
      addresses['TRC20'] = user.tronWallet.tronAddress;
      addresses['TRX_HD'] = user.tronWallet.tronAddress;
    }
    res.json({
      balance: user.balance,
      exchangeBalance: user.exchangeBalance,
      tradeBalance: user.tradeBalance,
      perpetualBalance: user.perpetualBalance,
      lockedBalance: user.lockedBalance,
      profitBalance: user.profitBalance,
      referralBalance: user.referralBalance,
      email: user.email,
      addresses
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/deposit', authMiddleware, async (req, res) => {
  try {
    const { txHash, amount, network } = req.body;
    if (!txHash || txHash.length < 10) return res.status(400).json({ error: 'Valid transaction hash required' });
    const amt = parseFloat(amount);
    if (!amt || amt < 10) return res.status(400).json({ error: 'Minimum deposit is 10 USDT' });

    const settings = await prisma.platformSettings.findUnique({ where: { key: 'min_deposit' } });
    const minDep = parseFloat(settings?.value || '10');
    if (amt < minDep) return res.status(400).json({ error: `Minimum deposit is ${minDep} USDT` });

    const tx = await prisma.transaction.create({
      data: { userId: req.user.userId, type: 'DEPOSIT', amount: amt, status: 'PENDING', txHash, network: network || 'TRC20' }
    });
    if (global.ns) await global.ns.send(req.user.userId, 'Deposit Received', `Your deposit of ${amt} USDT is under review.`, 'DEPOSIT');
    res.json(tx);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const txs = await prisma.transaction.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * 20,
      take: 20
    });
    res.json(txs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/invest', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const result = await global.ws.invest(req.user.userId, amt);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/wallet/convert — move USDT to convertedBalance (total assets unchanged)
router.post('/convert', authMiddleware, async (req, res) => {
  try {
    const { fromAmount, toAsset, rate } = req.body;
    const amt = parseFloat(fromAmount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (!toAsset || !rate) return res.status(400).json({ error: 'Missing asset or rate' });

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.balance < amt) return res.status(400).json({ error: 'Insufficient balance' });

    const toAmount = (amt / parseFloat(rate)).toFixed(8);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        balance: { decrement: amt },
        convertedBalance: { increment: amt }
      }
    });

    res.json({ success: true, fromAmount: amt, toAmount, toAsset });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── WALLET TRANSFER ──
router.post('/transfer', authMiddleware, async (req, res) => {
  try {
    const { fromWallet, toWallet, amount } = req.body;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const validWallets = ['Exchange', 'Trade', 'Perpetual'];
    if (!validWallets.includes(fromWallet) || !validWallets.includes(toWallet) || fromWallet === toWallet) {
      return res.status(400).json({ error: 'Invalid transfer wallets' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { investmentLocks: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Map wallet names to model fields
    const getField = (w) => {
      if (w === 'Exchange') return 'balance'; // Using balance as exchange balance
      if (w === 'Trade') return 'tradeBalance';
      if (w === 'Perpetual') return 'perpetualBalance';
    };

    const fromField = getField(fromWallet);
    const toField = getField(toWallet);

    if (user[fromField] < amt) return res.status(400).json({ error: 'Insufficient balance in source wallet' });

    let principalAmount = 0;
    let profitAmount = 0;
    let penaltyAmount = 0;
    let actualTransferAmt = amt;

    // Special logic for Trade -> Exchange (Profit vs Principal)
    if (fromWallet === 'Trade' && toWallet === 'Exchange') {
      const lock = user.investmentLocks[0]; // Assuming single active lock for simplicity
      let lockActive = false;
      let penaltyPct = 0;

      if (lock && lock.lockEndDate && new Date() < new Date(lock.lockEndDate)) {
         lockActive = true;
         penaltyPct = lock.penaltyPercentage;
      }

      const totalTrade = user.tradeBalance;
      const profit = user.profitBalance;
      const principal = Math.max(0, totalTrade - profit);

      if (amt <= profit) {
        // Only transferring profit
        profitAmount = amt;
      } else {
        // Transferring profit + some principal
        profitAmount = profit;
        principalAmount = amt - profit;
      }

      if (lockActive && principalAmount > 0) {
        penaltyAmount = principalAmount * (penaltyPct / 100);
        actualTransferAmt = amt - penaltyAmount;
      }
      
      // Update profitBalance if we withdrew profit
      if (profitAmount > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: { profitBalance: { decrement: profitAmount } }
        });
      }
    }
    
    // Special logic for Exchange -> Trade (Creating/Updating InvestmentLock)
    if (fromWallet === 'Exchange' && toWallet === 'Trade') {
      const lockDaysSetting = await prisma.platformSettings.findUnique({ where: { key: 'withdrawal_lock_days' } });
      const penaltyPctSetting = await prisma.platformSettings.findUnique({ where: { key: 'withdrawal_penalty_pct' } });
      const lockDays = parseInt(lockDaysSetting?.value || '35');
      const penaltyPct = parseFloat(penaltyPctSetting?.value || '20');

      if (lockDays > 0) {
        const lockEndDate = new Date();
        lockEndDate.setDate(lockEndDate.getDate() + lockDays);
        
        await prisma.investmentLock.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            principalLocked: amt,
            lockStartDate: new Date(),
            lockEndDate: lockEndDate,
            penaltyPercentage: penaltyPct,
            remainingLockedPrincipal: amt
          },
          update: {
            principalLocked: { increment: amt },
            remainingLockedPrincipal: { increment: amt },
            lockEndDate: lockEndDate, // Reset lock duration on new deposit
            penaltyPercentage: penaltyPct
          }
        });
      }
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          [fromField]: { decrement: amt },
          [toField]: { increment: actualTransferAmt }
        }
      }),
      prisma.walletTransferLog.create({
        data: {
          userId: user.id,
          fromWallet,
          toWallet,
          amount: amt,
          transferType: `${fromWallet}_TO_${toWallet}`,
          principalAmount,
          profitAmount,
          penaltyAmount
        }
      })
    ]);

    res.json({ success: true, actualTransferAmt, penaltyAmount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
