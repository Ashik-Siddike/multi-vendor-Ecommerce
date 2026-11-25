const crypto = require('crypto');
const prisma = require('../config/prisma');

/**
 * Dispatches an HMAC-SHA256 signed webhook POST event to active merchant endpoints
 */
const dispatchShopWebhook = async (shopId, eventName, payload) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: {
        shopId,
        isActive: true,
        events: { has: eventName },
      },
    });

    if (!webhooks.length) return;

    const bodyString = JSON.stringify({
      event: eventName,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    await Promise.allSettled(
      webhooks.map(async (wh) => {
        const signature = crypto
          .createHmac('sha256', wh.secret)
          .update(bodyString)
          .digest('hex');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        try {
          await fetch(wh.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Event': eventName,
              'X-Webhook-Signature': `sha256=${signature}`,
            },
            body: bodyString,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
      })
    );
  } catch (err) {
    console.error(`Webhook dispatch error (${eventName}):`, err.message);
  }
};

module.exports = { dispatchShopWebhook };
