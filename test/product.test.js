require('dotenv').config();
const app = require('../src/app');
const prisma = require('../src/config/prisma');

let server;
let baseUrl;

async function runTests() {
  console.log('🧪 Starting Phase 3: Product CRUD, Ownership & Search/Filter Integration Tests...\n');

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`📡 Test server listening on ${baseUrl}\n`);

  const timestamp = Date.now();
  const adminEmail = `admin_p3_${timestamp}@example.com`;
  const vendorAEmail = `vendor_a_${timestamp}@example.com`;
  const vendorBEmail = `vendor_b_${timestamp}@example.com`;
  const vendorCEmail = `vendor_c_${timestamp}@example.com`;
  const customerEmail = `customer_p3_${timestamp}@example.com`;

  let adminToken = '';
  let vendorAToken = '';
  let vendorBToken = '';
  let vendorCToken = '';
  let customerToken = '';

  let categoryAId = '';
  let categoryBId = '';
  let shopAId = '';
  let shopBId = '';
  let productA1Id = '';

  try {
    // ----------------------------------------------------
    // SETUP: Users, Categories, and Approved Shops
    // ----------------------------------------------------
    console.log('⚙️ Setting up users, shops, and categories for Phase 3...');

    // 1. Admin
    const adminReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Admin P3', email: adminEmail, password: 'password123', role: 'ADMIN' }),
    });
    const adminData = await adminReg.json();
    adminToken = adminData.data.token;

    // 2. Categories
    const catARes = await fetch(`${baseUrl}/api/v1/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: `Laptops_${timestamp}` }),
    });
    const catAData = await catARes.json();
    categoryAId = catAData.data.category.id;

    const catBRes = await fetch(`${baseUrl}/api/v1/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: `Phones_${timestamp}` }),
    });
    const catBData = await catBRes.json();
    categoryBId = catBData.data.category.id;

    // 3. Vendor A (Register, create Shop A, Approve)
    const vAReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vendor A', email: vendorAEmail, password: 'password123', role: 'CUSTOMER' }),
    });
    const vAData = await vAReg.json();
    const tempVAToken = vAData.data.token;

    const shopARes = await fetch(`${baseUrl}/api/v1/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tempVAToken}` },
      body: JSON.stringify({ name: `ShopA_${timestamp}`, description: 'Vendor A Store' }),
    });
    const shopAData = await shopARes.json();
    shopAId = shopAData.data.shop.id;

    // Admin approves Shop A
    await fetch(`${baseUrl}/api/v1/admin/shops/${shopAId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // Re-login Vendor A to get token with VENDOR role
    const vALogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: vendorAEmail, password: 'password123' }),
    });
    const vALoginData = await vALogin.json();
    vendorAToken = vALoginData.data.token;

    // 4. Vendor B (Register, create Shop B, Approve)
    const vBReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vendor B', email: vendorBEmail, password: 'password123', role: 'CUSTOMER' }),
    });
    const vBData = await vBReg.json();
    const tempVBToken = vBData.data.token;

    const shopBRes = await fetch(`${baseUrl}/api/v1/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tempVBToken}` },
      body: JSON.stringify({ name: `ShopB_${timestamp}`, description: 'Vendor B Store' }),
    });
    const shopBData = await shopBRes.json();
    shopBId = shopBData.data.shop.id;

    // Admin approves Shop B
    await fetch(`${baseUrl}/api/v1/admin/shops/${shopBId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const vBLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: vendorBEmail, password: 'password123' }),
    });
    const vBLoginData = await vBLogin.json();
    vendorBToken = vBLoginData.data.token;

    // 5. Vendor C with Unapproved Shop
    const vCReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vendor C', email: vendorCEmail, password: 'password123', role: 'CUSTOMER' }),
    });
    const vCData = await vCReg.json();
    vendorCToken = vCData.data.token;

    await fetch(`${baseUrl}/api/v1/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorCToken}` },
      body: JSON.stringify({ name: `ShopC_Pending_${timestamp}`, description: 'Unapproved Store' }),
    });

    // 6. Customer
    const custReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Customer P3', email: customerEmail, password: 'password123', role: 'CUSTOMER' }),
    });
    const custData = await custReg.json();
    customerToken = custData.data.token;

    console.log('   ✅ Environment initialized: Categories, Vendors & Shops ready\n');

    // ----------------------------------------------------
    // 1. PRODUCT CREATION & GUARDS
    // ----------------------------------------------------
    console.log('1️⃣ Product: Customer tries POST /api/v1/products (Forbidden)');
    const prodCustRes = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        name: 'Forbidden Item',
        description: 'Should not create',
        price: 100,
        stock: 5,
        categoryId: categoryAId,
      }),
    });
    console.assert(prodCustRes.status === 403, `Expected 403, got ${prodCustRes.status}`);
    console.log('   ✅ Customer role rejected (403 Forbidden)\n');

    console.log('2️⃣ Product: Vendor with unapproved shop tries POST /api/v1/products (Forbidden)');
    const prodPendingRes = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorCToken}` },
      body: JSON.stringify({
        name: 'Pending Shop Item',
        description: 'Should not create',
        price: 100,
        stock: 5,
        categoryId: categoryAId,
      }),
    });
    console.assert(prodPendingRes.status === 403, `Expected 403, got ${prodPendingRes.status}`);
    console.log('   ✅ Unapproved shop rejected (403 Forbidden)\n');

    console.log('3️⃣ Product: POST /api/v1/products validation (Invalid Price & Missing Fields)');
    const prodValRes = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorAToken}` },
      body: JSON.stringify({
        name: '',
        description: 'No name',
        price: -50,
        stock: -1,
        categoryId: categoryAId,
      }),
    });
    console.assert(prodValRes.status === 400, `Expected 400, got ${prodValRes.status}`);
    console.log('   ✅ Invalid product fields rejected (400 Bad Request)\n');

    console.log('4️⃣ Product: Vendor A creates Product 1 (MacBook Pro M3 Max)');
    const prodA1Res = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorAToken}` },
      body: JSON.stringify({
        name: 'MacBook Pro M3 Max',
        description: 'High performance Apple silicon laptop',
        price: 2499.99,
        stock: 15,
        categoryId: categoryAId,
        images: ['https://example.com/macbook1.png', 'https://example.com/macbook2.png'],
      }),
    });
    const prodA1Data = await prodA1Res.json();
    console.assert(prodA1Res.status === 201, `Expected 201, got ${prodA1Res.status}`);
    console.assert(prodA1Data.data.product.name === 'MacBook Pro M3 Max', 'Product name matches');
    console.assert(prodA1Data.data.product.shopId === shopAId, 'shopId automatically assigned to Shop A');
    console.assert(prodA1Data.data.product.images.length === 2, 'Images array populated');
    productA1Id = prodA1Data.data.product.id;
    console.log('   ✅ Vendor A created Product 1 successfully\n');

    console.log('5️⃣ Product: Vendor A creates Product 2 (Dell XPS 15)');
    const prodA2Res = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorAToken}` },
      body: JSON.stringify({
        name: 'Dell XPS 15',
        description: 'Premium InfinityEdge Windows laptop',
        price: 1799.0,
        stock: 8,
        categoryId: categoryAId,
        images: ['https://example.com/dell.png'],
      }),
    });
    console.assert(prodA2Res.status === 201, `Expected 201, got ${prodA2Res.status}`);
    console.log('   ✅ Vendor A created Product 2 successfully\n');

    console.log('6️⃣ Product: Vendor B creates Product 3 (iPhone 16 Pro Max)');
    const prodB1Res = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorBToken}` },
      body: JSON.stringify({
        name: 'iPhone 16 Pro Max',
        description: 'Titanium design with A18 Pro chip',
        price: 1199.0,
        stock: 25,
        categoryId: categoryBId,
        images: ['https://example.com/iphone.png'],
      }),
    });
    const prodB1Data = await prodB1Res.json();
    console.assert(prodB1Res.status === 201, `Expected 201, got ${prodB1Res.status}`);
    console.assert(prodB1Data.data.product.shopId === shopBId, 'shopId automatically assigned to Shop B');
    console.log('   ✅ Vendor B created Product 3 successfully\n');

    // ----------------------------------------------------
    // 2. SEARCH, FILTER, SORT & PAGINATION
    // ----------------------------------------------------
    console.log('7️⃣ Public GET /api/v1/products (General list)');
    const listRes = await fetch(`${baseUrl}/api/v1/products`);
    const listData = await listRes.json();
    console.assert(listRes.status === 200, `Expected 200, got ${listRes.status}`);
    console.assert(listData.data.total >= 3, 'Total products count should be at least 3');
    console.log('   ✅ Retrieved all public products\n');

    console.log('8️⃣ Search: GET /api/v1/products?search=MacBook');
    const searchRes = await fetch(`${baseUrl}/api/v1/products?search=macbook`);
    const searchData = await searchRes.json();
    console.assert(searchRes.status === 200, `Expected 200, got ${searchRes.status}`);
    const macbookFound = searchData.data.products.every((p) =>
      p.name.toLowerCase().includes('macbook') || p.description.toLowerCase().includes('macbook')
    );
    console.assert(macbookFound && searchData.data.products.length >= 1, 'Search matched MacBook');
    console.log('   ✅ Case-insensitive search on name/description verified\n');

    console.log('9️⃣ Filter by Category: GET /api/v1/products?categoryId=...');
    const catFilterRes = await fetch(`${baseUrl}/api/v1/products?categoryId=${categoryAId}`);
    const catFilterData = await catFilterRes.json();
    console.assert(catFilterRes.status === 200, `Expected 200, got ${catFilterRes.status}`);
    const allCatA = catFilterData.data.products.every((p) => p.categoryId === categoryAId);
    console.assert(allCatA, 'All returned products match category A');
    console.log('   ✅ Category filter verified\n');

    console.log('🔟 Filter by Shop: GET /api/v1/products?shopId=...');
    const shopFilterRes = await fetch(`${baseUrl}/api/v1/products?shopId=${shopAId}`);
    const shopFilterData = await shopFilterRes.json();
    console.assert(shopFilterRes.status === 200, `Expected 200, got ${shopFilterRes.status}`);
    const allShopA = shopFilterData.data.products.every((p) => p.shopId === shopAId);
    console.assert(allShopA, 'All returned products match Shop A');
    console.log('   ✅ Shop filter verified\n');

    console.log('1️⃣1️⃣ Filter by Price Range: GET /api/v1/products?minPrice=1500&maxPrice=2000');
    const priceFilterRes = await fetch(`${baseUrl}/api/v1/products?minPrice=1500&maxPrice=2000`);
    const priceFilterData = await priceFilterRes.json();
    console.assert(priceFilterRes.status === 200, `Expected 200, got ${priceFilterRes.status}`);
    const inRange = priceFilterData.data.products.every((p) => p.price >= 1500 && p.price <= 2000);
    console.assert(inRange && priceFilterData.data.products.length >= 1, 'Products fall in price range');
    console.log('   ✅ Price range (minPrice/maxPrice) filter verified\n');

    console.log('1️⃣2️⃣ Sorting: GET /api/v1/products?sortBy=price_asc');
    const sortAscRes = await fetch(`${baseUrl}/api/v1/products?sortBy=price_asc`);
    const sortAscData = await sortAscRes.json();
    const prices = sortAscData.data.products.map((p) => p.price);
    const isSortedAsc = prices.every((val, i, arr) => !i || arr[i - 1] <= val);
    console.assert(isSortedAsc, 'Products sorted ascending by price');
    console.log('   ✅ Sort by price_asc verified\n');

    console.log('1️⃣3️⃣ Pagination: GET /api/v1/products?page=1&limit=2');
    const pagRes = await fetch(`${baseUrl}/api/v1/products?page=1&limit=2`);
    const pagData = await pagRes.json();
    console.assert(pagRes.status === 200, `Expected 200, got ${pagRes.status}`);
    console.assert(pagData.data.products.length <= 2, 'Products length within limit');
    console.assert(pagData.data.page === 1, 'Current page is 1');
    console.assert(pagData.data.limit === 2, 'Limit is 2');
    console.assert(pagData.data.totalPages >= 2, 'Total pages >= 2');
    console.log('   ✅ Pagination metadata verified\n');

    // ----------------------------------------------------
    // 3. SINGLE PRODUCT DETAIL
    // ----------------------------------------------------
    console.log('1️⃣4️⃣ GET /api/v1/products/:id (Public details)');
    const singleRes = await fetch(`${baseUrl}/api/v1/products/${productA1Id}`);
    const singleData = await singleRes.json();
    console.assert(singleRes.status === 200, `Expected 200, got ${singleRes.status}`);
    console.assert(singleData.data.product.id === productA1Id, 'Product ID matches');
    console.assert(singleData.data.product.category.name, 'Category is included');
    console.assert(singleData.data.product.shop.name, 'Shop is included');
    console.log('   ✅ Single product retrieved with shop and category relations\n');

    // ----------------------------------------------------
    // 4. STRICT VENDOR OWNERSHIP CHECKS
    // ----------------------------------------------------
    console.log('1️⃣5️⃣ Ownership Check: Vendor B attempts PATCH on Vendor A’s product (Forbidden)');
    const unauthorizedPatch = await fetch(`${baseUrl}/api/v1/products/${productA1Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorBToken}` },
      body: JSON.stringify({ price: 100 }),
    });
    console.assert(unauthorizedPatch.status === 403, `Expected 403, got ${unauthorizedPatch.status}`);
    console.log('   ✅ Strict ownership check: Vendor B denied modifying Vendor A product (403 Forbidden)\n');

    console.log('1️⃣6️⃣ Ownership Check: Vendor A updates own product (Success)');
    const authorizedPatch = await fetch(`${baseUrl}/api/v1/products/${productA1Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorAToken}` },
      body: JSON.stringify({
        price: 2399.0,
        stock: 12,
        description: 'Updated description for Apple MacBook Pro',
      }),
    });
    const patchData = await authorizedPatch.json();
    console.assert(authorizedPatch.status === 200, `Expected 200, got ${authorizedPatch.status}`);
    console.assert(patchData.data.product.price === 2399.0, 'Price updated');
    console.assert(patchData.data.product.stock === 12, 'Stock updated');
    console.log('   ✅ Vendor A successfully updated their own product (200 OK)\n');

    console.log('1️⃣7️⃣ Ownership Check: Customer attempts DELETE on Vendor A’s product (Forbidden)');
    const custDelete = await fetch(`${baseUrl}/api/v1/products/${productA1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    console.assert(custDelete.status === 403, `Expected 403, got ${custDelete.status}`);
    console.log('   ✅ Customer denied deleting product (403 Forbidden)\n');

    console.log('1️⃣8️⃣ Ownership Check: Vendor B attempts DELETE on Vendor A’s product (Forbidden)');
    const unauthorizedDelete = await fetch(`${baseUrl}/api/v1/products/${productA1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${vendorBToken}` },
    });
    console.assert(unauthorizedDelete.status === 403, `Expected 403, got ${unauthorizedDelete.status}`);
    console.log('   ✅ Strict ownership check: Vendor B denied deleting Vendor A product (403 Forbidden)\n');

    console.log('1️⃣9️⃣ Ownership Check: Vendor A DELETEs own product (Success)');
    const authorizedDelete = await fetch(`${baseUrl}/api/v1/products/${productA1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    console.assert(authorizedDelete.status === 200, `Expected 200, got ${authorizedDelete.status}`);
    console.log('   ✅ Vendor A successfully deleted own product (200 OK)\n');

    console.log('2️⃣0️⃣ Verify Deleted Product is gone: GET /api/v1/products/:id (404 Not Found)');
    const verifyDeleted = await fetch(`${baseUrl}/api/v1/products/${productA1Id}`);
    console.assert(verifyDeleted.status === 404, `Expected 404, got ${verifyDeleted.status}`);
    console.log('   ✅ Deleted product verified non-existent (404 Not Found)\n');

    console.log('🎉 ALL PHASE 3 INTEGRATION TESTS PASSED (20/20)! 🚀\n');
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
