const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const p = new PrismaClient();
async function main() {
  // Zero out all tradeBalance — perpetualBalance is used instead
  const r = await p.user.updateMany({ data: { tradeBalance: 0 } });
  console.log('Zeroed tradeBalance for', r.count, 'users');
  const updated = await p.user.findUnique({ where: { email: 'admin@pql.com' }, select: { balance: true, tradeBalance: true, perpetualBalance: true } });
  console.log('admin@pql.com balances:', updated);
  // Total should be: exchange + perpetual only
  const total = (updated.balance || 0) + (updated.perpetualBalance || 0);
  console.log('Correct total:', total, 'USDT');
}
main().catch(console.error).finally(() => p.$disconnect());
