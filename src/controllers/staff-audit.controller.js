const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');
const { createNotification } = require('../utils/notify');
const { recordAuditLog } = require('../utils/audit');

const VALID_STAFF_ROLES = ['MANAGER', 'ORDER_HANDLER', 'INVENTORY_CLERK'];

/**
 * Vendor: Add a staff member to their shop team
 * POST /api/v1/vendor/staff (Vendor owner only)
 */
const addShopStaff = async (req, res) => {
  try {
    const { email, staffRole = 'ORDER_HANDLER' } = req.body;

    if (!email || typeof email !== 'string') {
      return sendError(res, 400, 'Staff user email is required');
    }

    const normalizedRole = staffRole.toUpperCase();
    if (!VALID_STAFF_ROLES.includes(normalizedRole)) {
      return sendError(res, 400, `Invalid staffRole. Allowed: ${VALID_STAFF_ROLES.join(', ')}`);
    }

    const shop = await prisma.shop.findUnique({ where: { ownerId: req.user.id } });
    if (!shop || !shop.isApproved) {
      return sendError(res, 403, 'Approved shop required to manage staff');
    }

    const targetUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!targetUser) {
      return sendError(res, 404, 'No user found with that email address');
    }
    if (targetUser.id === req.user.id) {
      return sendError(res, 400, 'You are already the shop owner');
    }

    const existing = await prisma.shopStaff.findUnique({
      where: { shopId_userId: { shopId: shop.id, userId: targetUser.id } },
    });
    if (existing) {
      return sendError(res, 409, 'This user is already a staff member of your shop');
    }

    const staff = await prisma.shopStaff.create({
      data: {
        shopId: shop.id,
        userId: targetUser.id,
        staffRole: normalizedRole,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await createNotification({
      userId: targetUser.id,
      title: `Added to ${shop.name} Team`,
      message: `You have been added as ${normalizedRole} at "${shop.name}".`,
      type: 'SYSTEM',
    });

    await recordAuditLog({
      actorId: req.user.id,
      action: 'STAFF_ADDED',
      entity: 'ShopStaff',
      entityId: staff.id,
      details: { shopId: shop.id, staffEmail: targetUser.email, staffRole: normalizedRole },
      req,
    });

    return sendSuccess(res, 201, 'Staff member added successfully', { staff });
  } catch (error) {
    console.error('Error adding shop staff:', error);
    return sendError(res, 500, 'Failed to add staff member');
  }
};

/**
 * Vendor: List all staff members of own shop
 * GET /api/v1/vendor/staff
 */
const getShopStaff = async (req, res) => {
  try {
    const shop = await prisma.shop.findUnique({ where: { ownerId: req.user.id } });
    if (!shop) {
      return sendError(res, 404, 'Shop not found');
    }

    const staffMembers = await prisma.shopStaff.findMany({
      where: { shopId: shop.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Shop staff retrieved successfully', { staffMembers });
  } catch (error) {
    console.error('Error fetching shop staff:', error);
    return sendError(res, 500, 'Failed to fetch shop staff');
  }
};

/**
 * Vendor: Remove a staff member
 * DELETE /api/v1/vendor/staff/:staffId
 */
const removeShopStaff = async (req, res) => {
  try {
    const { staffId } = req.params;
    const shop = await prisma.shop.findUnique({ where: { ownerId: req.user.id } });
    if (!shop) {
      return sendError(res, 404, 'Shop not found');
    }

    const staff = await prisma.shopStaff.findUnique({ where: { id: staffId } });
    if (!staff || staff.shopId !== shop.id) {
      return sendError(res, 404, 'Staff member not found in your shop');
    }

    await prisma.shopStaff.delete({ where: { id: staffId } });

    await recordAuditLog({
      actorId: req.user.id,
      action: 'STAFF_REMOVED',
      entity: 'ShopStaff',
      entityId: staffId,
      details: { shopId: shop.id },
      req,
    });

    return sendSuccess(res, 200, 'Staff member removed successfully');
  } catch (error) {
    console.error('Error removing shop staff:', error);
    return sendError(res, 500, 'Failed to remove staff member');
  }
};

/**
 * Admin: View platform audit logs
 * GET /api/v1/admin/audit-logs (Admin only)
 */
const getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
    ]);

    return sendSuccess(res, 200, 'Audit logs retrieved successfully', {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      logs,
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return sendError(res, 500, 'Failed to fetch audit logs');
  }
};

module.exports = {
  addShopStaff,
  getShopStaff,
  removeShopStaff,
  getAuditLogs,
};
