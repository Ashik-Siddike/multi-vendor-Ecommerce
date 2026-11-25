process.env.NODE_ENV = 'test';
require('dotenv').config();
const app = require('../src/app');
const prisma = require('../src/config/prisma');

let server;
let baseUrl;

async function runTests() {
  console.log('🧪 Starting Phase 13: SaaS Multi-Tenant Storefront, Themes, Color Customization & Plans Tests...\n');

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`📡 Test server listening on ${baseUrl}\n`);

  const timestamp = Date.now();
  const adminEmail = `admin_saas_${timestamp}@example.com`;
  const vendorEmail = `vendor_saas_${timestamp}@example.com`;

  let adminToken = '';
  let vendorToken = '';
  let shopId = '';
  let shopSlug = '';
  let categoryId = '';

  try {
    console.log('⚙️ Setting up Admin, Category & Merchant Shop...');

    // 1. Admin
    const adminReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Admin SaaS', email: adminEmail, password: 'password123', role: 'ADMIN' }),
    });
    adminToken = (await adminReg.json()).data.token;

    // 2. Category
    const catRes = await fetch(`${baseUrl}/api/v1/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: `SaaS_Cat_${timestamp}` }),
    });
    categoryId = (await catRes.json()).data.category.id;

    // 3. Customer registers & requests Shop (auto-generates slug & assigns STARTER plan)
    const custReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'SaaS Merchant', email: vendorEmail, password: 'password123' }),
    });
    const custToken = (await custReg.json()).data.token;

    const shopRes = await fetch(`${baseUrl}/api/v1/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({ name: `Urban Style ${timestamp}`, description: 'Modern apparel SaaS store' }),
    });
    const shopData = await shopRes.json();
    if (shopRes.status !== 201) throw new Error(`Shop create failed: ${JSON.stringify(shopData)}`);
    shopId = shopData.data.shop.id;
    shopSlug = shopData.data.shop.slug;
    if (!shopSlug) throw new Error('Expected auto-generated shop slug');

    // Approve shop & re-login to get VENDOR token
    await fetch(`${baseUrl}/api/v1/admin/shops/${shopId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: vendorEmail, password: 'password123' }),
    });
    vendorToken = (await loginRes.json()).data.token;

    // Add a product to shop
    await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({
        name: 'Classic Linen Shirt',
        description: 'Breathable summer shirt',
        price: 45,
        stock: 20,
        categoryId,
      }),
    });

    console.log(`   ✅ Shop created (slug: "${shopSlug}") & approved.\n`);

    // 1. Public Themes Catalog
    console.log('1️⃣ Themes: GET /api/v1/themes (Public catalog)');
    const themesRes = await fetch(`${baseUrl}/api/v1/themes`);
    const themesData = await themesRes.json();
    if (themesRes.status !== 200 || themesData.data.themes.length < 4) {
      throw new Error(`Expected >= 4 themes, got: ${JSON.stringify(themesData)}`);
    }
    console.log(`   ✅ Retrieved ${themesData.data.themes.length} frontend theme templates\n`);

    // 2. Public Subscription Plans
    console.log('2️⃣ Plans: GET /api/v1/plans (Public SaaS pricing tiers)');
    const plansRes = await fetch(`${baseUrl}/api/v1/plans`);
    const plansData = await plansRes.json();
    if (plansRes.status !== 200 || plansData.data.plans.length < 3) {
      throw new Error(`Expected >= 3 plans, got: ${JSON.stringify(plansData)}`);
    }
    console.log('   ✅ Retrieved STARTER, PRO & ENTERPRISE plans\n');

    // 3. STARTER plan blocked from Premium Theme (403)
    console.log('3️⃣ Feature Gate: STARTER plan tries selecting Premium theme "luxury-dark" (403)');
    const premBlockRes = await fetch(`${baseUrl}/api/v1/vendor/theme`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ themeSlug: 'luxury-dark' }),
    });
    if (premBlockRes.status !== 403) throw new Error(`Expected 403, got ${premBlockRes.status}`);
    console.log('   ✅ Premium theme gated cleanly for STARTER plan (403 Upgrade required)\n');

    // 4. STARTER plan blocked from Custom Domain (403)
    console.log('4️⃣ Feature Gate: STARTER plan tries setting customDomain (403)');
    const domBlockRes = await fetch(`${baseUrl}/api/v1/vendor/theme`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ customDomain: `shop-${timestamp}.com` }),
    });
    if (domBlockRes.status !== 403) throw new Error(`Expected 403, got ${domBlockRes.status}`);
    console.log('   ✅ Custom domain gated cleanly for STARTER plan (403 Upgrade required)\n');

    // 5. Invalid hex color rejected (400)
    console.log('5️⃣ Color Validation: Invalid hex color "red-ish" rejected (400)');
    const badColorRes = await fetch(`${baseUrl}/api/v1/vendor/theme`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ themeConfig: { primaryColor: 'red-ish' } }),
    });
    if (badColorRes.status !== 400) throw new Error(`Expected 400, got ${badColorRes.status}`);
    console.log('   ✅ Invalid hex color rejected (400 Bad Request)\n');

    // 6. Select Free Theme & Customize Colors
    console.log('6️⃣ Customization: Vendor selects "modern-vibrant" & sets custom #E11D48 color');
    const custThemeRes = await fetch(`${baseUrl}/api/v1/vendor/theme`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({
        themeSlug: 'modern-vibrant',
        themeConfig: {
          primaryColor: '#E11D48',
          accentColor: '#F59E0B',
          bannerTitle: 'Eid Mega Collection 2026',
        },
      }),
    });
    const custThemeData = await custThemeRes.json();
    if (
      custThemeRes.status !== 200 ||
      custThemeData.data.resolvedThemeConfig.primaryColor !== '#E11D48'
    ) {
      throw new Error(`Theme customization failed: ${JSON.stringify(custThemeData)}`);
    }
    console.log('   ✅ Theme & custom colors saved and merged with defaults\n');

    // 7. Upgrade Subscription to PRO
    console.log('7️⃣ Subscription: Vendor upgrades to PRO plan (Commission drops 10% -> 5%)');
    const upgRes = await fetch(`${baseUrl}/api/v1/vendor/subscription/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ planName: 'PRO' }),
    });
    const upgData = await upgRes.json();
    if (upgRes.status !== 200 || upgData.data.commissionRate !== 5) {
      throw new Error(`Upgrade failed: ${JSON.stringify(upgData)}`);
    }
    console.log('   ✅ Upgraded to PRO plan! Commission rate automatically reduced to 5%\n');

    // 8. Now PRO plan unlocks Premium Theme + Custom Domain
    console.log('8️⃣ Unlocked: PRO Vendor selects "luxury-dark" & sets customDomain');
    const proThemeRes = await fetch(`${baseUrl}/api/v1/vendor/theme`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({
        themeSlug: 'luxury-dark',
        customDomain: `urban-${timestamp}.com`,
      }),
    });
    if (proThemeRes.status !== 200) {
      throw new Error(`PRO theme update failed: ${JSON.stringify(await proThemeRes.json())}`);
    }
    console.log('   ✅ Premium theme & custom domain unlocked and saved\n');

    // 9. Public Storefront Resolution by Slug
    console.log('9️⃣ Storefront: Public GET /api/v1/storefront/:slug');
    const sfRes = await fetch(`${baseUrl}/api/v1/storefront/${shopSlug}`);
    const sfData = await sfRes.json();
    if (
      sfRes.status !== 200 ||
      sfData.data.storefront.themeSlug !== 'luxury-dark' ||
      sfData.data.storefront.designConfig.primaryColor !== '#E11D48' ||
      sfData.data.storefront.featuredProducts.length !== 1
    ) {
      throw new Error(`Storefront resolution mismatch: ${JSON.stringify(sfData)}`);
    }
    console.log('   ✅ Multi-tenant storefront resolved with theme, custom colors & products!\n');

    // 10. Product Quota Enforcement Test
    console.log('🔟 Quota Gatekeeper: Enforce maxProducts limit on plan');
    const limitedPlan = await prisma.subscriptionPlan.create({
      data: {
        name: `LIMITED_${timestamp}`,
        monthlyPrice: 0,
        maxProducts: 1,
        commissionRate: 10,
      },
    });
    await prisma.shop.update({
      where: { id: shopId },
      data: { planId: limitedPlan.id },
    });

    const quotaRes = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({
        name: 'Blocked 2nd Product',
        description: 'Should hit quota limit',
        price: 25,
        stock: 10,
        categoryId,
      }),
    });
    if (quotaRes.status !== 403) throw new Error(`Expected 403 quota error, got ${quotaRes.status}`);
    console.log('   ✅ Product quota limit enforced (403 Upgrade required)\n');

    console.log('🎉 ALL PHASE 13 SAAS INTEGRATION TESTS PASSED (10/10)! 🚀\n');
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await prisma.$disconnect();
    process.exit(0);
  }
}

runTests();
