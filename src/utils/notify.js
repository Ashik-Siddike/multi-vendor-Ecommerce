const prisma = require('../config/prisma');

/**
 * Helper to create an in-app notification safely
 */
const createNotification = async ({ userId, title, message, type = 'SYSTEM' }, tx = prisma) => {
  try {
    if (!userId) return null;
    return await tx.notification.create({
      data: {
        userId,
        title,
        message,
        type,
      },
    });
  } catch (err) {
    console.error('Notification creation error (non-fatal):', err.message);
    return null;
  }
};

module.exports = { createNotification };
