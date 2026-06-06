const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanJunkDeposits() {
  try {
    const deleted = await prisma.deposit.deleteMany({
      where: {
        currency: 'TRX',
        amount: {
          in: [0, 15]
        }
      }
    });
    console.log(`Successfully deleted ${deleted.count} junk TRX deposit entries (0 or 15 TRX).`);
  } catch (error) {
    console.error('Error deleting junk deposits:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanJunkDeposits();
