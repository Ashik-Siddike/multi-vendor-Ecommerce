process.env.NODE_ENV = 'test';
require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const app = require('../src/app');
const prisma = require('../src/config/prisma');

let server;
let webhookServer;
let baseUrl;

async function runTests() {
  console.log('🧪 Starting Phase 17: Variant Checkout, Headless API Keys & HMAC Webhooks Tests...\n');

  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
  console.log(`📡 Test server listening on ${baseUrl}\n`);

  let receivedWebhook = null;
  webhookServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      receivedWebhook = {
        event: req.headers['x-webhook-event'],
        signature: req.headers['x-webhook-signature'],
        rawBody: body,
      };
      res.writeHead(200);
      res.end('ok');
    });
  });

  await new Promise((resolve) => webhookServer.listen(0, resolve));
  const hookUrl = `http://127.0.0.1:${webhookServer.address().port}/hook`;

  const timestamp = Date.now();
  const adminEmail = `admin_hl_${timestamp}@example.com`;
  const vendorEmail = `vendor_hl_${timestamp}@example.com`;
  const customerEmail = `customer_hl_${timestamp}@example.com`;

  let adminToken = '';
  let vendorToken = '';
  let customerToken = '';

  let categoryId = '';
  let productId = '';
  let variantId = '';
  let apiKeyId = '';
  let apiKeySecret = '';
  let webhookSecret = '';

  try {
    console.log('⚙️ Setting up Admin, Vendor, Shop, Product, Variant & Customer...');

    adminToken = (
      await (
        await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Admin HL', email: adminEmail, password: 'password123', role: 'ADMIN' }),
        })
      ).json()
    ).data.token;

    categoryId = (
      await (
        await fetch(`${baseUrl}/api/v1/categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ name: `HL_Cat_${timestamp}` }),
        })
      ).json()
    ).data.category.id;

    // Customer registers -> creates shop (auto STARTER plan) -> approved -> login as VENDOR
    const custForShop = (
      await (
        await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Vendor HL', email: vendorEmail, password: 'password123' }),
        })
      ).json()
    ).data.token;

    const shopId = (
      await (
        await fetch(`${baseUrl}/api/v1/shops`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custForShop}` },
          body: JSON.stringify({ name: `Headless Shop ${timestamp}` }),
        })
      ).json()
    ).data.shop.id;

    await fetch(`${baseUrl}/api/v1/admin/shops/${shopId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    vendorToken = (
      await (
        await fetch(`${baseUrl}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: vendorEmail, password: 'password123' }),
        })
      ).json()
    ).data.token;

    customerToken = (
      await (
        await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Customer HL', email: customerEmail, password: 'password123' }),
        })
      ).json()
    ).data.token;

    productId = (
      await (
        await fetch(`${baseUrl}/api/v1/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
          body: JSON.stringify({
            name: 'Sneaker Pro',
            description: 'Running shoe',
            price: 50,
            stock: 10,
            categoryId,
          }),
        })
      ).json()
    ).data.product.id;

    variantId = (
      await (
        await fetch(`${baseUrl}/api/v1/products/${productId}/variants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
          body: JSON.stringify({
            sku: `SNK-42-${timestamp}`,
            name: 'Neon / Size 42',
            attributes: { color: 'Neon', size: 42 },
            price: 75,
            stock: 5,
          }),
        })
      ).json()
    ).data.variant.id;

    console.log('   ✅ Setup complete.\n');

    // 1. Variant-Aware Cart Stock Limit
    console.log('1️⃣ Variant Cart: Exceeding variant stock (5) rejected (400)');
    const overVarRes = await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ productId, variantId, quantity: 6 }),
    });
    if (overVarRes.status !== 400) throw new Error(`Expected 400, got ${overVarRes.status}`);
    console.log('   ✅ Variant stock limit enforced in cart\n');

    // 2. Add Variant to Cart ($75 x 2 = $150)
    console.log('2️⃣ Variant Cart: Add variant qty 2 -> subtotal $150');
    await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ productId, variantId, quantity: 2 }),
    });
    const cartData = await (
      await fetch(`${baseUrl}/api/v1/cart`, { headers: { Authorization: `Bearer ${customerToken}` } })
    ).json();
    if (cartData.data.subtotal !== 150) throw new Error(`Expected subtotal 150, got ${cartData.data.subtotal}`);
    console.log('   ✅ Variant price ($75 x 2 = $150) calculated accurately in cart\n');

    // 3. STARTER plan blocked from API Key & Webhook (403)
    console.log('3️⃣ Plan Gate: STARTER plan blocked from API Keys & Webhooks (403)');
    const gateRes = await fetch(`${baseUrl}/api/v1/vendor/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ name: 'Mobile App' }),
    });
    if (gateRes.status !== 403) throw new Error(`Expected 403, got ${gateRes.status}`);
    console.log('   ✅ API Key creation gated on STARTER plan\n');

    // 4. Upgrade to PRO -> Generate API Key & Register Webhook
    console.log('4️⃣ PRO Unlocked: Upgrade to PRO, generate API Key & register Webhook');
    await fetch(`${baseUrl}/api/v1/vendor/subscription/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
      body: JSON.stringify({ planName: 'PRO' }),
    });

    const keyData = await (
      await fetch(`${baseUrl}/api/v1/vendor/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
        body: JSON.stringify({ name: 'Mobile App' }),
      })
    ).json();
    apiKeyId = keyData.data.apiKey.id;
    apiKeySecret = keyData.data.apiKey.key;

    const whData = await (
      await fetch(`${baseUrl}/api/v1/vendor/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
        body: JSON.stringify({ url: hookUrl, events: ['order.created'] }),
      })
    ).json();
    webhookSecret = whData.data.webhook.secret;
    console.log('   ✅ API key and HMAC-signed webhook registered\n');

    // 5. Headless API Key Authentication
    console.log('5️⃣ Headless API: GET /api/v1/headless/products using x-api-key');
    const unauthHl = await fetch(`${baseUrl}/api/v1/headless/products`);
    if (unauthHl.status !== 401) throw new Error('Expected 401 without API key');

    const hlRes = await fetch(`${baseUrl}/api/v1/headless/products`, {
      headers: { 'x-api-key': apiKeySecret },
    });
    const hlData = await hlRes.json();
    if (hlRes.status !== 200 || hlData.data.products.length !== 1 || hlData.data.products[0].variants.length !== 1) {
      throw new Error(`Headless products mismatch: ${JSON.stringify(hlData)}`);
    }
    console.log('   ✅ Headless storefront products & variants fetched via x-api-key\n');

    // 6. Variant Checkout + Real-time HMAC Webhook Delivery
    console.log('6️⃣ Variant Checkout & Webhook: Place order -> Variant stock decrements & Webhook fires');
    const ordRes = await fetch(`${baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ address: '123 Road, Dhaka', phone: '01700000000', paymentMethod: 'COD' }),
    });
    const ordData = await ordRes.json();
    if (ordRes.status !== 201 || ordData.data.order.totalAmount !== 150) {
      throw new Error(`Variant checkout failed: ${JSON.stringify(ordData)}`);
    }

    const updatedVariant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (updatedVariant.stock !== 3) throw new Error(`Expected variant stock 3, got ${updatedVariant.stock}`);

    // Wait briefly for async webhook HTTP delivery
    await new Promise((r) => setTimeout(r, 400));
    if (!receivedWebhook || receivedWebhook.event !== 'order.created') {
      throw new Error('Expected order.created webhook to be delivered');
    }
    const expectedSig = `sha256=${crypto.createHmac('sha256', webhookSecret).update(receivedWebhook.rawBody).digest('hex')}`;
    if (receivedWebhook.signature !== expectedSig) {
      throw new Error('Webhook HMAC-SHA256 signature verification failed');
    }
    console.log('   ✅ Variant stock decremented (5 -> 3) & HMAC-signed webhook delivered!\n');

    // 7. Revoke API Key
    console.log('7️⃣ Revoke Key: DELETE /api/v1/vendor/api-keys/:id blocks further access');
    await fetch(`${baseUrl}/api/v1/vendor/api-keys/${apiKeyId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${vendorToken}` },
    });
    const revokedRes = await fetch(`${baseUrl}/api/v1/headless/products`, {
      headers: { 'x-api-key': apiKeySecret },
    });
    if (revokedRes.status !== 401) throw new Error('Expected 401 after revoking API key');
    console.log('   ✅ Revoked API key rejected (401 Unauthorized)\n');

    console.log('🎉 ALL PHASE 17 HEADLESS & VARIANT TESTS PASSED (7/7)! 🚀\n');
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  } finally {
    if (server) server.close();
    if (webhookServer) webhookServer.close();
    await prisma.$disconnect();
    process.exit(0);
  }
}

runTests();
