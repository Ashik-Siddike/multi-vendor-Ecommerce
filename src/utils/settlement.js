const prisma = require('../config/prisma');
const { createNotification } = require('./notify');

/**
 * Settles any DELIVERED & unsettled OrderItems for a PAID order,
 * calculating platform commission and crediting the vendor's wallet atomically.
 */
const settleEligibleOrderItems = async (orderId, tx = prisma) => {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        where: {
          status: 'DELIVERED',
          isSettled: false,
        },
        include: {
          shop: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  if (!order || order.paymentStatus !== 'PAID' || !order.items.length) {
    return [];
  }

  const settledItems = [];

  for (const item of order.items) {
    const itemTotal = item.price * item.quantity;
    const commissionRate = item.shop.commissionRate || 10.0;
    const commissionAmount = parseFloat(((itemTotal * commissionRate) / 100).toFixed(2));
    const vendorEarning = parseFloat((itemTotal - commissionAmount).toFixed(2));

    const updatedItem = await tx.orderItem.update({
      where: { id: item.id },
      data: {
        commissionAmount,
        vendorEarning,
        isSettled: true,
      },
    });

    await tx.shop.update({
      where: { id: item.shopId },
      data: {
        walletBalance: { increment: vendorEarning },
        totalEarned: { increment: vendorEarning },
      },
    });

    await createNotification(
      {
        userId: item.shop.ownerId,
        title: 'Wallet Credited',
        message: `Your wallet was credited $${vendorEarning} for "${item.product.name}" (after ${commissionRate}% platform fee).`,
        type: 'PAYOUT_UPDATE',
      },
      tx
    );

    settledItems.push(updatedItem);
  }

  return settledItems;
};

module.exports = { settleEligibleOrderItems };
