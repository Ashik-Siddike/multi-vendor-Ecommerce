require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/prisma');

async function seed() {
  console.log('🌱 Starting database seed for Multi-Vendor E-commerce...');

  const adminEmail = 'admin@multivendor.com';
  const rawPassword = 'Admin@123';

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(`ℹ️ Admin user already exists: ${existingAdmin.email} (ID: ${existingAdmin.id}) [Role: ${existingAdmin.role}]`);
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(rawPassword, salt);

  const defaultAdmin = await prisma.user.create({
    data: {
      name: 'System Administrator',
      email: adminEmail,
      password: hashedPassword,
      role: 'ADMIN',
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  console.log(`✅ Default admin created successfully:`);
  console.log(`   Email: ${defaultAdmin.email}`);
  console.log(`   Role: ${defaultAdmin.role}`);
  console.log(`   ID: ${defaultAdmin.id}`);
  console.log(`   Password: ${rawPassword}`);
}

seed()
  .then(() => {
    console.log('🎉 Seeding completed successfully.');
  })
  .catch((error) => {
    console.error('❌ Seeding failed with error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (prisma.$pool) {
      await prisma.$pool.end();
    }
  });
