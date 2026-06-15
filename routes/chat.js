const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const auth = require('../middlewares/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../uploads/chat');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, req.user.userId + '_' + Date.now() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  }
});

// GET messages for current user
router.get('/messages', auth, async (req, res) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'asc' }
    });
    // Mark admin messages as read when user opens chat
    await prisma.chatMessage.updateMany({
      where: { userId: req.user.userId, sender: 'ADMIN', read: false },
      data: { read: true }
    });
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST text message from user
router.post('/message', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Empty message' });
    const msg = await prisma.chatMessage.create({
      data: { userId: req.user.userId, content: content.trim(), sender: 'USER' }
    });
    const u = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { email: true } });
    global.io.emit('admin_new_chat', { ...msg, userEmail: u ? u.email : req.user.userId });
    res.json(msg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST image upload from user
router.post('/upload', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const imageUrl = '/uploads/chat/' + req.file.filename;
    const msg = await prisma.chatMessage.create({
      data: { userId: req.user.userId, imageUrl, sender: 'USER' }
    });
    const u2 = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { email: true } });
    global.io.emit('admin_new_chat', { ...msg, userEmail: u2 ? u2.email : req.user.userId });
    res.json(msg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET unread admin-reply count
router.get('/unread', auth, async (req, res) => {
  try {
    const count = await prisma.chatMessage.count({
      where: { userId: req.user.userId, sender: 'ADMIN', read: false }
    });
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
