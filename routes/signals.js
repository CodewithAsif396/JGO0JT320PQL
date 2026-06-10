const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();
const authMiddleware = require('../middlewares/auth');

// Cache tier thresholds — refreshed every 60s
let _tierCache = null;
let _tierCacheAt = 0;
async function getTierThresholds() {
  if (_tierCache && Date.now() - _tierCacheAt < 60000) return _tierCache;
  const rows = await prisma.platformSettings.findMany({
    where: { key: { in: ['tier1_min', 'tier2_min', 'tier3_min', 'tier4_min'] } }
  });
  const map = {};
  rows.forEach(r => { map[r.key] = parseFloat(r.value); });
  _tierCache = {
    t1: map['tier1_min'] ?? 500,
    t2: map['tier2_min'] ?? 1000,
    t3: map['tier3_min'] ?? 1500,
    t4: map['tier4_min'] ?? 2000
  };
  _tierCacheAt = Date.now();
  return _tierCache;
}

// Server-side balance tier — uses total balance across all wallets
async function getAccessTier(balance, tradeBalance, perpetualBalance) {
  const total = (balance || 0) + (tradeBalance || 0) + (perpetualBalance || 0);
  const { t1, t2, t3, t4 } = await getTierThresholds();
  if (total >= t4) return 4;
  if (total >= t3) return 3;
  if (total >= t2) return 2;
  if (total >= t1) return 1;
  return 0;
}


// GET /api/signals — returns only signals the user's balance qualifies for
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const accessTier = await getAccessTier(user.balance, user.tradeBalance, user.perpetualBalance);
    const { t1 } = await getTierThresholds();

    // Targeted signals are always visible regardless of balance tier
    const targetedSignals = await prisma.signal.findMany({
      where: { status: { in: ['PENDING', 'ACTIVE'] }, targetUserId: user.id },
      orderBy: [{ entryTime: 'asc' }]
    });

    if (accessTier === 0) {
      return res.json({
        signals: targetedSignals,
        accessTier: 0,
        balance: user.balance,
        tradeBalance: user.tradeBalance,
        tiers: await getTierThresholds(),
        message: targetedSignals.length === 0 ? `Minimum $${t1} balance required to access signals.` : undefined
      });
    }

    // Public signals at or below the user's tier
    const publicSignals = await prisma.signal.findMany({
      where: {
        status: { in: ['PENDING', 'ACTIVE'] },
        visibilityTier: { lte: accessTier },
        targetUserId: null
      },
      orderBy: [{ visibilityTier: 'asc' }, { entryTime: 'asc' }],
      take: accessTier
    });

    // Merge: targeted first, then public (no duplicates possible since they're mutually exclusive)
    const signals = [...targetedSignals, ...publicSignals];

    res.json({ signals, accessTier, balance: user.balance, tradeBalance: user.tradeBalance, tiers: await getTierThresholds() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/signals/my-trades
router.get('/my-trades', authMiddleware, async (req, res) => {
  try {
    const trades = await prisma.trade.findMany({
      where: { userId: req.user.userId },
      include: {
        signal: {
          select: {
            id: true, pair: true, direction: true, marketType: true,
            entryTime: true, duration: true, multiplier: true, status: true,
            result: true, rewardPercentage: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    let autoHealed = false;
    for (const trade of trades) {
      if (trade.outcome === 'PENDING' && trade.signal) {
        const signal = trade.signal;
        const entryTime = new Date(signal.entryTime).getTime();
        const endTime = entryTime + (signal.duration * 1000);
        // 2-second buffer to handle slight client/server clock desync
        const hasExpired = Date.now() >= endTime;

        if (signal.status === 'COMPLETED' || (signal.status === 'ACTIVE' && hasExpired)) {
          if (global.ss) {
            await global.ss.completeSignal(signal.id);
            autoHealed = true;
          }
        }
      }
    }

    if (autoHealed) {
      // Refetch after healing
      const healedTrades = await prisma.trade.findMany({
        where: { userId: req.user.userId },
        include: {
          signal: {
            select: {
              id: true, pair: true, direction: true, marketType: true,
              entryTime: true, duration: true, multiplier: true, status: true,
              result: true, rewardPercentage: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      return res.json(healedTrades);
    }

    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/signals/trade — balance tier validated server-side
router.post('/trade', authMiddleware, async (req, res) => {
  try {
    const { signalId, amount, direction, entryPrice } = req.body;
    const amt = parseFloat(amount);
    if (!signalId || !amt || amt <= 0) {
      return res.status(400).json({ error: 'Signal ID and valid amount required' });
    }

    const [signal, user] = await Promise.all([
      prisma.signal.findUnique({ where: { id: signalId } }),
      prisma.user.findUnique({ where: { id: req.user.userId } })
    ]);

    if (!signal) return res.status(404).json({ error: 'Signal not found' });
    if (signal.status !== 'ACTIVE') return res.status(400).json({ error: 'Signal is not active' });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.tradeBalance === 0) return res.status(400).json({ error: 'Please transfer funds to Trade wallet before trading.' });
    if (user.tradeBalance < amt) return res.status(400).json({ error: 'Insufficient Trade wallet balance' });

    // 1. Enforce 1% limit based on total balance for ALL signals (allow tiny precision margin)
    const totalBalance = (user.balance || 0) + (user.tradeBalance || 0) + (user.perpetualBalance || 0);
    if (amt > (totalBalance * 0.01) + 0.01) {
      return res.status(400).json({ error: 'You are crossing terms and conditions.' });
    }

    // Server-side balance tier validation — cannot be bypassed from frontend
    const accessTier = await getAccessTier(user.balance, user.tradeBalance, user.perpetualBalance);
    const { t1: tierMin } = await getTierThresholds();
    if (accessTier === 0) {
      return res.status(403).json({ error: `Minimum $${tierMin} Trade balance required to trade signals.` });
    }
    if (signal.visibilityTier > accessTier) {
      return res.status(403).json({ error: 'Your Trade balance tier does not grant access to this signal.' });
    }

    // Prevent duplicate active trade on same signal
    const existing = await prisma.trade.findFirst({
      where: { userId: user.id, signalId, outcome: 'PENDING' }
    });
    if (existing) {
      return res.status(400).json({ error: 'You already have an active trade on this signal.' });
    }

    // Tier-based concurrent signal limit: Tier 1 = 1 signal, Tier 2 = 2 signals, Tier 3 = 3, etc.
    const activeSignalTrades = await prisma.trade.count({
      where: { userId: user.id, outcome: 'PENDING', signalId: { not: null } }
    });
    if (activeSignalTrades >= accessTier) {
      return res.status(403).json({
        error: `Tier ${accessTier} allows maximum ${accessTier} active signal trade${accessTier > 1 ? 's' : ''} at a time. Please wait for your current trade${accessTier > 1 ? 's' : ''} to complete.`
      });
    }

    const [trade] = await prisma.$transaction([
      prisma.trade.create({
        data: {
          userId: user.id,
          signalId,
          amount: amt,
          direction: direction || signal.direction,
          outcome: 'PENDING',
          entryPrice: entryPrice ? parseFloat(entryPrice) : null
        }
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { tradeBalance: { decrement: amt } }
      })
    ]);

    res.json(trade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// MANUAL TRADING (NO SIGNAL)
router.post('/manual-trade', authMiddleware, async (req, res) => {
  try {
    const { pair, amount, direction, duration, entryPrice } = req.body;
    const amt = parseFloat(amount);
    if (!pair || !amt || amt <= 0) return res.status(400).json({ error: 'Invalid parameters' });

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (user.tradeBalance < amt) return res.status(400).json({ error: 'Insufficient trade balance' });

    // INTERCEPT: Check if there's an ACTIVE signal for this user on this exact pair
    let cleanPair = pair.replace(/[\s\/]/g, '').replace('USDTUSDT', 'USDT').toUpperCase();
    if (cleanPair.includes(':')) cleanPair = cleanPair.split(':')[1]; // Strip BINANCE: or CRYPTO:
    
    const activeSignals = await prisma.signal.findMany({
      where: { status: 'ACTIVE' }
    });
    
    let interceptedSignal = null;
    const accessTier = await getAccessTier(user.balance, user.tradeBalance, user.perpetualBalance);
    for (const sig of activeSignals) {
      const sigPair = sig.pair.replace(/[\s\/]/g, '').replace('USDTUSDT', 'USDT').toUpperCase();
      if (sigPair === cleanPair) {
        if (sig.targetUserId === user.id) { interceptedSignal = sig; break; }
        if (!sig.targetUserId && sig.visibilityTier <= accessTier) { interceptedSignal = sig; break; }
      }
    }

    let trade;
    if (interceptedSignal) {
      // Auto-map as Signal Trade
      const existing = await prisma.trade.findFirst({
        where: { userId: user.id, signalId: interceptedSignal.id, outcome: 'PENDING' }
      });
      if (existing) return res.status(400).json({ error: 'You already have an active trade on this signal.' });

      await prisma.user.update({
        where: { id: user.id },
        data: { tradeBalance: { decrement: amt } }
      });
      trade = await prisma.trade.create({
        data: {
          userId: user.id,
          signalId: interceptedSignal.id,
          amount: amt,
          direction: direction || interceptedSignal.direction,
          outcome: 'PENDING',
          entryPrice: entryPrice ? parseFloat(entryPrice) : null
        }
      });
    } else {
      // Normal Manual Trade
      await prisma.user.update({
        where: { id: user.id },
        data: { tradeBalance: { decrement: amt } }
      });
      trade = await prisma.trade.create({
        data: {
          userId: user.id,
          pair: pair,
          amount: amt,
          direction: direction,
          outcome: 'PENDING',
          duration: duration || 600, // typically 600 seconds (10 mins)
          signalId: null,
          entryPrice: entryPrice ? parseFloat(entryPrice) : null
        }
      });
    }

    res.json({ success: true, trade });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to place manual trade' });
  }
});

router.post('/manual-cancel', authMiddleware, async (req, res) => {
  try {
    const { tradeId } = req.body;
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });

    if (!trade || trade.userId !== req.user.userId || trade.outcome !== 'PENDING') {
      return res.status(400).json({ error: 'Trade not found or already closed' });
    }

    // Check if 10 minutes have passed
    const timeElapsed = Date.now() - new Date(trade.createdAt).getTime();
    if (timeElapsed >= trade.duration * 1000) {
      return res.status(400).json({ error: 'Time limit exceeded. Trade cannot be cancelled and will be resolved.' });
    }

    // Return balance
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { tradeBalance: { increment: trade.amount } }
    });

    // Mark as cancelled
    await prisma.trade.update({
      where: { id: tradeId },
      data: { outcome: 'CANCELLED', profit: 0 }
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to cancel trade' });
  }
});

router.post('/manual-resolve', authMiddleware, async (req, res) => {
  try {
    const { tradeId } = req.body;
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });

    if (!trade || trade.userId !== req.user.userId || trade.outcome !== 'PENDING') {
      return res.status(400).json({ error: 'Trade not found or already closed' });
    }

    // Generate a close price that forces a loss based on direction
    let closePrice = null;
    if (trade.entryPrice) {
      // Random change between 0.1% and 0.5%
      const changePct = 0.001 + Math.random() * 0.004;
      if (trade.direction === 'CALL') {
        closePrice = trade.entryPrice * (1 - changePct); // Goes down, loss for CALL
      } else {
        closePrice = trade.entryPrice * (1 + changePct); // Goes up, loss for PUT
      }
    }

    await prisma.$transaction([
      prisma.trade.update({
        where: { id: tradeId },
        data: { outcome: 'LOSS', profit: -trade.amount, closePrice: closePrice }
      }),
      prisma.user.update({
        where: { id: trade.userId },
        data: { profitBalance: { increment: -trade.amount } }
      })
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to resolve trade' });
  }
});

module.exports = router;
