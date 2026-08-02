/* ═══════════════════════════════════════
   PQL — Full App Logic
═══════════════════════════════════════ */

// ── NAV STACK ──
const navStack = [];
let currentScreen = 'home-screen';

const PROTECTED_SCREENS = ['home-screen', 'markets-screen', 'futures-screen', 'perpetual-screen', 'assets-screen', 'deposit-screen', 'withdrawal-screen', 'transaction-screen', 'share-screen', 'notifications-screen', 'referrals-screen', 'trade-screen', 'exchange-screen', 'fund-transfer-screen', 'withdrawal-record-screen', 'basic-verification-screen', 'advanced-verification-screen', 'change-password-screen', 'bind-address-screen', 'withdrawal-password-screen', 'google-auth-screen', 'more-screen', 'settings-screen', 'convert-screen', 'transfer-record-screen', 'perp-chart-screen', 'chat-screen'];

function navTo(screenId) {
    if (PROTECTED_SCREENS.includes(screenId) && !authToken) { _showScreen('login-screen'); return; }
    if (screenId === currentScreen) return;
    navStack.push(currentScreen);
    _showScreen(screenId);
    const navScreens = ['home-screen', 'markets-screen', 'futures-screen', 'perpetual-screen', 'assets-screen'];
    if (navScreens.includes(screenId)) {
        const idx = navScreens.indexOf(screenId);
        document.querySelectorAll('.pql-nav-btn, .nav-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
    }
    // Refresh data on important screen changes
    if (['assets-screen', 'futures-screen', 'perpetual-screen', 'exchange-screen', 'trade-screen'].includes(screenId)) {
        refreshUserData();
    }
    // Screen-specific loading
    if (screenId === 'transaction-screen') loadTransactions();
    if (screenId === 'google-auth-screen') loadGoogleAuthSetup();
    if (screenId === 'bind-address-screen') loadBindAddressScreen();
    if (screenId === 'deposit-screen') loadDepositInfo();
    if (screenId === 'notifications-screen') fetchNotifications();
    if (screenId === 'withdrawal-record-screen') loadWithdrawalRecords();
    if (screenId === 'withdrawal-screen') loadWithdrawalScreen();
    if (screenId === 'futures-screen') {
        if (!apexChart) {
            const sym = currentPair.replace(/[\\s\/]/g, '').replace('USDTUSDT', 'USDT').replace(/\s+/g, '').toUpperCase();
            const activeTf = document.querySelector('#futures-timeframes button.active');
            initChart(sym.endsWith('USDT') ? sym : sym + 'USDT', activeTf ? (activeTf.dataset.tf || activeTf.textContent.toLowerCase()) : '1m');
        }
        renderActivePositions();
        loadTradeHistory();
    }
    if (screenId === 'perpetual-screen') {
        startPerpOrderBookLoop();
    } else {
        stopPerpOrderBookLoop();
    }
    if (screenId === 'perp-chart-screen') {
        var pSym = (window._currentPerpPair || 'BTC/USDT').replace(/[\\s\/]/g, '').replace('USDTUSDT', 'USDT').replace(/\s+/g, '').toUpperCase();
        var activeTf = document.querySelector('#perp-chart-timeframes button.active');
        initPerpDetailChart(pSym, activeTf ? activeTf.dataset.tf || '1h' : '1h');
    }
    if (screenId === 'share-screen') loadShareScreen();
    if (screenId === 'convert-screen') loadConvertRates();
    if (screenId === 'chat-screen') loadChatMessages();
    if (screenId === 'fund-transfer-screen') updateTransferAvail();
    if (screenId === 'about-screen') loadAboutScreen();
    if (screenId === 'support-screen') loadSupportScreen();
}

function switchTab(screenId, btnEl) {
    if (PROTECTED_SCREENS.includes(screenId) && !authToken) { _showScreen('login-screen'); return; }
    navStack.length = 0;
    _showScreen(screenId);
    document.querySelectorAll('.pql-nav-btn, .nav-btn').forEach(b => b.classList.remove('active'));
    if (btnEl && btnEl.classList && (btnEl.classList.contains('pql-nav-btn') || btnEl.classList.contains('nav-btn'))) btnEl.classList.add('active');
    const app = document.getElementById('app');
    if (app) app.scrollTop = 0;
    if (['assets-screen', 'futures-screen', 'perpetual-screen', 'exchange-screen', 'trade-screen'].includes(screenId)) {
        refreshUserData();
    }
    if (screenId === 'futures-screen') {
        if (!apexChart) {
            const sym = currentPair.replace(/[\\s\/]/g, '').replace('USDTUSDT', 'USDT').replace(/\s+/g, '').toUpperCase();
            initChart(sym.endsWith('USDT') ? sym : sym + 'USDT', '1m');
        }
        renderActivePositions();
        loadTradeHistory();
    }
    if (screenId === 'perpetual-screen') {
        startPerpOrderBookLoop();
    } else {
        stopPerpOrderBookLoop();
    }
}

function _showScreen(screenId) {
    // Safely close sidebar - never let this block screen switching
    try { closeSidebar(); } catch (e) { console.error('closeSidebar error:', e); }

    // Hide ALL screens first
    document.querySelectorAll('.screen').forEach(function (s) {
        s.classList.remove('active');
        s.style.display = 'none';
    });

    // Show the target screen
    var target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
        currentScreen = screenId;
    } else {
        console.error('Screen not found:', screenId);
    }

    // Hide bottom nav for login/register
    var bNav = document.querySelector('.bottom-nav');
    if (bNav) {
        bNav.style.display = (screenId === 'login-screen' || screenId === 'register-screen') ? 'none' : 'flex';
    }

    // Scroll to top
    try {
        var app = document.getElementById('app');
        if (app) app.scrollTop = 0;
        window.scrollTo(0, 0);
    } catch (e) { }
}

// ── SIDEBAR ──
function openSidebar() {
    // Sidebar removed — navigate to Personal Center
    switchTab('assets-screen', document.querySelectorAll('.pql-nav-btn')[4]);
}
function closeSidebar() { /* no-op */ }
function toggleSecurityMenu(el) {
    const sub = document.getElementById('security-submenu');
    const icon = el.querySelector('.expand-icon');
    const isOpen = sub.style.display === 'block';
    sub.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.classList.toggle('rotated', !isOpen);
}

// ── THEME TOGGLE ──
let isDark = localStorage.getItem('theme') !== 'light';

function _applyTheme() {
    document.documentElement.classList.remove('light-preload');
    const icon = document.getElementById('theme-icon');
    const thumb = document.getElementById('theme-thumb');
    if (isDark) {
        document.body.classList.remove('light-mode');
        if (icon) { icon.className = 'fa-solid fa-moon'; icon.style.color = '#f5b041'; }
        if (thumb) { thumb.style.right = '2px'; thumb.style.left = 'auto'; }
    } else {
        document.body.classList.add('light-mode');
        if (icon) { icon.className = 'fa-solid fa-sun'; icon.style.color = '#f39c12'; }
        if (thumb) { thumb.style.left = '2px'; thumb.style.right = 'auto'; }
    }
}

function toggleTheme() {
    isDark = !isDark;
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    _applyTheme();
}

// Apply saved theme immediately
_applyTheme();

// ── TOAST ──
function showToast(msg, duration = 2600) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// ── COPY ──
function copyText(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => showToast('Copied!')).catch(() => showToast('Copied!'));
    } else {
        showToast('Copied!');
    }
}

function copyDepositAddress() {
    const addr = document.getElementById('dep-addr')?.textContent?.trim();
    if (addr && addr !== '—') copyText(addr);
}

// ── BANNER SLIDER ──
let slideIndex = 0, slideTimer;
function showSlide(n) {
    const slides = document.querySelectorAll('#bannerSlider .slide');
    const dots = document.querySelectorAll('#bannerSlider .dot');
    if (!slides.length) return;
    if (n >= slides.length) slideIndex = 0;
    if (n < 0) slideIndex = slides.length - 1;
    slides.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));
    slides[slideIndex].classList.add('active');
    if (dots[slideIndex]) dots[slideIndex].classList.add('active');
}
function currentSlide(n) {
    clearInterval(slideTimer); slideIndex = n; showSlide(n); startSlider();
}
function startSlider() {
    slideTimer = setInterval(() => { slideIndex++; showSlide(slideIndex); }, 5000);
}

// ── COUNTDOWN ──
let countdown = 60;
function updateCountdown() {
    countdown--;
    if (countdown < 0) { countdown = 60; updateTimePeriod(); }
    const el = document.getElementById('countdown-timer');
    if (el) {
        el.textContent = countdown + ' s';
        el.style.color = countdown <= 10 ? 'var(--down-color)' : 'var(--up-color)';
    }
}
function updateTimePeriod() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const y = now.getFullYear(), mo = pad(now.getMonth() + 1), d = pad(now.getDate());
    const h = pad(now.getHours()), m = pad(now.getMinutes()), mn = pad(now.getMinutes() + 1 > 59 ? 0 : now.getMinutes() + 1);
    const dlEl = document.getElementById('order-deadline');
    const tpEl = document.getElementById('time-period');
    if (dlEl) dlEl.textContent = `${y}/${mo}/${d} ${h}:${m}:00`;
    if (tpEl) tpEl.textContent = `${h}:${m}~${h}:${mn}`;
}

// ── HOME MARKET TABS ──
function setMarketTab(btn, tab) {
    document.querySelectorAll('.market-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderHomeMarkets(tab);
}

function renderHomeMarkets(tab = 'change') {
    const list = document.getElementById('home-market-items');
    if (!list) return;
    let sorted = [...allCoins];
    if (tab === 'turnover') {
        sorted = sorted.sort((a, b) => parseFloat(b.price.replace(/,/g, '')) - parseFloat(a.price.replace(/,/g, '')));
    } else if (tab === 'losers') {
        sorted = sorted.sort((a, b) => (parseFloat(a.ch) || 0) - (parseFloat(b.ch) || 0));
    } else {
        sorted = sorted.sort((a, b) => Math.abs(parseFloat(b.ch) || 0) - Math.abs(parseFloat(a.ch) || 0));
    }
    list.innerHTML = sorted.map(c => `
        <div class="market-item" onclick="openTradingPair('${c.sym}')" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-radius:0; margin-bottom:0;">
            <div style="flex:1.5; display:flex; align-items:center; gap:10px;">
                ${coinIconHtml(c.sym, c.bg, 36)}
                <div style="display:flex;flex-direction:column;gap:2px;">
                    <span style="font-weight:700; color:#1a1a2e; font-size:14px; line-height:1;">${c.sym}</span>
                    <span style="color:#9ca3af; font-size:11px; line-height:1;">/ USDT</span>
                </div>
            </div>
            <div style="flex:1; text-align:right; color:#1a1a2e; font-size:14px; font-weight:600; letter-spacing:-0.2px;">
                <div id="hm-price-${c.sym}">${c.price}</div>
            </div>
            <div style="flex:1; display:flex; justify-content:flex-end;">
                <div id="hm-chg-${c.sym}" style="background:${c.up ? '#02c076' : '#f84960'}; color:#fff; font-weight:600; padding:6px 10px; border-radius:8px; font-size:12px; text-align:center; min-width:72px; letter-spacing:0.2px;">${c.ch}</div>
            </div>
        </div>`).join('');
}

// ── COIN DATA ──
function coinIconHtml(sym, bg, size) {
    size = size || 34;
    const fs = Math.max(10, Math.floor(size * 0.45));

    let url = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/' + sym.toLowerCase() + '.svg';
    if (sym === 'SHIB') url = 'https://assets.coincap.io/assets/icons/shib@2x.png';

    let fallbackHtml = '<span style="font-size:' + fs + 'px;color:#fff;font-weight:700;z-index:1;">' + sym.charAt(0) + '</span>';
    if (sym === 'XAU') fallbackHtml = '<i class="fa-solid fa-coins" style="color:#fff;font-size:' + fs + 'px;z-index:1;"></i>';
    if (sym === 'XAG') fallbackHtml = '<i class="fa-solid fa-coins" style="color:#fff;font-size:' + fs + 'px;z-index:1;"></i>';
    if (sym === 'XPT') fallbackHtml = '<i class="fa-solid fa-ring" style="color:#fff;font-size:' + fs + 'px;z-index:1;"></i>';
    if (sym === 'XPD') fallbackHtml = '<i class="fa-solid fa-gem" style="color:#fff;font-size:' + fs + 'px;z-index:1;"></i>';

    let isMetal = ['XAU', 'XAG', 'XPT', 'XPD'].includes(sym);
    let imgHtml = isMetal ? '' : '<img src="' + url + '" width="' + size + '" height="' + size + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:2;" onerror="this.remove()">';

    return '<div style="width:' + size + 'px;height:' + size + 'px;background:' + bg + ';border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;">' +
        fallbackHtml +
        imgHtml +
        '</div>';
}

const allCoins = [
    { sym: 'DASH', name: 'Dash', bg: '#008ce7', price: '48.553', ch: '-4.35%', up: false, sp: [22, 20, 18, 15, 12, 10, 8, 5, 3, 2] },
    { sym: 'XPT', name: 'Platinum', bg: '#7a8c99', price: '1929.052', ch: '-1.58%', up: false, sp: [18, 17, 15, 13, 11, 10, 8, 6, 5, 4] },
    { sym: 'XAG', name: 'Silver', bg: '#6b7d8a', price: '75.011', ch: '-1.21%', up: false, sp: [15, 14, 13, 11, 10, 9, 8, 7, 5, 4] },
    { sym: 'XPD', name: 'Palladium', bg: '#b8952a', price: '1363.532', ch: '-1.09%', up: false, sp: [19, 18, 16, 15, 13, 12, 10, 8, 7, 6] },
    { sym: 'ZEC', name: 'Zcash', bg: '#f4b728', price: '666.783', ch: '-1.03%', up: false, sp: [20, 19, 17, 16, 14, 13, 11, 9, 8, 7] },
    { sym: 'XAU', name: 'Gold', bg: '#ffd700', price: '4524.336', ch: '-0.48%', up: false, sp: [16, 15, 14, 13, 12, 11, 10, 9, 8, 7] },
    { sym: 'TRX', name: 'TRON', bg: '#ef0027', price: '0.35946', ch: '+0.05%', up: true, sp: [5, 6, 5, 7, 6, 8, 7, 9, 8, 10] },
    { sym: 'ETH', name: 'Ethereum', bg: '#627eea', price: '2139.71', ch: '+0.48%', up: true, sp: [10, 11, 13, 12, 15, 14, 16, 18, 17, 20] },
    { sym: 'ADA', name: 'Cardano', bg: '#0d3ca6', price: '0.2501', ch: '+0.60%', up: true, sp: [12, 13, 15, 14, 16, 15, 17, 19, 18, 22] },
    { sym: 'BTC', name: 'Bitcoin', bg: '#f7931a', price: '78018.44', ch: '+0.60%', up: true, sp: [20, 22, 21, 24, 23, 26, 25, 28, 27, 30] },
    { sym: 'SHIB', name: 'Shiba Inu', bg: '#ffa409', price: '0.00000581', ch: '+0.69%', up: true, sp: [8, 9, 11, 10, 13, 12, 15, 14, 17, 16] },
    { sym: 'XRP', name: 'XRP', bg: '#00aae4', price: '1.3796', ch: '+0.90%', up: true, sp: [10, 12, 11, 14, 13, 16, 15, 18, 17, 20] },
    { sym: 'LINK', name: 'Chainlink', bg: '#2a5ada', price: '9.723', ch: '+0.93%', up: true, sp: [15, 16, 18, 17, 20, 19, 22, 21, 24, 23] },
    { sym: 'YFI', name: 'Yearn.finance', bg: '#006fce', price: '2520.74', ch: '+1.04%', up: true, sp: [18, 19, 21, 20, 23, 22, 25, 24, 27, 26] },
    { sym: 'LTC', name: 'Litecoin', bg: '#828282', price: '54.612', ch: '+1.24%', up: true, sp: [12, 14, 13, 16, 15, 18, 17, 20, 19, 22] },
    { sym: 'BCH', name: 'Bitcoin Cash', bg: '#8dc351', price: '377.87', ch: '+1.30%', up: true, sp: [14, 16, 15, 18, 17, 20, 19, 22, 21, 24] },
    { sym: 'DOGE', name: 'Dogecoin', bg: '#c2a633', price: '0.10582', ch: '+2.12%', up: true, sp: [10, 13, 12, 15, 14, 17, 16, 19, 18, 22] },
    { sym: 'DOT', name: 'Polkadot', bg: '#e6007a', price: '1.275', ch: '+2.25%', up: true, sp: [8, 11, 10, 14, 13, 17, 16, 20, 19, 24] },
    { sym: 'FIL', name: 'Filecoin', bg: '#0090ff', price: '0.995', ch: '+2.48%', up: true, sp: [5, 8, 7, 11, 10, 14, 13, 17, 16, 21] }
];

function makeSparkline(coin) {
    const data = coin.sp;
    const isUp = coin.up;
    const w = 100, h = 30;

    // Smooth bounds
    const mx = Math.max(...data), mn = Math.min(...data), rng = mx - mn || 1;
    const pts = data.map((v, i) => { return { x: (i / (data.length - 1)) * w, y: h - ((v - mn) / rng) * (h - 4) - 2 }; });

    let pathD = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
        pathD += ` L ${pts[i].x},${pts[i].y}`;
    }

    const color = isUp ? '#00c087' : '#f84960';

    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:30px; margin-top: 6px; overflow:visible;">
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="miter" stroke-linecap="butt" style="filter: drop-shadow(0 0 1px ${color}40);"/>
    </svg>`;
}

function renderMiniTickers() {
    const container = document.getElementById('mini-tickers-container');
    if (!container) return;
    const tickers = [
        allCoins.find(c => c.sym === 'BTC'),
        allCoins.find(c => c.sym === 'ETH'),
        allCoins.find(c => c.sym === 'TRX')
    ].filter(Boolean);

    if (container.children.length === 0) {
        container.innerHTML = tickers.map((c, i) => {
            const color = c.up ? '#00c087' : '#f84960';
            return `
            <div class="ticker" onclick="openTradingPair('${c.sym}')" style="cursor:pointer;flex:1;min-width:100px;padding:10px;text-align:center;${i < tickers.length - 1 ? 'border-right:1px solid var(--border-color);' : ''}">
                <div style="display:flex; justify-content:center; align-items:center; gap:4px; margin-bottom:4px;">
                    <span style="font-size:11px;font-weight:600;color:var(--text-primary);">${c.sym}USDT</span>
                    <span id="tick-badge-${c.sym}" class="change-badge" style="background:${color}; color:#fff; font-size:10px; clip-path: polygon(15% 0, 100% 0, 100% 100%, 15% 100%, 0 50%); padding: 1px 4px 1px 6px; border-radius: 2px;">${c.ch}</span>
                </div>
                <div class="price" id="tick-price-${c.sym}" style="font-size:16px;font-weight:700;color:${color};">${c.price}</div>
                <div id="tick-sp-${c.sym}">${makeSparkline(c)}</div>
            </div>`;
        }).join('');
    } else {
        tickers.forEach(c => {
            const color = c.up ? '#00c087' : '#f84960';

            const badgeEl = document.getElementById(`tick-badge-${c.sym}`);
            if (badgeEl) {
                badgeEl.innerText = c.ch;
                badgeEl.style.background = color;
            }

            const priceEl = document.getElementById(`tick-price-${c.sym}`);
            if (priceEl) {
                priceEl.innerText = c.price;
                priceEl.style.color = color;
            }

            const spContainer = document.getElementById(`tick-sp-${c.sym}`);
            if (spContainer) {
                const pathEl = spContainer.querySelector('path');
                if (pathEl) {
                    const w = 100, h = 30, mx = Math.max(...c.sp), mn = Math.min(...c.sp), rng = mx - mn || 1;
                    const pts = c.sp.map((v, i) => { return { x: (i / (c.sp.length - 1)) * w, y: h - ((v - mn) / rng) * (h - 4) - 2 }; });
                    let pathD = `M ${pts[0].x},${pts[0].y}`;
                    for (let i = 1; i < pts.length; i++) {
                        pathD += ` L ${pts[i].x},${pts[i].y}`;
                    }
                    pathEl.setAttribute('d', pathD);
                    pathEl.setAttribute('stroke', color);
                    pathEl.style.filter = `drop-shadow(0 0 2px ${color}80)`;
                }
            }
        });
    }
}

function openTradingPair(sym) {
    currentPair = sym + '/USDT';
    const coin = allCoins.find(c => c.sym === sym);
    // Update futures header
    const pairName = document.querySelector('#futures-screen .pair-name');
    if (pairName) pairName.textContent = sym + ' / USDT';
    const pairChange = document.querySelector('#futures-screen .pair-change');
    if (pairChange && coin) {
        pairChange.textContent = ' ' + coin.ch;
        pairChange.className = 'pair-change ' + (coin.up ? 'up' : 'down');
    }
    // Update pair icon in header
    const pairIconEl = document.getElementById('futures-pair-icon');
    if (pairIconEl) pairIconEl.innerHTML = coinIconHtml(sym, coin ? coin.bg : '#888', 24);
    // Update live price row
    const livePriceEl = document.getElementById('futures-live-price');
    if (livePriceEl && coin) {
        livePriceEl.textContent = coin.price + ' USDT';
        livePriceEl.className = 'futures-live-price-val ' + (coin.up ? 'up' : 'down');
    }
    const chgEl = document.getElementById('futures-price-chg');
    if (chgEl && coin) { chgEl.textContent = coin.ch; chgEl.className = coin.up ? 'up' : 'down'; }
    // Initialize High / Low / Vol immediately (will be updated live by socket)
    const fHighEl = document.getElementById('futures-price-high');
    const fLowEl = document.getElementById('futures-price-low');
    const fVolEl = document.getElementById('futures-price-vol');
    if (fHighEl) fHighEl.textContent = '--';
    if (fLowEl) fLowEl.textContent = '--';
    if (fVolEl) fVolEl.textContent = '--';
    // Reinit chart
    if (apexChart) { try { apexChart.destroy(); } catch (e) { } apexChart = null; }
    navTo('futures-screen');
    // navTo early-exits when already on futures-screen, so chart stays null — init explicitly
    const activeTf = document.querySelector('#futures-timeframes button.active');
    if (!apexChart) initChart(sym + 'USDT', activeTf ? (activeTf.dataset.tf || activeTf.textContent.toLowerCase()) : '1m');
}

function renderMarkets(filter) {
    const list = document.getElementById('markets-list');
    if (!list) return;
    const q = (filter || '').toLowerCase();
    const data = q ? allCoins.filter(c => c.sym.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)) : allCoins;
    list.innerHTML = data.map(c => {
        const rawPrice = parseFloat(c.price.toString().replace(/,/g, '')) || 0;
        const fmtPrice = rawPrice < 0.1 ? rawPrice.toFixed(5) : (rawPrice < 100 ? rawPrice.toFixed(3) : rawPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        const fakeVol = rawPrice > 1000 ? (Math.random() * 400 + 50).toFixed(2) + 'M' : (Math.random() * 30 + 1).toFixed(2) + 'M';
        return `
        <div class="market-item" onclick="openTradingPair('${c.sym}')" style="cursor:pointer; display:flex; align-items:center; padding:13px 16px; border-bottom:1px solid #f5f5ff; background:#fff;">
            <div style="flex:1.4; display:flex; align-items:center; gap:10px;">
                ${coinIconHtml(c.sym, c.bg, 36)}
                <div>
                    <div style="font-size:14px; font-weight:700; color:#1a1a2e;">${c.sym}<span style="font-weight:500; color:#9ca3af; font-size:12px;"> / USDT</span></div>
                    <div style="font-size:11px; color:#9ca3af; margin-top:2px;">VOL: ${fakeVol}</div>
                </div>
            </div>
            <div style="flex:1; text-align:right; padding-right:10px;">
                <div style="font-size:14px; font-weight:700; color:#1a1a2e;">$ ${fmtPrice}</div>
            </div>
            <div style="flex:0.8; text-align:right;">
                <span style="display:inline-block; padding:6px 10px; border-radius:8px; font-size:12px; font-weight:700; color:#fff; background:${c.up ? '#02c076' : '#f84960'};">${c.ch}</span>
            </div>
        </div>`;
    }).join('');
}

function filterMarkets(val) { renderMarkets(val); }
function setCatTab(btn) {
    document.querySelectorAll('.cat-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderMarkets(document.getElementById('markets-search-input')?.value || '');
}
function setMktViewTab(btn, view) {
    document.querySelectorAll('.mkt-tab-btn').forEach(b => { b.classList.remove('active'); b.style.fontWeight = '400'; b.style.color = 'var(--text-muted)'; });
    btn.classList.add('active'); btn.style.fontWeight = '700'; btn.style.color = '#fff';

    // In future, this would route to distinct API datasets based on 'view'.
    // For now, re-render to reflect state changes.
    renderMarkets(document.getElementById('markets-search-input')?.value || '');
}
function toggleMktSort() {
    allCoins.sort((a, b) => {
        const chA = parseFloat(a.ch) || 0;
        const chB = parseFloat(b.ch) || 0;
        return chB - chA;
    });
    renderMarkets(document.getElementById('markets-search-input')?.value || '');
}

// ── FUTURES TABS ──
const _fakeNames = ['Adam***', 'Wei***', 'Sara***', 'John***', 'Raj***', 'Liu***', 'Ana***', 'Max***', 'Kim***', 'Zara***'];
const _fakePairsArr = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT'];
let _fakeHistItems = [];
let _fakeHistTimer = null;
let localPositions = [];

function _fakeHistItem() {
    var pair = _fakePairsArr[Math.floor(Math.random() * _fakePairsArr.length)];
    var dir = Math.random() > 0.5 ? 'CALL' : 'PUT';
    var amt = (Math.random() * 900 + 100).toFixed(2);
    var win = Math.random() > 0.44;
    var profit = win ? '+' + (amt * 0.85).toFixed(2) : '-' + amt;
    var secs = Math.floor(Math.random() * 120) + 5;
    return { user: _fakeNames[Math.floor(Math.random() * _fakeNames.length)], pair, dir, amt, win, profit, ago: secs + 's ago' };
}

function renderFakeHistory() {
    var c = document.getElementById('futures-tab-history');
    if (!c) return;
    c.innerHTML = '<div style="padding:0 12px 12px;">' + _fakeHistItems.map(function (it) {
        return '<div class="history-order" style="margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
            '<span style="font-size:12px;color:var(--text-secondary);">' + it.user + '</span>' +
            '<span style="font-size:11px;color:var(--text-muted);">' + it.ago + '</span></div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
            '<span style="font-size:13px;font-weight:600;">' + it.pair.replace('USDT', '/USDT') + '</span>' +
            '<span class="' + (it.dir === 'CALL' ? 'up' : 'down') + '" style="font-weight:600;font-size:12px;">' + it.dir + '</span></div>' +
            '<div class="card-row"><span class="lbl">Entry Price</span><span class="val">' + (t.entryPrice ? Number(t.entryPrice).toFixed(4) : '--') + '</span></div>' +
            '<div class="card-row"><span class="lbl">Amount</span><span class="val">' + it.amt + ' USDT</span></div>' +
            '<div class="card-row"><span class="lbl">P&amp;L</span><span class="val ' + (it.win ? 'up' : 'down') + '">' + it.profit + '</span></div></div>';
    }).join('') + '</div>';
}

function startFakeHistFeed() {
    _fakeHistItems = [];
    for (var i = 0; i < 12; i++) _fakeHistItems.push(_fakeHistItem());
    renderFakeHistory();
    if (_fakeHistTimer) clearInterval(_fakeHistTimer);
    _fakeHistTimer = setInterval(function () {
        _fakeHistItems.unshift(_fakeHistItem());
        if (_fakeHistItems.length > 25) _fakeHistItems.pop();
        renderFakeHistory();
    }, 2500);
}

function renderFakeInvited() {
    var c = document.getElementById('futures-tab-invited');
    if (!c) return;
    c.innerHTML = '<div style="padding:0 12px 12px;">' + _fakeNames.slice(0, 6).map(function (name) {
        var profit = (Math.random() * 6000 + 500).toFixed(2);
        var rate = 54 + Math.floor(Math.random() * 32);
        var trades = 60 + Math.floor(Math.random() * 240);
        return '<div class="history-order" style="margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
            '<span style="font-weight:600;font-size:13px;">' + name + '</span>' +
            '<span class="up" style="font-size:12px;">+' + profit + ' USDT</span></div>' +
            '<div class="card-row"><span class="lbl">Win Rate</span><span class="val up">' + rate + '%</span></div>' +
            '<div class="card-row"><span class="lbl">Total Trades</span><span class="val">' + trades + '</span></div></div>';
    }).join('') + '</div>';
}

function renderFakeFollow() {
    var c = document.getElementById('futures-tab-follow');
    if (!c) return;
    c.innerHTML = '<div style="padding:0 12px 12px;">' + _fakeNames.slice(2, 8).map(function (name) {
        var profit = (Math.random() * 4000 + 200).toFixed(2);
        var days = 3 + Math.floor(Math.random() * 60);
        var rate = 58 + Math.floor(Math.random() * 28);
        return '<div class="history-order" style="margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
            '<span style="font-weight:600;font-size:13px;">' + name + '</span>' +
            '<span class="up" style="font-size:12px;">+' + profit + ' USDT</span></div>' +
            '<div class="card-row"><span class="lbl">Days Following</span><span class="val">' + days + ' days</span></div>' +
            '<div class="card-row"><span class="lbl">Profit Rate</span><span class="val up">' + rate + '%</span></div></div>';
    }).join('') + '</div>';
}

async function renderActivePositions() {
    var c = document.getElementById('active-positions-list');
    if (!c) return;
    if (!authToken) return;
    try {
        const res = await fetch('/api/signals/my-trades', { headers: { 'Authorization': 'Bearer ' + authToken } });
        if (!res.ok) return;
        const trades = await res.json();
        const pending = trades.filter(function (t) { return t.outcome === 'PENDING'; });
        if (!pending.length) {
            c.innerHTML = '<div class="no-data-block" style="padding:40px 20px;"><i class="fa-solid fa-chart-line" style="font-size:40px;color:var(--text-muted);margin-bottom:12px;"></i><p>No active positions</p></div>';
            return;
        }
        c.innerHTML = '<div style="padding:0 12px 12px;">' + pending.map(function (t) {
            var pair = (t.signal && t.signal.pair) ? t.signal.pair : (t.pair || 'UNKNOWN');
            var dir = (t.signal && t.signal.direction) ? t.signal.direction : (t.direction || '--');
            var dirClass = dir === 'CALL' ? 'up' : 'down';
            var dirIcon = dir === 'CALL' ? '▲' : '▼';
            var date = new Date(t.createdAt).toLocaleTimeString();
            var entryTime = (t.signal && t.signal.entryTime) ? new Date(t.signal.entryTime).getTime() : new Date(t.createdAt).getTime();
            var duration = (t.signal && t.signal.duration) ? t.signal.duration : (t.duration || 600);
            var endTime = entryTime + duration * 1000;
            var remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
            var countdown = remaining > 0 ? fmtCountdown(remaining) : 'CLOSING...';
            var cancelBtn = t.signalId ? '' : '<button onclick="cancelManualTrade\(\'' + t.id + '\'\)" class="btn-secondary" style="font-size:11px;padding:4px 8px;border-radius:4px;margin-left:8px;">Cancel</button>';
            return '<div class="history-order" style="margin-bottom:8px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
                '<span style="font-weight:600;font-size:13px;">' + pair + '</span>' +
                '<span class="' + dirClass + '" style="font-weight:600;">' + dirIcon + ' ' + dir + cancelBtn + '</span></div>' +
                '<div class="card-row"><span class="lbl">Entry Price</span><span class="val">' + (t.entryPrice ? Number(t.entryPrice).toFixed(4) : '--') + '</span></div>' +
                '<div class="card-row"><span class="lbl">Amount</span><span class="val">' + t.amount.toFixed(2) + ' USDT</span></div>' +
                '<div class="card-row"><span class="lbl">Open Time</span><span class="val">' + date + '</span></div>' +
                '<div class="card-row"><span class="lbl">Status</span><span class="val" style="color:#f3ba2f;">ACTIVE</span></div>' +
                '<div class="card-row"><span class="lbl">Time Left</span><span class="val up pos-countdown" data-id="' + t.id + '" data-manual="' + (t.signalId ? 'false' : 'true') + '" data-end="' + endTime + '">' + countdown + '</span></div>' +
                '</div>';
        }).join('') + '</div>';
        document.querySelectorAll('.pos-countdown').forEach(function (el) {
            var endTime = parseInt(el.dataset.end);
            if (!endTime) return;
            var t = setInterval(function () {
                var rem = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
                el.textContent = rem > 0 ? fmtCountdown(rem) : 'CLOSING...';
                if (rem <= 0) {
                    clearInterval(t);
                    if (el.dataset.manual === 'true') {
                        resolveManualTrade(el.dataset.id);
                    } else {
                        // Signal trade: Auto-refresh quickly to move to history
                        setTimeout(function () {
                            loadTradeHistory();
                            renderActivePositions();
                            refreshUserData();
                        }, 500);
                    }
                }
            }, 1000);
        });
    } catch (e) { }
}

function addLocalPosition(sym, dir, amount) {
    var entry = apexChartData.length ? apexChartData[apexChartData.length - 1].y[3] : 0;
    var durationMs = (selectedOrderMinutes || 1) * 60000;
    var pos = { id: Date.now(), sym: sym, dir: dir, amount: amount, entry: entry, time: new Date().toLocaleTimeString(), status: 'active', durationMs: durationMs };
    localPositions.push(pos);
    // Switch to position tab to show the user their trade
    var posTabBtn = document.querySelector('#futures-pos-tabs button[onclick*="position"]');
    if (posTabBtn) posTabBtn.click();
    renderActivePositions();
    setTimeout(function () {
        var idx = localPositions.findIndex(function (p) { return p.id === pos.id; });
        if (idx !== -1) localPositions[idx].status = 'settled';
        renderActivePositions();
        showToast('Trade closed: ' + dir + ' ' + sym + ' (' + (selectedOrderMinutes || 1) + 'min)');
    }, durationMs);
}

function setFuturesTab(btn, tab) {
    document.querySelectorAll('#futures-pos-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['position', 'history', 'invited', 'follow'].forEach(t => {
        const el = document.getElementById('futures-tab-' + t);
        if (el) el.style.display = t === tab ? 'block' : 'none';
    });
    if (_fakeHistTimer) { clearInterval(_fakeHistTimer); _fakeHistTimer = null; }
    if (tab === 'position') renderActivePositions();
    if (tab === 'history') loadTradeHistory();
    if (tab === 'invited') renderFakeInvited();
    if (tab === 'follow') renderFakeFollow();
}
function setTimeframe(btn, tf) {
    document.querySelectorAll('#futures-timeframes button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const sym = currentPair.replace(/[\\s\/]/g, '').replace('/USDT', '').toUpperCase() + 'USDT';
    initChart(sym.replace('USDTUSDT', 'USDT'), tf || '1m');
}

function setPerpTimeframe(btn, tf) {
    document.querySelectorAll('#perp-timeframes button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    initPerpChart('BTCUSDT', tf || '1h');
}

// ── ORDER PANEL ──
let currentOrderDir = 'CALL';
let selectedOrderMinutes = 1; // default 1-minute expiry

function _getTimeSlots() {
    var now = new Date();
    var slots = [];
    for (var i = 1; i <= 20; i++) {
        var t = new Date(now.getTime() + i * 60000);
        var hh = String(t.getHours()).padStart(2, '0');
        var mm = String(t.getMinutes()).padStart(2, '0');
        slots.push({ label: hh + ':' + mm, mins: i });
    }
    return slots;
}

function renderTimeSlots() {
    var container = document.querySelector('#order-panel .time-selector');
    if (!container) return;

    // Signal mode: show locked expiry time from admin-set duration
    if (activeSignal && activeSignal.duration) {
        var endTime = new Date(activeSignal.entryTime).getTime() + activeSignal.duration * 1000;
        var endDate = new Date(endTime);
        var hh = String(endDate.getHours()).padStart(2, '0');
        var mm = String(endDate.getMinutes()).padStart(2, '0');
        container.innerHTML = '<div class="time-slot active-time" style="cursor:default;">' + hh + ':' + mm + '</div>';
        return;
    }

    var slots = _getTimeSlots();
    container.innerHTML = slots.map(function (s) {
        var active = s.mins === selectedOrderMinutes ? ' active-time' : '';
        return '<div class="time-slot' + active + '" onclick="selectOrderTime(' + s.mins + ')">' + s.label + '</div>';
    }).join('');
}

function selectOrderTime(mins) {
    selectedOrderMinutes = mins;
    renderTimeSlots();
}

function openOrderPanel(dir) {
    currentOrderDir = dir;
    const btn = document.getElementById('order-action-btn');
    if (btn) { btn.textContent = dir; btn.style.background = dir === 'CALL' ? 'var(--up-color)' : 'var(--down-color)'; }
    const availSpan = document.querySelector('#order-panel .order-minmax .up');
    if (availSpan && userData) availSpan.textContent = (userData.tradeBalance || 0).toFixed(2);

    // Set pair title in panel header
    const pairTitle = document.querySelector('#order-panel .order-pair-title');
    if (pairTitle) {
        pairTitle.textContent = activeSignal ? activeSignal.pair.replace('/', ' / ') : (currentPair || 'BTC / USDT');
    }

    // Signal mode: use admin-set duration, else default to 1 min
    selectedOrderMinutes = (activeSignal && activeSignal.duration) ? Math.max(1, Math.round(activeSignal.duration / 60)) : 1;
    renderTimeSlots();
    document.getElementById('order-panel').style.display = 'block';
    document.getElementById('order-panel-overlay').style.display = 'block';
}
function closeOrderPanel() {
    document.getElementById('order-panel').style.display = 'none';
    document.getElementById('order-panel-overlay').style.display = 'none';
    activeSignal = null;
}
function setOrderPct(pct) {
    const el = document.getElementById('order-amount');
    const balance = userData?.tradeBalance || 0;
    if (el) {
        // Use Math.floor to truncate to 2 decimals instead of rounding up
        el.value = (Math.floor((balance * pct / 100) * 100) / 100).toFixed(2);
    }
}
function showPairPicker() {
    var list = document.getElementById('futures-pair-list');
    if (list) {
        list.innerHTML = allCoins.map(function (c) {
            var isActive = currentPair === c.sym + '/USDT';
            return '<div class="perp-pair-item' + (isActive ? ' selected' : '') + '" onclick="selectFuturesPair(\'' + c.sym + '\')">' + c.sym + ' / USDT</div>';
        }).join('');
    }
    var overlay = document.getElementById('futures-pair-picker-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function closeFuturesPairPicker() {
    var overlay = document.getElementById('futures-pair-picker-overlay');
    if (overlay) overlay.style.display = 'none';
}

function selectFuturesPair(sym) {
    closeFuturesPairPicker();
    openTradingPair(sym);
}

// ── PERPETUAL ──
function setPerpTab(btn, tab) {
    document.querySelectorAll('.perp-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const ab = document.getElementById('perp-action-btn');
    if (ab) { ab.textContent = tab === 'long' ? 'Open Long' : 'Open Short'; ab.style.background = tab === 'long' ? 'var(--up-color)' : 'var(--down-color)'; }
}
function setLeverage(btn) {
    document.querySelectorAll('.leverage-btns button').forEach(b => b.classList.remove('active-lev'));
    btn.classList.add('active-lev');
}
function adjPrice(d) { const el = document.getElementById('perp-price'); if (el) el.value = (parseFloat(el.value || 0) + d * 10).toFixed(2); }
function adjAmount(d) { const el = document.getElementById('perp-amount'); if (el) el.value = Math.max(0, parseFloat(el.value || 0) + d * 0.001).toFixed(3); }
function setPerpPct(pct) { showToast(pct + '% selected'); }

// ── ASSETS ──
let assetsVisible = true;
let _spotBal = null, _futuresBal = null, _perpBal = null;
function toggleAssetsVisibility() {
    assetsVisible = !assetsVisible;
    const bal = document.getElementById('assets-balance-val');
    const b = userData?.balance ?? 0;
    const p = userData?.profitBalance ?? 0;

    if (bal) bal.innerHTML = assetsVisible
        ? `${b.toFixed(2)} <i class="fa-solid fa-caret-down" style="font-size:14px;margin-left:4px;"></i>`
        : '****** <i class="fa-solid fa-caret-down" style="font-size:14px;margin-left:4px;"></i>';

    const pVal = userData?.todayPnl !== undefined ? userData.todayPnl : (userData?.profitBalance ?? 0);
    const pStr = pVal > 0 ? `+${pVal.toFixed(2)}` : pVal.toFixed(2);
    const pColor = pVal > 0 ? 'var(--up-color)' : (pVal < 0 ? 'var(--down-color)' : '#fff');

    const pnlEls = ['assets-pnl-val', 'exchange-pnl-val', 'trade-pnl-val'];
    pnlEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = assetsVisible ? pStr : '****';
            el.style.color = assetsVisible ? (id === 'assets-pnl-val' ? '#fff' : pColor) : '#fff';
        }
    });
}
async function refreshPnl() {
    await refreshUserData();
    showToast('PnL refreshed!');
}

// ── DEPOSIT ──
function setNetworkTab(btn, network) {
    document.querySelectorAll('.network-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const addr = window._depositAddresses?.[network];
    if (addr) {
        const el = document.getElementById('dep-addr');
        if (el) el.textContent = addr;
    } else {
        const addrs = { TRC20: '—', ERC20: '—', BEP20: '—', BTC: '—' };
        const el = document.getElementById('dep-addr');
        if (el) el.textContent = addrs[network] || addrs.TRC20;
    }
}

// ── CONVERT ──
function openConvertModal() { navTo('convert-screen'); loadConvertRates(); }
function closeConvertModal() { navTo('home-screen'); }

// ── FUND TRANSFER ──
function toggleDropdown(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
}
function selectDropdown(id, val) {
    const menu = document.getElementById(id);
    if (!menu) return;
    const sel = menu.previousElementSibling;
    if (sel) sel.querySelector('span').textContent = val;
    menu.style.display = 'none';
}
function selectTransferWallet(side, wallet) {
    const labelId = side === 'from' ? 'from-wallet-label' : 'to-wallet-label';
    const dropId = side === 'from' ? 'from-dropdown' : 'to-dropdown';
    const el = document.getElementById(labelId);
    if (el) el.textContent = wallet;
    const menu = document.getElementById(dropId);
    if (menu) menu.style.display = 'none';
    updateTransferAvail();
}

function _getSubBal(name) {
    if (name === 'Exchange') return _spotBal !== null ? _spotBal : (userData ? userData.balance : 0);
    if (name === 'Trade') return _futuresBal !== null ? _futuresBal : (userData ? (userData.tradeBalance || 0) : 0);
    if (name === 'Perpetual') return _perpBal !== null ? _perpBal : (userData ? (userData.perpetualBalance || 0) : 0);
    return 0;
}
function _setSubBal(name, val) {
    if (name === 'Exchange') _spotBal = val;
    else if (name === 'Trade') _futuresBal = val;
    else if (name === 'Perpetual') _perpBal = val;
}

function updateTransferAvail() {
    const from = document.getElementById('from-wallet-label')?.textContent || 'Exchange';
    const el = document.getElementById('transfer-avail-bal');
    if (el) el.textContent = _getSubBal(from).toFixed(2);
}

function setTransferAll() {
    const from = document.getElementById('from-wallet-label')?.textContent || 'Exchange';
    const inp = document.getElementById('transfer-amount');
    if (inp) inp.value = _getSubBal(from).toFixed(2);
}

function openCurrencyPicker() {
    const o = document.getElementById('currency-picker-overlay');
    if (o) o.style.display = 'block';
}
function closeCurrencyPicker() {
    const o = document.getElementById('currency-picker-overlay');
    if (o) o.style.display = 'none';
}
function selectCurrency(currency) {
    const lbl = document.getElementById('selected-currency-label');
    if (lbl) lbl.textContent = currency;
    closeCurrencyPicker();
}

async function doTransfer() {
    if (!authToken) { showToast('Please login first'); return; }
    const from = document.getElementById('from-wallet-label')?.textContent || '';
    const to = document.getElementById('to-wallet-label')?.textContent || '';
    if (from === to) { showToast('From and To cannot be the same'); return; }
    const amount = parseFloat(document.getElementById('transfer-amount')?.value);
    if (!amount || amount <= 0) { showToast('Please enter a valid amount'); return; }
    const fromBal = _getSubBal(from);
    if (amount > fromBal) { showToast('Insufficient ' + from + ' balance'); return; }
    const btn = document.querySelector('#fund-transfer-screen .btn-green-full');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
    try {
        const resp = await fetch('/api/wallet/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
            body: JSON.stringify({ fromWallet: from, toWallet: to, amount })
        });
        const data = await resp.json();
        if (resp.ok) {
            // Refresh balances from server after successful transfer
            try {
                const balResp = await fetch('/api/wallet/balance', { headers: { 'Authorization': 'Bearer ' + authToken } });
                const balData = await balResp.json();
                if (balResp.ok) {
                    _spotBal = balData.balance ?? _spotBal;
                    _futuresBal = balData.tradeBalance ?? _futuresBal;
                    _perpBal = balData.perpetualBalance ?? _perpBal;
                }
            } catch (e2) {
                _setSubBal(from, fromBal - amount);
                _setSubBal(to, _getSubBal(to) + amount);
            }
            const spotEl = document.getElementById('acct-exchange-bal');
            const futEl = document.getElementById('acct-trade-bal');
            const perpEl = document.getElementById('acct-perpetual-bal');
            if (spotEl) spotEl.textContent = (_spotBal || 0).toFixed(2);
            if (futEl) futEl.textContent = (_futuresBal || 0).toFixed(2);
            if (perpEl) perpEl.textContent = (_perpBal || 0).toFixed(2);
            document.getElementById('transfer-amount').value = '';
            updateTransferAvail();
            showToast('Transfer successful! ' + amount.toFixed(2) + ' USDT moved to ' + to);
        } else {
            showToast(data.error || 'Transfer failed. Please try again.');
        }
    } catch (e) {
        _setSubBal(from, fromBal - amount);
        _setSubBal(to, _getSubBal(to) + amount);
        const spotEl = document.getElementById('acct-exchange-bal');
        const futEl = document.getElementById('acct-trade-bal');
        const perpEl = document.getElementById('acct-perpetual-bal');
        if (spotEl) spotEl.textContent = (_spotBal || 0).toFixed(2);
        if (futEl) futEl.textContent = (_futuresBal || 0).toFixed(2);
        if (perpEl) perpEl.textContent = (_perpBal || 0).toFixed(2);
        document.getElementById('transfer-amount').value = '';
        updateTransferAvail();
        showToast('Transfer successful! ' + amount.toFixed(2) + ' USDT moved to ' + to);
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm'; }
}

// ── LOGIN/REGISTER TAB SWITCHES ──
function setLoginTab(btn, tab) {
    document.querySelectorAll('.login-type-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const emailGroup = document.getElementById('login-email-group');
    const mobileGroup = document.getElementById('login-mobile-group');
    if (emailGroup) emailGroup.style.display = tab === 'email' ? 'block' : 'none';
    if (mobileGroup) mobileGroup.style.display = tab === 'mobile' ? 'block' : 'none';
}

function setRegTab(btn, tab) {
    document.querySelectorAll('#register-screen .login-type-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showToast(tab === 'mobile' ? 'Mobile registration coming soon' : '');
}

// ── OTP TIMER ──
let currentCaptchaStr = '';

function drawCaptcha() {
    const canvas = document.getElementById('captcha-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const chars = '23456789abcdefghkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    currentCaptchaStr = '';
    for (let i = 0; i < 4; i++) {
        currentCaptchaStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Draw dots
    for (let i = 0; i < 50; i++) {
        ctx.fillStyle = `hsl(${Math.random() * 360}, 50%, 50%)`;
        ctx.beginPath();
        ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw text
    for (let i = 0; i < 4; i++) {
        ctx.font = 'bold 24px "Times New Roman", serif';
        ctx.fillStyle = `hsl(${Math.random() * 360}, 60%, 40%)`;
        ctx.save();
        ctx.translate(20 + i * 22, 28);
        ctx.rotate((Math.random() - 0.5) * 0.4);
        ctx.fillText(currentCaptchaStr[i], 0, 0);
        ctx.restore();
    }
}

function showCaptchaModal() {
    const email = document.getElementById('reg-email')?.value?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Please enter a valid email first');
        return;
    }
    const btn = document.getElementById('otp-btn');
    if (!btn || btn.disabled) return;

    document.getElementById('captcha-input').value = '';
    document.getElementById('captcha-overlay').style.display = 'flex';
    drawCaptcha();
}

function closeCaptcha() {
    document.getElementById('captcha-overlay').style.display = 'none';
}

async function verifyCaptchaAndSend() {
    const input = document.getElementById('captcha-input').value.trim();
    if (input.toLowerCase() !== currentCaptchaStr.toLowerCase()) {
        showToast('Incorrect verification code');
        drawCaptcha();
        return;
    }
    closeCaptcha();

    const email = document.getElementById('reg-email').value.trim();
    const btn = document.getElementById('otp-btn');
    btn.disabled = true;
    try {
        const res = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        let data;
        try {
            data = await res.json();
        } catch (err) {
            const txt = await res.text();
            showToast('Server Error: ' + (txt.slice(0, 100) || res.statusText));
            btn.disabled = false;
            return;
        }
        if (data.error) { showToast(data.error); btn.disabled = false; return; }
        showToast('Verification code sent successfully!');
    } catch (e) { showToast('Failed to send code: ' + e.message); btn.disabled = false; return; }
    let seconds = 60;
    btn.textContent = seconds + 's';
    const interval = setInterval(() => {
        seconds--;
        btn.textContent = seconds + 's';
        if (seconds <= 0) { clearInterval(interval); btn.disabled = false; btn.textContent = 'Send'; }
    }, 1000);
}

// ── PASTE ADDRESS ──
function pasteAddress() {
    if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(text => {
            const el = document.getElementById('withdrawal-addr');
            if (el) { el.value = text; showToast('Address pasted'); }
        }).catch(() => showToast('Paste from clipboard denied'));
    } else {
        showToast('Tap and hold the field to paste');
    }
}

// ── CLOSE WRONG PASS POPUP ──
function closeWrongPass() {
    const el = document.getElementById('wrong-pass-overlay');
    if (el) el.style.display = 'none';
}
function showBalanceCriteria() {
    const el = document.getElementById('balance-criteria-overlay');
    if (el) el.style.display = 'flex';
}
function closeBalanceCriteria() {
    const el = document.getElementById('balance-criteria-overlay');
    if (el) el.style.display = 'none';
}

// ── SET USER PROFILE (called on DOMContentLoaded) ──
function setUserProfile() {
    if (userData) {
        updateUIWithUserData();
    }
}

// ── CHART ──
let apexChart = null;
let apexChartData = [];
let apexChartRaw = [];
let apexPerpChart = null;
let apexPerpData = [];
let apexPerpRaw = [];
let chartState = { sym: 'BTCUSDT', tf: '1m', type: 'candle', vol: true, ma7: true, ma25: true };
let perpState = { sym: 'BTCUSDT', tf: '1h', type: 'candle', vol: true, ma7: true, ma25: true };

function _updateRealtimeChart(chartObj, state, kDataRaw) {
    if (!chartObj || !kDataRaw) return;
    try {
        chartObj.updateData({
            timestamp: kDataRaw[0],
            open: +kDataRaw[1],
            high: +kDataRaw[2],
            low: +kDataRaw[3],
            close: +kDataRaw[4],
            volume: +kDataRaw[5]
        });
    } catch (e) { console.error('KLine update error:', e); }
}

function _rebuildChart(candleData, rawKlines, state, containerId, height) {
    var c = document.getElementById(containerId);
    if (!c || !candleData.length) return null;
    try { klinecharts.dispose(containerId); } catch (e) { }
    c.innerHTML = '';
    c.style.width = '100%';
    c.style.height = height + 'px';

    var isLight = document.body.classList.contains('light-mode');
    var bg = 'transparent';
    var text = isLight ? '#6b7280' : '#848e9c';
    var grid = isLight ? '#e5e7eb' : '#1f2530';
    var up = '#02c076';
    var down = '#f84960';

    var chart;
    try {
        chart = klinecharts.init(containerId, {
            styles: {
                grid: { horizontal: { color: grid, style: 'dashed' }, vertical: { color: grid, style: 'dashed' } },
                candle: {
                    bar: { upColor: up, downColor: down, noChangeColor: up, upBorderColor: up, downBorderColor: down, noChangeBorderColor: up, upWickColor: up, downWickColor: down, noChangeWickColor: up },
                    area: { lineColor: up, backgroundColor: [{ offset: 0, color: 'rgba(2,192,118,0.4)' }, { offset: 1, color: 'rgba(2,192,118,0)' }] },
                    type: state.type === 'line' || state.type === 'area' ? 'area' : 'candle_solid',
                    tooltip: { showRule: 'none' }
                },
                xAxis: { axisLine: { color: grid }, tickLine: { color: grid }, tickText: { color: text } },
                yAxis: { axisLine: { color: grid }, tickLine: { color: grid }, tickText: { color: text } },
                separator: { color: grid },
                crosshair: { horizontal: { line: { color: '#848e9c' } }, vertical: { line: { color: '#848e9c' } } },
                indicator: { tooltip: { showRule: 'none' } }
            }
        });

        var pPrecision = 2;
        if (candleData.length && candleData[0].y[3] < 10) pPrecision = 4;
        if (candleData.length && candleData[0].y[3] < 1) pPrecision = 6;
        chart.setPriceVolumePrecision(pPrecision, 2);

        var kData = candleData.map(function (d, i) {
            return {
                timestamp: d.x,
                open: d.y[0],
                high: d.y[1],
                low: d.y[2],
                close: d.y[3],
                volume: rawKlines && rawKlines[i] ? +rawKlines[i][5] : 0
            };
        });

        chart.applyNewData(kData);

        if (state.vol) {
            try { chart.createIndicator('VOL', false, { id: 'pane_1' }); } catch (e) { }
        }
        if (state.ma7 || state.ma25) {
            var maArgs = [];
            if (state.ma7) maArgs.push(7);
            if (state.ma25) maArgs.push(25);
            try { chart.createIndicator({ name: 'MA', calcParams: maArgs }, false, { id: 'candle_pane' }); } catch (e) { }
        }
    } catch (e) {
        console.error('KLineChart error:', e);
    }
    return chart;
}

function initChart(symbol, interval) {
    interval = interval || '1m';
    const container = document.getElementById('main-chart');
    if (!container) return;
    if (apexChart) { try { apexChart.destroy(); } catch (e) { } apexChart = null; }
    apexChartData = []; apexChartRaw = [];
    chartState.sym = symbol.replace(/\//g, '').replace('USDTUSDT', 'USDT').replace(/\s+/g, '').toUpperCase();
    chartState.tf = interval;
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:340px;color:#4a5568;font-size:13px;">Loading...</div>';

    const sym = chartState.sym;
    let bSym = sym;
    if (bSym === 'XAUUSDT') bSym = 'PAXGUSDT';
    else if (bSym === 'XAGUSDT') bSym = 'LTCUSDT';
    else if (bSym === 'XPTUSDT') bSym = 'ETHUSDT';
    else if (bSym === 'XPDUSDT') bSym = 'BCHUSDT';

    // Use Binance Vision as fallback to avoid IP bans
    fetch('/api/mexc/klines?symbol=' + bSym + '&interval=' + interval + '&limit=150')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!Array.isArray(data)) return;
            apexChartRaw = data;
            apexChartData = data.map(function (k) { return { x: +k[0], y: [+k[1], +k[2], +k[3], +k[4]] }; });
            apexChart = _rebuildChart(apexChartData, apexChartRaw, chartState, 'main-chart', 360);
            updateOHLCRow('chart-ma-row', sym, interval, data[data.length - 1]);
        }).catch(function () {
            // Fallback to MEXC if Binance Vision fails
            fetch('/api/mexc/klines?symbol=' + bSym + '&interval=' + interval + '&limit=150')
                .then(r => r.json())
                .then(data => {
                    if (!Array.isArray(data)) return;
                    apexChartRaw = data;
                    apexChartData = data.map(function (k) { return { x: +k[0], y: [+k[1], +k[2], +k[3], +k[4]] }; });
                    apexChart = _rebuildChart(apexChartData, apexChartRaw, chartState, 'main-chart', 360);
                    updateOHLCRow('chart-ma-row', sym, interval, data[data.length - 1]);
                }).catch(() => { });
        });


    if (window._chartWs) { clearInterval(window._chartWs); window._chartWs = null; }
    function pollChartMexc() {
        fetch('/api/mexc/klines?symbol=' + bSym + '&interval=' + interval + '&limit=1')
            .then(r => r.json())
            .then(data => {
                if (!Array.isArray(data) || !data.length) return;
                var k = data[0];
                var rawC = [+k[0], +k[1], +k[2], +k[3], +k[4], +k[5]];
                if (apexChartData.length) {
                    var last = apexChartData[apexChartData.length - 1];
                    if (last.x === rawC[0]) {
                        apexChartData[apexChartData.length - 1] = { x: rawC[0], y: [+k[1], +k[2], +k[3], +k[4]] };
                        apexChartRaw[apexChartRaw.length - 1] = rawC;
                    } else {
                        apexChartData.push({ x: rawC[0], y: [+k[1], +k[2], +k[3], +k[4]] });
                        apexChartRaw.push(rawC);
                        if (apexChartData.length > 160) { apexChartData.shift(); apexChartRaw.shift(); }
                    }
                }
                updateOHLCRow('chart-ma-row', sym, interval, rawC);
                _updateRealtimeChart(apexChart, chartState, rawC);
            }).catch(() => { });
    }
    window._chartWs = setInterval(pollChartMexc, 2000);
}


function initPerpChart(symbol, interval) {
    symbol = symbol || 'BTCUSDT';
    interval = interval || '1h';
    const container = document.getElementById('perp-main-chart');
    if (!container) return;
    if (apexPerpChart) { try { apexPerpChart.destroy(); } catch (e) { } apexPerpChart = null; }
    apexPerpData = []; apexPerpRaw = [];
    perpState.sym = symbol.replace(/\//g, '').toUpperCase();
    perpState.tf = interval;
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:290px;color:#4a5568;font-size:13px;">Loading...</div>';

    const sym = perpState.sym;
    let bSym = sym;
    if (bSym === 'XAUUSDT') bSym = 'PAXGUSDT';
    else if (bSym === 'XAGUSDT') bSym = 'LTCUSDT';
    else if (bSym === 'XPTUSDT') bSym = 'ETHUSDT';
    else if (bSym === 'XPDUSDT') bSym = 'BCHUSDT';
    // Use Binance Vision as fallback to avoid IP bans
    fetch('/api/mexc/klines?symbol=' + bSym + '&interval=' + interval + '&limit=150')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!Array.isArray(data)) return;
            apexPerpRaw = data;
            apexPerpData = data.map(function (k) { return { x: +k[0], y: [+k[1], +k[2], +k[3], +k[4]] }; });
            apexPerpChart = _rebuildChart(apexPerpData, apexPerpRaw, perpState, 'perp-main-chart', 310);
            updateOHLCRow('perp-ma-row', sym, interval, data[data.length - 1]);
        }).catch(function () {
            // Fallback to MEXC if Binance Vision fails
            fetch('/api/mexc/klines?symbol=' + bSym + '&interval=' + interval + '&limit=150')
                .then(r => r.json())
                .then(data => {
                    if (!Array.isArray(data)) return;
                    apexPerpRaw = data;
                    apexPerpData = data.map(function (k) { return { x: +k[0], y: [+k[1], +k[2], +k[3], +k[4]] }; });
                    apexPerpChart = _rebuildChart(apexPerpData, apexPerpRaw, perpState, 'perp-main-chart', 310);
                    updateOHLCRow('perp-ma-row', sym, interval, data[data.length - 1]);
                }).catch(() => { });
        });


    if (window._perpWs) { clearInterval(window._perpWs); window._perpWs = null; }
    function pollPerpMexc() {
        fetch('/api/mexc/klines?symbol=' + bSym + '&interval=' + interval + '&limit=1')
            .then(r => r.json())
            .then(data => {
                if (!Array.isArray(data) || !data.length) return;
                var k = data[0];
                var rawC = [+k[0], +k[1], +k[2], +k[3], +k[4], +k[5]];
                if (apexPerpData.length) {
                    var last = apexPerpData[apexPerpData.length - 1];
                    if (last.x === rawC[0]) {
                        apexPerpData[apexPerpData.length - 1] = { x: rawC[0], y: [+k[1], +k[2], +k[3], +k[4]] };
                        apexPerpRaw[apexPerpRaw.length - 1] = rawC;
                    } else {
                        apexPerpData.push({ x: rawC[0], y: [+k[1], +k[2], +k[3], +k[4]] });
                        apexPerpRaw.push(rawC);
                        if (apexPerpData.length > 160) { apexPerpData.shift(); apexPerpRaw.shift(); }
                    }
                }
                updateOHLCRow('perp-chart-ma-row', sym, interval, rawC);
                _updateRealtimeChart(apexPerpChart, perpState, rawC);
            }).catch(() => { });
    }
    window._perpWs = setInterval(pollPerpMexc, 2000);
}


function _syncIndicators(chartObj, state) {
    if (!chartObj) return;
    try {
        if (state.vol) chartObj.createIndicator('VOL', false, { id: 'pane_1' });
        else chartObj.removeIndicator('pane_1', 'VOL');

        if (state.ma7 || state.ma25) {
            var maArgs = [];
            if (state.ma7) maArgs.push(7);
            if (state.ma25) maArgs.push(25);
            chartObj.createIndicator({ name: 'MA', calcParams: maArgs }, false, { id: 'candle_pane' });
        } else {
            chartObj.removeIndicator('candle_pane', 'MA');
        }
    } catch (e) { }
}

function _syncChartType(chartObj, state) {
    if (!chartObj) return;
    try {
        chartObj.setStyles({
            candle: { type: state.type === 'line' || state.type === 'area' ? 'area' : 'candle_solid' }
        });
    } catch (e) { }
}

function setChartType(type) {
    chartState.type = type;
    ['candle', 'line', 'area'].forEach(function (t) {
        var btn = document.getElementById('btn-type-' + t);
        if (btn) btn.classList.toggle('active', t === type);
    });
    _syncChartType(apexChart, chartState);
}

function toggleChartIndicator(ind) {
    chartState[ind] = !chartState[ind];
    var btn = document.getElementById('btn-ind-' + ind);
    if (btn) btn.classList.toggle('active', chartState[ind]);
    _syncIndicators(apexChart, chartState);
}

function setPerpChartType(type) {
    perpState.type = type;
    ['candle', 'line', 'area'].forEach(function (t) {
        var btn = document.getElementById('perp-btn-type-' + t);
        if (btn) btn.classList.toggle('active', t === type);
    });
    _syncChartType(apexPerpChart, perpState);
}

function togglePerpIndicator(ind) {
    perpState[ind] = !perpState[ind];
    var btn = document.getElementById('perp-btn-ind-' + ind);
    if (btn) btn.classList.toggle('active', perpState[ind]);
    _syncIndicators(apexPerpChart, perpState);
}

// ── PRODUCTION BACKEND INTEGRATION ──
let socket;
let authToken = localStorage.getItem('token');
let userData = null;
try { userData = JSON.parse(localStorage.getItem('user')); } catch (e) { userData = null; }
let activeSignals = [];   // array of current signals from server
let activeSignal = null;  // the signal the user clicked "Follow" on (used in placeOrder)
let signalTimers = {};    // signalId → setInterval handle
let currentPair = 'ETH/USDT';

function initSocket() {
    window.updateOHLCRow = function () { };
    socket = io();
    if (authToken) socket.emit('authenticate', authToken);

    socket.on('market_update', (prices) => {
        updateMarketUI(prices);
    });

    socket.on('new_signal', (signal) => {
        fetchSignals();
        showToast('New Signal: ' + signal.pair + ' ' + signal.direction);
        const tickerEl = document.getElementById('home-ticker-text');
        const sigTime = signal.entryTime ? new Date(signal.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const durMins = signal.duration ? Math.round(signal.duration / 60) + 'min' : '';
        if (tickerEl) tickerEl.textContent = 'HOT SIGNAL ALERT: ' + signal.pair + ' ' + signal.direction + (sigTime ? ' @ ' + sigTime : '') + (durMins ? ' | Duration: ' + durMins : '') + ' - GET READY TO TRADE!';
        // Show bell badge immediately
        const dot = document.getElementById('notif-dot-main');
        if (dot) { dot.style.display = 'block'; }
    });

    socket.on('signal_started', (signal) => {
        const idx = activeSignals.findIndex(function (s) { return s.id === signal.id; });
        if (idx !== -1) { activeSignals[idx] = signal; } else { activeSignals.push(signal); }
        renderSignalCards();
        showToast('Signal ACTIVE: ' + signal.pair + ' — Follow Now!');
        const tickerEl = document.getElementById('home-ticker-text');
        const sigTime = signal.entryTime ? new Date(signal.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const durMins = signal.duration ? Math.round(signal.duration / 60) + 'min' : '';
        if (tickerEl) tickerEl.textContent = '🔴 SIGNAL ACTIVE: ' + signal.pair + ' ' + signal.direction + (sigTime ? ' @ ' + sigTime : '') + (durMins ? ' | ' + durMins : '') + ' - TRADE NOW!';
        // Show bell badge immediately
        const dot = document.getElementById('notif-dot-main');
        if (dot) { dot.style.display = 'block'; }
        fetchNotifications();
    });

    socket.on('signal_completed', function (data) {
        activeSignals = activeSignals.filter(function (s) { return s.id !== data.signalId; });
        if (activeSignal && activeSignal.id === data.signalId) activeSignal = null;
        if (signalTimers[data.signalId]) { clearInterval(signalTimers[data.signalId]); delete signalTimers[data.signalId]; }
        renderSignalCards();
        refreshUserData();
        loadTradeHistory();
        showToast('Signal Resolved — check History tab for result!');
    });

    socket.on('signal_cancelled', function (data) {
        activeSignals = activeSignals.filter(function (s) { return s.id !== data.signalId; });
        if (activeSignal && activeSignal.id === data.signalId) activeSignal = null;
        if (signalTimers[data.signalId]) { clearInterval(signalTimers[data.signalId]); delete signalTimers[data.signalId]; }
        renderSignalCards();
    });

    // Live chat: admin reply received
    socket.on('chat_message', (msg) => {
        if (currentScreen === 'chat-screen') {
            appendChatBubble(msg);
            scrollChatToBottom();
        } else {
            // Show badge on Customer Support menu item
            updateChatUnreadBadge(1);
            showToast('Support: ' + (msg.content || 'Photo received'));
        }
    });

    socket.on('chat_resolved', () => {
        var area = document.getElementById('chat-messages');
        if (area) area.innerHTML = '<div class="chat-date-label">Today</div><div class="chat-bubble admin-bubble"><span>Your issue has been resolved. Thank you for contacting support!</span><span class="chat-time">Support</span></div>';
        updateChatUnreadBadge(0);
        showToast('Your support case has been resolved');
    });

    socket.on('notification', (notif) => {
        showToast(notif.title || notif.message);
        // Always show bell badge immediately
        const dot = document.getElementById('notif-dot-main');
        if (dot) dot.style.display = 'block';
        // If it's a signal notification, also update the news ticker
        if (notif.type === 'SIGNAL') {
            const tickerEl = document.getElementById('home-ticker-text');
            if (tickerEl) tickerEl.textContent = '🔔 ' + notif.title + ' - ' + notif.message;
        }
        fetchNotifications();
    });
}

function flashEl(el, isUp) {
    if (!el) return;
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth;
    el.classList.add(isUp ? 'flash-up' : 'flash-down');
}

function updateMarketUI(prices) {
    for (const [pair, data] of Object.entries(prices)) {
        // Skip invalid/zero prices to prevent flash
        if (!data.price || data.price <= 0) continue;

        const up = data.change >= 0;
        const sym = pair.replace('/USDT', '').replace('USDT', '');

        // Update allCoins with sparkline history
        const coin = allCoins.find(c => c.sym === sym);
        if (coin) {
            const prevPrice = parseFloat(coin.price.replace(/,/g, '')) || 0;
            let formattedPrice = data.price < 0.1 ? data.price.toFixed(5) : (data.price < 100 ? data.price.toFixed(4) : data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            coin.price = formattedPrice;
            coin.ch = (up ? '+' : '') + data.change.toFixed(2) + '%';
            coin.up = up;
            // Leave the sparkline arrays alone so the charts stay exactly as their initial wavy shapes.
            const hmPrice = document.getElementById('hm-price-' + sym);
            const hmChg = document.getElementById('hm-chg-' + sym);
            if (hmPrice) { hmPrice.textContent = coin.price; hmPrice.style.color = '#1a1a2e'; }
            if (hmChg) {
                hmChg.textContent = coin.ch;
                hmChg.style.background = up ? '#02c076' : '#f84960';
                hmChg.style.color = '#fff';
            }
        }

        // Update mini ticker by ID (fast, no DOM scan)
        const priceEl = document.getElementById('tick-price-' + sym);
        const chgEl = document.getElementById('tick-badge-' + sym);
        const spEl = document.getElementById('tick-sp-' + sym);
        if (priceEl) {
            const prev = priceEl.textContent;
            let formattedPrice = data.price < 0.1 ? data.price.toFixed(5) : (data.price < 100 ? data.price.toFixed(4) : data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            priceEl.textContent = formattedPrice;
            priceEl.className = 'price ' + (up ? 'up' : 'down');
            if (prev !== priceEl.textContent) flashEl(priceEl, up);
        }
        if (chgEl) {
            chgEl.textContent = (up ? '+' : '') + data.change.toFixed(2) + '%';
            chgEl.style.background = up ? '#00c087' : '#f84960';
        }
        if (spEl && coin) spEl.innerHTML = makeSparkline(coin);

        // Update futures screen live price (if this pair is active)
        const activeSym = currentPair.replace('/USDT', '').replace(/[\\s\/]/g, '');
        if (sym === activeSym) {
            const fpEl = document.getElementById('futures-live-price');
            const fcEl = document.getElementById('futures-price-chg');
            const pn = document.querySelector('#futures-screen .pair-change');
            if (fpEl) {
                let formattedPrice = data.price < 0.1 ? data.price.toFixed(5) : (data.price < 100 ? data.price.toFixed(4) : data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                fpEl.textContent = formattedPrice + ' USDT';
                fpEl.className = 'futures-live-price-val ' + (up ? 'up' : 'down');
                flashEl(fpEl, up);
            }
            if (fcEl) { fcEl.textContent = (up ? '+' : '') + data.change.toFixed(2) + '%'; fcEl.className = up ? 'up' : 'down'; }
            if (pn) { pn.textContent = ' ' + (up ? '+' : '') + data.change.toFixed(2) + '%'; pn.className = 'pair-change ' + (up ? 'up' : 'down'); }
            // Update High / Low / Volume stats
            const fHighEl = document.getElementById('futures-price-high');
            const fLowEl = document.getElementById('futures-price-low');
            const fVolEl = document.getElementById('futures-price-vol');
            if (fHighEl && data.high) fHighEl.textContent = data.high.toLocaleString();
            if (fLowEl && data.low) fLowEl.textContent = data.low.toLocaleString();
            if (fVolEl && data.volume) {
                const v = data.volume;
                fVolEl.textContent = v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(2) + 'K' : v.toFixed(2);
            }
        }

        // Update perpetual screen if BTC
        if (sym === 'BTC') {
            const ppEl = document.getElementById('perp-live-price');
            const puEl = document.getElementById('perp-live-usd');
            if (ppEl) { ppEl.textContent = data.price.toLocaleString(); ppEl.className = 'perp-price ' + (up ? 'up' : 'down'); flashEl(ppEl, up); }
            if (puEl) { puEl.textContent = '≈ $' + data.price.toLocaleString(); puEl.className = 'perp-usd ' + (up ? 'up' : 'down'); }
            const perpPriceInput = document.getElementById('perp-price');
            if (perpPriceInput) perpPriceInput.value = data.price.toFixed(2);
        }
    }

    // Re-render markets search list (targeted rebuild only when on that screen)
    if (currentScreen === 'markets-screen') {
        renderMarkets(document.getElementById('markets-search-input')?.value || '');
    }
    // Home market: targeted updates already done above per-coin, no full rebuild needed
}

async function fetchNotifications() {
    if (!authToken) return;
    try {
        const res = await fetch('/api/user/notifications', { headers: { 'Authorization': `Bearer ${authToken}` } });
        if (!res.ok) return;
        const notifs = await res.json();
        const container = document.getElementById('notif-list-container');
        if (!container) return;
        if (!notifs.length) {
            container.innerHTML = '<div class="no-data-block" style="padding-top:60px;"><i class="fa-regular fa-bell" style="font-size:40px;color:var(--text-muted);margin-bottom:12px;"></i><p>No notifications</p></div>';
            return;
        }
        container.innerHTML = notifs.map(n => `
            <div class="notif-item ${n.read ? '' : 'unread'}">
                <div class="notif-icon ${n.type ? n.type.toLowerCase() : ''}"><i class="fa-solid fa-bell"></i></div>
                <div class="notif-content">
                    <div class="notif-title">${n.title}</div>
                    <div class="notif-msg">${n.message}</div>
                    <div class="notif-time">${new Date(n.createdAt).toLocaleString()}</div>
                </div>
            </div>
        `).join('');
        const unread = notifs.some(n => !n.read);
        const dot = document.getElementById('notif-dot-main');
        if (dot) dot.style.display = unread ? 'block' : 'none';
    } catch (err) { }
}

async function markAllRead() {
    if (!authToken) return;
    await fetch('/api/user/notifications/read', { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` } });
    fetchNotifications();
}

function updateUIWithUserData() {
    if (!userData) return;

    // Sidebar
    const emailEl = document.getElementById('sidebar-email');
    const idEl = document.getElementById('sidebar-uid');
    if (emailEl) {
        const email = userData.email || '';
        const savedPhone = localStorage.getItem('phone_' + email);
        const display = savedPhone || email;
        emailEl.textContent = display.length > 24 ? display.substring(0, 22) + '...' : display;
    }
    if (idEl && userData.id) {
        idEl.style.display = 'flex';
        idEl.innerHTML = `ID: ${userData.id.substring(0, 12).toUpperCase()} <i class="fa-regular fa-copy" onclick="copyText('${userData.id.substring(0, 12).toUpperCase()}')" style="cursor:pointer;"></i>`;
    }
    // Personal Center profile card — show phone if saved, else email
    const pcEmail = document.getElementById('pc-email');
    if (pcEmail) {
        const savedPhone = localStorage.getItem('phone_' + (userData.email || ''));
        pcEmail.textContent = savedPhone || userData.email || 'Not logged in';
    }
    const pcUid = document.getElementById('pc-uid');
    const pcUidVal = document.getElementById('pc-uid-val');
    if (pcUid && userData.id) {
        pcUid.style.display = 'flex';
        if (pcUidVal) pcUidVal.textContent = userData.id.substring(0, 12).toUpperCase();
    }
    const pcKycBadge = document.getElementById('pc-kyc-badge');
    if (pcKycBadge) {
        const isVerified = userData.isVerified || false;
        pcKycBadge.innerHTML = isVerified
            ? '<i class="fa-solid fa-circle-check" style="font-size:11px;"></i> Verified'
            : '<i class="fa-solid fa-circle-xmark" style="font-size:11px;"></i> Unverified';
        pcKycBadge.className = isVerified ? 'pc-badge-verified verified-ok' : 'pc-badge-verified';
    }
    // Update avatar with user initials
    const pcAvatar = document.getElementById('pc-avatar');
    if (pcAvatar && userData.email) {
        const initial = (userData.email[0] || 'U').toUpperCase();
        pcAvatar.innerHTML = `<div style="width:100%;height:100%;background:linear-gradient(135deg,#4c1d95,#8b5cf6);display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:28px;font-weight:800;color:#fff;">${initial}</div>`;
    }

    // Assets balance — always show real USDT balance unchanged
    const balEl = document.getElementById('assets-balance-val');
    if (balEl) balEl.innerHTML = `${(userData.balance || 0).toFixed(2)} <span style="font-size:13px;font-weight:500;margin-left:4px;">USDT</span> <i class="fa-solid fa-caret-down" style="font-size:14px;margin-left:4px;"></i>`;

    // My account sub-balances — initialise spot only once; futures/perp track their own balances
    // My account sub-balances from backend
    const totalAssetVal = (userData.balance || 0) + (userData.tradeBalance || 0) + (userData.perpetualBalance || 0);
    if (document.getElementById("assets-balance-val")) document.getElementById("assets-balance-val").innerHTML = `${totalAssetVal.toFixed(2)} <span style="font-size:13px;font-weight:500;margin-left:4px;">USDT</span> <i class="fa-solid fa-caret-down" style="font-size:14px;margin-left:4px;"></i>`;
    const exchBal = document.getElementById('acct-exchange-bal');
    if (exchBal) exchBal.textContent = (userData.exchangeBalance || userData.balance || 0).toFixed(2);
    const tradeBal = document.getElementById('acct-trade-bal');
    if (tradeBal) tradeBal.textContent = (userData.tradeBalance || 0).toFixed(2);
    const perpBal = document.getElementById('acct-perpetual-bal');
    if (perpBal) perpBal.textContent = (userData.perpetualBalance || 0).toFixed(2);

    // Exchange sub-screen — header shows total, coin list stays at 0
    const exBalVal = userData.exchangeBalance || userData.balance || 0;
    const exchHeader = document.getElementById('exchange-assets-bal');
    if (exchHeader) exchHeader.innerHTML = `${exBalVal.toFixed(2)} <i class="fa-solid fa-caret-down" style="font-size:14px;margin-left:4px;"></i>`;

    // Trade sub-screen
    const trBalVal = userData.tradeBalance || 0;
    const tradeHeader = document.getElementById('trade-assets-bal');
    if (tradeHeader) tradeHeader.innerHTML = `${trBalVal.toFixed(2)} <i class="fa-solid fa-caret-down" style="font-size:14px;margin-left:4px;"></i>`;
    const trAvail = document.getElementById('trade-usdt-avail');
    if (trAvail) trAvail.textContent = trBalVal.toFixed(2);
    const trFreeze = document.getElementById('trade-usdt-freeze');
    if (trFreeze) trFreeze.textContent = (userData.lockedBalance || 0).toFixed(2);
    const trVal = document.getElementById('trade-usdt-val');
    if (trVal) trVal.textContent = `≈ ${trBalVal.toFixed(2)}`;

    // PnL
    const pVal = userData.todayPnl !== undefined ? userData.todayPnl : (userData.profitBalance || 0);
    const pStr = pVal > 0 ? `+${pVal.toFixed(2)}` : pVal.toFixed(2);
    const pColor = pVal > 0 ? 'var(--up-color)' : (pVal < 0 ? 'var(--down-color)' : '#fff');
    const pnlEls = ['assets-pnl-val', 'exchange-pnl-val', 'trade-pnl-val'];
    pnlEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = assetsVisible ? pStr : '****';
            el.style.color = assetsVisible ? (id === 'assets-pnl-val' ? '#fff' : pColor) : '#fff';
        }
    });

    // Referral link
    const refLinkEl = document.getElementById('ref-link-text');
    if (refLinkEl) refLinkEl.textContent = `${window.location.origin}/register?ref=${userData.referralCode || ''}`;

    // Referral stats
    const refCountEl = document.getElementById('ref-count');
    if (refCountEl) refCountEl.textContent = (userData.referrals || []).length;

    const refEarnedEl = document.getElementById('ref-earned');
    if (refEarnedEl) refEarnedEl.textContent = (userData.referralBalance || 0).toFixed(2);

    // Referral list (update both referrals-screen and share-screen containers)
    const refContainers = [document.getElementById('ref-list-container'), document.getElementById('share-ref-list-container')];
    const refs = userData.referrals || [];
    let htmlContent = '<div class="no-data-block"><p>No referrals yet</p></div>';

    if (refs.length > 0) {
        htmlContent = refs.map(r => {
            const commission = ((r.investments || 0) * 0.05).toFixed(2);
            return `
                <div class="ref-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0;">
                    <div>
                        <div class="ref-user" style="font-weight:600;font-size:14px;color:var(--text-primary);">${r.email}</div>
                        <div class="ref-date" style="font-size:12px;color:var(--text-secondary);">${new Date(r.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div class="ref-income" style="font-weight:600;color:var(--up-color);">+${commission} USDT</div>
                </div>`;
        }).join('');
    }

    refContainers.forEach(container => {
        if (container) container.innerHTML = htmlContent;
    });

    // Share screen invite code
    const shareCodeEl = document.getElementById('share-invite-code');
    if (shareCodeEl && userData.referralCode) shareCodeEl.textContent = userData.referralCode;

    const shareRefBtn = document.getElementById('share-ref-link');
    if (shareRefBtn && userData.referralCode) {
        shareRefBtn.onclick = () => copyText(`${window.location.origin}/register?ref=${userData.referralCode}`);
    }

    // Withdrawal balance hint
    const hintEl = document.querySelector('#withdrawal-screen .input-hint');
    if (hintEl) hintEl.textContent = `Balance: ${userData.balance.toFixed(2)} USDT`;
    const wbHint = document.getElementById('withdrawal-balance-hint');
    if (wbHint && userData.balance !== undefined) wbHint.textContent = `Available: ${userData.balance.toFixed(2)} USDT`;

    // Order panel available balance
    const availSpan = document.querySelector('#order-panel .order-minmax .up');
    if (availSpan) availSpan.textContent = (userData.tradeBalance || 0).toFixed(2);

    // Fund transfer available balance
    updateTransferAvail();

    // Convert screen available balance
    var convertAvailEl = document.getElementById('convert-avail');
    if (convertAvailEl) convertAvailEl.textContent = userData.balance.toFixed(2) + ' USDT';

    // Store deposit address for deposit screen
    if (userData.depositAddress) {
        const depEl = document.getElementById('dep-addr');
        if (depEl) depEl.textContent = userData.depositAddress;
    }

    // Trade screen balance
    const tradeBalEls = document.querySelectorAll('#trade-screen .assets-balance');
    tradeBalEls.forEach(el => {
        el.innerHTML = `${userData.balance.toFixed(2)} <i class="fa-solid fa-caret-down" style="font-size:14px;margin-left:4px;"></i>`;
    });
    const tradeAvailEl = document.querySelector('#trade-screen .detail-val.up');
    if (tradeAvailEl) tradeAvailEl.textContent = userData.balance.toFixed(2);
}

async function loadDepositInfo() {
    if (!authToken) return;
    try {
        const res = await fetch('/api/wallet/info', { headers: { 'Authorization': `Bearer ${authToken}` } });
        if (!res.ok) return;
        const data = await res.json();
        const activeNet = document.querySelector('.network-tabs button.active')?.textContent?.trim() || 'TRC20';
        const addr = data.addresses?.[activeNet] || data.addresses?.TRC20 || '—';
        const depEl = document.getElementById('dep-addr');
        if (depEl) depEl.textContent = addr;
        window._depositAddresses = data.addresses || {};

        // Load real QR code for TRC20 (TRON HD wallet)
        const qrBox = document.getElementById('dep-qr-box');
        if (qrBox && data.addresses?.TRC20 && data.addresses.TRC20.length === 34) {
            const qrRes = await fetch('/api/wallet/address', { headers: { 'Authorization': `Bearer ${authToken}` } });
            if (qrRes.ok) {
                const qrData = await qrRes.json();
                if (qrData.qr_code_base64) {
                    qrBox.innerHTML = '<img src="' + qrData.qr_code_base64 + '" style="width:160px;height:160px;border-radius:8px;" />';
                }
            }
        }
    } catch (err) { }
}

function switchDepositNetwork(btn, network) {
    document.querySelectorAll('.network-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const addr = window._depositAddresses?.[network] || '—';
    const depEl = document.getElementById('dep-addr');
    if (depEl) depEl.textContent = addr;
}

async function loadTransactions() {
    const container = document.getElementById('transaction-list');
    if (!container) return;
    if (!authToken) {
        container.innerHTML = '<div class="no-data-block" style="padding-top:60px;"><i class="fa-solid fa-file-invoice" style="font-size:48px;color:var(--text-muted);margin-bottom:14px;"></i><p>Please login to view transactions</p></div>';
        return;
    }
    container.innerHTML = '<div class="no-data-block" style="padding-top:60px;"><p>Loading...</p></div>';
    try {
        const res = await fetch('/api/wallet/transactions', { headers: { 'Authorization': `Bearer ${authToken}` } });
        if (!res.ok) { container.innerHTML = '<div class="no-data-block" style="padding-top:60px;"><p>Failed to load transactions</p></div>'; return; }
        const txs = await res.json();
        if (!txs.length) {
            container.innerHTML = '<div class="no-data-block" style="padding-top:60px;"><i class="fa-solid fa-file-invoice" style="font-size:48px;color:var(--text-muted);margin-bottom:14px;"></i><p>No transactions yet</p></div>';
            return;
        }
        const statusClass = { PENDING: 'pending-status', COMPLETED: 'paid-status', FAILED: 'fail-status' };
        const statusLabel = { PENDING: 'Pending', COMPLETED: 'Completed', FAILED: 'Failed' };
        container.innerHTML = txs.map(tx => `
            <div class="record-item">
                <div class="record-left">
                    <div class="record-title">${tx.type === 'DEPOSIT' ? 'Deposit' : tx.type === 'WITHDRAWAL' ? 'Withdrawal' : tx.type}</div>
                    <div class="record-time">${new Date(tx.createdAt).toLocaleString()}</div>
                </div>
                <div class="record-right">
                    <div class="record-coin">${tx.amount.toFixed(2)} USDT</div>
                    <div class="record-status ${statusClass[tx.status] || 'pending-status'}">${statusLabel[tx.status] || tx.status}</div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = '<div class="no-data-block" style="padding-top:60px;"><p>Error loading transactions</p></div>';
    }
}

async function loadTradeHistory() {
    const container = document.getElementById('futures-tab-history');
    if (!container) return;
    if (!authToken) return;
    try {
        const res = await fetch('/api/signals/my-trades', { headers: { 'Authorization': `Bearer ${authToken}` } });
        if (!res.ok) return;
        const trades = await res.json();
        if (!trades.length) {
            container.innerHTML = '<div class="no-data-block"><i class="fa-solid fa-clock-rotate-left" style="font-size:40px;color:var(--text-muted);margin-bottom:12px;"></i><p>No trade history</p></div>';
            return;
        }
        let totalTurnover = 0, totalProfit = 0;
        const rows = trades.map(t => {
            const isPending = t.outcome === 'PENDING';
            const isWin = t.outcome === 'WIN';
            const isCancelled = t.outcome === 'CANCELLED';
            const profit = isPending ? null : (isCancelled ? 0 : (isWin ? (t.profit || 0) : -t.amount));
            if (!isPending && !isCancelled) { totalTurnover += t.amount; totalProfit += profit; }
            const pair = t.signal?.pair || t.pair || 'UNKNOWN';
            const dir = t.signal?.direction || t.direction || '--';
            const date = new Date(t.createdAt).toLocaleString();
            const profitStr = isPending
                ? '<span style="color:var(--text-muted)">Pending...</span>'
                : (isCancelled ? '<span style="color:var(--text-muted)">0.00 USDT</span>' : `<span class="${profit >= 0 ? 'up' : 'down'}">${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USDT</span>`);
            const statusColor = isWin ? 'up' : (isPending || isCancelled ? '' : 'down');
            const dirClass = dir === 'CALL' ? 'up' : 'down';
            const dirIcon = dir === 'CALL' ? '▲' : '▼';
            return `
                <div class="history-order" style="margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        <span style="font-weight:600;font-size:13px;">${pair.replace(/[\s\/]/g, '')}</span>
                        <span class="${dirClass}" style="font-weight:600;">${dirIcon} ${dir}</span>
                    </div>
                    <div class="card-row"><span class="lbl">Entry Price</span><span class="val">${t.entryPrice ? Number(t.entryPrice).toFixed(4) : '--'}</span></div><div class="card-row"><span class="lbl">Close Price</span><span class="val">${t.closePrice ? Number(t.closePrice).toFixed(4) : '--'}</span></div><div class="card-row"><span class="lbl">Amount</span><span class="val">${t.amount.toFixed(2)} USDT</span></div>
                    <div class="card-row"><span class="lbl">Time</span><span class="val">${date}</span></div>
                    <div class="card-row"><span class="lbl">Status</span><span class="val ${statusColor}" style="font-weight:600;">${t.outcome}</span></div>
                    <div class="card-row"><span class="lbl">Profit/Loss</span><span class="val" style="font-weight:600;">${profitStr}</span></div>
                </div>`;
        }).join('');
        const rate = totalTurnover > 0 ? ((totalProfit / totalTurnover) * 100).toFixed(2) : '0.00';
        container.innerHTML = `
            <div class="history-summary">
                <div class="history-row"><span class="lbl">Turnover</span><span class="val">${totalTurnover.toFixed(2)}</span></div>
                <div class="history-row"><span class="lbl">Profit/Loss</span><span class="val ${totalProfit >= 0 ? 'up' : 'down'}">${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}</span></div>
                <div class="history-row"><span class="lbl">Rate of return</span><span class="val">${rate}%</span></div>
            </div>
            ${rows}`;
    } catch (err) { }
}

async function fetchSignals() {
    if (!authToken) return;
    try {
        const res = await fetch('/api/signals', { headers: { 'Authorization': 'Bearer ' + authToken } });
        if (!res.ok) return;
        const data = await res.json();
        activeSignals = Array.isArray(data.signals) ? data.signals : [];
        if (data.tiers) {
            window.appTiers = data.tiers;
            renderVipTiers(data.tiers);
        }
        renderSignalCards();
    } catch (e) { }
}

function renderVipTiers(tiers) {
    const tbody = document.getElementById('vip-tiers-tbody');
    if (!tbody) return;

    // We expect tiers.t1, tiers.t2, etc. (up to t4 or higher)
    let html = '';
    const tierLimits = [
        { lv: 1, min: tiers.t1 || 500, label: '1 Signal / day' },
        { lv: 2, min: tiers.t2 || 1000, label: '2 Signals / day' },
        { lv: 3, min: tiers.t3 || 1500, label: '3 Signals / day' },
        { lv: 4, min: tiers.t4 || 2000, label: '4 Signals / day' }
    ];

    tierLimits.forEach(function (t, idx) {
        let max = tierLimits[idx + 1] ? tierLimits[idx + 1].min : '';
        html += `
        <tr>
            <td style="padding:5px;">LV${t.lv}</td>
            <td style="text-align:right;padding:5px;">$${t.min} ${max !== '' ? 'to $' + (max - 1) : 'and above'} <span style="display:block;font-size:10px;color:var(--accent);margin-top:2px;">(${t.label})</span></td>
        </tr>`;
    });

    tbody.innerHTML = html;

    const minLabel = document.getElementById('min-tier-label');
    if (minLabel && tiers.t1) minLabel.innerText = '$' + tiers.t1;
}

function fmtCountdown(seconds) {
    if (seconds <= 0) return '00:00';
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function renderSignalCards() {
    var container = document.getElementById('signals-container');
    if (!container) return;
    container.style.display = 'none';
    container.innerHTML = '';
}

function followSignal(signalId) {
    if (!authToken) { navTo('login-screen'); return; }
    const _totalBal = ((userData?.balance || 0) + (userData?.tradeBalance || 0) + (userData?.perpetualBalance || 0));
    const minTier1 = window.appTiers ? window.appTiers.t1 : 300;
    if (userData && _totalBal < minTier1) { showBalanceCriteria(); return; }
    var sig = activeSignals.find(function (s) { return s.id === signalId; });
    if (!sig) return;
    activeSignal = sig;

    var sym = sig.pair.replace(/[\\s\/]/g, '').replace('USDTUSDT', 'USDT');
    initChart(sym);
    switchTab('futures-screen');
    // Small delay so futures screen is visible before panel opens
    setTimeout(function () { openOrderPanel(sig.direction); }, 80);
    showToast('Signal: ' + sig.pair + ' ' + sig.direction + ' — enter amount and confirm!');
}

async function refreshUserData() {
    if (!authToken) return;
    try {
        const res = await fetch('/api/user/me', { headers: { 'Authorization': `Bearer ${authToken}` } });
        if (res.status === 401 || res.status === 403) {
            doLogout();
            return;
        }
        if (!res.ok) return;
        const data = await res.json();
        userData = data;
        localStorage.setItem('user', JSON.stringify(userData));
        updateUIWithUserData();
    } catch (err) {
        console.error('Refresh error:', err);
    }
}

async function doLogin() {
    const emailGroup = document.getElementById('login-email-group');
    let identifier = '';
    if (emailGroup && emailGroup.style.display !== 'none') {
        identifier = document.getElementById('login-email').value;
    } else {
        identifier = document.getElementById('login-mobile').value;
    }

    const pass = document.getElementById('login-pass').value;
    if (!identifier || !pass) { showToast('Please enter credentials'); return; }

    const loginBtn = document.querySelector('#login-screen .btn-green-full');
    const originalText = loginBtn.textContent;
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: identifier, password: pass })
        });
        const data = await res.json();
        if (res.ok) {
            authToken = data.token;
            userData = data.user;
            localStorage.setItem('token', authToken);
            localStorage.setItem('user', JSON.stringify(userData));
            if (socket) socket.emit('authenticate', authToken);
            if (typeof showSuccessModal === 'function') {
                showSuccessModal('Login successful!');
            } else {
                showToast('Login successful!');
            }
            refreshUserData();
            fetchSignals();
            navTo('home-screen');
        } else {
            showToast(data.error || 'Login failed');
            if (data.error === 'Incorrect password') {
                document.getElementById('wrong-pass-overlay').style.display = 'flex';
            }
        }
    } catch (err) {
        showToast('Connection error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = originalText;
    }
}

async function doRegister() {
    const email = document.getElementById('reg-email')?.value?.trim();
    const phone = document.getElementById('reg-phone')?.value?.trim();
    const code = document.getElementById('reg-code')?.value?.trim();
    const pass = document.getElementById('reg-pass')?.value;
    const confirm = document.getElementById('reg-confirm')?.value;
    const ref = document.getElementById('reg-invite')?.value?.trim();
    if (!email || !pass || !confirm) { showToast('Please fill all fields'); return; }
    if (!phone) { showToast('Please enter your mobile number'); return; }
    if (!code) { showToast('Please enter the verification code'); return; }
    if (pass !== confirm) { showToast('Passwords do not match'); return; }
    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass, referralCode: ref, otp: code })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        // Save phone linked to this email in localStorage
        localStorage.setItem('phone_' + email, '+92' + phone);
        showToast('Registration successful! Please login.');
        _showScreen('login-screen');
    } catch (err) { showToast('Server error'); }
}

async function doForgotPassword() {
    const email = document.getElementById('forgot-email')?.value?.trim();
    if (!email) { showToast('Please enter your email'); return; }
    try {
        const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        const token = data.resetToken || '';
        document.getElementById('forgot-token-display').textContent = token;
        document.getElementById('reset-token-input').value = token;
        document.getElementById('forgot-step1').style.display = 'none';
        document.getElementById('forgot-step2').style.display = 'block';
        showToast('Reset token generated!');
    } catch (err) { showToast('Server error. Try again.'); }
}

async function doResetPassword() {
    const token = document.getElementById('reset-token-input')?.value?.trim();
    const newPass = document.getElementById('reset-new-pass')?.value;
    if (!token || !newPass) { showToast('Please fill all fields'); return; }
    if (newPass.length < 6) { showToast('Password must be at least 6 characters'); return; }
    try {
        const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, newPassword: newPass })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        showToast('Password reset successfully! Please login.');
        document.getElementById('forgot-step1').style.display = 'block';
        document.getElementById('forgot-step2').style.display = 'none';
        navTo('login-screen');
    } catch (err) { showToast('Server error. Try again.'); }
}

function showBindAddrTip() {
    const el = document.getElementById('bind-addr-tip-overlay');
    if (el) el.style.display = 'flex';
}
function closeBindAddrTip() {
    const el = document.getElementById('bind-addr-tip-overlay');
    if (el) el.style.display = 'none';
}

async function doWithdrawal() {
    if (!authToken) { showToast('Please login first'); navTo('login-screen'); return; }
    const bound = localStorage.getItem('boundWithdrawAddress');
    if (!bound) { showBindAddrTip(); return; }
    // Frontend freeze check (backend also enforces this)
    const freezeUntil = localStorage.getItem('withdrawFreezeUntil');
    if (freezeUntil && new Date() < new Date(freezeUntil)) {
        const remaining = Math.ceil((new Date(freezeUntil) - new Date()) / 3600000);
        showToast(`Withdrawals frozen for ${remaining} more hour(s) after address change.`);
        return;
    }
    const amount = parseFloat(document.getElementById('withdrawal-amount')?.value);
    if (!amount || amount <= 0) { showToast('Please enter a valid amount'); return; }
    if (userData && amount > userData.balance) { showToast('Insufficient balance'); return; }
    try {
        const res = await fetch('/api/wallet/withdraw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ amount })
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Withdrawal failed'); return; }
        showToast('Withdrawal submitted successfully!');
        document.getElementById('withdrawal-amount').value = '';
        refreshUserData();
    } catch (err) { showToast('Withdrawal failed'); }
}

async function submitDepositProof() {
    if (!authToken) { showToast('Please login first'); return; }
    const txHash = document.getElementById('deposit-txhash')?.value?.trim();
    const amount = parseFloat(document.getElementById('deposit-amount-input')?.value);
    if (!txHash) { showToast('Please enter transaction hash'); return; }
    if (!amount || amount < 10) { showToast('Minimum deposit is 10 USDT'); return; }
    const network = document.querySelector('.network-tabs button.active')?.textContent || 'TRC20';
    try {
        const res = await fetch('/api/wallet/deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ txHash, amount, network })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        showToast('Deposit submitted for review!');
        document.getElementById('deposit-txhash').value = '';
        document.getElementById('deposit-amount-input').value = '';
    } catch (e) { showToast('Submission failed'); }
}

function doLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    authToken = null;
    userData = null;
    if (socket) { socket.disconnect(); socket = null; }
    if (apexChart) { try { apexChart.destroy(); } catch (e) { } apexChart = null; }
    showToast('Logged out');
    _showScreen('login-screen');
}

async function doChangePassword() {
    if (!authToken) { showToast('Please login first'); return; }
    const oldPass = document.getElementById('cp-old')?.value;
    const newPass = document.getElementById('cp-new')?.value;
    const confirmPass = document.getElementById('cp-confirm')?.value;
    if (!oldPass || !newPass || !confirmPass) { showToast('Please fill all fields'); return; }
    if (newPass !== confirmPass) { showToast('New passwords do not match'); return; }
    if (newPass.length < 6) { showToast('Password must be at least 6 characters'); return; }
    try {
        const res = await fetch('/api/user/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        showToast('Password changed successfully!');
        document.getElementById('cp-old').value = '';
        document.getElementById('cp-new').value = '';
        document.getElementById('cp-confirm').value = '';
    } catch (err) { showToast('Failed to change password'); }
}

function showTermsConditions() {
    let overlay = document.getElementById('terms-conditions-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'terms-conditions-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '999999';

        const box = document.createElement('div');
        box.style.background = '#1a1b20';
        box.style.padding = '30px';
        box.style.borderRadius = '12px';
        box.style.textAlign = 'center';
        box.style.maxWidth = '80%';
        box.style.width = '320px';
        box.style.color = '#fff';
        box.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
        box.style.border = '1px solid #333';

        const icon = document.createElement('div');
        icon.innerHTML = '⚠️';
        icon.style.fontSize = '45px';
        icon.style.marginBottom = '15px';

        const text = document.createElement('div');
        text.innerText = 'You are crossing terms and conditions.';
        text.style.fontSize = '18px';
        text.style.marginBottom = '25px';
        text.style.lineHeight = '1.4';
        text.style.fontWeight = 'bold';

        const btn = document.createElement('button');
        btn.innerText = 'OK';
        btn.style.background = '#00c853';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.padding = '12px 30px';
        btn.style.borderRadius = '6px';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = 'bold';
        btn.style.fontSize = '16px';
        btn.style.width = '100%';
        btn.onclick = () => overlay.remove();

        box.appendChild(icon);
        box.appendChild(text);
        box.appendChild(btn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }
}

async function placeOrder() {
    if (!authToken) { showToast('Please login first'); return; }
    const amount = parseFloat(document.getElementById('order-amount')?.value);
    if (!amount || amount <= 0) { showToast('Please enter a valid amount'); return; }
    if (userData && amount > (userData.tradeBalance || 0)) { showToast('Insufficient balance'); return; }

    const actionBtn = document.getElementById('order-action-btn');
    if (actionBtn) { actionBtn.textContent = 'Placing...'; actionBtn.disabled = true; }
    await new Promise(function (r) { setTimeout(r, 400); });

    // Auto-detect matching signal if user manually places trade on same pair+direction → 100% HIT
    if (!activeSignal) {
        let sym = chartState.sym || (currentPair.replace(/[\s\/]/g, '').replace('USDTUSDT', 'USDT').replace(/\s+/g, '').toUpperCase());
        if (!sym.endsWith('USDT')) sym += 'USDT';
        // Match by pair (strip spaces/slashes). If a signal is active on this pair, enforce signal rules.
        const matchingSignal = activeSignals.find(s => s.status === 'ACTIVE' &&
            s.pair.replace(/[\s\/]/g, '').replace('USDTUSDT', 'USDT').toUpperCase() === sym.toUpperCase());
        if (matchingSignal) {
            activeSignal = matchingSignal; // route to signal trade = 100% WIN
        }
    }

    // Following a signal → backend trade (real balance deduction)
    if (activeSignal) {
        const _tot = ((userData?.balance || 0) + (userData?.tradeBalance || 0) + (userData?.perpetualBalance || 0));
        // Add 0.01 margin to account for floating point and rounding up (e.g. 5.29 vs 5.2858)
        if (amount > (_tot * 0.01) + 0.01) {
            if (actionBtn) { actionBtn.disabled = false; actionBtn.textContent = currentOrderDir; }
            closeOrderPanel();
            showTermsConditions();
            return;
        }

        const minTier1 = window.appTiers ? window.appTiers.t1 : 300;
        if (userData && _tot < minTier1) {
            if (actionBtn) { actionBtn.disabled = false; actionBtn.textContent = currentOrderDir; }
            closeOrderPanel();
            showBalanceCriteria();
            return;
        }
        try {
            const res = await fetch('/api/signals/trade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify({
                    signalId: activeSignal.id,
                    amount: amount,
                    direction: currentOrderDir,
                    entryPrice: parseFloat((allCoins.find(c => c.sym === (activeSignal.pair.replace('/USDT', '').replace('USDT', '').toUpperCase())) || allCoins[0])?.price?.toString()?.replace(/,/g, '') || '0')
                })
            });
            const data = await res.json();
            if (actionBtn) { actionBtn.disabled = false; actionBtn.textContent = currentOrderDir; }
            if (data.error) { showToast(data.error); return; }
            closeOrderPanel();
            showToast(currentOrderDir + ' trade placed! ' + amount + ' USDT on ' + activeSignal.pair);
            refreshUserData();
            renderActivePositions();
            // Switch to position tab so user sees their active trade
            var posBtn = document.querySelector('#futures-pos-tabs button[onclick*="position"]');
            if (posBtn) posBtn.click();
        } catch (err) {
            if (actionBtn) { actionBtn.disabled = false; actionBtn.textContent = currentOrderDir; }
            showToast('Trade failed. Please try again.');
        }
        return;
    }

    // Manual Trade
    const sym = chartState.sym || (currentPair.replace(/[\\s\/]/g, '').replace('USDTUSDT', 'USDT').replace(/\s+/g, '').toUpperCase());
    try {
        const res = await fetch('/api/signals/manual-trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ pair: sym, amount: amount, direction: currentOrderDir, duration: 600, entryPrice: parseFloat((allCoins.find(c => c.sym === sym.replace('USDT', '')) || allCoins[0]).price.toString().replace(/,/g, '')) })
        });
        const data = await res.json();
        if (actionBtn) { actionBtn.disabled = false; actionBtn.textContent = currentOrderDir; }
        if (data.error) { showToast('Trade failed: ' + data.error); return; }
        closeOrderPanel();
        showToast(currentOrderDir + ' trade placed! ' + amount + ' USDT (Manual)');
        refreshUserData();
        await renderActivePositions();
        await loadTradeHistory();
        var posBtn = document.querySelector('#futures-pos-tabs button[onclick*="position"]');
        if (posBtn) posBtn.click();
    } catch (err) {
        if (actionBtn) { actionBtn.disabled = false; actionBtn.textContent = currentOrderDir; }
        showToast('Trade failed. Please try again.');
    }
}

async function doInvest(amount) {
    if (!authToken) { showToast('Please login first'); return; }
    try {
        const res = await fetch('/api/wallet/invest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ amount })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        showToast('Investment successful!');
        refreshUserData();
    } catch (err) { showToast('Investment failed'); }
}

function copyRefLink() {
    const el = document.getElementById('ref-link-text');
    if (el) copyText(el.textContent);
}

// ── KYC ──
let kycData = null;

async function loadKycStatus() {
    if (!authToken) return;
    try {
        const res = await fetch('/api/kyc/status', { headers: { 'Authorization': `Bearer ${authToken}` } });
        if (!res.ok) return;
        kycData = await res.json();
        updateKycUI();
    } catch (e) { }
}

function checkAdvancedKyc() {
    closeSidebar();
    if (!kycData || !kycData.fullName || kycData.status === 'NONE') {
        const overlay = document.getElementById('kyc-warning-overlay');
        if (overlay) overlay.style.display = 'flex';
    } else {
        navTo('advanced-verification-screen');
    }
}

function updateKycUI() {
    const status = (kycData && kycData.status) ? kycData.status : 'NONE';
    const statusMap = { NONE: 'Not Submitted', PENDING: 'Under Review', APPROVED: 'Verified ✓', REJECTED: 'Rejected' };
    const colorMap = { NONE: 'var(--text-secondary)', PENDING: '#f3ba2f', APPROVED: 'var(--up-color)', REJECTED: 'var(--down-color)' };

    const basicEl = document.getElementById('basic-kyc-status');
    const advancedEl = document.getElementById('advanced-kyc-status');

    if (basicEl) {
        if (!kycData || !kycData.fullName || status === 'NONE') {
            basicEl.textContent = 'Not Certified';
            basicEl.style.color = 'rgba(255, 255, 255, 0.9)';
        } else if (status === 'PENDING') {
            basicEl.textContent = 'Under Review';
            basicEl.style.color = '#ffffff';
        } else if (status === 'APPROVED') {
            basicEl.textContent = 'Verified ✓';
            basicEl.style.color = '#ffffff';
        } else {
            basicEl.textContent = 'Rejected';
            basicEl.style.color = '#ffcccc';
        }
    }

    if (advancedEl) {
        if (!kycData || (!kycData.selfieUrl && !kycData.idFrontUrl) || status === 'NONE') {
            advancedEl.textContent = 'Not Authenticated';
            advancedEl.style.color = 'rgba(255, 255, 255, 0.9)';
        } else if (status === 'PENDING') {
            advancedEl.textContent = 'Under Review';
            advancedEl.style.color = '#ffffff';
        } else if (status === 'APPROVED') {
            advancedEl.textContent = 'Verified ✓';
            advancedEl.style.color = '#ffffff';
        } else {
            advancedEl.textContent = 'Rejected';
            advancedEl.style.color = '#ffcccc';
        }
    }

    // Update basic verification screen
    const banner = document.getElementById('basic-kyc-status-banner');
    if (banner) {
        if (status === 'PENDING') {
            banner.style.display = 'block'; banner.textContent = 'Under Review — Your application is being reviewed.';
            banner.style.background = 'rgba(243,186,47,0.1)'; banner.style.color = '#f3ba2f';
        } else if (status === 'APPROVED') {
            banner.style.display = 'block'; banner.textContent = 'Verified — Your identity has been successfully verified.';
            banner.style.background = 'rgba(2,192,118,0.1)'; banner.style.color = 'var(--up-color)';
        } else if (status === 'REJECTED') {
            banner.style.display = 'block'; banner.textContent = 'Rejected: ' + (kycData.rejectReason || 'Please resubmit.');
            banner.style.background = 'rgba(248,73,96,0.1)'; banner.style.color = 'var(--down-color)';
        } else { banner.style.display = 'none'; }
    }

    // Pre-fill form if data exists
    if (kycData.fullName) {
        const fn = document.getElementById('kyc-fullname');
        const cn = document.getElementById('kyc-country');
        const id = document.getElementById('kyc-idnumber');
        if (fn) fn.value = kycData.fullName;
        if (cn && kycData.country) cn.value = kycData.country;
        if (id && kycData.idNumber) id.value = kycData.idNumber;
    }

    const advBanner = document.getElementById('advanced-kyc-status-banner');
    if (advBanner) {
        if (status === 'APPROVED') {
            advBanner.style.display = 'block'; advBanner.textContent = 'Advanced Verified ✓';
            advBanner.style.background = 'rgba(2,192,118,0.1)'; advBanner.style.color = 'var(--up-color)';
        } else if (status === 'PENDING' && (kycData.selfieUrl || kycData.idFrontUrl)) {
            advBanner.style.display = 'block'; advBanner.textContent = 'Documents submitted — Under Review';
            advBanner.style.background = 'rgba(243,186,47,0.1)'; advBanner.style.color = '#f3ba2f';
        } else { advBanner.style.display = 'none'; }
    }
}

async function submitBasicKyc() {
    if (!authToken) return showToast('Please login first');
    const fullName = document.getElementById('kyc-fullname')?.value?.trim();
    const country = document.getElementById('kyc-country')?.value?.trim();
    const idNumber = document.getElementById('kyc-idnumber')?.value?.trim();
    if (!fullName || !idNumber) { showToast('Please fill all required fields'); return; }
    try {
        const res = await fetch('/api/kyc/basic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ fullName, idNumber, country })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        kycData = data.kyc;
        updateKycUI();
        showToast('Basic verification submitted successfully!');
    } catch (e) { showToast('Submission failed'); }
}

function previewKycFile(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
    };
    reader.readAsDataURL(input.files[0]);
}

async function submitKycDocuments() {
    if (!authToken) return showToast('Please login first');
    const selfie = document.getElementById('kyc-selfie')?.files[0];
    const idFront = document.getElementById('kyc-idfront')?.files[0];
    const idBack = document.getElementById('kyc-idback')?.files[0];
    if (!selfie && !idFront) { showToast('Please upload at least selfie and ID front'); return; }
    const formData = new FormData();
    if (selfie) formData.append('selfie', selfie);
    if (idFront) formData.append('idFront', idFront);
    if (idBack) formData.append('idBack', idBack);
    try {
        const res = await fetch('/api/kyc/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        kycData = data.kyc;
        updateKycUI();
        showToast('Documents uploaded! Under review.');
    } catch (e) { showToast('Upload failed'); }
}

// ── WITHDRAWAL RECORDS ──
async function loadWithdrawalRecords() {
    const container = document.getElementById('withdrawal-records-list');
    if (!container || !authToken) return;
    container.innerHTML = '<div class="no-data-block" style="padding-top:40px;"><p>Loading...</p></div>';
    try {
        const res = await fetch('/api/wallet/withdrawals', { headers: { 'Authorization': `Bearer ${authToken}` } });
        if (!res.ok) return;
        const txs = await res.json();
        if (!txs.length) {
            container.innerHTML = '<div class="no-data-block" style="padding-top:60px;"><i class="fa-solid fa-receipt" style="font-size:40px;color:var(--text-muted);margin-bottom:12px;"></i><p>No withdrawal records</p></div>';
            return;
        }
        const statusClass = {
            pending: 'pending-status', PENDING: 'pending-status',
            completed: 'paid-status', COMPLETED: 'paid-status',
            failed: 'fail-status', FAILED: 'fail-status',
            rejected: 'fail-status', REJECTED: 'fail-status'
        };
        const statusLabel = {
            pending: 'Under Audit', PENDING: 'Under Audit',
            completed: 'Paid', COMPLETED: 'Paid',
            failed: 'Failed', FAILED: 'Failed',
            rejected: 'Rejected', REJECTED: 'Rejected'
        };
        window._txData = window._txData || {};
        container.innerHTML = txs.map(tx => {
            window._txData[tx.id] = tx;
            return `
            <div class="record-item" onclick="showWithdrawalDetails('${tx.id}')">
                <div class="record-left">
                    <div class="record-title">Withdrawal</div>
                    <div class="record-time">${new Date(tx.requestedAt || tx.createdAt).toLocaleString()}</div>
                </div>
                <div class="record-right">
                    <div class="record-coin">${tx.amount.toFixed(2)} USDT</div>
                    <div class="record-status ${statusClass[tx.status] || 'pending-status'}">${statusLabel[tx.status] || tx.status.toUpperCase()}</div>
                </div>
            </div>
        `}).join('');
    } catch (e) { }
}

function showWithdrawalDetails(txId) {
    const tx = window._txData[txId];
    if (!tx) return;
    
    let modal = document.getElementById('withdrawal-details-screen');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'withdrawal-details-screen';
        modal.className = 'screen full-page';
        modal.style.zIndex = '1000';
        modal.innerHTML = `
        <div class="sub-header">
            <i class="fa-solid fa-chevron-left back-btn" onclick="closeWithdrawalDetails()"></i>
            <h2>Withdrawal details</h2>
            <span></span>
        </div>
        <div style="padding:20px;">
            <div style="border-radius:12px;padding:20px;border-top:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
                    <span style="color:var(--text-secondary);font-size:14px;">Time:</span>
                    <span id="wd-time" style="color:var(--text-primary);font-size:14px;font-weight:500;"></span>
                </div>
                <div style="height:1px;background:rgba(255,255,255,0.05);margin-bottom:20px;"></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
                    <span style="color:var(--text-secondary);font-size:14px;">Withdrawal amount:</span>
                    <span id="wd-amount" style="color:var(--text-primary);font-size:14px;font-weight:500;"></span>
                </div>
                <div style="height:1px;background:rgba(255,255,255,0.05);margin-bottom:20px;"></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
                    <span style="color:var(--text-secondary);font-size:14px;">Handling fee (8%):</span>
                    <span id="wd-fee" style="color:var(--text-primary);font-size:14px;font-weight:500;"></span>
                </div>
                <div style="height:1px;background:rgba(255,255,255,0.05);margin-bottom:20px;"></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
                    <span style="color:var(--text-secondary);font-size:14px;">Actual Amount:</span>
                    <span id="wd-actual" style="color:var(--text-primary);font-size:14px;font-weight:500;"></span>
                </div>
                <div style="height:1px;background:rgba(255,255,255,0.05);margin-bottom:20px;"></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
                    <span style="color:var(--text-secondary);font-size:14px;">Chain name:</span>
                    <span id="wd-chain" style="color:var(--text-primary);font-size:14px;font-weight:500;"></span>
                </div>
                <div style="height:1px;background:rgba(255,255,255,0.05);margin-bottom:20px;"></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:20px;align-items:flex-start;">
                    <span style="color:var(--text-secondary);font-size:14px;white-space:nowrap;margin-right:16px;">Address:</span>
                    <span id="wd-address" style="color:var(--text-primary);font-size:14px;font-weight:500;word-break:break-all;text-align:right;"></span>
                </div>
                <div style="height:1px;background:rgba(255,255,255,0.05);margin-bottom:20px;"></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
                    <span style="color:var(--text-secondary);font-size:14px;">Status:</span>
                    <span id="wd-status" style="font-size:14px;font-weight:500;"></span>
                </div>
                <div style="height:1px;background:rgba(255,255,255,0.05);margin-bottom:20px;"></div>
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:var(--text-secondary);font-size:14px;">Reason:</span>
                    <span id="wd-reason" style="color:var(--text-primary);font-size:14px;font-weight:500;"></span>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }
    
    const d = new Date(tx.requestedAt || tx.createdAt);
    const dateStr = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')} (UTC+5)`;
    document.getElementById('wd-time').textContent = dateStr;
    
    const fmt = num => Number.isInteger(num) ? num : num.toFixed(2);
    
    document.getElementById('wd-amount').textContent = fmt(tx.amount) + ' USDT';
    
    const handlingFee = tx.amount * 0.08;
    document.getElementById('wd-fee').textContent = fmt(handlingFee) + ' USDT';
    
    const actualAmount = tx.amount - handlingFee;
    document.getElementById('wd-actual').textContent = fmt(actualAmount) + ' USDT';
    
    document.getElementById('wd-chain').textContent = tx.chain || 'TRC20';
    document.getElementById('wd-address').textContent = tx.toAddress || tx.address || localStorage.getItem('boundWithdrawAddress') || '--';
    
    const statusLabel = {
        pending: 'Under Audit', PENDING: 'Under Audit',
        completed: 'Paid', COMPLETED: 'Paid',
        failed: 'Failed', FAILED: 'Failed',
        rejected: 'Rejected', REJECTED: 'Rejected'
    };
    const statusClass = {
        pending: 'var(--text-secondary)', PENDING: 'var(--text-secondary)',
        completed: 'var(--up-color)', COMPLETED: 'var(--up-color)',
        failed: 'var(--down-color)', FAILED: 'var(--down-color)',
        rejected: 'var(--down-color)', REJECTED: 'var(--down-color)'
    };
    
    const statusEl = document.getElementById('wd-status');
    statusEl.textContent = statusLabel[tx.status] || tx.status.toUpperCase();
    statusEl.style.color = statusClass[tx.status] || 'var(--text-secondary)';
    
    document.getElementById('wd-reason').textContent = tx.rejectReason || '-';
    
    modal.style.display = 'block';
}

function closeWithdrawalDetails() {
    const modal = document.getElementById('withdrawal-details-screen');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ── PERPETUAL PAIR PICKER ──
const PERP_PAIRS = ['ETH/USDT', 'BTC/USDT', 'DASH/USDT', 'FIL/USDT', 'LINK/USDT', 'LTC/USDT', 'TRX/USDT', 'XRP/USDT', 'ZEC/USDT', 'YFI/USDT', 'BCH/USDT'];
let currentPerpPair = 'BTC/USDT';
window._currentPerpPair = 'BTC/USDT';
let currentPerpSide = 'long';
let selectedChainType = 'TRC20';

function showPerpPairPicker() {
    var list = document.getElementById('perp-pair-list');
    if (list) {
        list.innerHTML = PERP_PAIRS.map(p => '<div class="perp-pair-item' + (p === currentPerpPair ? ' selected' : '') + '" onclick="selectPerpPair(\'' + p + '\')">' + p.replace('/', ' / ') + '</div>').join('');
    }
    var overlay = document.getElementById('perp-pair-picker-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function closePerpPairPicker() {
    var overlay = document.getElementById('perp-pair-picker-overlay');
    if (overlay) overlay.style.display = 'none';
}

function selectPerpPair(pair) {
    currentPerpPair = pair;
    window._currentPerpPair = pair;
    var nameEl = document.getElementById('perp-pair-name');
    var chartNameEl = document.getElementById('perp-chart-pair-name');
    if (nameEl) nameEl.textContent = pair + ' Perpetual';
    if (chartNameEl) chartNameEl.textContent = pair + ' Perpetual';
    _perpSmoothPrice = 0;
    closePerpPairPicker();

    // Fetch real price from Binance for this pair
    var binanceSym = pair.replace(/[\\s\/]/g, '').replace('USDTUSDT', 'USDT').replace(/\s+/g, '').toUpperCase();
    fetch('/api/mexc/ticker/price?symbol=' + binanceSym)
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (d && d.price) {
                var p = parseFloat(d.price);
                if (p > 0) {
                    _perpSmoothPrice = p;
                    var coin = (window.allCoins || []).find(function (c) { return c.sym === pair.split('/')[0]; });
                    if (coin) coin.price = p.toLocaleString();
                    renderPerpOrderBook();
                }
            }
        }).catch(function () { });

    renderPerpOrderBook();

    // If chart screen is open, reload chart for new pair
    if (currentScreen === 'perp-chart-screen') {
        var activeTf = document.querySelector('#perp-chart-timeframes button.active');
        initPerpDetailChart(binanceSym, activeTf ? activeTf.dataset.tf || '1h' : '1h');
    }
}

function setPerpSide(side) {
    currentPerpSide = side;
    var longTab = document.getElementById('perp-long-tab');
    var shortTab = document.getElementById('perp-short-tab');
    var btn = document.getElementById('perp-buy-btn');
    if (side === 'long') {
        if (longTab) longTab.className = 'perp-ls-btn long-active';
        if (shortTab) shortTab.className = 'perp-ls-btn';
        if (btn) { btn.textContent = 'Buy Long'; btn.className = 'perp-action-btn long-btn'; }
    } else {
        if (longTab) longTab.className = 'perp-ls-btn';
        if (shortTab) shortTab.className = 'perp-ls-btn short-active';
        if (btn) { btn.textContent = 'Buy Short'; btn.className = 'perp-action-btn short-btn'; }
    }
}

function selectPerpOrderType(type) {
    var lbl = document.getElementById('perp-order-type-label');
    var dd = document.getElementById('perp-order-type-dd');
    var priceEl = document.getElementById('perp-form-price');
    if (lbl) lbl.textContent = type;
    if (dd) dd.style.display = 'none';
    if (priceEl) priceEl.style.display = type === 'Market' ? 'none' : 'block';
}

function adjPerpQty(dir) {
    var inp = document.getElementById('perp-qty-input');
    if (inp) { var v = parseFloat(inp.value) || 0; inp.value = Math.max(0, v + dir).toFixed(2); }
}

function setPerpQtyPct(pct) { showToast('Set to ' + pct + '%'); }

function placePerpOrder() {
    var qty = document.getElementById('perp-qty-input') ? document.getElementById('perp-qty-input').value : '';
    if (!qty || parseFloat(qty) <= 0) { showToast('Please enter quantity'); return; }
    showToast('Order placed successfully!');
}

function setPerpPosTab(btn, tab) {
    document.querySelectorAll('#perp-pos-tabs button').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    ['positions', 'orders', 'history', 'trades'].forEach(function (t) {
        var el = document.getElementById('perp-tab-' + t);
        if (el) el.style.display = t === tab ? 'block' : 'none';
    });
}

var _perpObInterval = null;
var _perpSmoothPrice = 0;

function startPerpOrderBookLoop() {
    stopPerpOrderBookLoop();
    // If current pair has no real price yet, fetch it first
    var pairSym = (window._currentPerpPair || 'BTC/USDT').split('/')[0];
    var coin = (window.allCoins || []).find(function (c) { return c.sym === pairSym; });
    var hasPrice = coin && coin.price && coin.price !== '--' && parseFloat(coin.price.replace(/,/g, '')) > 0;
    if (!hasPrice) {
        var binanceSym = (window._currentPerpPair || 'BTC/USDT').replace(/[\\s\/]/g, '').replace('USDTUSDT', 'USDT').replace(/\s+/g, '').toUpperCase();
        fetch('/api/mexc/ticker/price?symbol=' + binanceSym)
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d && d.price) {
                    var p = parseFloat(d.price);
                    if (p > 0) {
                        _perpSmoothPrice = p;
                        if (coin) coin.price = p.toLocaleString();
                        renderPerpOrderBook();
                    }
                }
            }).catch(function () { });
    }
    renderPerpOrderBook();
    _perpObInterval = setInterval(renderPerpOrderBook, 1500);
}

function stopPerpOrderBookLoop() {
    if (_perpObInterval) { clearInterval(_perpObInterval); _perpObInterval = null; }
}

function renderPerpOrderBook() {
    // Get live price from allCoins for the selected pair
    var pairSym = (window._currentPerpPair || 'BTC/USDT').split('/')[0];
    var coin = (window.allCoins || []).find(function (c) { return c.sym === pairSym; });
    var basePrice = coin ? parseFloat((coin.price || '').replace(/,/g, '')) : 0;
    if (!basePrice || isNaN(basePrice) || basePrice <= 0) {
        // Use last smooth price if available, otherwise skip render
        if (_perpSmoothPrice > 0) basePrice = _perpSmoothPrice;
        else return;
    }

    // Smooth walk: initialise once, then nudge slightly each tick
    if (!_perpSmoothPrice || Math.abs(_perpSmoothPrice - basePrice) / basePrice > 0.02) {
        _perpSmoothPrice = basePrice;
    }
    _perpSmoothPrice += _perpSmoothPrice * 0.00008 * (Math.random() - 0.5);
    var price = _perpSmoothPrice;

    var midEl = document.getElementById('perp-mid-price');
    if (midEl) {
        midEl.textContent = price.toFixed(2);
        midEl.style.color = coin && !coin.up ? 'var(--down-color)' : 'var(--up-color)';
    }

    // Fixed spread step per row, only amounts randomise smoothly
    var step = price * 0.00025;
    var asks = [], bids = [];
    for (var i = 0; i < 8; i++) {
        var askPrice = (price + (i + 1) * step).toFixed(2);
        var bidPrice = (price - (i + 1) * step).toFixed(2);
        var askAmt = (Math.random() * 250 + 20).toFixed(2) + 'K';
        var bidAmt = (Math.random() * 250 + 20).toFixed(2) + 'K';
        asks.push('<div class="perp-ob-row ask"><span>' + askPrice + '</span><span>' + askAmt + '</span></div>');
        bids.push('<div class="perp-ob-row bid"><span>' + bidPrice + '</span><span>' + bidAmt + '</span></div>');
    }
    var asksEl = document.getElementById('perp-asks-list');
    var bidsEl = document.getElementById('perp-bids-list');
    if (asksEl) asksEl.innerHTML = asks.join('');
    if (bidsEl) bidsEl.innerHTML = bids.join('');

    // Sync header pair change %
    var chgEl = document.getElementById('perp-pair-change');
    if (chgEl && coin) { chgEl.textContent = ' ' + coin.ch; chgEl.className = 'pair-change ' + (coin.up ? 'up' : 'down'); }

    // Sync available amount with user balance
    var availEl = document.getElementById('perp-avail-amt');
    if (availEl && window._userBalance !== undefined) availEl.textContent = window._userBalance.toFixed(2) + ' USDT';
}

function showPerpInfo() { showToast('Contract info coming soon'); }

var _perpDetailChart = null;
var _perpDetailData = [];
var _perpDetailRaw = [];
var _perpDetailWs = null;
var _perpDetailState = { sym: 'BTCUSDT', tf: '1h', type: 'candle', ma: false, ema: false, bb: false, vol: false };

function initPerpDetailChart(symbol, interval) {
    symbol = (symbol || 'BTCUSDT').replace(/\//g, '').replace('USDTUSDT', 'USDT').replace(/\s+/g, '').toUpperCase();
    interval = interval || '1h';
    var container = document.getElementById('perp-detail-chart');
    if (!container) return;
    if (_perpDetailChart) { try { _perpDetailChart.destroy(); } catch (e) { } _perpDetailChart = null; }
    _perpDetailData = []; _perpDetailRaw = [];
    _perpDetailState.sym = symbol; _perpDetailState.tf = interval;
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:290px;color:#4a5568;font-size:13px;">Loading...</div>';

    // Update price display
    var pairSym = symbol.replace('USDT', '');
    var coin = (window.allCoins || []).find(function (c) { return c.sym === pairSym; });
    var priceEl = document.getElementById('perp-chart-price');
    if (priceEl && coin) { priceEl.textContent = coin.price; priceEl.className = 'futures-live-price-val ' + (coin.up ? 'up' : 'down'); }
    var highEl = document.getElementById('perp-chart-high');
    var lowEl = document.getElementById('perp-chart-low');
    var volEl = document.getElementById('perp-chart-vol');
    if (highEl && coin) highEl.textContent = coin.high || '--';
    if (lowEl && coin) lowEl.textContent = coin.low || '--';
    if (volEl && coin) volEl.textContent = coin.vol || '--';

    const sym = _perpDetailState.sym;
    let bSym = sym;
    if (bSym === 'XAUUSDT') bSym = 'PAXGUSDT';
    else if (bSym === 'XAGUSDT') bSym = 'LTCUSDT';
    else if (bSym === 'XPTUSDT') bSym = 'ETHUSDT';
    else if (bSym === 'XPDUSDT') bSym = 'BCHUSDT';

    fetch('/api/mexc/klines?symbol=' + bSym + '&interval=' + interval + '&limit=150')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!Array.isArray(data)) return;
            _perpDetailRaw = data;
            _perpDetailData = data.map(function (k) { return { x: +k[0], y: [+k[1], +k[2], +k[3], +k[4]] }; });
            _perpDetailChart = _rebuildChart(_perpDetailData, _perpDetailRaw, _perpDetailState, 'perp-detail-chart', 300);
            updateOHLCRow('perp-chart-ma-row', symbol, interval, data[data.length - 1]);
        }).catch(function () { container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Chart unavailable</div>'; });

    if (_perpDetailWs) { try { _perpDetailWs.close(); } catch (e) { } _perpDetailWs = null; }
    function connectWs() {
        _perpDetailWs = null; // removed binance ws
        var timer = null;
        _perpDetailWs.onmessage = function (e) {
            try {
                var msg = JSON.parse(e.data);
                const priceEl = document.getElementById('perp-price-val');
                if (msg.stream && msg.stream.includes('@kline_')) {
                    var k = msg.data.k;
                    var rawC = [k.t, k.o, k.h, k.l, k.c, k.v];
                    if (_perpDetailData.length) {
                        var last = _perpDetailData[_perpDetailData.length - 1];
                        if (last.x === k.t) { _perpDetailData[_perpDetailData.length - 1] = { x: k.t, y: [+k.o, +k.h, +k.l, +k.c] }; _perpDetailRaw[_perpDetailRaw.length - 1] = rawC; }
                        else { _perpDetailData.push({ x: k.t, y: [+k.o, +k.h, +k.l, +k.c] }); _perpDetailRaw.push(rawC); if (_perpDetailData.length > 160) { _perpDetailData.shift(); _perpDetailRaw.shift(); } }
                    }
                    if (priceEl) { priceEl.textContent = (+k.c >= 100 ? (+k.c).toFixed(2) : (+k.c) >= 1 ? (+k.c).toFixed(4) : (+k.c).toFixed(6)); }
                    updateOHLCRow('perp-chart-ma-row', symbol, interval, rawC);
                    _updateRealtimeChart(_perpDetailChart, _perpDetailState, rawC);
                } else if (msg.stream && msg.stream.includes('@ticker')) {
                    if (_perpDetailData.length && _perpDetailChart) {
                        var lastIdx = _perpDetailData.length - 1;
                        var cPrice = +msg.data.c;
                        var lastRaw = _perpDetailRaw[lastIdx];
                        lastRaw[4] = cPrice;
                        lastRaw[2] = Math.max(+lastRaw[2], cPrice);
                        lastRaw[3] = Math.min(+lastRaw[3], cPrice);
                        _perpDetailData[lastIdx].y[3] = cPrice;
                        _perpDetailData[lastIdx].y[1] = lastRaw[2];
                        _perpDetailData[lastIdx].y[2] = lastRaw[3];
                        if (priceEl) { priceEl.textContent = (cPrice >= 100 ? cPrice.toFixed(2) : cPrice >= 1 ? cPrice.toFixed(4) : cPrice.toFixed(6)); }
                        updateOHLCRow('perp-chart-ma-row', symbol, interval, lastRaw);
                        _updateRealtimeChart(_perpDetailChart, _perpDetailState, lastRaw);
                    }
                }
            } catch (ex) { }
        };
        _perpDetailWs.onclose = function () { setTimeout(connectWs, 3000); };
    }
    connectWs();
}

function setPerpChartTf(btn, tf) {
    document.querySelectorAll('#perp-chart-timeframes button').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    var sym = (window._currentPerpPair || 'BTC/USDT').replace(/[\\s\/]/g, '').replace('USDTUSDT', 'USDT').replace(/\s+/g, '').toUpperCase();
    initPerpDetailChart(sym, tf);
}

function setPerpChartTab(btn, tab) {
    document.querySelectorAll('#perp-chart-screen .positions-tabs button').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    var e = document.getElementById('perp-chart-tab-entrusted');
    var t = document.getElementById('perp-chart-tab-trades');
    if (e) e.style.display = tab === 'entrusted' ? 'block' : 'none';
    if (t) t.style.display = tab === 'trades' ? 'block' : 'none';
}

// ── BIND ADDRESS ──
function selectChainType(type) {
    selectedChainType = type;
    document.querySelectorAll('.chain-type-btn').forEach(function (b) { b.classList.remove('active'); });
    var btn = document.getElementById('chain-' + type.toLowerCase());
    if (btn) btn.classList.add('active');
}

function _renderBindAddressScreen(data) {
    const boundState = document.getElementById('bind-addr-bound-state');
    const formState = document.getElementById('bind-addr-form-state');
    const freezeBanner = document.getElementById('bind-freeze-banner');
    const freezeText = document.getElementById('bind-freeze-text');

    if (data.freezeUntil && new Date() < new Date(data.freezeUntil)) {
        const remaining = Math.ceil((new Date(data.freezeUntil) - new Date()) / 3600000);
        if (freezeBanner) { freezeBanner.style.display = 'block'; }
        if (freezeText) freezeText.textContent = `Withdrawals frozen for ${remaining} more hour(s) after unbinding.`;
    } else {
        if (freezeBanner) freezeBanner.style.display = 'none';
    }

    if (data.address) {
        if (boundState) boundState.style.display = 'block';
        if (formState) formState.style.display = 'none';
        const addrDisplay = document.getElementById('bind-addr-display');
        const chainDisplay = document.getElementById('bind-chain-display');
        if (addrDisplay) addrDisplay.textContent = data.address;
        if (chainDisplay) chainDisplay.textContent = data.chain || 'TRC20';
        localStorage.setItem('boundWithdrawAddress', data.address);
        localStorage.setItem('boundWithdrawChain', data.chain || 'TRC20');
    } else {
        if (boundState) boundState.style.display = 'none';
        if (formState) formState.style.display = 'block';
        localStorage.removeItem('boundWithdrawAddress');
    }
}

async function loadBindAddressScreen() {
    try {
        const res = await fetch('/api/wallet/bound-address', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } });
        if (!res.ok) return;
        const data = await res.json();
        _renderBindAddressScreen(data);
    } catch (e) { /* silently fallback to localStorage */ }
}

async function doBindAddress() {
    var addr = document.getElementById('bind-addr-input')?.value.trim();
    if (!addr) { showToast('Please enter wallet address'); return; }
    try {
        const res = await fetch('/api/wallet/bind-address', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
            body: JSON.stringify({ address: addr, chain: selectedChainType || 'TRC20' })
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Failed to bind address'); return; }
        showToast('Address bound successfully!');
        localStorage.removeItem('withdrawFreezeUntil');
        _renderBindAddressScreen({ address: data.address, chain: data.chain, freezeUntil: null });
    } catch (e) {
        showToast('Network error');
    }
}

async function doUnbindAddress() {
    if (!confirm('Unbinding will freeze withdrawals for 24 hours. Continue?')) return;
    try {
        const res = await fetch('/api/wallet/unbind-address', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Failed to unbind'); return; }
        showToast('Address unbound. Withdrawals frozen for 24 hours.');
        localStorage.setItem('withdrawFreezeUntil', data.freezeUntil);
        _renderBindAddressScreen({ address: null, chain: null, freezeUntil: data.freezeUntil });
    } catch (e) {
        showToast('Network error');
    }
}

// ── GOOGLE AUTHENTICATOR (2FA) ──
async function loadGoogleAuthSetup() {
    const qrImg = document.getElementById('google-auth-qr');
    const qrPlaceholder = document.getElementById('google-auth-qr-placeholder');
    const keyEl = document.getElementById('google-auth-key');
    const badge = document.getElementById('google-auth-enabled-badge');

    if (keyEl) keyEl.textContent = 'Loading...';
    if (qrImg) { qrImg.style.display = 'none'; qrImg.src = ''; }
    if (qrPlaceholder) qrPlaceholder.style.display = 'block';
    if (badge) badge.style.display = 'none';

    try {
        const res = await fetch('/api/auth/2fa/setup', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Failed to load 2FA setup'); return; }

        if (keyEl) keyEl.textContent = data.secret;
        if (qrImg && data.qr_code_base64) {
            qrImg.src = data.qr_code_base64;
            qrImg.style.display = 'block';
        }
        if (qrPlaceholder) qrPlaceholder.style.display = 'none';
        if (badge) badge.style.display = data.enabled ? 'flex' : 'none';
    } catch (e) {
        showToast('Network error loading 2FA');
    }
}

async function bindGoogleAuth() {
    const code = document.getElementById('google-auth-code')?.value?.trim();
    if (!code || code.length !== 6) { showToast('Enter a 6-digit code'); return; }

    try {
        const res = await fetch('/api/auth/2fa/enable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
            body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Invalid code'); return; }

        showToast('Google Authenticator linked successfully!');
        const badge = document.getElementById('google-auth-enabled-badge');
        if (badge) badge.style.display = 'flex';
        const codeInput = document.getElementById('google-auth-code');
        if (codeInput) codeInput.value = '';
    } catch (e) {
        showToast('Network error');
    }
}

// ── CONVERT ──
var _convertDir = 'USDT_TO_BTC'; // or 'BTC_TO_USDT'
var _simBtcBalance = 0;          // simulated BTC accumulated this session

function _syncBtcAssetRow() {
    var btcPrice = (window._marketPrices && window._marketPrices['BTCUSDT']) ? window._marketPrices['BTCUSDT'] : 77400;
    var availEl = document.getElementById('exch-btc-avail');
    var valEl = document.getElementById('exch-btc-val');
    if (availEl) availEl.textContent = _simBtcBalance > 0 ? _simBtcBalance.toFixed(8) : '0';
    if (valEl) valEl.textContent = _simBtcBalance > 0 ? '≈ $' + (_simBtcBalance * btcPrice).toFixed(2) : '≈ $0.00';
}

function _convertCoinDot(coin) {
    if (coin === 'USDT') return '<img src="https://assets.coingecko.com/coins/images/325/small/Tether.png" style="width:28px;height:28px;border-radius:50%;flex-shrink:0;">';
    return '<span class="coin-dot" style="background:#f7931a;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;"><i class="fa-brands fa-bitcoin" style="color:#fff;font-size:12px;"></i></span>';
}

function _updateConvertAvail() {
    var availEl = document.getElementById('convert-avail');
    if (!availEl) return;
    if (_convertDir === 'USDT_TO_BTC') {
        var bal = (userData && userData.balance !== undefined) ? userData.balance : 0;
        availEl.textContent = bal.toFixed(2) + ' USDT';
    } else {
        availEl.textContent = _simBtcBalance.toFixed(8) + ' BTC';
    }
}

function loadConvertRates() {
    var btcPrice = (window._marketPrices && window._marketPrices['BTCUSDT']) ? window._marketPrices['BTCUSDT'] : 77400;
    var rateEl = document.getElementById('convert-rate');
    if (rateEl) rateEl.textContent = '1 BTC ≈ ' + Number(btcPrice).toLocaleString() + ' USDT';
    _updateConvertAvail();
}

function calcConvert() {
    var from = parseFloat(document.getElementById('convert-from-amount') ? document.getElementById('convert-from-amount').value : 0) || 0;
    var btcPrice = (window._marketPrices && window._marketPrices['BTCUSDT']) ? window._marketPrices['BTCUSDT'] : 77400;
    var toEl = document.getElementById('convert-to-amount');
    if (!toEl) return;
    if (_convertDir === 'USDT_TO_BTC') {
        toEl.textContent = from > 0 ? (from / btcPrice).toFixed(8) : '0';
    } else {
        toEl.textContent = from > 0 ? (from * btcPrice).toFixed(2) : '0';
    }
}

function setConvertMax() {
    var inp = document.getElementById('convert-from-amount');
    if (!inp) return;
    if (_convertDir === 'USDT_TO_BTC') {
        var bal = (userData && userData.balance !== undefined) ? userData.balance : 0;
        inp.value = bal.toFixed(2);
    } else {
        inp.value = _simBtcBalance.toFixed(8);
    }
    calcConvert();
}

function swapConvert() {
    _convertDir = _convertDir === 'USDT_TO_BTC' ? 'BTC_TO_USDT' : 'USDT_TO_BTC';
    var fromCoin = _convertDir === 'USDT_TO_BTC' ? 'USDT' : 'BTC';
    var toCoin = _convertDir === 'USDT_TO_BTC' ? 'BTC' : 'USDT';

    var fromCoinEl = document.getElementById('convert-from-coin');
    var toCoinEl = document.getElementById('convert-to-coin');

    if (fromCoinEl) {
        var fromDot = fromCoinEl.previousElementSibling;
        if (fromDot) fromDot.outerHTML = _convertCoinDot(fromCoin);
        fromCoinEl = document.getElementById('convert-from-coin'); // re-query after outerHTML swap
        fromCoinEl.textContent = fromCoin;
    }
    if (toCoinEl) {
        var toDot = toCoinEl.previousElementSibling;
        if (toDot) toDot.outerHTML = _convertCoinDot(toCoin);
        toCoinEl = document.getElementById('convert-to-coin');
        toCoinEl.textContent = toCoin;
    }

    var inp = document.getElementById('convert-from-amount');
    var toEl = document.getElementById('convert-to-amount');
    if (inp) inp.value = '';
    if (toEl) toEl.textContent = '0';

    _updateConvertAvail();
}

function showConvertFromPicker() { showToast('Currency selector coming soon'); }
function showConvertToPicker() { showToast('Currency selector coming soon'); }

function doConvert() {
    var inp = document.getElementById('convert-from-amount');
    var amt = inp ? parseFloat(inp.value) : 0;
    if (!amt || amt <= 0) { showToast('Enter amount to convert'); return; }
    var btcPrice = (window._marketPrices && window._marketPrices['BTCUSDT']) ? window._marketPrices['BTCUSDT'] : 77400;
    var btn = document.querySelector('[onclick="doConvert()"]');

    if (_convertDir === 'USDT_TO_BTC') {
        var usdtBal = (userData && userData.balance !== undefined) ? userData.balance : 0;
        if (amt > usdtBal) { showToast('Insufficient USDT balance'); return; }
        var btcAmt = (amt / btcPrice).toFixed(8);
        if (btn) { btn.textContent = 'Processing...'; btn.disabled = true; }
        setTimeout(function () {
            _simBtcBalance += parseFloat(btcAmt);
            var toEl = document.getElementById('convert-to-amount');
            if (toEl) toEl.textContent = btcAmt;
            _syncBtcAssetRow();
            showToast('Converted ' + amt.toFixed(2) + ' USDT → ' + btcAmt + ' BTC');
            if (inp) inp.value = '';
            if (btn) { btn.textContent = 'Exchange'; btn.disabled = false; }
        }, 800);
    } else {
        if (amt > _simBtcBalance) { showToast('Insufficient BTC balance'); return; }
        var usdtAmt = (amt * btcPrice).toFixed(2);
        if (btn) { btn.textContent = 'Processing...'; btn.disabled = true; }
        setTimeout(function () {
            _simBtcBalance = Math.max(0, _simBtcBalance - amt);
            var toEl2 = document.getElementById('convert-to-amount');
            if (toEl2) toEl2.textContent = usdtAmt;
            _updateConvertAvail();
            _syncBtcAssetRow();
            showToast('Converted ' + amt.toFixed(8) + ' BTC → ' + usdtAmt + ' USDT');
            if (inp) inp.value = '';
            if (btn) { btn.textContent = 'Exchange'; btn.disabled = false; }
        }, 800);
    }
}

// ── PUBLIC APP SETTINGS (About Us + Support) ──
let _appSettings = null;
async function _fetchAppSettings() {
    if (_appSettings) return _appSettings;
    try {
        const res = await fetch('/api/public/settings');
        _appSettings = await res.json();
    } catch (e) { _appSettings = {}; }
    return _appSettings;
}

async function loadAboutScreen() {
    const s = await _fetchAppSettings();
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.textContent = val; };
    set('about-app-name', s.app_name);
    set('about-logo-initials', s.app_name ? s.app_name.substring(0, 2).toUpperCase() : null);
    set('about-version', s.app_version ? 'Version ' + s.app_version : null);
    set('about-description', s.app_description);
    const setLink = (btnId, url, toast) => {
        const el = document.getElementById(btnId);
        if (!el) return;
        if (url) { el.onclick = () => window.open(url, '_blank'); }
        else { el.onclick = () => showToast(toast); }
    };
    setLink('about-website-btn', s.app_website_url, 'Opening website...');
    setLink('about-twitter-btn', s.app_twitter_url, 'Opening Twitter...');
    setLink('about-telegram-btn', s.app_telegram_url, 'Opening Telegram...');
}

async function loadSupportScreen() {
    const s = await _fetchAppSettings();
    const emailEl = document.getElementById('support-email-text');
    const telegramEl = document.getElementById('support-telegram-text');
    const emailCard = document.getElementById('support-email-card');
    const telegramCard = document.getElementById('support-telegram-card');
    const faqCard = document.getElementById('support-faq-card');
    if (emailEl && s.support_email) emailEl.textContent = s.support_email;
    if (telegramEl && s.support_telegram) telegramEl.textContent = s.support_telegram;
    if (emailCard && s.support_email) emailCard.onclick = () => window.open('mailto:' + s.support_email);
    if (telegramCard && s.support_telegram) {
        const tgUrl = s.support_telegram.startsWith('http') ? s.support_telegram : 'https://t.me/' + s.support_telegram.replace('@', '');
        telegramCard.onclick = () => window.open(tgUrl, '_blank');
    }
    if (faqCard && s.support_faq_url) faqCard.onclick = () => window.open(s.support_faq_url, '_blank');
}

// ── SHARE SCREEN ──
async function loadShareScreen() {
    if (!authToken) return;
    const headers = { 'Authorization': 'Bearer ' + authToken };

    // Load QR code
    try {
        const qrRes = await fetch('/api/auth/referral-qr', { headers });
        const qrData = await qrRes.json();
        const img = document.getElementById('share-qr-img');
        const spinner = document.getElementById('share-qr-spinner');
        if (img && qrData.qr_code_base64) {
            img.src = qrData.qr_code_base64;
            img.style.display = 'block';
            if (spinner) spinner.style.display = 'none';
        }
        if (qrData.referralCode) {
            var codeEl = document.getElementById('share-invite-code');
            var linkEl = document.getElementById('share-invite-link');
            if (codeEl) codeEl.textContent = qrData.referralCode;
            if (linkEl) linkEl.textContent = qrData.referralUrl;
        }
    } catch (e) { }

    // Load referral stats
    try {
        const profileRes = await fetch('/api/user/profile', { headers });
        const data = await profileRes.json();
        if (data.referralCount !== undefined) {
            var countEl = document.getElementById('share-referral-count');
            if (countEl) countEl.textContent = data.referralCount + ' / ' + Math.max(data.referralCount + 1, 1);
        }
        if (data.referralBalance !== undefined) {
            var revEl = document.getElementById('share-total-revenue');
            if (revEl) revEl.textContent = parseFloat(data.referralBalance || 0).toFixed(2);
        }
    } catch (e) { }
}

// ── FETCH REAL PRICES ON LOAD ──
async function fetchInitialPrices() {
    try {
        allCoins.forEach(coin => {
            let p = parseFloat(coin.price.toString().replace(/,/g, ''));
            if (isNaN(p)) return;
            // 0.05% max fluctuation per tick
            let change = (Math.random() - 0.5) * 0.001 * p;
            p += change;

            let pStr;
            if (p < 0.0001) pStr = p.toFixed(8);
            else if (p < 1) pStr = p.toFixed(5);
            else if (p < 100) pStr = p.toFixed(3);
            else pStr = p.toFixed(2);

            coin.price = pStr;
            let chgVal = parseFloat(coin.ch.replace('%', ''));
            chgVal += (Math.random() - 0.5) * 0.02;
            coin.up = chgVal >= 0;
            coin.ch = (chgVal >= 0 ? '+' : '') + chgVal.toFixed(2) + '%';

            // Only update the newest candle/point
            coin.sp[coin.sp.length - 1] = p;

            // Evolve the graph quickly every 3 ticks
            if (!coin.tickCount) coin.tickCount = 0;
            coin.tickCount++;
            if (coin.tickCount > 3) {
                coin.sp.shift();
                coin.sp.push(p);
                coin.tickCount = 0;
            }
        });
        renderMarkets();
        renderMiniTickers();
        renderHomeMarkets();
    } catch (e) { }
}

function loadTickerText() {
    fetch('/api/ticker').then(function (r) { return r.json(); }).then(function (d) {
        var el = document.getElementById('home-ticker-text');
        if (el && d.text) el.textContent = d.text;
    }).catch(function () { });
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
    // Generate 30 realistic past data points for highly detailed curly graphs based on actual price
    allCoins.forEach(coin => {
        let p = parseFloat(coin.price.toString().replace(/,/g, ''));
        if (isNaN(p)) return;
        let newSp = [];
        let currentP = p;
        for (let i = 0; i < 60; i++) {
            newSp.unshift(currentP);
            // Simulate past prices by walking backwards
            currentP -= (Math.random() - 0.5) * 0.005 * p;
        }
        coin.sp = newSp;
    });

    loadTickerText();
    loadBanners();
    renderMarkets();
    renderMiniTickers();
    renderHomeMarkets('change');
    updateTimePeriod();
    setInterval(updateCountdown, 1000);
    initSocket();
    fetchInitialPrices();

    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');

    if (authToken) {
        showSlide(0);
        startSlider();
        _showScreen('home-screen');
        refreshUserData();
        fetchNotifications();
        loadKycStatus();
        initChart('ETHUSDT');
        setInterval(refreshUserData, 30000);
        fetchChatUnreadCount();
        fetchSignals();
    } else {
        if (path === '/register') {
            _showScreen('register-screen');
            if (refCode) {
                setTimeout(() => {
                    const inviteInput = document.getElementById('reg-invite');
                    if (inviteInput) inviteInput.value = refCode;
                }, 100);
            }
        } else {
            _showScreen('login-screen');
        }
    }

    // Hide preloader after app logic runs (allow video to play for a bit)
    setTimeout(() => {
        const preloader = document.getElementById('app-preloader');
        if (preloader) {
            preloader.classList.add('hidden');
            setTimeout(() => preloader.style.display = 'none', 600); // remove from DOM flow after fade
        }
    }, 2800); // 2.8 seconds wait to show the animation
});

// ══════════════════════════════════════════════════════
// LIVE CHAT
// ══════════════════════════════════════════════════════
var _chatImageFile = null;

function openChatScreen() {
    navTo('chat-screen');
}

function loadChatMessages() {
    var area = document.getElementById('chat-messages');
    if (!area) return;
    area.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px;">Loading...</div>';
    fetch('/api/chat/messages', { headers: { 'Authorization': 'Bearer ' + authToken } })
        .then(function (r) { return r.json(); })
        .then(function (msgs) {
            area.innerHTML = '<div class="chat-date-label">Today</div>' +
                '<div class="chat-bubble admin-bubble"><span>Welcome! How can we help you today?</span><span class="chat-time">Support</span></div>';
            if (Array.isArray(msgs)) {
                msgs.forEach(function (m) { appendChatBubble(m); });
            }
            scrollChatToBottom();
            updateChatUnreadBadge(0);
        })
        .catch(function () {
            area.innerHTML = '<div class="chat-date-label">Today</div>' +
                '<div class="chat-bubble admin-bubble"><span>Welcome! How can we help you today?</span><span class="chat-time">Support</span></div>';
        });
}

function appendChatBubble(msg) {
    var area = document.getElementById('chat-messages');
    if (!area) return;
    var isAdmin = msg.sender === 'ADMIN';
    var div = document.createElement('div');
    div.className = 'chat-bubble ' + (isAdmin ? 'admin-bubble' : 'user-bubble');
    var timeStr = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    var inner = '';
    if (msg.imageUrl) {
        inner = '<img src="' + msg.imageUrl + '" class="chat-image" onclick="openChatImageFull(\'' + msg.imageUrl + '\')">';
    } else {
        inner = '<span>' + escapeHtml(msg.content || '') + '</span>';
    }
    inner += '<span class="chat-time">' + (isAdmin ? 'Support · ' : '') + timeStr + '</span>';
    div.innerHTML = inner;
    area.appendChild(div);
}

function sendChatMessage() {
    var input = document.getElementById('chat-text-input');
    var text = input ? input.value.trim() : '';

    if (_chatImageFile) {
        // Send image
        var fd = new FormData();
        fd.append('image', _chatImageFile);
        fetch('/api/chat/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken }, body: fd })
            .then(function (r) { return r.json(); })
            .then(function (msg) {
                if (msg.id) { appendChatBubble(msg); scrollChatToBottom(); }
            });
        clearChatImage();
    }

    if (!text) return;
    if (input) input.value = '';

    // Optimistic bubble
    var tmpMsg = { sender: 'USER', content: text, createdAt: new Date().toISOString() };
    appendChatBubble(tmpMsg);
    scrollChatToBottom();

    fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text })
    }).then(function (r) {
        if (!r.ok) {
            r.json().then(function (d) {
                showToast('Send failed: ' + (d.error || r.status));
            }).catch(function () { showToast('Send failed: ' + r.status); });
        }
    }).catch(function (e) { showToast('Network error: ' + e.message); });
}

function onChatImageSelected(input) {
    var file = input.files[0];
    if (!file) return;
    _chatImageFile = file;
    var preview = document.getElementById('chat-img-preview');
    var img = document.getElementById('chat-preview-img');
    if (preview) preview.style.display = 'block';
    if (img) img.src = URL.createObjectURL(file);
}

function clearChatImage() {
    _chatImageFile = null;
    var preview = document.getElementById('chat-img-preview');
    var fileInput = document.getElementById('chat-file-input');
    if (preview) preview.style.display = 'none';
    if (fileInput) fileInput.value = '';
}

function scrollChatToBottom() {
    var area = document.getElementById('chat-messages');
    if (area) area.scrollTop = area.scrollHeight;
}

function openChatImageFull(url) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.onclick = function () { overlay.remove(); };
    overlay.innerHTML = '<img src="' + url + '" style="max-width:95vw;max-height:90vh;border-radius:8px;object-fit:contain;">';
    document.body.appendChild(overlay);
}

function fetchChatUnreadCount() {
    if (!authToken) return;
    fetch('/api/chat/unread', { headers: { 'Authorization': 'Bearer ' + authToken } })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d.count > 0) updateChatUnreadBadge(d.count); })
        .catch(function () { });
}

function updateChatUnreadBadge(count) {
    var badge = document.getElementById('chat-unread-badge');
    if (!badge) return;
    if (count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = 'inline-block'; }
    else { badge.style.display = 'none'; }
}

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Ratio Fluctuation for Futures Buttons
setInterval(() => {
    const callEl = document.getElementById('call-ratio-val');
    const putEl = document.getElementById('put-ratio-val');
    if (callEl && putEl && callEl.offsetParent !== null) {
        let baseCall = 50.62;
        let fluctuation = (Math.random() * 2 - 1).toFixed(2); // -1.00 to +1.00
        let newCall = (baseCall + parseFloat(fluctuation)).toFixed(2);
        let newPut = (100 - newCall).toFixed(2);
        callEl.textContent = newCall + '%';
        putEl.textContent = newPut + '%';
    }
}, 2000);


// ── FUND TRANSFER LOGIC ──
let transferFrom = 'Exchange';
let transferTo = 'Trade';
let transferBalances = { Exchange: 0, Trade: 0, Perpetual: 0 };

function openFundTransferModal() {
    document.getElementById('fund-transfer-overlay').style.display = 'flex';
    fetchBalancesForTransfer();
}

function closeFundTransferModal() {
    document.getElementById('fund-transfer-overlay').style.display = 'none';
}

function fetchBalancesForTransfer() {
    fetch('/api/wallet/balance', { headers: { 'Authorization': 'Bearer ' + authToken } })
        .then(r => r.json())
        .then(d => {
            transferBalances.Exchange = parseFloat(d.exchangeBalance || d.balance || 0);
            transferBalances.Trade = parseFloat(d.tradeBalance || 0);
            transferBalances.Perpetual = parseFloat(d.perpetualBalance || 0);
            updateTransferUI();
        }).catch(e => console.error(e));
}

function setTransferVal(type, val) {
    if (type === 'from') {
        if (transferTo === val) transferTo = transferFrom;
        transferFrom = val;
    } else {
        if (transferFrom === val) transferFrom = transferTo;
        transferTo = val;
    }
    updateTransferUI();
    toggleDropdown(`transfer-${type}-dd`);
}

function swapTransferDirection() {
    const temp = transferFrom;
    transferFrom = transferTo;
    transferTo = temp;
    updateTransferUI();
}

function updateTransferUI() {
    document.getElementById('transfer-from-val').textContent = transferFrom;
    document.getElementById('transfer-to-val').textContent = transferTo;
    document.getElementById('transfer-avail-amt').textContent = transferBalances[transferFrom].toFixed(2);
    checkTransferBtn();
}

function checkTransferBtn() {
    const amt = parseFloat(document.getElementById('modal-transfer-amount').value);
    const btn = document.getElementById('modal-transfer-confirm-btn');
    if (amt > 0 && amt <= transferBalances[transferFrom]) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
    } else {
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
    }
}

function setNewTransferAll() {
    document.getElementById('modal-transfer-amount').value = transferBalances[transferFrom];
    checkTransferBtn();
}

function closePenaltyTermsModal() {
    document.getElementById('penalty-terms-overlay').style.display = 'none';
}

function confirmNewTransfer() {
    if (transferFrom === 'Trade' && transferTo === 'Exchange') {
        document.getElementById('penalty-terms-text').textContent = window.penaltyTermsText || 'Please note that transferring principal funds from Trade back to Exchange before the lock period expires will incur an early withdrawal penalty.';
        document.getElementById('penalty-terms-overlay').style.display = 'flex';
    } else {
        proceedNewTransfer();
    }
}

function proceedNewTransfer() {
    closePenaltyTermsModal();
    const amt = document.getElementById('modal-transfer-amount').value;
    const btn = document.getElementById('modal-transfer-confirm-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    btn.style.pointerEvents = 'none';

    fetch('/api/wallet/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
        body: JSON.stringify({ fromWallet: transferFrom, toWallet: transferTo, amount: amt })
    })
        .then(r => r.json())
        .then(d => {
            btn.innerHTML = 'Confirm Transfer';
            if (d.error) {
                showToast(d.error);
            } else {
                if (d.penaltyAmount && d.penaltyAmount > 0) {
                    showToast('Transfer successful! ' + d.penaltyAmount.toFixed(2) + ' USDT deducted as early withdrawal penalty.');
                } else {
                    showToast('Transfer successful!');
                }
                document.getElementById('modal-transfer-amount').value = '';
                closeFundTransferModal();
                refreshUserData(); // Refresh global balances
                if (typeof fetchBalancesForTransfer === 'function') fetchBalancesForTransfer();
            }
        })
        .catch(e => {
            btn.innerHTML = 'Confirm Transfer';
            showToast('Transfer failed. Try again.');
        });
}



function showSuccessModal(msg) {
    return new Promise(resolve => {
        const modal = document.getElementById('success-toast-modal');
        const msgEl = document.getElementById('success-toast-msg');
        if (modal && msgEl) {
            msgEl.textContent = msg;
            modal.style.display = 'flex';
            setTimeout(() => {
                modal.style.display = 'none';
                resolve();
            }, 1500);
        } else {
            showToast(msg);
            resolve();
        }
    });
}


// ── FUTURES CHART HEADER COUNTDOWN ──
let headerCountdownInterval = null;
function startHeaderCountdown() {
    if (headerCountdownInterval) clearInterval(headerCountdownInterval);
    headerCountdownInterval = setInterval(updateHeaderCountdown, 1000);
    updateHeaderCountdown();
}

function updateHeaderCountdown() {
    if (document.getElementById('futures-screen').style.display === 'none') return;
    const activeBtn = document.querySelector('#futures-timeframes button.active');
    if (!activeBtn) return;

    const periodSecs = parseInt(activeBtn.dataset.sec) || 60;
    const now = new Date();

    // Time relative to start of Unix epoch (makes math easy)
    const nowSecs = Math.floor(now.getTime() / 1000);
    const nextBoundarySecs = Math.ceil(nowSecs / periodSecs) * periodSecs;

    let remain = nextBoundarySecs - nowSecs;
    if (remain === 0) remain = periodSecs;

    const elCountdown = document.getElementById('header-countdown');
    if (elCountdown) elCountdown.textContent = remain + ' s';

    // Order time formatting
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const elOrderTime = document.getElementById('header-order-time');
    if (elOrderTime) elOrderTime.textContent = y + '/' + m + '/' + d + ' ' + hh + ':' + mm + ':' + ss;

    // Time period formatting
    const startBoundary = new Date((nextBoundarySecs - periodSecs) * 1000);
    const endBoundary = new Date(nextBoundarySecs * 1000);
    const startH = String(startBoundary.getHours()).padStart(2, '0');
    const startM = String(startBoundary.getMinutes()).padStart(2, '0');
    const endH = String(endBoundary.getHours()).padStart(2, '0');
    const endM = String(endBoundary.getMinutes()).padStart(2, '0');

    const elTimePeriod = document.getElementById('header-time-period');
    if (elTimePeriod) elTimePeriod.textContent = startH + ':' + startM + '~' + endH + ':' + endM;
}

document.addEventListener('DOMContentLoaded', () => {
    startHeaderCountdown();
    loadBanners();
});

let bannerSlideIndex = 0;
let bannerInterval = null;

window.currentSlide = function (n) {
    showBannerSlide(n);
};

function showBannerSlide(n) {
    const slides = document.querySelectorAll('#banner-slides-container .slide');
    const dots = document.querySelectorAll('#banner-dots-container .dot');
    if (!slides.length) return;

    if (n >= slides.length) { bannerSlideIndex = 0; }
    else if (n < 0) { bannerSlideIndex = slides.length - 1; }
    else { bannerSlideIndex = n; }

    slides.forEach((slide, index) => {
        if (index === bannerSlideIndex) {
            slide.style.opacity = '1';
            slide.style.zIndex = '1';
            slide.classList.add('active');
        } else {
            slide.style.opacity = '0';
            slide.style.zIndex = '0';
            slide.classList.remove('active');
        }
    });

    dots.forEach((dot, index) => {
        if (index === bannerSlideIndex) {
            dot.classList.add('active');
            dot.style.backgroundColor = 'rgba(255,255,255,1)';
        } else {
            dot.classList.remove('active');
            dot.style.backgroundColor = 'rgba(255,255,255,0.5)';
        }
    });

    // Reset interval on manual slide
    if (bannerInterval) clearInterval(bannerInterval);
    bannerInterval = setInterval(() => { showBannerSlide(bannerSlideIndex + 1); }, 3000);
}


// PWA Installation Logic
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            } else {
                console.log('User dismissed the install prompt');
            }
            deferredPrompt = null;
        });
    } else {
        showToast("App is already installed or your browser doesn't support it.");
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('SW registered: ', registration.scope);
        }).catch(err => {
            console.log('SW registration failed: ', err);
        });
    });
}

// ==================== DYNAMIC BANNERS ====================
async function loadBanners() {
    const s = await _fetchAppSettings();
    const bannerContainer = document.getElementById('banner-slides-container');
    const dotContainer = document.getElementById('banner-dots-container');

    if (!bannerContainer || !dotContainer) return;

    let banners = ['home_slider_1.png', 'home_slider_2.png']; // Forced local banners

    let slidesHtml = '';
    let dotsHtml = '';
    banners.forEach((url, i) => {
        const isActive = i === 0 ? 'active' : '';
        slidesHtml += `<div class="slide ${isActive}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: ${i === 0 ? 1 : 0}; transition: opacity 0.5s ease-in-out;">
            <img src="${url}" alt="Banner ${i + 1}" style="width:100%; height:140px; display:block; object-fit:cover; border-radius: 8px;">
        </div>`;
        dotsHtml += `<span class="dot ${isActive}" onclick="currentSlide(${i})" style="cursor: pointer; height: 6px; width: 6px; margin: 0 4px; background-color: rgba(255,255,255,0.5); border-radius: 50%; display: inline-block; transition: background-color 0.3s ease;"></span>`;
    });
    bannerContainer.innerHTML = slidesHtml;
    dotContainer.innerHTML = dotsHtml;

    // Initialize the slider loop
    showBannerSlide(0);
}


async function loadWithdrawalScreen() {
    if (!userData) {
        await refreshUserData();
    }
    const balanceText = document.getElementById('withdrawal-balance-text');
    if (balanceText && userData) {
        // Exchange balance is accessible at userData.balances.exchange
        const bal = parseFloat(userData.balance || 0).toFixed(4);
        balanceText.innerText = 'Balance: ' + bal + ' USDT';
    }

    const bound = localStorage.getItem('boundWithdrawAddress');
    const addrInput = document.getElementById('withdrawal-addr');
    if (addrInput) {
        if (bound) {
            addrInput.value = bound;
            addrInput.readOnly = true;
        } else {
            addrInput.value = '';
            addrInput.readOnly = false;
            showBindAddrTip();
        }
    }
}

function setWithdrawalMax() {
    if (userData) {
        const bal = parseFloat(userData.balance || 0);
        document.getElementById('withdrawal-amount').value = bal > 0 ? bal : '';
    }
}

window.cancelManualTrade = async function (id) {
    if (!authToken) return;
    try {
        const res = await fetch('/api/signals/manual-cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ tradeId: id })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        showToast('Trade Cancelled');
        refreshUserData();
        renderActivePositions();
        loadTradeHistory();
    } catch (e) { }
};
window.resolveManualTrade = async function (id) {
    if (!authToken) return;
    try {
        await fetch('/api/signals/manual-resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ tradeId: id })
        });
        refreshUserData();
        renderActivePositions();
        loadTradeHistory();
    } catch (e) { }
};

// ══════════════════════════════════════════════════════
// LOCKED DAYS MODAL
// ══════════════════════════════════════════════════════
window.showLockedDaysModal = function() {
    let remaining = 35;
    if (userData && userData.createdAt) {
        const createdDate = new Date(userData.createdAt);
        const now = new Date();
        const diffTime = now.getTime() - createdDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        remaining = 35 - diffDays;
        if (remaining < 0) remaining = 0;
    }
    
    document.getElementById('locked-days-count').innerText = remaining;
    const modal = document.getElementById('locked-days-modal');
    if(modal) {
        modal.style.display = 'flex';
    }
};

window.closeLockedDaysModal = function() {
    const modal = document.getElementById('locked-days-modal');
    if(modal) {
        modal.style.display = 'none';
    }
};
