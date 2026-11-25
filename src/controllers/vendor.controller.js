const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');
const { createNotification } = require('../utils/notify');

/**
 * Get vendor wallet, earnings summary & payout history
 * GET /api/v1/vendor/wallet (Vendor only)
 */
const getVendorWallet = async (req, res) => {
  try {
    const shop = await prisma.shop.findUnique({
      where: { ownerId: req.user.id },
      include: {
        payoutRequests: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!shop) {
      return sendError(res, 404, 'Shop not found for this vendor');
    }

    return sendSuccess(res, 200, 'Vendor wallet retrieved successfully', {
      shopId: shop.id,
      shopName: shop.name,
      commissionRate: shop.commissionRate,
      walletBalance: parseFloat(shop.walletBalance.toFixed(2)),
      totalEarned: parseFloat(shop.totalEarned.toFixed(2)),
      payoutRequests: shop.payoutRequests,
    });
  } catch (error) {
    console.error('Error in getVendorWallet:', error);
    return sendError(res, 500, 'Failed to fetch vendor wallet');
  }
};

/**
 * Request a payout withdrawal
 * POST /api/v1/vendor/payouts (Vendor only)
 */
const requestPayout = async (req, res) => {
  try {
    const { amount, paymentMethod, accountDetails } = req.body;

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return sendError(res, 400, 'Payout amount must be a positive number');
    }

    if (!paymentMethod || typeof paymentMethod !== 'string' || !paymentMethod.trim()) {
      return sendError(res, 400, 'paymentMethod is required (e.g., BKASH, NAGAD, BANK)');
    }

    if (!accountDetails || typeof accountDetails !== 'string' || !accountDetails.trim()) {
      return sendError(res, 400, 'accountDetails (number/account) is required');
    }

    const payout = await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.findUnique({
        where: { ownerId: req.user.id },
      });

      if (!shop || !shop.isApproved) {
        throw { statusCode: 403, message: 'Approved shop required to request payouts' };
      }

      if (shop.walletBalance < numericAmount) {
        throw {
          statusCode: 400,
          message: `Insufficient wallet balance. Available: $${shop.walletBalance.toFixed(2)}`,
        };
      }

      // Deduct immediately from walletBalance to prevent double-spend
      await tx.shop.update({
        where: { id: shop.id },
        data: {
          walletBalance: { decrement: numericAmount },
        },
      });

      return await tx.payoutRequest.create({
        data: {
          shopId: shop.id,
          amount: parseFloat(numericAmount.toFixed(2)),
          paymentMethod: paymentMethod.trim().toUpperCase(),
          accountDetails: accountDetails.trim(),
          status: 'PENDING',
        },
      });
    });

    return sendSuccess(res, 201, 'Payout request submitted successfully', { payout });
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.statusCode, error.message);
    }
    console.error('Error in requestPayout:', error);
    return sendError(res, 500, 'Failed to submit payout request');
  }
};

/**
 * Get vendor business analytics & low-stock alerts
 * GET /api/v1/vendor/analytics (Vendor only)
 */
const getVendorAnalytics = async (req, res) => {
  try {
    const shop = await prisma.shop.findUnique({
      where: { ownerId: req.user.id },
    });

    if (!shop) {
      return sendError(res, 404, 'Shop not found');
    }

    const [totalProducts, lowStockProducts, orderItems] = await Promise.all([
      prisma.product.count({ where: { shopId: shop.id } }),
      prisma.product.findMany({
        where: { shopId: shop.id, stock: { lte: 5 } },
        select: { id: true, name: true, stock: true, price: true },
        orderBy: { stock: 'asc' },
      }),
      prisma.orderItem.findMany({
        where: { shopId: shop.id },
        include: {
          product: { select: { id: true, name: true } },
        },
      }),
    ]);

    const statusBreakdown = {
      PENDING: 0,
      PROCESSING: 0,
      SHIPPED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    };

    let totalItemsSold = 0;
    let grossSales = 0;
    const productSalesMap = {};

    for (const item of orderItems) {
      if (statusBreakdown[item.status] !== undefined) {
        statusBreakdown[item.status] += 1;
      }
      if (item.status !== 'CANCELLED') {
        totalItemsSold += item.quantity;
        grossSales += item.price * item.quantity;

        if (!productSalesMap[item.productId]) {
          productSalesMap[item.productId] = {
            productId: item.productId,
            name: item.product ? item.product.name : 'Unknown',
            unitsSold: 0,
            revenue: 0,
          };
        }
        productSalesMap[item.productId].unitsSold += item.quantity;
        productSalesMap[item.productId].revenue += item.price * item.quantity;
      }
    }

    const topSellingProducts = Object.values(productSalesMap)
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 5);

    return sendSuccess(res, 200, 'Vendor analytics retrieved successfully', {
      shopName: shop.name,
      walletBalance: parseFloat(shop.walletBalance.toFixed(2)),
      totalEarned: parseFloat(shop.totalEarned.toFixed(2)),
      commissionRate: shop.commissionRate,
      totalProducts,
      totalOrdersCount: orderItems.length,
      totalItemsSold,
      grossSales: parseFloat(grossSales.toFixed(2)),
      statusBreakdown,
      lowStockAlertCount: lowStockProducts.length,
      lowStockProducts,
      topSellingProducts,
    });
  } catch (error) {
    console.error('Error in getVendorAnalytics:', error);
    return sendError(res, 500, 'Failed to retrieve vendor analytics');
  }
};

/**
 * Admin: List all payout requests
 * GET /api/v1/admin/payouts (Admin only)
 */
const getAllPayoutRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status.toUpperCase())) {
      where.status = status.toUpperCase();
    }

    const payouts = await prisma.payoutRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            walletBalance: true,
            owner: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return sendSuccess(res, 200, 'Payout requests retrieved successfully', { payouts });
  } catch (error) {
    console.error('Error in getAllPayoutRequests:', error);
    return sendError(res, 500, 'Failed to fetch payout requests');
  }
};

/**
 * Admin: Approve or Reject a payout request
 * PATCH /api/v1/admin/payouts/:id (Admin only)
 */
const processPayoutRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, transactionRef, adminNote } = req.body;

    if (!status || !['APPROVED', 'REJECTED'].includes(status.toUpperCase())) {
      return sendError(res, 400, 'status must be APPROVED or REJECTED');
    }

    const normalizedStatus = status.toUpperCase();

    if (normalizedStatus === 'APPROVED' && (!transactionRef || !transactionRef.trim())) {
      return sendError(res, 400, 'transactionRef is required when approving a payout');
    }

    const updatedPayout = await prisma.$transaction(async (tx) => {
      const payout = await tx.payoutRequest.findUnique({
        where: { id },
        include: { shop: true },
      });

      if (!payout) {
        throw { statusCode: 404, message: 'Payout request not found' };
      }

      if (payout.status !== 'PENDING') {
        throw { statusCode: 400, message: `Payout request has already been ${payout.status}` };
      }

      // If rejected, refund the amount back to vendor's walletBalance
      if (normalizedStatus === 'REJECTED') {
        await tx.shop.update({
          where: { id: payout.shopId },
          data: {
            walletBalance: { increment: payout.amount },
          },
        });
      }

      const processed = await tx.payoutRequest.update({
        where: { id },
        data: {
          status: normalizedStatus,
          transactionRef: transactionRef ? transactionRef.trim() : null,
          adminNote: adminNote ? adminNote.trim() : null,
          processedAt: new Date(),
        },
      });

      await createNotification(
        {
          userId: payout.shop.ownerId,
          title: `Payout ${normalizedStatus}`,
          message:
            normalizedStatus === 'APPROVED'
              ? `Your payout request of $${payout.amount} has been approved (Ref: ${transactionRef}).`
              : `Your payout request of $${payout.amount} was rejected. Funds returned to your wallet.`,
          type: 'PAYOUT_UPDATE',
        },
        tx
      );

      return processed;
    });

    return sendSuccess(res, 200, `Payout request ${normalizedStatus.toLowerCase()} successfully`, {
      payout: updatedPayout,
    });
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.statusCode, error.message);
    }
    console.error('Error in processPayoutRequest:', error);
    return sendError(res, 500, 'Failed to process payout request');
  }
};

/**
 * Admin: Update platform commission rate for a shop
 * PATCH /api/v1/admin/shops/:id/commission (Admin only)
 */
const updateShopCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const { commissionRate } = req.body;

    const rate = parseFloat(commissionRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return sendError(res, 400, 'commissionRate must be a number between 0 and 100');
    }

    const shop = await prisma.shop.findUnique({ where: { id } });
    if (!shop) {
      return sendError(res, 404, 'Shop not found');
    }

    const updated = await prisma.shop.update({
      where: { id },
      data: { commissionRate: rate },
    });

    return sendSuccess(res, 200, `Shop commission rate updated to ${rate}%`, { shop: updated });
  } catch (error) {
    console.error('Error in updateShopCommission:', error);
    return sendError(res, 500, 'Failed to update shop commission rate');
  }
};

module.exports = {
  getVendorWallet,
  requestPayout,
  getVendorAnalytics,
  getAllPayoutRequests,
  processPayoutRequest,
  updateShopCommission,
};
