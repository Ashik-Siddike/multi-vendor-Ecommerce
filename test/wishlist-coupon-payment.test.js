process.env.NODE_ENV = 'test';
require('dotenv').config();
const app = require('../src/app');
const prisma = require('../src/config/prisma');

let server;
let baseUrl;

async function runTests() {
  console.log('🧪 Starting Phase 7 & 8: Wishlist, Coupons, and Manual Payment Integration Tests...\n');

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`📡 Test server listening on ${baseUrl}\n`);

  const timestamp = Date.now();
  const adminEmail = `admin_wcp_${timestamp}@example.com`;
  const vendorEmail = `vendor_wcp_${timestamp}@example.com`;
  const customerEmail = `customer_wcp_${timestamp}@example.com`;

  let adminToken = '';
  let vendorToken = '';
  let customerToken = '';

  let categoryId = '';
  let shopId = '';
  let productId = '';
  let product2Id = '';
  let platformCouponCode = `SAVE20_${timestamp}`;
  let vendorCouponCode = `VEND10_${timestamp}`;

  let codOrderId = '';
  let bkashOrderId = '';
  let codOrderItemId = '';

  try {
    // ----------------------------------------------------
    // SETUP: Admin, Vendor with Shop, Products, Customer
    // ----------------------------------------------------
    console.log('⚙️ Setting up users, shop, and products...');

    // 1. Admin
    const adminReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Admin WCP', email: adminEmail, password: 'password123', role: 'ADMIN' }),
    });
    const adminData = await adminReg.json();
    adminToken = adminData.data.token;

    // 2. Category
    const catRes = await fetch(`${baseUrl}/api/v1/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: `WCP_Cat_${timestamp}` }),
    });
    const catData = await catRes.json();
    categoryId = catData.data.category.id;

    // 3. Vendor & Shop
    const vendorReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vendor WCP', email: vendorEmail, password: 'password123', role: 'VENDOR' }),
    });
    const vendorData = await vendorReg.json();
    vendorToken = vendorData.data.token;

    const shop = await prisma.shop.create({
      data: {
        name: `WCP_Shop_${timestamp}`,
        description: 'Test shop for WCP',
        isApproved: true,
        ownerId: vendorData.data.user.id,
      },
    });
    shopId = shop.id;

    // 4. Products
    const prodRes1 = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({
        name: 'Mechanical Gaming Keyboard',
        description: 'RGB mechanical keyboard',
        price: 100,
        stock: 30,
        categoryId,
      }),
    });
    const prodData1 = await prodRes1.json();
    productId = prodData1.data.product.id;

    const prodRes2 = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({
        name: 'Wireless Gaming Mouse',
        description: 'Ultra-lightweight sensor mouse',
        price: 60,
        stock: 25,
        categoryId,
      }),
    });
    const prodData2 = await prodRes2.json();
    product2Id = prodData2.data.product.id;

    // 5. Customer
    const custReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Customer WCP', email: customerEmail, password: 'password123' }),
    });
    const custData = await custReg.json();
    customerToken = custData.data.token;

    console.log('   ✅ Environment initialized. Running tests...\n');

    // ====================================================
    // WISHLIST TESTS
    // ====================================================

    // 1. Initial Wishlist (Empty)
    console.log('1️⃣ Wishlist: GET /api/v1/wishlist (Initial empty wishlist)');
    const wish1Res = await fetch(`${baseUrl}/api/v1/wishlist`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const wish1Data = await wish1Res.json();
    if (wish1Res.status !== 200 || wish1Data.data.itemCount !== 0) {
      throw new Error(`Expected empty wishlist, got: ${JSON.stringify(wish1Data)}`);
    }
    console.log('   ✅ Empty wishlist auto-created and returned\n');

    // 2. Add product 1 to wishlist (toggle in)
    console.log('2️⃣ Wishlist: POST /api/v1/wishlist/:productId (Toggle Product 1 in)');
    const addWishRes = await fetch(`${baseUrl}/api/v1/wishlist/${productId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const addWishData = await addWishRes.json();
    if (addWishRes.status !== 201 || !addWishData.data.inWishlist) {
      throw new Error(`Expected 201 inWishlist true, got ${addWishRes.status}: ${JSON.stringify(addWishData)}`);
    }
    console.log('   ✅ Product 1 added to wishlist successfully\n');

    // 3. Toggle Product 2 into wishlist
    console.log('3️⃣ Wishlist: POST /api/v1/wishlist/:productId (Toggle Product 2 in)');
    const togInRes = await fetch(`${baseUrl}/api/v1/wishlist/${product2Id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const togInData = await togInRes.json();
    if (togInRes.status !== 201 || !togInData.data.inWishlist) {
      throw new Error(`Expected toggle add, got: ${JSON.stringify(togInData)}`);
    }
    console.log('   ✅ Toggle added Product 2 into wishlist\n');

    // 4. Verify wishlist now has 2 products
    console.log('4️⃣ Wishlist: GET /api/v1/wishlist (Verify 2 items)');
    const wish2Res = await fetch(`${baseUrl}/api/v1/wishlist`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const wish2Data = await wish2Res.json();
    if (wish2Res.status !== 200 || wish2Data.data.itemCount !== 2) {
      throw new Error(`Expected 2 items, got ${wish2Data.data.itemCount}`);
    }
    console.log('   ✅ Wishlist contains 2 items with populated product info\n');

    // 5. Toggle Product 2 out of wishlist
    console.log('5️⃣ Wishlist: POST /api/v1/wishlist/:productId (Toggle Product 2 out)');
    const togOutRes = await fetch(`${baseUrl}/api/v1/wishlist/${product2Id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const togOutData = await togOutRes.json();
    if (togOutRes.status !== 200 || togOutData.data.inWishlist !== false) {
      throw new Error(`Expected toggle remove, got: ${JSON.stringify(togOutData)}`);
    }
    console.log('   ✅ Toggle removed Product 2 from wishlist\n');

    // 6. Remove Product 1 from wishlist via DELETE
    console.log('6️⃣ Wishlist: DELETE /api/v1/wishlist/:productId (Remove Product 1)');
    const remWishRes = await fetch(`${baseUrl}/api/v1/wishlist/${productId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    if (remWishRes.status !== 200) throw new Error(`Expected 200, got ${remWishRes.status}`);
    console.log('   ✅ Product 1 removed from wishlist\n');

    // 7. Verify wishlist is empty again
    console.log('7️⃣ Wishlist: GET /api/v1/wishlist (Verify 0 items)');
    const wish3Res = await fetch(`${baseUrl}/api/v1/wishlist`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const wish3Data = await wish3Res.json();
    if (wish3Res.status !== 200 || wish3Data.data.itemCount !== 0) {
      throw new Error(`Expected 0 items, got ${wish3Data.data.itemCount}`);
    }
    console.log('   ✅ Wishlist is now empty\n');

    // ====================================================
    // COUPON TESTS
    // ====================================================

    // 8. Admin creates platform-wide coupon (20% off, min order $50)
    console.log('8️⃣ Coupon: Admin POST /api/v1/coupons (Platform-wide 20% off)');
    const adminCoupRes = await fetch(`${baseUrl}/api/v1/coupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        code: platformCouponCode,
        discountType: 'PERCENTAGE',
        discountValue: 20,
        minOrderValue: 50,
        maxDiscount: 50,
        expiryDate: '2028-12-31T23:59:59.000Z',
      }),
    });
    const adminCoupData = await adminCoupRes.json();
    if (adminCoupRes.status !== 201) throw new Error(`Failed to create platform coupon: ${JSON.stringify(adminCoupData)}`);
    console.log('   ✅ Platform-wide coupon created successfully\n');

    // 9. Vendor creates shop-specific coupon ($10 off, min order $40)
    console.log('9️⃣ Coupon: Vendor POST /api/v1/coupons (Shop-specific $10 off)');
    const vendCoupRes = await fetch(`${baseUrl}/api/v1/coupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({
        code: vendorCouponCode,
        discountType: 'FIXED',
        discountValue: 10,
        minOrderValue: 40,
        expiryDate: '2028-12-31T23:59:59.000Z',
      }),
    });
    const vendCoupData = await vendCoupRes.json();
    if (vendCoupRes.status !== 201 || vendCoupData.data.coupon.shopId !== shopId) {
      throw new Error(`Failed to create vendor coupon: ${JSON.stringify(vendCoupData)}`);
    }
    console.log('   ✅ Shop-specific coupon created with vendor shopId attached\n');

    // 10. Public GET /api/v1/coupons
    console.log('🔟 Coupon: GET /api/v1/coupons (Public list)');
    const listCoupRes = await fetch(`${baseUrl}/api/v1/coupons`);
    const listCoupData = await listCoupRes.json();
    if (listCoupRes.status !== 200 || listCoupData.data.coupons.length < 2) {
      throw new Error(`Expected at least 2 coupons, got: ${JSON.stringify(listCoupData)}`);
    }
    console.log('   ✅ Active coupons list retrieved publicly\n');

    // 11. Apply coupon calculation check: order $100 with SAVE20 -> $20 discount, final $80
    console.log('1️⃣1️⃣ Coupon: POST /api/v1/coupons/apply (Validate discount calculation)');
    const applyRes = await fetch(`${baseUrl}/api/v1/coupons/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: platformCouponCode, orderAmount: 100 }),
    });
    const applyData = await applyRes.json();
    if (applyRes.status !== 200 || applyData.data.discountAmount !== 20 || applyData.data.finalAmount !== 80) {
      throw new Error(`Discount calculation error: ${JSON.stringify(applyData)}`);
    }
    console.log('   ✅ Coupon discount calculated accurately ($100 - $20 = $80)\n');

    // ====================================================
    // MANUAL PAYMENT & CASH ON DELIVERY (COD) TESTS
    // ====================================================

    // 12. Checkout with Cash On Delivery (COD) and apply Coupon
    console.log('1️⃣2️⃣ Order: Checkout with paymentMethod = "COD" & Coupon SAVE20');
    await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ productId, quantity: 1 }), // $100 product
    });

    const codOrderRes = await fetch(`${baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        address: '777 Green Road, Dhaka',
        phone: '01711111111',
        paymentMethod: 'COD',
        couponCode: platformCouponCode,
      }),
    });
    const codOrderData = await codOrderRes.json();
    if (codOrderRes.status !== 201) throw new Error(`COD Order failed: ${JSON.stringify(codOrderData)}`);
    codOrderId = codOrderData.data.order.id;
    codOrderItemId = codOrderData.data.order.items[0].id;

    if (codOrderData.data.order.totalAmount !== 80) {
      throw new Error(`Expected totalAmount $80 after 20% discount on $100, got: ${codOrderData.data.order.totalAmount}`);
    }
    if (codOrderData.data.order.paymentMethod !== 'COD' || codOrderData.data.order.paymentStatus !== 'PENDING') {
      throw new Error(`Expected COD and PENDING, got: ${codOrderData.data.order.paymentMethod}, ${codOrderData.data.order.paymentStatus}`);
    }
    console.log('   ✅ COD order created with discounted total ($80) and paymentStatus = PENDING\n');

    // 13. Manual bKash checkout missing transactionId (Rejected 400)
    console.log('1️⃣3️⃣ Payment: MANUAL_BKASH without transactionId (Rejected 400)');
    await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ productId: product2Id, quantity: 1 }),
    });

    const missingTrxRes = await fetch(`${baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        address: '888 Blue Road, Dhaka',
        phone: '01722222222',
        paymentMethod: 'MANUAL_BKASH',
      }),
    });
    if (missingTrxRes.status !== 400) throw new Error(`Expected 400 for missing transactionId, got ${missingTrxRes.status}`);
    console.log('   ✅ Manual payment without transactionId correctly rejected (400 Bad Request)\n');

    // 14. Manual bKash checkout with transactionId
    console.log('1️⃣4️⃣ Payment: MANUAL_BKASH with transactionId: "TRX_BKASH_998877"');
    const bkashOrderRes = await fetch(`${baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        address: '888 Blue Road, Dhaka',
        phone: '01722222222',
        paymentMethod: 'MANUAL_BKASH',
        transactionId: 'TRX_BKASH_998877',
      }),
    });
    const bkashOrderData = await bkashOrderRes.json();
    if (bkashOrderRes.status !== 201) throw new Error(`bKash order failed: ${JSON.stringify(bkashOrderData)}`);
    bkashOrderId = bkashOrderData.data.order.id;
    if (bkashOrderData.data.order.paymentMethod !== 'MANUAL_BKASH' || bkashOrderData.data.order.transactionId !== 'TRX_BKASH_998877') {
      throw new Error(`Expected MANUAL_BKASH and transactionId recorded, got: ${JSON.stringify(bkashOrderData)}`);
    }
    console.log('   ✅ Manual bKash order recorded with transactionId and PENDING verification\n');

    // 15. Admin verifies bKash manual payment
    console.log('1️⃣5️⃣ Admin: PATCH /api/v1/admin/orders/:id/verify-payment (Marks PAID)');
    const verifyPayRes = await fetch(`${baseUrl}/api/v1/admin/orders/${bkashOrderId}/verify-payment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ paymentStatus: 'PAID' }),
    });
    const verifyPayData = await verifyPayRes.json();
    if (verifyPayRes.status !== 200 || verifyPayData.data.order.paymentStatus !== 'PAID') {
      throw new Error(`Expected paymentStatus PAID, got: ${JSON.stringify(verifyPayData)}`);
    }
    console.log('   ✅ Admin successfully verified manual payment and updated paymentStatus to PAID\n');

    // 16. Vendor delivers COD order -> auto marks paymentStatus = PAID
    console.log('1️⃣6️⃣ Order: Vendor marks COD order as DELIVERED (Auto paymentStatus = PAID)');
    const deliverCodRes = await fetch(`${baseUrl}/api/v1/orders/items/${codOrderItemId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ status: 'DELIVERED' }),
    });
    if (deliverCodRes.status !== 200) throw new Error(`Deliver COD item failed: ${deliverCodRes.status}`);

    // Verify order paymentStatus in DB
    const codOrderDb = await prisma.order.findUnique({
      where: { id: codOrderId },
    });
    if (codOrderDb.paymentStatus !== 'PAID') {
      throw new Error(`Expected COD order paymentStatus to be PAID upon delivery, got: ${codOrderDb.paymentStatus}`);
    }
    console.log('   ✅ COD order automatically marked as PAID upon delivery\n');

    console.log('🎉 ALL PHASE 7 & 8 INTEGRATION TESTS PASSED (16/16)! 🚀\n');
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
