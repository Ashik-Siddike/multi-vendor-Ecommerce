process.env.NODE_ENV = 'test';
require('dotenv').config();
const app = require('../src/app');
const prisma = require('../src/config/prisma');

let server;
let baseUrl;

async function runTests() {
  console.log('🧪 Starting Phase 6: Product Reviews & Verified Purchase Integration Tests...\n');

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`📡 Test server listening on ${baseUrl}\n`);

  const timestamp = Date.now();
  const adminEmail = `admin_rev_${timestamp}@example.com`;
  const vendorEmail = `vendor_rev_${timestamp}@example.com`;
  const customer1Email = `cust1_rev_${timestamp}@example.com`;
  const customer2Email = `cust2_rev_${timestamp}@example.com`;

  let adminToken = '';
  let vendorToken = '';
  let customer1Token = '';
  let customer2Token = '';

  let categoryId = '';
  let shopId = '';
  let productId = '';
  let orderItemId1 = '';
  let orderItemId2 = '';
  let review1Id = '';
  let review2Id = '';

  try {
    // ----------------------------------------------------
    // SETUP: Admin, Vendor with Shop, Product, Customers
    // ----------------------------------------------------
    console.log('⚙️ Setting up users, shop, and product for review testing...');

    // 1. Admin
    const adminReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Admin Rev', email: adminEmail, password: 'password123', role: 'ADMIN' }),
    });
    const adminData = await adminReg.json();
    adminToken = adminData.data.token;

    // 2. Category
    const catRes = await fetch(`${baseUrl}/api/v1/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: `Reviewables_${timestamp}` }),
    });
    const catData = await catRes.json();
    categoryId = catData.data.category.id;

    // 3. Vendor
    const vendorReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vendor Rev', email: vendorEmail, password: 'password123', role: 'VENDOR' }),
    });
    const vendorData = await vendorReg.json();
    vendorToken = vendorData.data.token;

    // 4. Shop for Vendor
    const shop = await prisma.shop.create({
      data: {
        name: `Rev_Shop_${timestamp}`,
        description: 'Shop for review tests',
        isApproved: true,
        ownerId: vendorData.data.user.id,
      },
    });
    shopId = shop.id;

    // 5. Product
    const prodRes = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({
        name: 'Smart Noise-Cancelling Headphones',
        description: 'Premium wireless headphones',
        price: 250,
        stock: 50,
        categoryId,
      }),
    });
    const prodData = await prodRes.json();
    if (!prodData.data || !prodData.data.product) {
      throw new Error(`Failed to create test product: ${JSON.stringify(prodData)}`);
    }
    productId = prodData.data.product.id;

    // 6. Customers
    const cust1Reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Customer One', email: customer1Email, password: 'password123' }),
    });
    const cust1Data = await cust1Reg.json();
    customer1Token = cust1Data.data.token;

    const cust2Reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Customer Two', email: customer2Email, password: 'password123' }),
    });
    const cust2Data = await cust2Reg.json();
    customer2Token = cust2Data.data.token;

    console.log('   ✅ Setup complete. Beginning test assertions...\n');

    // ----------------------------------------------------
    // 1. Unauthenticated review attempt
    // ----------------------------------------------------
    console.log('1️⃣ Review: Unauthenticated POST /api/v1/products/:id/reviews (401)');
    const unauthRes = await fetch(`${baseUrl}/api/v1/products/${productId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 5, comment: 'Great!' }),
    });
    if (unauthRes.status !== 401) throw new Error(`Expected 401, got ${unauthRes.status}`);
    console.log('   ✅ Unauthenticated request rejected (401 Unauthorized)\n');

    // ----------------------------------------------------
    // 2. Verified Purchase Check: Non-buyer attempts review
    // ----------------------------------------------------
    console.log('2️⃣ Review: Non-buyer customer attempts review (403 Forbidden)');
    const nonBuyerRes = await fetch(`${baseUrl}/api/v1/products/${productId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer1Token}` },
      body: JSON.stringify({ rating: 5, comment: 'I did not buy this' }),
    });
    const nonBuyerData = await nonBuyerRes.json();
    if (nonBuyerRes.status !== 403 || !nonBuyerData.message.includes('Verified purchase required')) {
      throw new Error(`Expected 403 Verified purchase required, got ${nonBuyerRes.status}: ${JSON.stringify(nonBuyerData)}`);
    }
    console.log('   ✅ Non-buyer correctly rejected (403 Verified purchase required)\n');

    // ----------------------------------------------------
    // 3. Customer 1 places order (Status: PENDING)
    // ----------------------------------------------------
    console.log('3️⃣ Order: Customer 1 orders product (Status: PENDING)');
    await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer1Token}` },
      body: JSON.stringify({ productId, quantity: 1 }),
    });
    const order1Res = await fetch(`${baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer1Token}` },
      body: JSON.stringify({ address: '123 Test St', phone: '01700000001' }),
    });
    const order1Data = await order1Res.json();
    if (!order1Data.data || !order1Data.data.order) {
      throw new Error(`Order 1 creation failed: ${JSON.stringify(order1Data)}`);
    }
    orderItemId1 = order1Data.data.order.items[0].id;
    console.log('   ✅ Order created with PENDING item\n');

    // ----------------------------------------------------
    // 4. Undelivered review attempt
    // ----------------------------------------------------
    console.log('4️⃣ Review: Customer 1 attempts review before delivery (403 Forbidden)');
    const undeliveredRes = await fetch(`${baseUrl}/api/v1/products/${productId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer1Token}` },
      body: JSON.stringify({ rating: 5, comment: 'Waiting for delivery' }),
    });
    const undeliveredData = await undeliveredRes.json();
    if (undeliveredRes.status !== 403 || !undeliveredData.message.includes('DELIVERED')) {
      throw new Error(`Expected 403 DELIVERED check, got ${undeliveredRes.status}: ${JSON.stringify(undeliveredData)}`);
    }
    console.log('   ✅ Undelivered order review rejected (403 Must be DELIVERED)\n');

    // ----------------------------------------------------
    // 5. Vendor marks Customer 1 order as DELIVERED
    // ----------------------------------------------------
    console.log('5️⃣ Vendor: Updates Customer 1 order status to DELIVERED');
    const deliverRes = await fetch(`${baseUrl}/api/v1/orders/items/${orderItemId1}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ status: 'DELIVERED' }),
    });
    if (deliverRes.status !== 200) throw new Error(`Expected 200, got ${deliverRes.status}`);
    console.log('   ✅ Order item status marked as DELIVERED\n');

    // ----------------------------------------------------
    // 6. Invalid rating validation
    // ----------------------------------------------------
    console.log('6️⃣ Review: Invalid rating (rating: 6)');
    const invalidRatingRes = await fetch(`${baseUrl}/api/v1/products/${productId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer1Token}` },
      body: JSON.stringify({ rating: 6, comment: 'Too high rating' }),
    });
    if (invalidRatingRes.status !== 400) throw new Error(`Expected 400, got ${invalidRatingRes.status}`);
    console.log('   ✅ Rating > 5 rejected (400 Bad Request)\n');

    // ----------------------------------------------------
    // 7. Customer 1 submits valid review (Rating: 5)
    // ----------------------------------------------------
    console.log('7️⃣ Review: Customer 1 submits valid review (Rating: 5)');
    const review1Res = await fetch(`${baseUrl}/api/v1/products/${productId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer1Token}` },
      body: JSON.stringify({ rating: 5, comment: 'Absolute perfection! Sound quality is unreal.' }),
    });
    const review1Data = await review1Res.json();
    if (review1Res.status !== 201) throw new Error(`Expected 201, got ${review1Res.status}: ${JSON.stringify(review1Data)}`);
    review1Id = review1Data.data.id;
    console.log('   ✅ Review 1 created successfully (201 Created)\n');

    // ----------------------------------------------------
    // 8. Verify product averageRating & reviewCount updated
    // ----------------------------------------------------
    console.log('8️⃣ Product: Verify averageRating and reviewCount after 1st review');
    const prodCheck1 = await fetch(`${baseUrl}/api/v1/products/${productId}`);
    const prodCheck1Data = await prodCheck1.json();
    if (prodCheck1Data.data.product.averageRating !== 5 || prodCheck1Data.data.product.reviewCount !== 1) {
      throw new Error(`Expected averageRating 5 and count 1, got rating: ${prodCheck1Data.data.product.averageRating}, count: ${prodCheck1Data.data.product.reviewCount}`);
    }
    console.log('   ✅ Product stats updated: averageRating = 5.0, reviewCount = 1\n');

    // ----------------------------------------------------
    // 9. Duplicate review attempt by Customer 1 (409 Conflict)
    // ----------------------------------------------------
    console.log('9️⃣ Review: Customer 1 tries submitting second review (409 Conflict)');
    const dupReviewRes = await fetch(`${baseUrl}/api/v1/products/${productId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer1Token}` },
      body: JSON.stringify({ rating: 4, comment: 'Trying to review again' }),
    });
    if (dupReviewRes.status !== 409) throw new Error(`Expected 409, got ${dupReviewRes.status}`);
    console.log('   ✅ Duplicate review blocked (409 Conflict)\n');

    // ----------------------------------------------------
    // 10. Customer 2 buys, gets delivered, and reviews (Rating: 3)
    // ----------------------------------------------------
    console.log('🔟 Review: Customer 2 buys, gets delivered, and leaves Rating: 3');
    await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer2Token}` },
      body: JSON.stringify({ productId, quantity: 1 }),
    });
    const order2Res = await fetch(`${baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer2Token}` },
      body: JSON.stringify({ address: '456 Test Ave', phone: '01700000002' }),
    });
    const order2Data = await order2Res.json();
    if (!order2Data.data || !order2Data.data.order) {
      throw new Error(`Order 2 creation failed: ${JSON.stringify(order2Data)}`);
    }
    orderItemId2 = order2Data.data.order.items[0].id;

    // Deliver order 2
    await fetch(`${baseUrl}/api/v1/orders/items/${orderItemId2}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ status: 'DELIVERED' }),
    });

    // Customer 2 reviews
    const review2Res = await fetch(`${baseUrl}/api/v1/products/${productId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer2Token}` },
      body: JSON.stringify({ rating: 3, comment: 'Decent, but bass could be punchier.' }),
    });
    const review2Data = await review2Res.json();
    if (review2Res.status !== 201) throw new Error(`Expected 201, got ${review2Res.status}`);
    review2Id = review2Data.data.id;
    console.log('   ✅ Customer 2 review created successfully\n');

    // ----------------------------------------------------
    // 11. Verify aggregate rating recalculated to 4.0 ((5+3)/2)
    // ----------------------------------------------------
    console.log('1️⃣1️⃣ Product: Verify aggregate rating ((5+3)/2 = 4.0, count = 2)');
    const prodCheck2 = await fetch(`${baseUrl}/api/v1/products/${productId}`);
    const prodCheck2Data = await prodCheck2.json();
    if (prodCheck2Data.data.product.averageRating !== 4 || prodCheck2Data.data.product.reviewCount !== 2) {
      throw new Error(`Expected averageRating 4.0 and count 2, got rating: ${prodCheck2Data.data.product.averageRating}, count: ${prodCheck2Data.data.product.reviewCount}`);
    }
    console.log('   ✅ Aggregate rating accurately calculated: 4.0 (2 reviews)\n');

    // ----------------------------------------------------
    // 12. Public GET /api/v1/products/:id/reviews
    // ----------------------------------------------------
    console.log('1️⃣2️⃣ Public: GET /api/v1/products/:id/reviews');
    const listRevRes = await fetch(`${baseUrl}/api/v1/products/${productId}/reviews?page=1&limit=5`);
    const listRevData = await listRevRes.json();
    if (listRevRes.status !== 200 || listRevData.data.reviews.length !== 2) {
      throw new Error(`Expected 200 with 2 reviews, got: ${JSON.stringify(listRevData)}`);
    }
    console.log('   ✅ Public reviews list retrieved with user info and pagination metadata\n');

    // ----------------------------------------------------
    // 13. Customer GET /api/v1/reviews/my-reviews
    // ----------------------------------------------------
    console.log('1️⃣3️⃣ Customer: GET /api/v1/reviews/my-reviews');
    const myRevRes = await fetch(`${baseUrl}/api/v1/reviews/my-reviews`, {
      headers: { Authorization: `Bearer ${customer1Token}` },
    });
    const myRevData = await myRevRes.json();
    if (myRevRes.status !== 200 || myRevData.data.length !== 1 || myRevData.data[0].id !== review1Id) {
      throw new Error(`Expected customer 1 review, got: ${JSON.stringify(myRevData)}`);
    }
    console.log('   ✅ Customer retrieved personal review history\n');

    // ----------------------------------------------------
    // 14. Customer 2 tries deleting Customer 1 review (403)
    // ----------------------------------------------------
    console.log('1️⃣4️⃣ Security: Customer 2 tries DELETE on Customer 1 review (403 Forbidden)');
    const crossDeleteRes = await fetch(`${baseUrl}/api/v1/reviews/${review1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${customer2Token}` },
    });
    if (crossDeleteRes.status !== 403) throw new Error(`Expected 403, got ${crossDeleteRes.status}`);
    console.log('   ✅ Unauthorized review deletion blocked (403 Forbidden)\n');

    // ----------------------------------------------------
    // 15. Customer 1 deletes own review (200 OK)
    // ----------------------------------------------------
    console.log('1️⃣5️⃣ Customer 1 deletes own review (200 OK)');
    const delete1Res = await fetch(`${baseUrl}/api/v1/reviews/${review1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${customer1Token}` },
    });
    if (delete1Res.status !== 200) throw new Error(`Expected 200, got ${delete1Res.status}`);
    console.log('   ✅ Customer 1 review deleted successfully\n');

    // ----------------------------------------------------
    // 16. Verify averageRating recalculated back to 3.0 (count = 1)
    // ----------------------------------------------------
    console.log('1️⃣6️⃣ Product: Verify stats recalculated after review deletion');
    const prodCheck3 = await fetch(`${baseUrl}/api/v1/products/${productId}`);
    const prodCheck3Data = await prodCheck3.json();
    if (prodCheck3Data.data.product.averageRating !== 3 || prodCheck3Data.data.product.reviewCount !== 1) {
      throw new Error(`Expected averageRating 3.0 and count 1, got rating: ${prodCheck3Data.data.product.averageRating}, count: ${prodCheck3Data.data.product.reviewCount}`);
    }
    console.log('   ✅ Product stats updated: averageRating = 3.0, reviewCount = 1\n');

    // ----------------------------------------------------
    // 17. Admin deletes Customer 2 review (Admin authority)
    // ----------------------------------------------------
    console.log('1️⃣7️⃣ Admin: Deletes Customer 2 review as platform moderator (200 OK)');
    const adminDelRes = await fetch(`${baseUrl}/api/v1/reviews/${review2Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (adminDelRes.status !== 200) throw new Error(`Expected 200, got ${adminDelRes.status}`);
    console.log('   ✅ Admin successfully moderated and deleted review\n');

    // ----------------------------------------------------
    // 18. Verify stats reset to 0 after all reviews deleted
    // ----------------------------------------------------
    console.log('1️⃣8️⃣ Product: Verify stats reset to 0 (averageRating = 0, reviewCount = 0)');
    const prodCheck4 = await fetch(`${baseUrl}/api/v1/products/${productId}`);
    const prodCheck4Data = await prodCheck4.json();
    if (prodCheck4Data.data.product.averageRating !== 0 || prodCheck4Data.data.product.reviewCount !== 0) {
      throw new Error(`Expected averageRating 0 and count 0, got rating: ${prodCheck4Data.data.product.averageRating}, count: ${prodCheck4Data.data.product.reviewCount}`);
    }
    console.log('   ✅ Product stats cleanly reset to 0\n');

    console.log('🎉 ALL PHASE 6 INTEGRATION TESTS PASSED (18/18)! 🚀\n');
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
