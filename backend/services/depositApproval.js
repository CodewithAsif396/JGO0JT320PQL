const prisma = require('../prismaClient');
const tronWallet = require('./tronWalletService');

// Prevents a deposit's sweep from being kicked off twice concurrently
const _sweepInProgress = new Set();

// Credits a pending_approval deposit to the user's balance and kicks off the
// on-chain sweep to master in the background. Shared by the manual admin
// approve route and the deposit poller's auto-approve path.
async function approveDeposit(depositId, approvedByUserId = null) {
  const deposit = await prisma.deposit.findUnique({
    where: { id: depositId },
    include: { user: { include: { tronWallet: true } } }
  });
  if (!deposit) throw new Error('Deposit not found');
  if (deposit.status !== 'pending_approval') throw new Error('Deposit already processed');
  if (!deposit.user.tronWallet) throw new Error('User has no TRON wallet on record');

  const currency = deposit.currency || 'USDT';
  let creditAmount = deposit.amount;

  if (currency === 'TRX') {
    const trxPriceObj = global.ms ? global.ms.getPrice('TRX/USDT') : { price: 0 };
    const trxPrice = trxPriceObj.price || 0;
    if (trxPrice <= 0) throw new Error('Unable to fetch real-time TRX price');
    creditAmount = deposit.amount * trxPrice;
  }

  await prisma.$transaction([
    prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: 'confirmed', approvedAt: new Date(), approvedBy: approvedByUserId }
    }),
    prisma.user.update({
      where: { id: deposit.userId },
      data: { balance: { increment: creditAmount } }
    })
  ]);

  let notificationMsg = `Your deposit of ${deposit.amount} ${currency} has been credited to your account.`;
  if (currency === 'TRX') {
    notificationMsg = `Your deposit of ${deposit.amount} TRX (~${creditAmount.toFixed(4)} USDT) has been credited to your account.`;
  }
  if (global.ns) await global.ns.send(deposit.userId, 'Deposit Approved', notificationMsg, 'DEPOSIT');

  // Auto-activate + sweep in background (lock prevents concurrent runs)
  if (!_sweepInProgress.has(deposit.id)) {
    _sweepInProgress.add(deposit.id);
    (async () => {
      try {
        const childAddress = deposit.user.tronWallet.tronAddress;
        const derivationIndex = deposit.user.tronWallet.derivationIndex;

        await tronWallet.ensureChildTRX(childAddress, currency !== 'TRX');

        const txid = currency === 'TRX'
          ? await tronWallet.sweepToMaster(derivationIndex)
          : await tronWallet.sweepUSDTToMaster(derivationIndex);

        await prisma.deposit.update({ where: { id: deposit.id }, data: { sweepTxHash: txid, sweepStatus: 'completed' } });
        console.log(`Sweep completed for deposit ${deposit.id} (${currency}): ${txid}`);
      } catch (err) {
        await prisma.deposit.update({ where: { id: deposit.id }, data: { sweepStatus: 'failed', sweepError: err.message } });
        console.error(`Sweep failed for deposit ${deposit.id}:`, err.message);
      } finally {
        _sweepInProgress.delete(deposit.id);
      }
    })();
  }
}

module.exports = { approveDeposit };
