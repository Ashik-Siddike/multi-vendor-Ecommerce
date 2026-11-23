const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * List all shops pending approval
 * GET /api/v1/admin/shops/pending (Admin only)
 */
const getPendingShops = async (req, res) => {
  try {
    const pendingShops = await prisma.shop.findMany({
      where: { isApproved: false },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Pending shops retrieved successfully', {
      count: pendingShops.length,
      shops: pendingShops,
    });
  } catch (error) {
    console.error('Error in getPendingShops controller:', error);
    return sendError(res, 500, 'Failed to retrieve pending shops', error.message);
  }
};

/**
 * Approve a shop and promote owner to VENDOR
 * PATCH /api/v1/admin/shops/:id/approve (Admin only)
 */
const approveShop = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if shop exists
    const shop = await prisma.shop.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!shop) {
      return sendError(res, 404, 'Shop not found');
    }

    if (shop.isApproved) {
      return sendSuccess(res, 200, 'Shop is already approved', { shop });
    }

    // Atomic transaction: approve shop AND promote shop owner to VENDOR
    const [updatedShop, updatedOwner] = await prisma.$transaction([
      prisma.shop.update({
        where: { id },
        data: { isApproved: true },
      }),
      prisma.user.update({
        where: { id: shop.ownerId },
        data: { role: 'VENDOR' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          updatedAt: true,
        },
      }),
    ]);

    return sendSuccess(res, 200, 'Shop approved successfully and owner promoted to VENDOR', {
      shop: updatedShop,
      owner: updatedOwner,
    });
  } catch (error) {
    console.error('Error in approveShop controller:', error);
    return sendError(res, 500, 'Failed to approve shop', error.message);
  }
};

/**
 * Get system-wide dashboard stats
 * GET /api/v1/admin/dashboard-stats (Admin only)
 */
const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      approvedShops,
      pendingShops,
      totalProducts,
      totalOrders,
      revenueAggregate,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.shop.count({ where: { isApproved: true } }),
      prisma.shop.count({ where: { isApproved: false } }),
      prisma.product.count(),
      prisma.order.count(),
      prisma.order.aggregate({
        _sum: {
          totalAmount: true,
        },
      }),
    ]);

    const totalRevenue = revenueAggregate._sum.totalAmount || 0;

    return sendSuccess(res, 200, 'Admin dashboard stats retrieved successfully', {
      stats: {
        users: totalUsers,
        approvedShops,
        pendingShops,
        products: totalProducts,
        orders: totalOrders,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      },
    });
  } catch (error) {
    console.error('Error in getDashboardStats controller:', error);
    return sendError(res, 500, 'Failed to retrieve dashboard stats', error.message);
  }
};

module.exports = {
  getPendingShops,
  approveShop,
  getDashboardStats,
};
