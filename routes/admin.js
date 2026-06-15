const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = require('../prismaClient');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');
const tronWallet = require('../services/tronWalletService');

const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  next();
};

const _sweepInProgress = new Set();

// ── USERS ──
router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { search, page = 1 } = req.query;
    const where = search ? { email: { contains: search } } : {};
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { kycData: true, walletAddresses: true, tronWallet: true },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * 20,
        take: 20
      }),
      prisma.user.count({ where })
    ]);
    res.json({ users, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        kycData: true,
        walletAddresses: true,
        tronWallet: true,
        transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
        deposits: { orderBy: { detectedAt: 'desc' }, take: 20 },
        withdrawals: { orderBy: { requestedAt: 'desc' }, take: 20 },
        balanceAdjustments: { orderBy: { createdAt: 'desc' }, take: 20 },
        trades: { include: { signal: true }, orderBy: { createdAt: 'desc' }, take: 20 },
        loginHistory: { orderBy: { createdAt: 'desc' }, take: 10 },
        referrals: { select: { id: true, email: true, balance: true, investments: true, createdAt: true } },
        referredBy: { select: { id: true, email: true } }
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/balance', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { amount, type = 'set', field = 'balance' } = req.body;
    const val = parseFloat(amount);
    if (isNaN(val)) return res.status(400).json({ error: 'Invalid amount' });
    const allowedFields = ['balance', 'profitBalance', 'referralBalance'];
    if (!allowedFields.includes(field)) return res.status(400).json({ error: 'Invalid field' });
    const data = type === 'increment' ? { [field]: { increment: val } } : { [field]: val };
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json({ success: true, balance: user.balance, profitBalance: user.profitBalance, referralBalance: user.referralBalance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/suspend', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { suspended: true, suspendedReason: reason || 'Suspended by admin' }
    });
    if (global.ns) await global.ns.send(user.id, 'Account Suspended', reason || 'Your account has been suspended. Contact support.', 'SYSTEM');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/unsuspend', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { suspended: false, suspendedReason: null } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/reset-password', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.params.id }, data: { password: hashed } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    await prisma.$transaction([
      prisma.loginHistory.deleteMany({ where: { userId } }),
      prisma.walletAddress.deleteMany({ where: { userId } }),
      prisma.tronWallet.deleteMany({ where: { userId } }),
      prisma.deposit.deleteMany({ where: { userId } }),
      prisma.withdrawal.deleteMany({ where: { userId } }),
      prisma.balanceAdjustment.deleteMany({ where: { userId } }),
      prisma.trade.deleteMany({ where: { userId } }),
      prisma.kYC.deleteMany({ where: { userId } }),
      prisma.transaction.deleteMany({ where: { userId } }),
      prisma.notification.deleteMany({ where: { userId } }),
      prisma.chatMessage.deleteMany({ where: { userId } }),
      prisma.investment.deleteMany({ where: { userId } }),
      prisma.walletTransferLog.deleteMany({ where: { userId } }),
      prisma.investmentLock.deleteMany({ where: { userId } }),
      prisma.user.updateMany({ where: { referredById: userId }, data: { referredById: null } }),
      prisma.signal.updateMany({ where: { targetUserId: userId }, data: { targetUserId: null } }),
      prisma.user.delete({ where: { id: userId } })
    ]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── BALANCE ADJUSTMENTS ──
router.post('/balance/adjust', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { user_id, amount, type, reason, walletDestination = "Exchange" } = req.body;
    if (!user_id || !amount || !type || !reason) return res.status(400).json({ error: 'user_id, amount, type, reason are required' });
    if (!['credit', 'debit'].includes(type)) return res.status(400).json({ error: 'type must be credit or debit' });
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const user = await prisma.user.findUnique({ where: { id: user_id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    let targetField = 'balance';
    if (walletDestination === 'Trade') targetField = 'tradeBalance';
    if (walletDestination === 'Perpetual') targetField = 'perpetualBalance';
    
    if (type === 'debit' && user[targetField] < val) return res.status(400).json({ error: 'Insufficient balance to debit' });

    const balanceDelta = type === 'credit' ? val : -val;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user_id },
        data: { [targetField]: { increment: balanceDelta } }
      }),
      prisma.balanceAdjustment.create({
        data: { userId: user_id, adminId: req.user.userId, amount: val, type, reason }
      })
    ]);

    if (global.ns) {
      const msg = type === 'credit'
        ? `${val} TRX has been credited to your account. Reason: ${reason}`
        : `${val} TRX has been debited from your account. Reason: ${reason}`;
      await global.ns.send(user_id, `Balance ${type === 'credit' ? 'Credited' : 'Debited'}`, msg, 'SYSTEM');
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/balance/adjustments', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const [items, total] = await Promise.all([
      prisma.balanceAdjustment.findMany({
        include: {
          user: { select: { email: true, id: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * 50,
        take: 50
      }),
      prisma.balanceAdjustment.count()
    ]);
    res.json({ items, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── TRANSACTIONS (legacy) ──
router.get('/transactions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status = 'PENDING', page = 1, type } = req.query;
    const where = { status };
    if (type) where.type = type;
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { user: { select: { email: true, id: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * 20,
        take: 20
      }),
      prisma.transaction.count({ where })
    ]);
    res.json({ transactions, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/transactions/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const transaction = await prisma.transaction.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    if (transaction.status !== 'PENDING') return res.status(400).json({ error: 'Transaction already processed' });

    if (transaction.type === 'DEPOSIT') {
      await prisma.$transaction([
        prisma.transaction.update({ where: { id: req.params.id }, data: { status: 'COMPLETED' } }),
        prisma.user.update({ where: { id: transaction.userId }, data: { balance: { increment: transaction.amount } } })
      ]);
      const user = transaction.user;
      if (transaction.amount >= 300 && user.referredById) {
        const settings = await prisma.platformSettings.findUnique({ where: { key: 'referral_percentage' } });
        const pct = parseFloat(settings?.value || '5') / 100;
        const commission = transaction.amount * pct;
        await prisma.$transaction([
          prisma.user.update({ where: { id: user.referredById }, data: { balance: { increment: commission }, referralBalance: { increment: commission } } }),
          prisma.transaction.create({ data: { userId: user.referredById, type: 'REFERRAL_COMMISSION', amount: commission, status: 'COMPLETED', note: `Referral from ${user.email}` } })
        ]);
        if (global.ns) await global.ns.send(user.referredById, 'Referral Bonus!', `You earned ${commission.toFixed(2)} commission from ${user.email}.`, 'REFERRAL');
      }
      if (global.ns) await global.ns.send(transaction.userId, 'Deposit Approved', `Your deposit of ${transaction.amount} has been credited.`, 'DEPOSIT');
    } else if (transaction.type === 'WITHDRAWAL') {
      await prisma.transaction.update({ where: { id: req.params.id }, data: { status: 'COMPLETED' } });
      if (global.ns) await global.ns.send(transaction.userId, 'Withdrawal Approved', `Your withdrawal of ${transaction.amount} has been processed.`, 'WITHDRAWAL');
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/transactions/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const transaction = await prisma.transaction.findUnique({ where: { id: req.params.id } });
    if (!transaction) return res.status(404).json({ error: 'Not found' });
    if (transaction.status !== 'PENDING') return res.status(400).json({ error: 'Already processed' });
    await prisma.transaction.update({ where: { id: req.params.id }, data: { status: 'FAILED', note: reason } });
    if (transaction.type === 'WITHDRAWAL') {
      await prisma.user.update({ where: { id: transaction.userId }, data: { balance: { increment: transaction.amount } } });
    }
    if (global.ns) await global.ns.send(transaction.userId, `${transaction.type} Rejected`, reason || `Your ${transaction.type.toLowerCase()} was rejected.`, transaction.type);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 📋 PENALTIES 📋
router.get('/penalties', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const [data, total] = await Promise.all([
      prisma.walletTransferLog.findMany({
        where: { penaltyAmount: { gt: 0 } },
        include: { user: { select: { email: true, id: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20
      }),
      prisma.walletTransferLog.count({
        where: { penaltyAmount: { gt: 0 } }
      })
    ]);
    res.json({ data, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 💰 TRON DEPOSITS 💰──
router.get('/deposits', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, status = 'pending_approval' } = req.query;
    const where = status === 'all' ? { status: { not: 'deleted' } } : { status };
    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where,
        include: { user: { select: { email: true, id: true } } },
        orderBy: { detectedAt: 'desc' },
        skip: (parseInt(page) - 1) * 20,
        take: 20
      }),
      prisma.deposit.count({ where })
    ]);
    res.json({ deposits, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/deposits/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const where = { status: 'pending_approval' };
    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where,
        include: { user: { select: { email: true, id: true } } },
        orderBy: { detectedAt: 'desc' },
        skip: (parseInt(page) - 1) * 20,
        take: 20
      }),
      prisma.deposit.count({ where })
    ]);
    res.json({ deposits, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/deposits/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const deposit = await prisma.deposit.findUnique({
      where: { id: req.params.id },
      include: { user: { include: { tronWallet: true } } }
    });
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    if (deposit.status !== 'pending_approval') return res.status(400).json({ error: 'Deposit already processed' });
    if (!deposit.user.tronWallet) return res.status(400).json({ error: 'User has no TRON wallet on record' });

    // Credit user balance
    const currency = deposit.currency || 'USDT';
    let creditAmount = deposit.amount;
    
    if (currency === 'TRX') {
      const trxPriceObj = global.ms ? global.ms.getPrice('TRX/USDT') : { price: 0 };
      const trxPrice = trxPriceObj.price || 0;
      if (trxPrice <= 0) {
        return res.status(400).json({ error: 'Unable to fetch real-time TRX price. Please try again later.' });
      }
      creditAmount = deposit.amount * trxPrice;
    }

    await prisma.$transaction([
      prisma.deposit.update({
        where: { id: deposit.id },
        data: { status: 'confirmed', approvedAt: new Date(), approvedBy: req.user.userId }
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
          const currency = deposit.currency || 'USDT';

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

    res.json({ success: true, message: 'Deposit approved and sweep initiated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/deposits/:id/retry-sweep', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const deposit = await prisma.deposit.findUnique({
      where: { id: req.params.id },
      include: { user: { include: { tronWallet: true } } }
    });
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    if (!deposit.user.tronWallet) return res.status(400).json({ error: 'User has no TRON wallet' });

    await prisma.deposit.update({ where: { id: deposit.id }, data: { sweepStatus: 'pending', sweepError: null } });

    if (!_sweepInProgress.has(deposit.id)) {
      _sweepInProgress.add(deposit.id);
      (async () => {
        try {
          const childAddress = deposit.user.tronWallet.tronAddress;
          const derivationIndex = deposit.user.tronWallet.derivationIndex;
          const currency = deposit.currency || 'USDT';

          await tronWallet.ensureChildTRX(childAddress, currency !== 'TRX');
          const txid = currency === 'TRX'
            ? await tronWallet.sweepToMaster(derivationIndex)
            : await tronWallet.sweepUSDTToMaster(derivationIndex);

          await prisma.deposit.update({ where: { id: deposit.id }, data: { sweepTxHash: txid, sweepStatus: 'completed' } });
          console.log(`Retry sweep completed for deposit ${deposit.id}: ${txid}`);
        } catch (err) {
          await prisma.deposit.update({ where: { id: deposit.id }, data: { sweepStatus: 'failed', sweepError: err.message } });
          console.error(`Retry sweep failed for deposit ${deposit.id}:`, err.message);
        } finally {
          _sweepInProgress.delete(deposit.id);
        }
      })();
    }

    res.json({ success: true, message: 'Sweep retry initiated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/deposits/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const deposit = await prisma.deposit.findUnique({ where: { id: req.params.id } });
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    if (deposit.status !== 'pending_approval') return res.status(400).json({ error: 'Deposit already processed' });

    await prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: 'rejected', rejectionReason: reason || 'Rejected by admin', approvedBy: req.user.userId }
    });

    if (global.ns) await global.ns.send(deposit.userId, 'Deposit Rejected', reason || 'Your deposit was rejected. Please contact support.', 'DEPOSIT');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/deposits/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const deposit = await prisma.deposit.findUnique({ where: { id: req.params.id } });
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    
    await prisma.deposit.update({ where: { id: deposit.id }, data: { status: 'deleted' } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── TRON WITHDRAWALS ──
router.get('/withdrawals', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, status = 'pending' } = req.query;
    const where = status === 'all' ? {} : { status };
    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        include: { user: { select: { email: true, id: true } } },
        orderBy: { requestedAt: 'desc' },
        skip: (parseInt(page) - 1) * 20,
        take: 20
      }),
      prisma.withdrawal.count({ where })
    ]);
    res.json({ withdrawals, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/withdrawals/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const where = { status: 'pending' };
    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        include: { user: { select: { email: true, id: true } } },
        orderBy: { requestedAt: 'desc' },
        skip: (parseInt(page) - 1) * 20,
        take: 20
      }),
      prisma.withdrawal.count({ where })
    ]);
    res.json({ withdrawals, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/withdrawals/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id: req.params.id },
      include: { user: true }
    });
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ error: 'Withdrawal already processed' });

    // Admin has manually sent funds. We just deduct the locked balance.
    await prisma.$transaction([
      prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: 'completed', txHash: 'Manual-Transfer', processedAt: new Date(), processedBy: req.user.userId }
      }),
      prisma.user.update({
        where: { id: withdrawal.userId },
        data: { lockedBalance: { decrement: withdrawal.amount } }
      })
    ]);

    if (global.ns) await global.ns.send(withdrawal.userId, 'Withdrawal Completed', `Your withdrawal of ${withdrawal.amount} USDT has been manually approved and sent.`, 'WITHDRAWAL');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/withdrawals/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const withdrawal = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ error: 'Withdrawal already processed' });

    await prisma.$transaction([
      prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: 'rejected', rejectionReason: reason || 'Rejected by admin', processedAt: new Date(), processedBy: req.user.userId }
      }),
      prisma.user.update({
        where: { id: withdrawal.userId },
        data: {
          balance: { increment: withdrawal.amount },
          lockedBalance: { decrement: withdrawal.amount }
        }
      })
    ]);

    if (global.ns) await global.ns.send(withdrawal.userId, 'Withdrawal Rejected', reason || 'Your withdrawal request was rejected. Funds have been returned.', 'WITHDRAWAL');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── SIGNALS ──
router.get('/signals', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const fifteenHoursAgo = new Date(Date.now() - 15 * 60 * 60 * 1000);
    const signals = await prisma.signal.findMany({
      where: {
        OR: [
          { status: { in: ['PENDING', 'ACTIVE'] } },
          { createdAt: { gte: fifteenHoursAgo } }
        ]
      },
      include: { _count: { select: { trades: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(signals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/bulk-signals/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await prisma.platformSettings.findMany({
      where: { key: { in: ['tier1_min', 'tier2_min', 'tier3_min', 'tier4_min'] } }
    });
    const map = {};
    rows.forEach(r => { map[r.key] = parseFloat(r.value); });
    const t1 = map['tier1_min'] ?? 500;
    const t2 = map['tier2_min'] ?? 1000;
    const t3 = map['tier3_min'] ?? 1500;
    const t4 = map['tier4_min'] ?? 2000;

    const users = await prisma.user.findMany({
      select: { id: true, email: true, balance: true, tradeBalance: true, perpetualBalance: true }
    });
    
    const tiers = { t1: [], t2: [], t3: [], t4: [], t0: [] };
    users.forEach(u => {
      const tot = (u.balance||0) + (u.tradeBalance||0) + (u.perpetualBalance||0);
      if (tot >= t4) tiers.t4.push(u);
      else if (tot >= t3) tiers.t3.push(u);
      else if (tot >= t2) tiers.t2.push(u);
      else if (tot >= t1) tiers.t1.push(u);
      else tiers.t0.push(u);
    });

    res.json({ tiers, thresholds: { t1, t2, t3, t4 } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/signals', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!global.ss) return res.status(500).json({ error: 'Signal service not ready' });
    const body = { ...req.body };
    
    if (body.targetUserIds && Array.isArray(body.targetUserIds) && body.targetUserIds.length > 0) {
      const userIds = body.targetUserIds;
      delete body.targetUserIds;
      delete body.targetEmail;
      const createdSignals = [];
      for (const uid of userIds) {
        const sigBody = { ...body, targetUserId: uid };
        const signal = await global.ss.createSignal(sigBody);
        createdSignals.push(signal);
      }
      return res.json({ success: true, count: createdSignals.length, signals: createdSignals });
    }

    if (body.targetEmail) {
      const target = await prisma.user.findUnique({ where: { email: body.targetEmail.trim() } });
      if (!target) return res.status(404).json({ error: `No user found with email: ${body.targetEmail}` });
      body.targetUserId = target.id;
      delete body.targetEmail;
    }
    const signal = await global.ss.createSignal(body);
    res.json(signal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/signals/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const signal = await prisma.signal.findUnique({ where: { id: req.params.id } });
    if (!signal) return res.status(404).json({ error: 'Signal not found' });

    if (global.ss) global.ss.cancelSignal(req.params.id);
    
    // Preserve pair and duration for user trade history
    await prisma.trade.updateMany({ 
      where: { signalId: req.params.id }, 
      data: { signalId: null, pair: signal.pair, duration: signal.duration } 
    });
    
    await prisma.signal.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/admin/signals/:id/result — force WIN or LOSS outcome before signal completes
router.patch('/signals/:id/result', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { result } = req.body;
    if (!['WIN', 'LOSS'].includes(result)) return res.status(400).json({ error: 'result must be WIN or LOSS' });
    const signal = await prisma.signal.update({
      where: { id: req.params.id },
      data: { result }
    });
    res.json(signal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/signals/analytics — hit/miss stats and participation
router.get('/signals/analytics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [totalSignals, totalTrades, wins, losses, activeSignals, totalUsers] = await Promise.all([
      prisma.signal.count(),
      prisma.trade.count(),
      prisma.trade.count({ where: { outcome: 'WIN' } }),
      prisma.trade.count({ where: { outcome: 'LOSS' } }),
      prisma.signal.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { balance: { gte: 300 } } })
    ]);
    const winRate = 98;
    res.json({ totalSignals, totalTrades, wins, losses, winRate, activeSignals, eligibleUsers: totalUsers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── NOTIFICATIONS ──
router.post('/notify', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userIds, title, message, type = 'ADMIN' } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Title and message required' });
    let targets = userIds;
    if (!targets || targets === 'all') {
      const users = await prisma.user.findMany({ select: { id: true } });
      targets = users.map(u => u.id);
    }
    await Promise.all(targets.map(id => global.ns?.send(id, title, message, type)));
    res.json({ success: true, sent: targets.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── SETTINGS ──
router.get('/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await prisma.platformSettings.findMany();
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    res.json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const updates = req.body;
    await Promise.all(Object.entries(updates).map(([key, value]) =>
      prisma.platformSettings.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      })
    ));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DASHBOARD ──
router.get('/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [
      totalUsers,
      totalDeposits,
      totalWithdrawals,
      pendingTxs,
      activeSignals,
      totalTrades,
      recentUsers,
      pendingDeposits,
      pendingWithdrawals,
      pendingKycs,
      recentTransactions,
      activeSignalsList,
      activeUsers
    ] = await Promise.all([
      prisma.user.count(),
      prisma.deposit.aggregate({ where: { status: 'confirmed' }, _sum: { amount: true } }),
      prisma.withdrawal.aggregate({ where: { status: 'completed' }, _sum: { amount: true } }),
      prisma.transaction.count({ where: { status: 'PENDING' } }),
      prisma.signal.count({ where: { status: { in: ['ACTIVE', 'PENDING'] } } }),
      prisma.trade.count(),
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 7, select: { createdAt: true } }),
      prisma.deposit.count({ where: { status: 'pending_approval' } }),
      prisma.withdrawal.count({ where: { status: 'pending' } }),
      prisma.kYC.count({ where: { status: 'PENDING' } }),
      prisma.transaction.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { user: { select: { email: true } } } }),
      prisma.signal.findMany({ where: { status: { in: ['ACTIVE', 'PENDING'] } }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.user.count({ where: { OR: [{ balance: { gt: 0 } }, { tradeBalance: { gt: 0 } }, { perpetualBalance: { gt: 0 } }] } })
    ]);

    const inactiveUsers = totalUsers - activeUsers;

    res.json({
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalDeposits: totalDeposits._sum.amount || 0,
      totalWithdrawals: totalWithdrawals._sum.amount || 0,
      pendingTxs,
      activeSignals,
      totalTrades,
      recentUsers,
      pendingDeposits,
      pendingWithdrawals,
      pendingKycs,
      recentTransactions,
      activeSignalsList
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── ANALYTICS / DASHBOARD ──
router.get('/analytics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [
      totalUsers,
      totalDeposits,
      totalWithdrawals,
      pendingTxs,
      activeSignals,
      totalTrades,
      recentUsers,
      pendingDeposits,
      pendingWithdrawals,
      pendingKycs,
      activeUsers
    ] = await Promise.all([
      prisma.user.count(),
      prisma.deposit.aggregate({ where: { status: 'confirmed' }, _sum: { amount: true } }),
      prisma.withdrawal.aggregate({ where: { status: 'completed' }, _sum: { amount: true } }),
      prisma.transaction.count({ where: { status: 'PENDING' } }),
      prisma.signal.count({ where: { status: { in: ['ACTIVE', 'PENDING'] } } }),
      prisma.trade.count(),
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 7, select: { createdAt: true } }),
      prisma.deposit.count({ where: { status: 'pending_approval' } }),
      prisma.withdrawal.count({ where: { status: 'pending' } }),
      prisma.kYC.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { OR: [{ balance: { gt: 0 } }, { tradeBalance: { gt: 0 } }, { perpetualBalance: { gt: 0 } }] } })
    ]);

    const inactiveUsers = totalUsers - activeUsers;

    let masterBalance = null;
    try {
      masterBalance = await Promise.race([
        tronWallet.getMasterBalance(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
      ]);
    } catch {}

    res.json({
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalDeposits: totalDeposits._sum.amount || 0,
      totalWithdrawals: totalWithdrawals._sum.amount || 0,
      pendingTxs,
      activeSignals,
      totalTrades,
      recentUsers,
      pendingDeposits,
      pendingWithdrawals,
      pendingKycs,
      masterBalance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── REFERRALS ──
router.get('/referrals', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { referredById: { not: null } },
      include: {
        referredBy: { select: { email: true, id: true } },
        transactions: { where: { type: 'DEPOSIT', status: 'COMPLETED' }, select: { amount: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── INVESTMENTS ──
router.get('/investments', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const investments = await prisma.investment.findMany({
      include: { user: { select: { email: true, id: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(investments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── KYC MANAGEMENT ──
router.get('/kyc', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status = 'PENDING' } = req.query;
    const where = status === 'ALL' ? {} : { status };
    const kycs = await prisma.kYC.findMany({
      where,
      include: { user: { select: { email: true, id: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(kycs);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ── STEP 6: KYC APPROVE — HOOK: wallet creation ──
router.post('/kyc/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const kyc = await prisma.kYC.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', rejectReason: null }
    });

    // Derive and save TRON wallet if user doesn't have one yet
    const existing = await prisma.tronWallet.findUnique({ where: { userId: kyc.userId } });
    if (!existing) {
      // Get next available derivation index (max + 1, minimum 1)
      const last = await prisma.tronWallet.findFirst({ orderBy: { derivationIndex: 'desc' } });
      const nextIndex = last ? last.derivationIndex + 1 : 1;

      const { address } = await tronWallet.deriveChildWallet(nextIndex);

      await prisma.tronWallet.create({
        data: { userId: kyc.userId, tronAddress: address, derivationIndex: nextIndex }
      });

      console.log(`TRON wallet created for user ${kyc.userId}: ${address} (index ${nextIndex})`);
    }

    if (global.ns) await global.ns.send(kyc.userId, 'KYC Approved', 'Your identity verification has been approved! Your TRX deposit address is now available.', 'SYSTEM');
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/kyc/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const kyc = await prisma.kYC.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', rejectReason: reason || 'Documents not clear' }
    });
    if (global.ns) await global.ns.send(kyc.userId, 'KYC Rejected', reason || 'Your verification was rejected. Please resubmit.', 'SYSTEM');
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ── LIVE CHAT ──
router.get('/chat/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await prisma.chatMessage.findMany({
      distinct: ['userId'],
      orderBy: { createdAt: 'desc' },
      select: { userId: true }
    });
    const result = await Promise.all(rows.map(async r => {
      const user = await prisma.user.findUnique({ where: { id: r.userId }, select: { id: true, email: true } });
      const unread = await prisma.chatMessage.count({ where: { userId: r.userId, sender: 'USER', read: false } });
      const last = await prisma.chatMessage.findFirst({ where: { userId: r.userId }, orderBy: { createdAt: 'desc' } });
      return { ...user, unread, lastMessage: last };
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/chat/messages/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { userId: req.params.userId },
      orderBy: { createdAt: 'asc' }
    });
    await prisma.chatMessage.updateMany({
      where: { userId: req.params.userId, sender: 'USER', read: false },
      data: { read: true }
    });
    res.json(messages);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/chat/reply/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Empty message' });
    const msg = await prisma.chatMessage.create({
      data: { userId: req.params.userId, content: content.trim(), sender: 'ADMIN' }
    });
    global.io.to('user_' + req.params.userId).emit('chat_message', msg);
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/chat/resolve/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await prisma.chatMessage.deleteMany({ where: { userId: req.params.userId } });
    global.io.to('user_' + req.params.userId).emit('chat_resolved');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Manual wallet activation (send TRX to activate an existing child wallet) ──
router.post('/wallets/:userId/activate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const wallet = await prisma.tronWallet.findUnique({ where: { userId: req.params.userId } });
    if (!wallet) return res.status(404).json({ error: 'No TRON wallet found for this user' });

    const activationTrx = parseFloat(process.env.WALLET_ACTIVATION_TRX || '1.1');
    const txid = await tronWallet.sendFromMaster(wallet.tronAddress, activationTrx);
    console.log(`Manual wallet activation: ${wallet.tronAddress} | txid ${txid}`);
    res.json({ success: true, txid, address: wallet.tronAddress, amount: activationTrx });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Manual sweep: move funds from child wallet → master ──────────────────────
router.post('/wallets/:userId/sweep', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const wallet = await prisma.tronWallet.findUnique({ where: { userId: req.params.userId } });
    if (!wallet) return res.status(404).json({ error: 'No TRON wallet found for this user' });

    const txid = await tronWallet.sweepToMaster(wallet.derivationIndex);
    console.log(`Manual sweep: ${wallet.tronAddress} → master | txid ${txid}`);
    res.json({ success: true, txid, address: wallet.tronAddress });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
