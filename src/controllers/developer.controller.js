const crypto = require('crypto');
const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');
const { recordAuditLog } = require('../utils/audit');

/**
 * Vendor: Generate a Headless Storefront API Key (PRO / ENTERPRISE)
 * POST /api/v1/vendor/api-keys
 */
const generateApiKey = async (req, res) => {
  try {
    const { name = 'Storefront Key' } = req.body;

    const shop = await prisma.shop.findUnique({
      where: { ownerId: req.user.id },
      include: { plan: true },
    });

    if (!shop || !shop.isApproved) {
      return sendError(res, 403, 'Approved shop required');
    }

    if (!shop.plan || !['PRO', 'ENTERPRISE'].includes(shop.plan.name)) {
      return sendError(
        res,
        403,
        'Headless API Keys require a PRO or ENTERPRISE subscription plan.'
      );
    }

    const rawKey = `sk_live_${crypto.randomBytes(24).toString('hex')}`;

    const apiKey = await prisma.apiKey.create({
      data: {
        shopId: shop.id,
        name: name.trim(),
        key: rawKey,
      },
    });

    await recordAuditLog({
      actorId: req.user.id,
      action: 'API_KEY_CREATED',
      entity: 'ApiKey',
      entityId: apiKey.id,
      details: { name: apiKey.name },
      req,
    });

    return sendSuccess(res, 201, 'API key generated successfully', { apiKey });
  } catch (error) {
    console.error('Error generating API key:', error);
    return sendError(res, 500, 'Failed to generate API key');
  }
};

/**
 * Vendor: List API Keys
 * GET /api/v1/vendor/api-keys
 */
const getApiKeys = async (req, res) => {
  try {
    const shop = await prisma.shop.findUnique({ where: { ownerId: req.user.id } });
    if (!shop) return sendError(res, 404, 'Shop not found');

    const apiKeys = await prisma.apiKey.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'API keys retrieved successfully', { apiKeys });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return sendError(res, 500, 'Failed to fetch API keys');
  }
};

/**
 * Vendor: Revoke / Delete an API Key
 * DELETE /api/v1/vendor/api-keys/:id
 */
const revokeApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const shop = await prisma.shop.findUnique({ where: { ownerId: req.user.id } });
    if (!shop) return sendError(res, 404, 'Shop not found');

    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.shopId !== shop.id) {
      return sendError(res, 404, 'API key not found');
    }

    await prisma.apiKey.delete({ where: { id } });
    return sendSuccess(res, 200, 'API key revoked successfully');
  } catch (error) {
    console.error('Error revoking API key:', error);
    return sendError(res, 500, 'Failed to revoke API key');
  }
};

/**
 * Vendor: Register a Webhook URL (PRO / ENTERPRISE)
 * POST /api/v1/vendor/webhooks
 */
const createWebhook = async (req, res) => {
  try {
    const { url, events = ['order.created'] } = req.body;

    if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url.trim())) {
      return sendError(res, 400, 'A valid http/https webhook URL is required');
    }

    const shop = await prisma.shop.findUnique({
      where: { ownerId: req.user.id },
      include: { plan: true },
    });

    if (!shop || !shop.isApproved) {
      return sendError(res, 403, 'Approved shop required');
    }

    if (!shop.plan || !['PRO', 'ENTERPRISE'].includes(shop.plan.name)) {
      return sendError(
        res,
        403,
        'Webhooks require a PRO or ENTERPRISE subscription plan.'
      );
    }

    const secret = `whsec_${crypto.randomBytes(20).toString('hex')}`;

    const webhook = await prisma.webhook.create({
      data: {
        shopId: shop.id,
        url: url.trim(),
        events: Array.isArray(events) && events.length ? events : ['order.created'],
        secret,
      },
    });

    return sendSuccess(res, 201, 'Webhook registered successfully', { webhook });
  } catch (error) {
    console.error('Error creating webhook:', error);
    return sendError(res, 500, 'Failed to register webhook');
  }
};

/**
 * Vendor: List Webhooks
 * GET /api/v1/vendor/webhooks
 */
const getWebhooks = async (req, res) => {
  try {
    const shop = await prisma.shop.findUnique({ where: { ownerId: req.user.id } });
    if (!shop) return sendError(res, 404, 'Shop not found');

    const webhooks = await prisma.webhook.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Webhooks retrieved successfully', { webhooks });
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    return sendError(res, 500, 'Failed to fetch webhooks');
  }
};

/**
 * Vendor: Delete a Webhook
 * DELETE /api/v1/vendor/webhooks/:id
 */
const deleteWebhook = async (req, res) => {
  try {
    const { id } = req.params;
    const shop = await prisma.shop.findUnique({ where: { ownerId: req.user.id } });
    if (!shop) return sendError(res, 404, 'Shop not found');

    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook || webhook.shopId !== shop.id) {
      return sendError(res, 404, 'Webhook not found');
    }

    await prisma.webhook.delete({ where: { id } });
    return sendSuccess(res, 200, 'Webhook deleted successfully');
  } catch (error) {
    console.error('Error deleting webhook:', error);
    return sendError(res, 500, 'Failed to delete webhook');
  }
};

/**
 * Headless API: Get shop products authenticated via x-api-key
 * GET /api/v1/headless/products
 */
const getHeadlessProducts = async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { shopId: req.apiShop.id },
      include: {
        variants: true,
        category: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Headless shop products retrieved successfully', {
      shop: { id: req.apiShop.id, name: req.apiShop.name, slug: req.apiShop.slug },
      products,
    });
  } catch (error) {
    console.error('Error fetching headless products:', error);
    return sendError(res, 500, 'Failed to fetch headless products');
  }
};

module.exports = {
  generateApiKey,
  getApiKeys,
  revokeApiKey,
  createWebhook,
  getWebhooks,
  deleteWebhook,
  getHeadlessProducts,
};
