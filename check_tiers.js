const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const rows = await p.platformSettings.findMany({
    where: { key: { in: ['tier1_min','tier2_min','tier3_min','tier4_min'] } }
  });
  console.log('Current tiers:', JSON.stringify(rows, null, 2));
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
