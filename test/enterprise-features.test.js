process.env.NODE_ENV = 'test';
require('dotenv').config();
const app = require('../src/app');
const prisma = require('../src/config/prisma');

let server;
let baseUrl;

async function runTests() {
  console.log('🧪 Starting Phases 9–12: Finance, Payouts, Address Book, Notifications, Q&A & Analytics Tests...\n');

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`📡 Test server listening on ${baseUrl}\n`);

  const timestamp = Date.now();
  const adminEmail = `admin_ent_${timestamp}@example.com`;
  const vendor1Email = `vendor1_ent_${timestamp}@example.com`;
  const vendor2Email = `vendor2_ent_${timestamp}@example.com`;
  const customerEmail = `customer_ent_${timestamp}@example.com`;

  let adminToken = '';
  let vendor1Token = '';
  let vendor2Token = '';
  let customerToken = '';

  let categoryId = '';
  let shop1Id = '';
  let productId = '';
  let address1Id = '';
  let address2Id = '';
  let questionId = '';
  let orderItemId = '';
  let payout1Id = '';
  let payout2Id = '';

  try {
    console.log('⚙️ Setting up Admin, Vendors, Shop, Low-Stock Product & Customer...');

    // 1. Admin
    const adminReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Admin Ent', email: adminEmail, password: 'password123', role: 'ADMIN' }),
    });
    adminToken = (await adminReg.json()).data.token;

    // 2. Category
    const catRes = await fetch(`${baseUrl}/api/v1/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: `Ent_Cat_${timestamp}` }),
    });
    categoryId = (await catRes.json()).data.category.id;

    // 3. Vendor 1 & Shop 1
    const v1Reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vendor 1 Ent', email: vendor1Email, password: 'password123', role: 'VENDOR' }),
    });
    const v1Data = await v1Reg.json();
    vendor1Token = v1Data.data.token;

    const shop1 = await prisma.shop.create({
      data: {
        name: `Ent_Shop1_${timestamp}`,
        description: 'Enterprise Test Shop 1',
        isApproved: true,
        ownerId: v1Data.data.user.id,
      },
    });
    shop1Id = shop1.id;

    // 4. Vendor 2 & Shop 2 (for cross-vendor Q&A ownership check)
    const v2Reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vendor 2 Ent', email: vendor2Email, password: 'password123', role: 'VENDOR' }),
    });
    const v2Data = await v2Reg.json();
    vendor2Token = v2Data.data.token;
    await prisma.shop.create({
      data: {
        name: `Ent_Shop2_${timestamp}`,
        description: 'Enterprise Test Shop 2',
        isApproved: true,
        ownerId: v2Data.data.user.id,
      },
    });

    // 5. Product ($100, stock 4 -> triggers low-stock alert!)
    const prodRes = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendor1Token}` },
      body: JSON.stringify({
        name: 'Studio Monitor Speaker',
        description: 'High-precision audio monitor',
        price: 100,
        stock: 4,
        categoryId,
      }),
    });
    productId = (await prodRes.json()).data.product.id;

    // 6. Customer
    const custReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Customer Ent', email: customerEmail, password: 'password123' }),
    });
    customerToken = (await custReg.json()).data.token;

    console.log('   ✅ Setup complete.\n');

    // ====================================================
    // PHASE 10: ADDRESS BOOK & DYNAMIC SHIPPING FEE
    // ====================================================

    console.log('1️⃣ Address Book: Create Address 1 (INSIDE_CITY, isDefault: true)');
    const addr1Res = await fetch(`${baseUrl}/api/v1/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        label: 'Home',
        fullName: 'Ashik Siddike',
        phone: '01711111111',
        street: 'House 10, Banani',
        city: 'Dhaka',
        zone: 'INSIDE_CITY',
        isDefault: true,
      }),
    });
    const addr1Data = await addr1Res.json();
    if (addr1Res.status !== 201) throw new Error(`Failed Address 1: ${JSON.stringify(addr1Data)}`);
    address1Id = addr1Data.data.address.id;
    console.log('   ✅ Address 1 created as default\n');

    console.log('2️⃣ Address Book: Create Address 2 (OUTSIDE_CITY, isDefault: true) -> unsets Address 1 default');
    const addr2Res = await fetch(`${baseUrl}/api/v1/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        label: 'Village Home',
        fullName: 'Ashik Siddike',
        phone: '01722222222',
        street: 'Station Road',
        city: 'Sylhet',
        zone: 'OUTSIDE_CITY',
        isDefault: true,
      }),
    });
    const addr2Data = await addr2Res.json();
    address2Id = addr2Data.data.address.id;

    const listAddrRes = await fetch(`${baseUrl}/api/v1/addresses`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const listAddrData = await listAddrRes.json();
    const addr1Check = listAddrData.data.addresses.find((a) => a.id === address1Id);
    if (addr1Check.isDefault !== false) throw new Error('Expected Address 1 isDefault to become false');
    console.log('   ✅ Address 2 created and default address switched atomically\n');

    console.log('3️⃣ Shipping Fee: Checkout using Address 2 (OUTSIDE_CITY = $120 shipping)');
    await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ productId, quantity: 1 }), // $100
    });

    const orderRes = await fetch(`${baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        addressId: address2Id,
        paymentMethod: 'COD',
      }),
    });
    const orderData = await orderRes.json();
    if (orderRes.status !== 201) throw new Error(`Checkout with addressId failed: ${JSON.stringify(orderData)}`);
    if (orderData.data.order.shippingFee !== 120 || orderData.data.order.totalAmount !== 220) {
      throw new Error(`Expected shippingFee 120 and total 220, got shippingFee=${orderData.data.order.shippingFee}, total=${orderData.data.order.totalAmount}`);
    }
    orderItemId = orderData.data.order.items[0].id;
    console.log('   ✅ Order placed with dynamic OUTSIDE_CITY shipping ($100 + $120 = $220)\n');

    // ====================================================
    // PHASE 11: PRODUCT Q&A & NOTIFICATIONS
    // ====================================================

    console.log('4️⃣ Product Q&A: Customer asks a question on Product');
    const qRes = await fetch(`${baseUrl}/api/v1/products/${productId}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ question: 'Does it come with XLR cables?' }),
    });
    const qData = await qRes.json();
    if (qRes.status !== 201) throw new Error(`Ask question failed: ${JSON.stringify(qData)}`);
    questionId = qData.data.question.id;
    console.log('   ✅ Customer question submitted\n');

    console.log('5️⃣ Product Q&A: Vendor 2 tries answering Vendor 1 product question (403 Forbidden)');
    const crossAnsRes = await fetch(`${baseUrl}/api/v1/questions/${questionId}/answer`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendor2Token}` },
      body: JSON.stringify({ answer: 'Fake answer' }),
    });
    if (crossAnsRes.status !== 403) throw new Error(`Expected 403, got ${crossAnsRes.status}`);
    console.log('   ✅ Unauthorized vendor blocked from answering\n');

    console.log('6️⃣ Product Q&A: Vendor 1 answers own product question');
    const ansRes = await fetch(`${baseUrl}/api/v1/questions/${questionId}/answer`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendor1Token}` },
      body: JSON.stringify({ answer: 'Yes, 2 balanced XLR cables are included in the box.' }),
    });
    if (ansRes.status !== 200) throw new Error(`Answer failed: ${ansRes.status}`);
    console.log('   ✅ Vendor 1 answered question successfully\n');

    console.log('7️⃣ Notifications: Customer checks unread notifications & marks all read');
    const notifRes = await fetch(`${baseUrl}/api/v1/notifications`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const notifData = await notifRes.json();
    if (notifRes.status !== 200 || notifData.data.unreadCount < 2) {
      throw new Error(`Expected at least 2 unread notifications, got: ${JSON.stringify(notifData)}`);
    }

    const readAllRes = await fetch(`${baseUrl}/api/v1/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    if (readAllRes.status !== 200) throw new Error('Mark all read failed');

    const notifAfter = await (
      await fetch(`${baseUrl}/api/v1/notifications`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      })
    ).json();
    if (notifAfter.data.unreadCount !== 0) throw new Error('Expected 0 unread notifications after read-all');
    console.log('   ✅ Notification center verified (auto-created & read-all works)\n');

    // ====================================================
    // PHASE 9: VENDOR COMMISSION, WALLET & PAYOUTS
    // ====================================================

    console.log('8️⃣ Commission: Admin sets Shop 1 commission rate to 10%');
    const commRes = await fetch(`${baseUrl}/api/v1/admin/shops/${shop1Id}/commission`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ commissionRate: 10 }),
    });
    if (commRes.status !== 200) throw new Error('Failed to set commission rate');
    console.log('   ✅ Shop commission set to 10%\n');

    console.log('9️⃣ Settlement: Vendor 1 marks COD item DELIVERED -> Wallet credited $90 ($100 - 10%)');
    const delRes = await fetch(`${baseUrl}/api/v1/orders/items/${orderItemId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendor1Token}` },
      body: JSON.stringify({ status: 'DELIVERED' }),
    });
    if (delRes.status !== 200) throw new Error(`Deliver failed: ${delRes.status}`);

    const walletRes = await fetch(`${baseUrl}/api/v1/vendor/wallet`, {
      headers: { Authorization: `Bearer ${vendor1Token}` },
    });
    const walletData = await walletRes.json();
    if (walletData.data.walletBalance !== 90 || walletData.data.totalEarned !== 90) {
      throw new Error(`Expected walletBalance 90 and totalEarned 90, got: ${JSON.stringify(walletData)}`);
    }
    console.log('   ✅ Vendor wallet settled atomically: $90.00 credited after 10% commission\n');

    console.log('🔟 Payout: Vendor tries withdrawing $100 (Exceeds $90 balance -> 400)');
    const overPayRes = await fetch(`${baseUrl}/api/v1/vendor/payouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendor1Token}` },
      body: JSON.stringify({ amount: 100, paymentMethod: 'BKASH', accountDetails: '01799999999' }),
    });
    if (overPayRes.status !== 400) throw new Error(`Expected 400, got ${overPayRes.status}`);
    console.log('   ✅ Over-withdrawal rejected (400 Insufficient balance)\n');

    console.log('1️⃣1️⃣ Payout: Vendor submits Payout 1 ($40) and Payout 2 ($30)');
    const p1Res = await fetch(`${baseUrl}/api/v1/vendor/payouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendor1Token}` },
      body: JSON.stringify({ amount: 40, paymentMethod: 'BKASH', accountDetails: '01799999999' }),
    });
    payout1Id = (await p1Res.json()).data.payout.id;

    const p2Res = await fetch(`${baseUrl}/api/v1/vendor/payouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendor1Token}` },
      body: JSON.stringify({ amount: 30, paymentMethod: 'NAGAD', accountDetails: '01888888888' }),
    });
    payout2Id = (await p2Res.json()).data.payout.id;

    const wAfterReq = await (await fetch(`${baseUrl}/api/v1/vendor/wallet`, { headers: { Authorization: `Bearer ${vendor1Token}` } })).json();
    if (wAfterReq.data.walletBalance !== 20) throw new Error(`Expected balance 20 (90 - 40 - 30), got ${wAfterReq.data.walletBalance}`);
    console.log('   ✅ Both payouts created, remaining walletBalance = $20.00\n');

    console.log('1️⃣2️⃣ Admin Payout: Rejects Payout 2 ($30 refunded) & Approves Payout 1 ($40)');
    const rejRes = await fetch(`${baseUrl}/api/v1/admin/payouts/${payout2Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'REJECTED', adminNote: 'Invalid Nagad number' }),
    });
    if (rejRes.status !== 200) throw new Error('Reject payout failed');

    const appRes = await fetch(`${baseUrl}/api/v1/admin/payouts/${payout1Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'APPROVED', transactionRef: 'BKASH_TX_999111' }),
    });
    if (appRes.status !== 200) throw new Error('Approve payout failed');

    const wFinal = await (await fetch(`${baseUrl}/api/v1/vendor/wallet`, { headers: { Authorization: `Bearer ${vendor1Token}` } })).json();
    if (wFinal.data.walletBalance !== 50) throw new Error(`Expected balance 50 (20 + 30 refund), got ${wFinal.data.walletBalance}`);
    console.log('   ✅ Payout 1 approved & Payout 2 rejected with $30 refunded (balance = $50.00)\n');

    // ====================================================
    // PHASE 12: VENDOR BUSINESS ANALYTICS & LOW-STOCK ALERTS
    // ====================================================

    console.log('1️⃣3️⃣ Vendor Analytics: GET /api/v1/vendor/analytics');
    const anaRes = await fetch(`${baseUrl}/api/v1/vendor/analytics`, {
      headers: { Authorization: `Bearer ${vendor1Token}` },
    });
    const anaData = await anaRes.json();
    if (
      anaRes.status !== 200 ||
      anaData.data.totalItemsSold !== 1 ||
      anaData.data.grossSales !== 100 ||
      anaData.data.lowStockAlertCount < 1
    ) {
      throw new Error(`Analytics mismatch: ${JSON.stringify(anaData)}`);
    }
    console.log('   ✅ Vendor analytics & low-stock alerts verified successfully!\n');

    console.log('🎉 ALL PHASES 9–12 ENTERPRISE TESTS PASSED (13/13)! 🚀\n');
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
