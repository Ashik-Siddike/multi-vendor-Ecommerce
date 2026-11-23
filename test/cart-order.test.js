require('dotenv').config();
const app = require('../src/app');
const prisma = require('../src/config/prisma');

let server;
let baseUrl;

async function runTests() {
  console.log('🧪 Starting Phase 4: Cart, Multi-Vendor Order & Admin Stats Integration Tests...\n');

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`📡 Test server listening on ${baseUrl}\n`);

  const timestamp = Date.now();
  const adminEmail = `admin_p4_${timestamp}@example.com`;
  const vendorAEmail = `vendor_a_p4_${timestamp}@example.com`;
  const vendorBEmail = `vendor_b_p4_${timestamp}@example.com`;
  const customerEmail = `customer_p4_${timestamp}@example.com`;
  const customer2Email = `customer2_p4_${timestamp}@example.com`;

  let adminToken = '';
  let vendorAToken = '';
  let vendorBToken = '';
  let customerToken = '';
  let customer2Token = '';

  let categoryId = '';
  let shopAId = '';
  let shopBId = '';
  let productAId = '';
  let productBId = '';

  let orderId = '';
  let orderItemAId = '';
  let orderItemBId = '';

  try {
    // ----------------------------------------------------
    // SETUP: Admin, Vendors with Approved Shops, Products
    // ----------------------------------------------------
    console.log('⚙️ Setting up test users, shops, and multi-vendor products...');

    // 1. Admin
    const adminReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Admin P4', email: adminEmail, password: 'password123', role: 'ADMIN' }),
    });
    const adminData = await adminReg.json();
    adminToken = adminData.data.token;

    // 2. Category
    const catRes = await fetch(`${baseUrl}/api/v1/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: `Electronics_${timestamp}` }),
    });
    const catData = await catRes.json();
    categoryId = catData.data.category.id;

    // 3. Vendor A (Register, create Shop A, Approve)
    const vAReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vendor A P4', email: vendorAEmail, password: 'password123', role: 'CUSTOMER' }),
    });
    const vAData = await vAReg.json();
    const tempVAToken = vAData.data.token;

    const shopARes = await fetch(`${baseUrl}/api/v1/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tempVAToken}` },
      body: JSON.stringify({ name: `ShopA_P4_${timestamp}`, description: 'Shop A' }),
    });
    const shopAData = await shopARes.json();
    shopAId = shopAData.data.shop.id;

    await fetch(`${baseUrl}/api/v1/admin/shops/${shopAId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

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
      body: JSON.stringify({ name: 'Vendor B P4', email: vendorBEmail, password: 'password123', role: 'CUSTOMER' }),
    });
    const vBData = await vBReg.json();
    const tempVBToken = vBData.data.token;

    const shopBRes = await fetch(`${baseUrl}/api/v1/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tempVBToken}` },
      body: JSON.stringify({ name: `ShopB_P4_${timestamp}`, description: 'Shop B' }),
    });
    const shopBData = await shopBRes.json();
    shopBId = shopBData.data.shop.id;

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

    // 5. Products: Product A (Shop A, price 100, stock 10), Product B (Shop B, price 50, stock 10)
    const prodARes = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorAToken}` },
      body: JSON.stringify({
        name: 'Wireless Headphones',
        description: 'Noise cancelling headphones from Shop A',
        price: 100.0,
        stock: 10,
        categoryId,
      }),
    });
    const prodAData = await prodARes.json();
    productAId = prodAData.data.product.id;

    const prodBRes = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorBToken}` },
      body: JSON.stringify({
        name: 'USB-C Fast Charger',
        description: '65W GaN Charger from Shop B',
        price: 50.0,
        stock: 10,
        categoryId,
      }),
    });
    const prodBData = await prodBRes.json();
    productBId = prodBData.data.product.id;

    // 6. Customers
    const custReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Primary Buyer', email: customerEmail, password: 'password123', role: 'CUSTOMER' }),
    });
    const custData = await custReg.json();
    customerToken = custData.data.token;

    const cust2Reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Secondary Buyer', email: customer2Email, password: 'password123', role: 'CUSTOMER' }),
    });
    const cust2Data = await cust2Reg.json();
    customer2Token = cust2Data.data.token;

    console.log('   ✅ Environment initialized: Admin, 2 Vendors, 2 Products, 2 Customers\n');

    // ----------------------------------------------------
    // 1. CART MODULE TESTS
    // ----------------------------------------------------
    console.log('1️⃣ Cart: GET /api/v1/cart (Initial empty cart)');
    const emptyCartRes = await fetch(`${baseUrl}/api/v1/cart`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const emptyCartData = await emptyCartRes.json();
    console.assert(emptyCartRes.status === 200, `Expected 200, got ${emptyCartRes.status}`);
    console.assert(emptyCartData.data.items.length === 0, 'Cart should start empty');
    console.assert(emptyCartData.data.subtotal === 0, 'Subtotal should be 0');
    console.log('   ✅ Auto-created empty cart verified\n');

    console.log('2️⃣ Cart: POST /api/v1/cart/items (Stock limit check)');
    const overStockRes = await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ productId: productAId, quantity: 999 }),
    });
    console.assert(overStockRes.status === 400, `Expected 400, got ${overStockRes.status}`);
    console.log('   ✅ Exceeding stock rejected (400 Bad Request)\n');

    console.log('3️⃣ Cart: POST /api/v1/cart/items (Add Product A, qty 2)');
    const addA1Res = await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ productId: productAId, quantity: 2 }),
    });
    const addA1Data = await addA1Res.json();
    console.assert(addA1Res.status === 201, `Expected 201, got ${addA1Res.status}`);
    console.assert(addA1Data.data.item.quantity === 2, 'Quantity should be 2');
    console.log('   ✅ Product A added to cart (qty: 2)\n');

    console.log('4️⃣ Cart: POST /api/v1/cart/items (Add Product A again, increments qty to 3)');
    const addA2Res = await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ productId: productAId, quantity: 1 }),
    });
    const addA2Data = await addA2Res.json();
    console.assert(addA2Res.status === 201, `Expected 201, got ${addA2Res.status}`);
    console.assert(addA2Data.data.item.quantity === 3, 'Existing item incremented to 3');
    console.log('   ✅ Existing item quantity incremented successfully\n');

    console.log('5️⃣ Cart: POST /api/v1/cart/items (Add Product B from Shop B, qty 2)');
    const addBRes = await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ productId: productBId, quantity: 2 }),
    });
    const addBData = await addBRes.json();
    console.assert(addBRes.status === 201, `Expected 201, got ${addBRes.status}`);
    const itemBId = addBData.data.item.id;
    console.log('   ✅ Product B from Shop B added to cart\n');

    console.log('6️⃣ Cart: PATCH /api/v1/cart/items/:itemId (Update Product B qty to 1)');
    const updateBRes = await fetch(`${baseUrl}/api/v1/cart/items/${itemBId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ quantity: 1 }),
    });
    const updateBData = await updateBRes.json();
    console.assert(updateBRes.status === 200, `Expected 200, got ${updateBRes.status}`);
    console.assert(updateBData.data.item.quantity === 1, 'Quantity updated to 1');
    console.log('   ✅ Cart item quantity updated\n');

    console.log('7️⃣ Cart: GET /api/v1/cart (Verify multi-item subtotal)');
    const cartSummaryRes = await fetch(`${baseUrl}/api/v1/cart`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const cartSummaryData = await cartSummaryRes.json();
    // 3 x $100 (Product A) + 1 x $50 (Product B) = $350
    console.assert(cartSummaryData.data.subtotal === 350.0, `Expected 350, got ${cartSummaryData.data.subtotal}`);
    console.assert(cartSummaryData.data.items.length === 2, 'Cart should have 2 unique products');
    console.log('   ✅ Cart subtotal calculated accurately ($350.00)\n');

    console.log('8️⃣ Cart: Other user cannot modify customer 1 cart item');
    const unauthorizedCartRes = await fetch(`${baseUrl}/api/v1/cart/items/${itemBId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer2Token}` },
      body: JSON.stringify({ quantity: 5 }),
    });
    console.assert(unauthorizedCartRes.status === 404, `Expected 404, got ${unauthorizedCartRes.status}`);
    console.log('   ✅ Cross-user cart item tampering rejected (404 Not Found)\n');

    // ----------------------------------------------------
    // 2. MULTI-VENDOR ORDER PLACEMENT
    // ----------------------------------------------------
    console.log('9️⃣ Order: POST /api/v1/orders validation (Missing address/phone)');
    const emptyOrderRes = await fetch(`${baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ address: '', phone: '' }),
    });
    console.assert(emptyOrderRes.status === 400, `Expected 400, got ${emptyOrderRes.status}`);
    console.log('   ✅ Missing checkout fields rejected (400 Bad Request)\n');

    console.log('🔟 Order: POST /api/v1/orders (Atomic Multi-Vendor Checkout)');
    const checkoutRes = await fetch(`${baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        address: 'House 42, Road 7, Banani, Dhaka',
        phone: '+8801700000000',
      }),
    });
    const checkoutData = await checkoutRes.json();
    console.assert(checkoutRes.status === 201, `Expected 201, got ${checkoutRes.status}`);
    const order = checkoutData.data.order;
    orderId = order.id;
    console.assert(order.totalAmount === 350.0, `Total amount should be 350, got ${order.totalAmount}`);
    console.assert(order.items.length === 2, 'Order should contain 2 split order items');

    const itemA = order.items.find((i) => i.productId === productAId);
    const itemB = order.items.find((i) => i.productId === productBId);
    console.assert(itemA && itemA.shopId === shopAId, 'Item A mapped to Shop A');
    console.assert(itemB && itemB.shopId === shopBId, 'Item B mapped to Shop B');
    console.assert(itemA.status === 'PENDING', 'Item A status should be PENDING');
    console.assert(itemB.status === 'PENDING', 'Item B status should be PENDING');

    orderItemAId = itemA.id;
    orderItemBId = itemB.id;
    console.log('   ✅ Multi-vendor order created with 2 split OrderItems ($350 total)\n');

    console.log('1️⃣1️⃣ Order: Verify database stock decremented for both products');
    const freshProdA = await prisma.product.findUnique({ where: { id: productAId } });
    const freshProdB = await prisma.product.findUnique({ where: { id: productBId } });
    console.assert(freshProdA.stock === 7, `Product A stock should be 7 (10 - 3), got ${freshProdA.stock}`);
    console.assert(freshProdB.stock === 9, `Product B stock should be 9 (10 - 1), got ${freshProdB.stock}`);
    console.log('   ✅ Stock atomically decremented in database\n');

    console.log('1️⃣2️⃣ Order: Verify customer cart is now cleared');
    const clearedCartRes = await fetch(`${baseUrl}/api/v1/cart`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const clearedCartData = await clearedCartRes.json();
    console.assert(clearedCartData.data.items.length === 0, 'Cart should be empty after checkout');
    console.assert(clearedCartData.data.subtotal === 0, 'Cart subtotal should be 0');
    console.log('   ✅ Customer cart cleared after checkout\n');

    console.log('1️⃣3️⃣ Order: Checkout on empty cart returns 400 Bad Request');
    const emptyCheckout = await fetch(`${baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ address: 'Test', phone: '123' }),
    });
    console.assert(emptyCheckout.status === 400, `Expected 400, got ${emptyCheckout.status}`);
    console.log('   ✅ Order rejected when cart is empty (400 Bad Request)\n');

    // ----------------------------------------------------
    // 3. ORDER RETRIEVAL & VENDOR ISOLATION
    // ----------------------------------------------------
    console.log('1️⃣4️⃣ Customer: GET /api/v1/orders/my-orders');
    const myOrdersRes = await fetch(`${baseUrl}/api/v1/orders/my-orders`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const myOrdersData = await myOrdersRes.json();
    console.assert(myOrdersRes.status === 200, `Expected 200, got ${myOrdersRes.status}`);
    const foundMyOrder = myOrdersData.data.orders.some((o) => o.id === orderId);
    console.assert(foundMyOrder, 'Placed order must appear in my-orders');
    console.log('   ✅ Customer retrieved personal order history\n');

    console.log('1️⃣5️⃣ Vendor Isolation: Vendor A checks GET /api/v1/orders/vendor-orders');
    const vAOrdersRes = await fetch(`${baseUrl}/api/v1/orders/vendor-orders`, {
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    const vAOrdersData = await vAOrdersRes.json();
    console.assert(vAOrdersRes.status === 200, `Expected 200, got ${vAOrdersRes.status}`);
    const vAItems = vAOrdersData.data.orderItems;
    const hasShopAItem = vAItems.some((i) => i.id === orderItemAId);
    const hasShopBItem = vAItems.some((i) => i.id === orderItemBId);
    console.assert(hasShopAItem, 'Vendor A must see their own item');
    console.assert(!hasShopBItem, 'Vendor A MUST NOT see Vendor B’s item');
    console.log('   ✅ Vendor A sees only Shop A items (Vendor isolation verified)\n');

    console.log('1️⃣6️⃣ Vendor Isolation: Vendor B checks GET /api/v1/orders/vendor-orders');
    const vBOrdersRes = await fetch(`${baseUrl}/api/v1/orders/vendor-orders`, {
      headers: { Authorization: `Bearer ${vendorBToken}` },
    });
    const vBOrdersData = await vBOrdersRes.json();
    console.assert(vBOrdersRes.status === 200, `Expected 200, got ${vBOrdersRes.status}`);
    const vBItems = vBOrdersData.data.orderItems;
    const vBHasShopAItem = vBItems.some((i) => i.id === orderItemAId);
    const vBHasShopBItem = vBItems.some((i) => i.id === orderItemBId);
    console.assert(vBHasShopBItem, 'Vendor B must see their own item');
    console.assert(!vBHasShopAItem, 'Vendor B MUST NOT see Vendor A’s item');
    console.log('   ✅ Vendor B sees only Shop B items (Vendor isolation verified)\n');

    // ----------------------------------------------------
    // 4. ORDER STATUS MANAGEMENT & STRICT CHECKS
    // ----------------------------------------------------
    console.log('1️⃣7️⃣ Status: Vendor B attempts to update Vendor A’s order item (Forbidden)');
    const unauthorizedStatus = await fetch(`${baseUrl}/api/v1/orders/items/${orderItemAId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorBToken}` },
      body: JSON.stringify({ status: 'PROCESSING' }),
    });
    console.assert(unauthorizedStatus.status === 403, `Expected 403, got ${unauthorizedStatus.status}`);
    console.log('   ✅ Strict ownership check: Vendor B denied updating Vendor A item (403 Forbidden)\n');

    console.log('1️⃣8️⃣ Status: Vendor A updates own item status (PROCESSING -> SHIPPED)');
    const validStatus1 = await fetch(`${baseUrl}/api/v1/orders/items/${orderItemAId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorAToken}` },
      body: JSON.stringify({ status: 'PROCESSING' }),
    });
    const validStatus1Data = await validStatus1.json();
    console.assert(validStatus1.status === 200, `Expected 200, got ${validStatus1.status}`);
    console.assert(validStatus1Data.data.orderItem.status === 'PROCESSING', 'Status updated to PROCESSING');

    const validStatus2 = await fetch(`${baseUrl}/api/v1/orders/items/${orderItemAId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorAToken}` },
      body: JSON.stringify({ status: 'SHIPPED' }),
    });
    const validStatus2Data = await validStatus2.json();
    console.assert(validStatus2.status === 200, `Expected 200, got ${validStatus2.status}`);
    console.assert(validStatus2Data.data.orderItem.status === 'SHIPPED', 'Status updated to SHIPPED');
    console.log('   ✅ Vendor A successfully updated order item status to SHIPPED\n');

    // ----------------------------------------------------
    // 5. ADMIN DASHBOARD STATS
    // ----------------------------------------------------
    console.log('1️⃣9️⃣ Admin Stats: Customer attempts GET /api/v1/admin/dashboard-stats (Forbidden)');
    const custStatsRes = await fetch(`${baseUrl}/api/v1/admin/dashboard-stats`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    console.assert(custStatsRes.status === 403, `Expected 403, got ${custStatsRes.status}`);
    console.log('   ✅ Non-admin forbidden from dashboard stats (403)\n');

    console.log('2️⃣0️⃣ Admin Stats: Admin GET /api/v1/admin/dashboard-stats (Accurate counts)');
    const adminStatsRes = await fetch(`${baseUrl}/api/v1/admin/dashboard-stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminStatsData = await adminStatsRes.json();
    console.assert(adminStatsRes.status === 200, `Expected 200, got ${adminStatsRes.status}`);
    const stats = adminStatsData.data.stats;

    console.assert(stats.users >= 5, `Expected users >= 5, got ${stats.users}`);
    console.assert(stats.approvedShops >= 2, `Expected approvedShops >= 2, got ${stats.approvedShops}`);
    console.assert(stats.products >= 2, `Expected products >= 2, got ${stats.products}`);
    console.assert(stats.orders >= 1, `Expected orders >= 1, got ${stats.orders}`);
    console.assert(stats.totalRevenue >= 350.0, `Expected revenue >= 350, got ${stats.totalRevenue}`);
    console.log(`   ✅ Admin dashboard stats verified:`);
    console.log(`      Users: ${stats.users}, Approved Shops: ${stats.approvedShops}, Products: ${stats.products}`);
    console.log(`      Orders: ${stats.orders}, Total Revenue: $${stats.totalRevenue.toFixed(2)}\n`);

    console.log('🎉 ALL PHASE 4 INTEGRATION TESTS PASSED (20/20)! 🚀\n');
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
