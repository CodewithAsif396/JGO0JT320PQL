# Advanced Signal Exchange Platform

A professional-grade, lightweight signal-based simulated exchange.

## Features
- **Signal Notification System**: Real-time signals from admin.
- **Simulated Trading Engine**: Fake market movement and trade execution.
- **Wallet & Deposit System**: Custom TRC20 address generation and balance management.
- **Referral & KYC**: Complete user lifecycle management.
- **Powerful Admin Panel**: Full control over users, signals, and trades.

## Tech Stack
- **Frontend**: Next.js (HTML/JS/CSS used here), Tailwind (Vanilla CSS used here), TradingView.
- **Backend**: Node.js, Express, Socket.io.
- **Database**: PostgreSQL (Prisma ORM).
- **Cache**: Redis.
- **Infrastructure**: Docker.

## Getting Started

1. **Spin up Infrastructure**:
   ```bash
   docker-compose up -d
   ```

2. **Run Migrations**:
   ```bash
   npx prisma migrate dev --name init
   ```

3. **Setup Admin User**:
   ```bash
   node admin_setup.js
   ```

4. **Start the Server**:
   ```bash
   npm start
   ```

The app will be available at `http://localhost:3000`.

## Signal Flow
1. Admin creates a signal via `/api/admin/signals`.
2. Users receive a real-time notification on the Home screen.
3. Users click "FOLLOW SIGNAL" to go to the trading screen.
4. Users place a trade before the countdown ends.
5. Signal starts, market movement is simulated.
6. Signal ends, trades are resolved automatically.
