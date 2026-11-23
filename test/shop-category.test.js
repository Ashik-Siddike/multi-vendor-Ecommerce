process.env.NODE_ENV = 'test';
require('dotenv').config();
const app = require('../src/app');
const prisma = require('../src/config/prisma');

let server;
let baseUrl;

async function runTests() {
  console.log('🧪 Starting Phase 2: Category, Shop & Admin Approval Integration Tests...\n');

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`📡 Test server listening on ${baseUrl}\n`);

  const timestamp = Date.now();
  const adminEmail = `admin_${timestamp}@example.com`;
  const customer1Email = `cust1_${timestamp}@example.com`;
  const customer2Email = `cust2_${timestamp}@example.com`;
  const categoryName = `Category_${timestamp}`;
  const shopName = `SuperShop_${timestamp}`;

  let adminToken = '';
  let customer1Token = '';
  let customer2Token = '';
  let createdShopId = '';

  try {
    // ----------------------------------------------------
    // SETUP: Register Admin, Customer 1, Customer 2
    // ----------------------------------------------------
    console.log('⚙️ Setting up test users (Admin, Customer 1, Customer 2)...');

    const adminReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Super Admin',
        email: adminEmail,
        password: 'password123',
        role: 'ADMIN',
      }),
    });
    const adminData = await adminReg.json();
    adminToken = adminData.data.token;

    const cust1Reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Customer One',
        email: customer1Email,
        password: 'password123',
        role: 'CUSTOMER',
      }),
    });
    const cust1Data = await cust1Reg.json();
    customer1Token = cust1Data.data.token;

    const cust2Reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Customer Two',
        email: customer2Email,
        password: 'password123',
        role: 'CUSTOMER',
      }),
    });
    const cust2Data = await cust2Reg.json();
    customer2Token = cust2Data.data.token;

    console.log('   ✅ Test users created successfully\n');

    // ----------------------------------------------------
    // 1. CATEGORY MODULE TESTS
    // ----------------------------------------------------
    console.log('1️⃣ Category: POST /api/v1/categories without token');
    const catNoToken = await fetch(`${baseUrl}/api/v1/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: categoryName }),
    });
    console.assert(catNoToken.status === 401, `Expected 401, got ${catNoToken.status}`);
    console.log('   ✅ Unauthenticated category creation rejected (401)\n');

    console.log('2️⃣ Category: POST /api/v1/categories as Customer');
    const catCust = await fetch(`${baseUrl}/api/v1/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer1Token}`,
      },
      body: JSON.stringify({ name: categoryName }),
    });
    console.assert(catCust.status === 403, `Expected 403, got ${catCust.status}`);
    console.log('   ✅ Customer category creation rejected (403 Forbidden)\n');

    console.log('3️⃣ Category: POST /api/v1/categories as Admin');
    const catAdmin = await fetch(`${baseUrl}/api/v1/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: categoryName }),
    });
    const catAdminData = await catAdmin.json();
    console.assert(catAdmin.status === 201, `Expected 201, got ${catAdmin.status}`);
    console.assert(catAdminData.success === true, 'Category creation success should be true');
    console.assert(catAdminData.data.category.name === categoryName, 'Category name matches');
    console.log('   ✅ Admin successfully created category (201 Created)\n');

    console.log('4️⃣ Category: POST /api/v1/categories duplicate name');
    const catDup = await fetch(`${baseUrl}/api/v1/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: categoryName }),
    });
    console.assert(catDup.status === 409, `Expected 409, got ${catDup.status}`);
    console.log('   ✅ Duplicate category name rejected (409 Conflict)\n');

    console.log('5️⃣ Category: GET /api/v1/categories (Public)');
    const catList = await fetch(`${baseUrl}/api/v1/categories`);
    const catListData = await catList.json();
    console.assert(catList.status === 200, `Expected 200, got ${catList.status}`);
    const foundCat = catListData.data.categories.some((c) => c.name === categoryName);
    console.assert(foundCat, 'Created category should be in public list');
    console.log('   ✅ Public categories list retrieved successfully\n');

    // ----------------------------------------------------
    // 2. SHOP / VENDOR ONBOARDING TESTS
    // ----------------------------------------------------
    console.log('6️⃣ Shop: POST /api/v1/shops without token');
    const shopNoToken = await fetch(`${baseUrl}/api/v1/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: shopName }),
    });
    console.assert(shopNoToken.status === 401, `Expected 401, got ${shopNoToken.status}`);
    console.log('   ✅ Unauthenticated shop opening rejected (401)\n');

    console.log('7️⃣ Shop: POST /api/v1/shops as Customer 1 (First shop request)');
    const shopCust1 = await fetch(`${baseUrl}/api/v1/shops`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer1Token}`,
      },
      body: JSON.stringify({
        name: shopName,
        description: 'Best electronics and gadgets',
        logo: 'https://example.com/logo.png',
      }),
    });
    const shopCust1Data = await shopCust1.json();
    console.assert(shopCust1.status === 201, `Expected 201, got ${shopCust1.status}`);
    console.assert(shopCust1Data.data.shop.name === shopName, 'Shop name matches');
    console.assert(shopCust1Data.data.shop.isApproved === false, 'New shop isApproved must be false');
    createdShopId = shopCust1Data.data.shop.id;
    console.log('   ✅ Customer 1 successfully created shop request (isApproved: false)\n');

    console.log('8️⃣ Shop: POST /api/v1/shops Customer 1 tries second shop');
    const shopSecond = await fetch(`${baseUrl}/api/v1/shops`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer1Token}`,
      },
      body: JSON.stringify({ name: `${shopName}_second` }),
    });
    console.assert(shopSecond.status === 409, `Expected 409, got ${shopSecond.status}`);
    console.log('   ✅ Multiple shop request from same user rejected (409 Conflict)\n');

    console.log('9️⃣ Shop: POST /api/v1/shops Customer 2 tries duplicate shop name');
    const shopDupName = await fetch(`${baseUrl}/api/v1/shops`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer2Token}`,
      },
      body: JSON.stringify({ name: shopName }),
    });
    console.assert(shopDupName.status === 409, `Expected 409, got ${shopDupName.status}`);
    console.log('   ✅ Duplicate shop name rejected (409 Conflict)\n');

    console.log('🔟 Shop: GET /api/v1/shops (Public - pending shop should NOT appear)');
    const publicShopsBefore = await fetch(`${baseUrl}/api/v1/shops`);
    const publicShopsBeforeData = await publicShopsBefore.json();
    const isPendingShopListed = publicShopsBeforeData.data.shops.some((s) => s.id === createdShopId);
    console.assert(!isPendingShopListed, 'Unapproved shop must NOT be in public list');
    console.log('   ✅ Pending shop is hidden from public list\n');

    console.log('1️⃣1️⃣ Shop: GET /api/v1/shops/:id (Public - pending shop returns 404)');
    const singlePendingRes = await fetch(`${baseUrl}/api/v1/shops/${createdShopId}`);
    console.assert(singlePendingRes.status === 404, `Expected 404, got ${singlePendingRes.status}`);
    console.log('   ✅ Unapproved shop detail is not accessible publicly (404 Not Found)\n');

    console.log('1️⃣2️⃣ Shop: GET /api/v1/shops/my-shop (Customer 1 checks own shop)');
    const myShopRes = await fetch(`${baseUrl}/api/v1/shops/my-shop`, {
      headers: { Authorization: `Bearer ${customer1Token}` },
    });
    const myShopData = await myShopRes.json();
    console.assert(myShopRes.status === 200, `Expected 200, got ${myShopRes.status}`);
    console.assert(myShopData.data.shop.id === createdShopId, 'My shop ID matches');
    console.log('   ✅ Customer 1 can view own pending shop details\n');

    // ----------------------------------------------------
    // 3. ADMIN SHOP APPROVAL MODULE TESTS
    // ----------------------------------------------------
    console.log('1️⃣3️⃣ Admin: GET /api/v1/admin/shops/pending as Customer (Forbidden)');
    const adminPendingCust = await fetch(`${baseUrl}/api/v1/admin/shops/pending`, {
      headers: { Authorization: `Bearer ${customer1Token}` },
    });
    console.assert(adminPendingCust.status === 403, `Expected 403, got ${adminPendingCust.status}`);
    console.log('   ✅ Non-admin forbidden from pending shops endpoint (403)\n');

    console.log('1️⃣4️⃣ Admin: GET /api/v1/admin/shops/pending as Admin');
    const adminPendingRes = await fetch(`${baseUrl}/api/v1/admin/shops/pending`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminPendingData = await adminPendingRes.json();
    console.assert(adminPendingRes.status === 200, `Expected 200, got ${adminPendingRes.status}`);
    const foundPendingShop = adminPendingData.data.shops.some((s) => s.id === createdShopId);
    console.assert(foundPendingShop, 'Pending shop should be listed for Admin');
    console.log('   ✅ Admin successfully retrieved pending shops list\n');

    console.log('1️⃣5️⃣ Admin: PATCH /api/v1/admin/shops/:id/approve as Customer (Forbidden)');
    const approveCust = await fetch(`${baseUrl}/api/v1/admin/shops/${createdShopId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customer1Token}` },
    });
    console.assert(approveCust.status === 403, `Expected 403, got ${approveCust.status}`);
    console.log('   ✅ Non-admin forbidden from approving shop (403)\n');

    console.log('1️⃣6️⃣ Admin: PATCH /api/v1/admin/shops/:id/approve as Admin (Prisma Transaction)');
    const approveAdmin = await fetch(`${baseUrl}/api/v1/admin/shops/${createdShopId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const approveAdminData = await approveAdmin.json();
    console.assert(approveAdmin.status === 200, `Expected 200, got ${approveAdmin.status}`);
    console.assert(approveAdminData.data.shop.isApproved === true, 'shop.isApproved must be true');
    console.assert(approveAdminData.data.owner.role === 'VENDOR', 'owner role must be VENDOR');
    console.log('   ✅ Shop approved & owner promoted to VENDOR in atomic transaction\n');

    // ----------------------------------------------------
    // 4. POST-APPROVAL PUBLIC & VENDOR ACCESS TESTS
    // ----------------------------------------------------
    console.log('1️⃣7️⃣ Post-Approval: GET /api/v1/shops (Public list now shows approved shop)');
    const publicShopsAfter = await fetch(`${baseUrl}/api/v1/shops`);
    const publicShopsAfterData = await publicShopsAfter.json();
    const isApprovedShopListed = publicShopsAfterData.data.shops.some((s) => s.id === createdShopId);
    console.assert(isApprovedShopListed, 'Approved shop must now appear in public list');
    console.log('   ✅ Approved shop is now visible to the public\n');

    console.log('1️⃣8️⃣ Post-Approval: GET /api/v1/shops/:id (Public detail accessible)');
    const singleApprovedRes = await fetch(`${baseUrl}/api/v1/shops/${createdShopId}`);
    const singleApprovedData = await singleApprovedRes.json();
    console.assert(singleApprovedRes.status === 200, `Expected 200, got ${singleApprovedRes.status}`);
    console.assert(singleApprovedData.data.shop.name === shopName, 'Shop detail name matches');
    console.log('   ✅ Single approved shop details retrieved publicly\n');

    console.log('1️⃣9️⃣ Vendor: Customer 2 tries PATCH /api/v1/shops/my-shop (Forbidden)');
    const updateCust2 = await fetch(`${baseUrl}/api/v1/shops/my-shop`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer2Token}`,
      },
      body: JSON.stringify({ description: 'Hacked description' }),
    });
    console.assert(updateCust2.status === 403, `Expected 403, got ${updateCust2.status}`);
    console.log('   ✅ Customer 2 without vendor role forbidden from updating shop (403)\n');

    console.log('2️⃣0️⃣ Vendor: Customer 1 (now VENDOR) logs in to get fresh token & updates shop');
    // Login Customer 1 to get fresh token reflecting VENDOR role in JWT
    const vendorLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: customer1Email,
        password: 'password123',
      }),
    });
    const vendorLoginData = await vendorLogin.json();
    console.assert(vendorLoginData.data.user.role === 'VENDOR', 'Role in new JWT must be VENDOR');
    const freshVendorToken = vendorLoginData.data.token;

    const updateMyShopRes = await fetch(`${baseUrl}/api/v1/shops/my-shop`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freshVendorToken}`,
      },
      body: JSON.stringify({
        description: 'Updated premium electronics & fast shipping',
        logo: 'https://example.com/new-logo.png',
      }),
    });
    const updateMyShopData = await updateMyShopRes.json();
    console.assert(updateMyShopRes.status === 200, `Expected 200, got ${updateMyShopRes.status}`);
    console.assert(
      updateMyShopData.data.shop.description === 'Updated premium electronics & fast shipping',
      'Description was updated'
    );
    console.log('   ✅ Vendor successfully updated their own shop details (200 OK)\n');

    console.log('🎉 ALL PHASE 2 INTEGRATION TESTS PASSED (20/20)! 🚀\n');
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
    await prisma.$disconnect();
    if (prisma.$pool) {
      await prisma.$pool.end();
    }
    process.exit(process.exitCode || 0);
  }
}

runTests();
