const prisma = require('../config/prisma');
const { sendError } = require('../utils/response');

/**
 * Authenticates Headless Storefront requests using `x-api-key` header
 */
const verifyApiKey = async (req, res, next) => {
  try {
    const apiKeyHeader = req.headers['x-api-key'];
    if (!apiKeyHeader || typeof apiKeyHeader !== 'string') {
      return sendError(res, 401, 'Missing x-api-key header');
    }

    const keyRecord = await prisma.apiKey.findUnique({
      where: { key: apiKeyHeader.trim() },
      include: { shop: true },
    });

    if (!keyRecord || !keyRecord.isActive || !keyRecord.shop || !keyRecord.shop.isApproved) {
      return sendError(res, 401, 'Invalid or inactive API Key');
    }

    // Update lastUsedAt asynchronously
    prisma.apiKey
      .update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    req.apiShop = keyRecord.shop;
    next();
  } catch (error) {
    console.error('Error verifying API key:', error);
    return sendError(res, 500, 'API key verification failed');
  }
};

module.exports = { verifyApiKey };
