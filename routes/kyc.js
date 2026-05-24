const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = new PrismaClient();
const router = express.Router();
const authMiddleware = require('../middlewares/auth');

const uploadDir = path.join(__dirname, '../uploads/kyc');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${req.user.userId}_${file.fieldname}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|jpg|gif|webp)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  try {
    const kyc = await prisma.kYC.findUnique({ where: { userId: req.user.userId } });
    res.json(kyc || { status: 'NONE' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/basic', authMiddleware, async (req, res) => {
  try {
    const { fullName, idNumber, country } = req.body;
    if (!fullName || !idNumber) return res.status(400).json({ error: 'Full name and ID number required' });
    const kyc = await prisma.kYC.upsert({
      where: { userId: req.user.userId },
      update: { fullName, idNumber, country: country || null, status: 'PENDING' },
      create: { userId: req.user.userId, fullName, idNumber, country: country || null, status: 'PENDING' }
    });
    res.json({ success: true, kyc });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/upload', authMiddleware,
  upload.fields([{ name: 'selfie', maxCount: 1 }, { name: 'idFront', maxCount: 1 }, { name: 'idBack', maxCount: 1 }]),
  async (req, res) => {
    try {
      const files = req.files || {};
      const updateData = {};
      if (files.selfie?.[0]) updateData.selfieUrl = `/uploads/kyc/${files.selfie[0].filename}`;
      if (files.idFront?.[0]) updateData.idFrontUrl = `/uploads/kyc/${files.idFront[0].filename}`;
      if (files.idBack?.[0]) updateData.idBackUrl = `/uploads/kyc/${files.idBack[0].filename}`;
      if (!Object.keys(updateData).length) return res.status(400).json({ error: 'No files uploaded' });
      const kyc = await prisma.kYC.upsert({
        where: { userId: req.user.userId },
        update: { ...updateData, status: 'PENDING' },
        create: { userId: req.user.userId, ...updateData, status: 'PENDING' }
      });
      res.json({ success: true, kyc });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
);

module.exports = router;
