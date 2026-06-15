const express = require('express');
const prisma = require('../prismaClient');
const bcrypt = require('bcryptjs');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');

// Get profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        kycData: true,
        referrals: {
          select: { email: true, createdAt: true, balance: true, investments: true }
        }
      }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get notifications
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark notifications as read
router.post('/notifications/read', authMiddleware, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.userId, read: false },
      data: { read: true }
    });
    res.sendStatus(200);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change password
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old and new passwords are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { password: hashed }
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get wallet with addresses
router.get('/wallet', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { walletAddresses: true }
    });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({
      balance: user.balance,
      profitBalance: user.profitBalance,
      referralBalance: user.referralBalance,
      addresses: Object.fromEntries(user.walletAddresses.map(w => [w.network, w.address]))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Full profile refresh
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        kycData: true,
        walletAddresses: true,
        referrals: { select: { id: true, email: true, createdAt: true, balance: true, investments: true } }
      }
    });
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (user.suspended) return res.status(403).json({ error: 'Account suspended' });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTrades = await prisma.trade.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: startOfDay },
        outcome: { in: ['WIN', 'LOSS'] }
      }
    });
    const todayPnl = todayTrades.reduce((sum, t) => sum + (t.profit || 0), 0);

    const { password, resetToken, ...safe } = user;
    safe.todayPnl = todayPnl;
    res.json(safe);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
