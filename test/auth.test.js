process.env.NODE_ENV = 'test';
require('dotenv').config();
const app = require('../src/app');
const prisma = require('../src/config/prisma');

let server;
let baseUrl;

async function runTests() {
  console.log('🧪 Starting Auth API & Middleware Integration Tests...\n');

  // Start test server on random free port
  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`📡 Test server listening on ${baseUrl}\n`);

  let testCustomerToken = '';
  let testVendorToken = '';
  const timestamp = Date.now();
  const customerEmail = `customer_${timestamp}@example.com`;
  const vendorEmail = `vendor_${timestamp}@example.com`;

  try {
    // 1. Health check
    console.log('1️⃣ Testing GET /health');
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    console.assert(healthRes.status === 200, 'Health check status should be 200');
    console.assert(healthData.success === true, 'Health check success should be true');
    console.log('   ✅ Health check passed\n');

    // 2. Register Customer
    console.log('2️⃣ Testing POST /api/v1/auth/register (Customer)');
    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Customer',
        email: customerEmail,
        password: 'password123',
        role: 'CUSTOMER',
      }),
    });
    const regData = await regRes.json();
    console.assert(regRes.status === 201, `Expected 201, got ${regRes.status}`);
    console.assert(regData.success === true, 'Register success should be true');
    console.assert(regData.data.token, 'Token should be returned');
    console.assert(regData.data.user.email === customerEmail, 'Email should match');
    console.assert(regData.data.user.role === 'CUSTOMER', 'Role should be CUSTOMER');
    console.assert(!regData.data.user.password, 'Password must not be returned');
    console.log('   ✅ Customer registration passed\n');

    // 3. Register Duplicate Email
    console.log('3️⃣ Testing POST /api/v1/auth/register (Duplicate Email)');
    const dupRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate',
        email: customerEmail,
        password: 'password123',
      }),
    });
    const dupData = await dupRes.json();
    console.assert(dupRes.status === 409, `Expected 409, got ${dupRes.status}`);
    console.assert(dupData.success === false, 'Duplicate should fail');
    console.log('   ✅ Duplicate email rejected (409 Conflict)\n');

    // 4. Input Validation (short password)
    console.log('4️⃣ Testing POST /api/v1/auth/register (Validation Error)');
    const valRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Short',
        email: 'invalid-email',
        password: '123',
      }),
    });
    console.assert(valRes.status === 400, `Expected 400, got ${valRes.status}`);
    console.log('   ✅ Validation rejected (400 Bad Request)\n');

    // 5. Login Customer
    console.log('5️⃣ Testing POST /api/v1/auth/login');
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: customerEmail,
        password: 'password123',
      }),
    });
    const loginData = await loginRes.json();
    console.assert(loginRes.status === 200, `Expected 200, got ${loginRes.status}`);
    console.assert(loginData.data.token, 'Token should be returned on login');
    testCustomerToken = loginData.data.token;
    console.log('   ✅ Customer login passed\n');

    // 6. Login with Wrong Password
    console.log('6️⃣ Testing POST /api/v1/auth/login (Wrong Password)');
    const wrongRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: customerEmail,
        password: 'wrong_password',
      }),
    });
    console.assert(wrongRes.status === 401, `Expected 401, got ${wrongRes.status}`);
    console.log('   ✅ Wrong password rejected (401 Unauthorized)\n');

    // 7. GET /api/v1/auth/me (Authenticated)
    console.log('7️⃣ Testing GET /api/v1/auth/me with Bearer token');
    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${testCustomerToken}` },
    });
    const meData = await meRes.json();
    console.assert(meRes.status === 200, `Expected 200, got ${meRes.status}`);
    console.assert(meData.data.user.email === customerEmail, 'Email in /me should match');
    console.log('   ✅ GET /me retrieved current user profile\n');

    // 8. GET /api/v1/auth/me (Without Token)
    console.log('8️⃣ Testing GET /api/v1/auth/me without token');
    const noTokenRes = await fetch(`${baseUrl}/api/v1/auth/me`);
    console.assert(noTokenRes.status === 401, `Expected 401, got ${noTokenRes.status}`);
    console.log('   ✅ Unauthenticated request rejected (401 Unauthorized)\n');

    // 9. Register Vendor
    console.log('9️⃣ Testing POST /api/v1/auth/register (Vendor Role)');
    const vendorRegRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Vendor Store Owner',
        email: vendorEmail,
        password: 'password123',
        role: 'VENDOR',
      }),
    });
    const vendorRegData = await vendorRegRes.json();
    console.assert(vendorRegRes.status === 201, `Expected 201, got ${vendorRegRes.status}`);
    console.assert(vendorRegData.data.user.role === 'VENDOR', 'Role should be VENDOR');
    testVendorToken = vendorRegData.data.token;
    console.log('   ✅ Vendor registration passed\n');

    // 10. Test checkRole Middleware (Access Denied for Customer on Vendor Route)
    console.log('🔟 Testing checkRole middleware: Customer accessing /vendor-only');
    const deniedRes = await fetch(`${baseUrl}/api/v1/auth/vendor-only`, {
      headers: { Authorization: `Bearer ${testCustomerToken}` },
    });
    const deniedData = await deniedRes.json();
    console.assert(deniedRes.status === 403, `Expected 403, got ${deniedRes.status}`);
    console.assert(deniedData.success === false, 'Customer access should be forbidden');
    console.log('   ✅ checkRole correctly denied Customer on Vendor route (403 Forbidden)\n');

    // 11. Test checkRole Middleware (Access Granted for Vendor on Vendor Route)
    console.log('1️⃣1️⃣ Testing checkRole middleware: Vendor accessing /vendor-only');
    const grantedRes = await fetch(`${baseUrl}/api/v1/auth/vendor-only`, {
      headers: { Authorization: `Bearer ${testVendorToken}` },
    });
    const grantedData = await grantedRes.json();
    console.assert(grantedRes.status === 200, `Expected 200, got ${grantedRes.status}`);
    console.assert(grantedData.success === true, 'Vendor access should be granted');
    console.log('   ✅ checkRole correctly allowed Vendor on Vendor route (200 OK)\n');

    console.log('🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🚀');
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
