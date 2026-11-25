require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/prisma');

async function seed() {
  console.log('🌱 Starting database seed for Multi-Vendor SaaS Platform...');

  // 1. Seed Default Admin
  const adminEmail = 'admin@multivendor.com';
  const rawPassword = 'Admin@123';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(`ℹ️ Admin user already exists: ${existingAdmin.email} (ID: ${existingAdmin.id})`);
  } else {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    const defaultAdmin = await prisma.user.create({
      data: {
        name: 'System Administrator',
        email: adminEmail,
        password: hashedPassword,
        role: 'ADMIN',
      },
    });
    console.log(`✅ Default admin created: ${defaultAdmin.email} (${rawPassword})`);
  }

  // 2. Seed Default SaaS Subscription Plans
  const plans = [
    {
      name: 'STARTER',
      monthlyPrice: 0,
      maxProducts: 20,
      commissionRate: 10.0,
      allowCustomDomain: false,
      allowPremiumThemes: false,
      allowCoupons: true,
      description: 'Free starter tier for new merchants. Up to 20 products & standard themes.',
    },
    {
      name: 'PRO',
      monthlyPrice: 29,
      maxProducts: 500,
      commissionRate: 5.0,
      allowCustomDomain: true,
      allowPremiumThemes: true,
      allowCoupons: true,
      description: 'Growing businesses. Up to 500 products, 5% fee, custom domains & premium themes.',
    },
    {
      name: 'ENTERPRISE',
      monthlyPrice: 99,
      maxProducts: -1,
      commissionRate: 2.0,
      allowCustomDomain: true,
      allowPremiumThemes: true,
      allowCoupons: true,
      description: 'High-volume brands. Unlimited products, 2% fee & full SaaS customization.',
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan,
    });
  }
  console.log('✅ Seeded SaaS Subscription Plans: STARTER, PRO, ENTERPRISE');

  // 3. Seed Default Frontend Storefront Themes
  const themes = [
    {
      slug: 'minimal-light',
      name: 'Minimal Light',
      description: 'Clean, fast editorial storefront with crisp white canvas and slate typography.',
      previewImage: 'https://placehold.co/800x600/FFFFFF/111827?text=Minimal+Light+Theme',
      isPremium: false,
      defaultConfig: {
        primaryColor: '#111827',
        secondaryColor: '#4B5563',
        accentColor: '#2563EB',
        backgroundColor: '#FFFFFF',
        surfaceColor: '#F9FAFB',
        textColor: '#111827',
        fontFamily: 'Inter, sans-serif',
        borderRadius: '8px',
        headerStyle: 'clean-centered',
      },
    },
    {
      slug: 'modern-vibrant',
      name: 'Modern Vibrant',
      description: 'Energetic marketplace storefront with bold cards and gradient CTAs.',
      previewImage: 'https://placehold.co/800x600/EEF2FF/4F46E5?text=Modern+Vibrant+Theme',
      isPremium: false,
      defaultConfig: {
        primaryColor: '#4F46E5',
        secondaryColor: '#EC4899',
        accentColor: '#F59E0B',
        backgroundColor: '#F8FAFC',
        surfaceColor: '#FFFFFF',
        textColor: '#0F172A',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        borderRadius: '14px',
        headerStyle: 'sticky-search',
      },
    },
    {
      slug: 'luxury-dark',
      name: 'Luxury Dark',
      description: 'High-end dark mode boutique design with gold accents for electronics & jewelry.',
      previewImage: 'https://placehold.co/800x600/09090B/D4AF37?text=Luxury+Dark+Theme',
      isPremium: true,
      defaultConfig: {
        primaryColor: '#D4AF37',
        secondaryColor: '#A1A1AA',
        accentColor: '#FBBF24',
        backgroundColor: '#09090B',
        surfaceColor: '#18181B',
        textColor: '#FAFAFA',
        fontFamily: 'Playfair Display, serif',
        borderRadius: '4px',
        headerStyle: 'minimal-transparent',
      },
    },
    {
      slug: 'fashion-editorial',
      name: 'Fashion Editorial',
      description: 'Asymmetric lookbook-style storefront crafted for clothing and lifestyle brands.',
      previewImage: 'https://placehold.co/800x600/FAF7F2/292524?text=Fashion+Editorial+Theme',
      isPremium: true,
      defaultConfig: {
        primaryColor: '#292524',
        secondaryColor: '#78716C',
        accentColor: '#C2410C',
        backgroundColor: '#FAF7F2',
        surfaceColor: '#FFFFFF',
        textColor: '#1C1917',
        fontFamily: 'Cormorant Garamond, serif',
        borderRadius: '0px',
        headerStyle: 'editorial-split',
      },
    },
  ];

  for (const theme of themes) {
    await prisma.themeTemplate.upsert({
      where: { slug: theme.slug },
      update: theme,
      create: theme,
    });
  }
  console.log('✅ Seeded Storefront Themes: minimal-light, modern-vibrant, luxury-dark, fashion-editorial');
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
