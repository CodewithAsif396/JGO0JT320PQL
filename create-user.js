const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@pql.com';
  const password = 'Pql@12345';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('User already exists:', email);
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      referralCode: 'PQLADMIN',
      isVerified: true,
      role: 'ADMIN',
    }
  });

  console.log('✅ Test user created successfully!');
  console.log('   Email   :', email);
  console.log('   Password:', password);
  console.log('   ID      :', user.id);
}

main().catch(console.error).finally(() => prisma.$disconnect());
