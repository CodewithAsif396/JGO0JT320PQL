const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const xss = require('xss-clean');

dotenv.config({ path: path.join(__dirname, '.env') });

const NotificationService = require('./services/notificationService');
const WalletService = require('./services/walletService');
const SignalService = require('./services/signalService');
const MarketService = require('./services/marketService');
const DepositPoller = require('./services/depositPoller');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const allowedOrigins = [
  'http://localhost', 
  'https://localhost', 
  'capacitor://localhost', 
  'http://127.0.0.1',
  'https://trexisplatform.site',
  'https://www.trexisplatform.site',
  'https://trexisplatorm.site',
  'https://www.trexisplatorm.site'
];
if (process.env.APP_DOMAIN) {
  allowedOrigins.push(process.env.APP_DOMAIN);
  allowedOrigins.push(`https://${process.env.APP_DOMAIN}`);
}
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// --- HARD SECURITY LAYER ---
// Protect against tracing, cross-site scripting (XSS), and clickjacking
app.use(helmet({ 
  contentSecurityPolicy: false, // Disabled to allow external images/CDNs (like ui-avatars, MEXC)
  crossOriginEmbedderPolicy: false
})); 

// Prevent Multiple Link Attacks & Brute Force (Rate Limiting)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 1200, // Limit each IP to 1200 requests per 15 minutes
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use(limiter);

// Protect against HTTP Parameter Pollution attacks
app.use(hpp());

// Protect against Cross-Site Scripting (XSS) attacks
app.use(xss());
// ---------------------------

// PREVENT DOS ATTACKS: Lowered payload limits from 50mb to 5mb. 
// Hackers could crash the server by sending massive 50MB fake JSON bodies.
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(__dirname));

// Initialize Services
const notificationService = new NotificationService(io);
const walletService = new WalletService(notificationService);
const signalService = new SignalService(io, notificationService);
const marketService = new MarketService(io);

// Global access for routes
global.io = io;
global.ns = notificationService;
global.ws = walletService;
global.ss = signalService;
global.ms = marketService;

// Start deposit poller (only if MASTER_MNEMONIC is configured)
if (process.env.MASTER_MNEMONIC) {
  const depositPoller = new DepositPoller();
  depositPoller.start();
}

// Admin Panel Route
const adminPath = process.env.ADMIN_URL_PATH || '/94875Efn239120';
app.get(adminPath, (_req, res) => res.sendFile(__dirname + '/secure_admin_panel.html'));

// Public app settings endpoint (no auth) — about us, support links, etc.
app.get('/api/public/settings', async (_req, res) => {
  try {
    const prisma = require('./prismaClient');
    const PUBLIC_KEYS = ['app_name','app_version','app_description','app_website_url','app_twitter_url','app_telegram_url','support_email','support_telegram','support_faq_url','app_banners'];
    const rows = await prisma.platformSettings.findMany({ where: { key: { in: PUBLIC_KEYS } } });
    const obj = {};
    rows.forEach(r => { obj[r.key] = r.value; });
    res.json(obj);
  } catch (e) {
    res.json({});
  }
});

// Public ticker endpoint (no auth)
app.get('/api/ticker', async (_req, res) => {
  try {
    const prisma = require('./prismaClient');
    const [tickerSetting, termsSetting] = await Promise.all([
      prisma.platformSettings.findUnique({ where: { key: 'ticker_text' } }),
      prisma.platformSettings.findUnique({ where: { key: 'penalty_terms_text' } })
    ]);
    res.json({
      text: tickerSetting ? tickerSetting.value : 'Trexis demonstrates commitment to legal and transparent operations with full licensing. Safe, Fast, and Easy Trading for all professional investors.',
      penaltyTerms: termsSetting ? termsSetting.value : 'Please note that transferring principal funds from Trade back to Exchange before the lock period expires will incur an early withdrawal penalty.'
    });
  } catch (e) {
    res.json({
      text: 'Trexis demonstrates commitment to legal and transparent operations with full licensing. Safe, Fast, and Easy Trading for all professional investors.',
      penaltyTerms: 'Please note that transferring principal funds from Trade back to Exchange before the lock period expires will incur an early withdrawal penalty.'
    });
  }
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Attach io to every request so routes can emit events
app.use((req, _res, next) => { req.io = io; next(); });

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/signals', require('./routes/signals'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/kyc', require('./routes/kyc'));
app.use('/api/chat', require('./routes/chat'));

// SPA Catch-all route to serve index.html for client-side routing (e.g. /register?ref=...)


// Proxy endpoint for MEXC to bypass browser CORS
app.get('/api/mexc/*', (req, res) => {
  const https = require('https');
  const proxyPath = req.originalUrl.replace('/api/mexc', '/api/v3').replace('interval=1h', 'interval=60m');
  const url = 'https://api.mexc.com' + proxyPath;
  https.get(url, (mexcRes) => {
    let data = '';
    mexcRes.on('data', chunk => data += chunk);
    mexcRes.on('end', () => {
      try { res.json(JSON.parse(data)); } catch (e) { res.status(500).json({ error: 'Parse error' }); }
    });
  }).on('error', (e) => res.status(500).json({ error: 'Network error' }));
});

app.get('*', (req, res) => {

  if (req.path.startsWith('/api/') || req.path === '/admin-secure-login-12345') {
    return res.status(404).json({ error: 'Not Found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});
// Socket.io Auth & Personal Rooms
io.on('connection', (socket) => {
  socket.on('authenticate', (token) => {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.join(`user_${decoded.userId}`);
      
      // Send initial data
      socket.emit('market_init', marketService.prices);
    } catch (err) {}
  });
});

// Global Error Handler to ensure API never returns HTML errors
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'An internal server error occurred.' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Production server running on port ${PORT}`);
});
// Trigger redeploy
