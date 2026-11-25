process.env.NODE_ENV = 'test';
require('dotenv').config();
const app = require('../src/app');
const prisma = require('../src/config/prisma');

let server;
let baseUrl;

async function runTests() {
  console.log('🧪 Starting Phases 14–16: Variants, Flash Sales, Returns/Disputes, Tracking, CSV, Staff & Audit Logs Tests...\n');

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`📡 Test server listening on ${baseUrl}\n`);

  const timestamp = Date.now();
  const adminEmail = `admin_adv_${timestamp}@example.com`;
  const vendorEmail = `vendor_adv_${timestamp}@example.com`;
  const staffEmail = `staff_adv_${timestamp}@example.com`;
  const customerEmail = `customer_adv_${timestamp}@example.com`;

  let adminToken = '';
  let vendorToken = '';
  let customerToken = '';

  let categoryId = '';
  let productId = '';
  let variantId = '';
  let orderItemId = '';
  let returnId = '';
  let staffId = '';

  try {
    console.log('⚙️ Setting up Admin, Vendor, Staff User, Customer & Product...');

    // 1. Admin
    adminToken = (
      await (
        await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Admin Adv', email: adminEmail, password: 'password123', role: 'ADMIN' }),
        })
      ).json()
    ).data.token;

    // 2. Category
    categoryId = (
      await (
        await fetch(`${baseUrl}/api/v1/categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ name: `Adv_Cat_${timestamp}` }),
        })
      ).json()
    ).data.category.id;

    // 3. Vendor & Approved Shop
    const vData = (
      await (
        await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Vendor Adv', email: vendorEmail, password: 'password123', role: 'VENDOR' }),
        })
      ).json()
    ).data;
    vendorToken = vData.token;

    await prisma.shop.create({
      data: {
        name: `Adv_Shop_${timestamp}`,
        slug: `adv-shop-${timestamp}`,
        isApproved: true,
        ownerId: vData.user.id,
      },
    });

    // 4. Staff user & Customer
    await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Staff Member', email: staffEmail, password: 'password123' }),
    });

    customerToken = (
      await (
        await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Customer Adv', email: customerEmail, password: 'password123' }),
        })
      ).json()
    ).data.token;

    // 5. Product ($120, stock 10)
    productId = (
      await (
        await fetch(`${baseUrl}/api/v1/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
          body: JSON.stringify({
            name: 'Premium Cotton Polo',
            description: '100% combed cotton polo shirt',
            price: 120,
            stock: 10,
            categoryId,
          }),
        })
      ).json()
    ).data.product.id;

    console.log('   ✅ Setup complete.\n');

    // ====================================================
    // PHASE 14: PRODUCT VARIANTS & FLASH SALES
    // ====================================================

    console.log('1️⃣ Variants: Vendor creates SKU variant (Black / L)');
    const varRes = await fetch(`${baseUrl}/api/v1/products/${productId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({
        sku: `POLO-BLK-L-${timestamp}`,
        name: 'Black / Size L',
        attributes: { color: 'Black', size: 'L' },
        price: 125,
        stock: 15,
      }),
    });
    const varData = await varRes.json();
    if (varRes.status !== 201) throw new Error(`Variant failed: ${JSON.stringify(varData)}`);
    variantId = varData.data.variant.id;
    console.log('   ✅ SKU variant created successfully\n');

    console.log('2️⃣ Variants: Update variant stock & retrieve public variants');
    await fetch(`${baseUrl}/api/v1/variants/${variantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ stock: 20 }),
    });
    const listVarData = await (await fetch(`${baseUrl}/api/v1/products/${productId}/variants`)).json();
    if (listVarData.data.variants.length !== 1 || listVarData.data.variants[0].stock !== 20) {
      throw new Error('Variant update/get mismatch');
    }
    console.log('   ✅ Variant updated & retrieved publicly\n');

    console.log('3️⃣ Flash Sale: Vendor creates active Flash Sale ($80 instead of $120)');
    const now = new Date();
    const start = new Date(now.getTime() - 60000).toISOString();
    const end = new Date(now.getTime() + 3600000).toISOString();
    const fsRes = await fetch(`${baseUrl}/api/v1/flash-sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ productId, flashPrice: 80, startTime: start, endTime: end }),
    });
    if (fsRes.status !== 201) throw new Error(`Flash sale failed: ${fsRes.status}`);

    const activeFsData = await (await fetch(`${baseUrl}/api/v1/flash-sales`)).json();
    if (!activeFsData.data.flashSales.some((f) => f.productId === productId)) {
      throw new Error('Active flash sale missing from public list');
    }
    console.log('   ✅ Active flash sale created and live publicly\n');

    // ====================================================
    // PHASE 15: COURIER TRACKING, CSV EXPORT & RETURN/DISPUTE
    // ====================================================

    console.log('4️⃣ Order & Tracking: Customer places order -> Vendor adds courier tracking event');
    await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ productId, quantity: 1 }),
    });
    const ordData = await (
      await fetch(`${baseUrl}/api/v1/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
        body: JSON.stringify({ address: '123 Road, Dhaka', phone: '01700000000', paymentMethod: 'COD' }),
      })
    ).json();
    orderItemId = ordData.data.order.items[0].id;

    const trkRes = await fetch(`${baseUrl}/api/v1/orders/items/${orderItemId}/tracking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({
        status: 'HANDED_TO_COURIER',
        courierName: 'Steadfast',
        trackingNumber: `SF-${timestamp}`,
        note: 'Picked up by rider',
      }),
    });
    if (trkRes.status !== 201) throw new Error('Tracking event failed');

    const tlData = await (
      await fetch(`${baseUrl}/api/v1/orders/items/${orderItemId}/tracking`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      })
    ).json();
    if (tlData.data.timeline.length !== 1 || tlData.data.timeline[0].courierName !== 'Steadfast') {
      throw new Error('Tracking timeline mismatch');
    }
    console.log('   ✅ Courier tracking timeline added & verified\n');

    console.log('5️⃣ CSV Export: Vendor exports orders as CSV');
    const csvRes = await fetch(`${baseUrl}/api/v1/vendor/orders/export-csv`, {
      headers: { Authorization: `Bearer ${vendorToken}` },
    });
    const csvText = await csvRes.text();
    if (csvRes.status !== 200 || !csvText.includes('OrderItemID,OrderID,Product')) {
      throw new Error('CSV export failed');
    }
    console.log('   ✅ Vendor orders CSV exported cleanly\n');

    console.log('6️⃣ Return & Dispute: Deliver item -> Customer requests return -> Vendor rejects -> Customer disputes -> Admin refunds');
    await fetch(`${baseUrl}/api/v1/orders/items/${orderItemId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ status: 'DELIVERED' }),
    });

    const retRes = await fetch(`${baseUrl}/api/v1/returns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ orderItemId, reason: 'Wrong size delivered' }),
    });
    const retData = await retRes.json();
    if (retRes.status !== 201) throw new Error(`Return request failed: ${JSON.stringify(retData)}`);
    returnId = retData.data.returnRequest.id;

    // Vendor rejects
    await fetch(`${baseUrl}/api/v1/returns/${returnId}/vendor`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ status: 'VENDOR_REJECTED', vendorNote: 'Tag was removed' }),
    });

    // Customer escalates to dispute
    const dispRes = await fetch(`${baseUrl}/api/v1/returns/${returnId}/dispute`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    if (dispRes.status !== 200) throw new Error('Dispute escalation failed');

    // Admin resolves as REFUNDED (restores stock from 9 -> 10)
    const admRes = await fetch(`${baseUrl}/api/v1/admin/returns/${returnId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'REFUNDED', adminNote: 'Customer provided unboxing video' }),
    });
    if (admRes.status !== 200) throw new Error('Admin dispute resolution failed');

    const prodAfterRefund = await prisma.product.findUnique({ where: { id: productId } });
    if (prodAfterRefund.stock !== 10) throw new Error(`Expected stock restored to 10, got ${prodAfterRefund.stock}`);
    console.log('   ✅ Full Return -> Reject -> Dispute -> Admin Refund & Stock Restore verified!\n');

    // ====================================================
    // PHASE 16: SHOP STAFF RBAC & AUDIT LOGS
    // ====================================================

    console.log('7️⃣ Shop Staff: Vendor adds staff member & removes staff member');
    const stfAddRes = await fetch(`${baseUrl}/api/v1/vendor/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ email: staffEmail, staffRole: 'ORDER_HANDLER' }),
    });
    const stfAddData = await stfAddRes.json();
    if (stfAddRes.status !== 201) throw new Error(`Add staff failed: ${JSON.stringify(stfAddData)}`);
    staffId = stfAddData.data.staff.id;

    const stfListData = await (
      await fetch(`${baseUrl}/api/v1/vendor/staff`, { headers: { Authorization: `Bearer ${vendorToken}` } })
    ).json();
    if (stfListData.data.staffMembers.length !== 1) throw new Error('Expected 1 staff member');

    const stfDelRes = await fetch(`${baseUrl}/api/v1/vendor/staff/${staffId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${vendorToken}` },
    });
    if (stfDelRes.status !== 200) throw new Error('Remove staff failed');
    console.log('   ✅ Shop staff team management verified\n');

    console.log('8️⃣ Audit Logs: Admin checks GET /api/v1/admin/audit-logs');
    const auditRes = await fetch(`${baseUrl}/api/v1/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const auditData = await auditRes.json();
    if (auditRes.status !== 200 || auditData.data.logs.length < 3) {
      throw new Error(`Expected audit logs recorded, got: ${JSON.stringify(auditData)}`);
    }
    console.log(`   ✅ Audit logs verified (${auditData.data.total} total audit events recorded)\n`);

    console.log('🎉 ALL PHASES 14–16 ADVANCED TESTS PASSED (8/8)! 🚀\n');
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
