const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Request to open a shop
 * POST /api/v1/shops (Logged-in Customer)
 */
const createShop = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, logo } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return sendError(res, 400, 'Shop name is required');
    }

    const trimmedName = name.trim();

    // Check if user already owns a shop
    const existingUserShop = await prisma.shop.findUnique({
      where: { ownerId: userId },
    });

    if (existingUserShop) {
      return sendError(
        res,
        409,
        'You already have a shop or a pending shop approval request'
      );
    }

    // Check if shop name is already taken
    const existingNameShop = await prisma.shop.findUnique({
      where: { name: trimmedName },
    });

    if (existingNameShop) {
      return sendError(res, 409, `Shop name '${trimmedName}' is already taken`);
    }

    const shop = await prisma.shop.create({
      data: {
        name: trimmedName,
        description: description && typeof description === 'string' ? description.trim() : null,
        logo: logo && typeof logo === 'string' ? logo.trim() : null,
        ownerId: userId,
        isApproved: false,
      },
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

    return sendSuccess(
      res,
      201,
      'Shop opening request submitted successfully. Pending admin approval.',
      { shop }
    );
  } catch (error) {
    console.error('Error in createShop controller:', error);
    if (error.code === 'P2002') {
      return sendError(res, 409, 'Shop name or user shop already exists');
    }
    return sendError(res, 500, 'Failed to create shop request', error.message);
  }
};

/**
 * List all approved shops
 * GET /api/v1/shops (Public)
 */
const getAllApprovedShops = async (req, res) => {
  try {
    const shops = await prisma.shop.findMany({
      where: { isApproved: true },
      select: {
        id: true,
        name: true,
        description: true,
        logo: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Approved shops retrieved successfully', { shops });
  } catch (error) {
    console.error('Error in getAllApprovedShops controller:', error);
    return sendError(res, 500, 'Failed to retrieve shops', error.message);
  }
};

/**
 * Get single approved shop by ID
 * GET /api/v1/shops/:id (Public)
 */
const getApprovedShopById = async (req, res) => {
  try {
    const { id } = req.params;

    const shop = await prisma.shop.findFirst({
      where: {
        id,
        isApproved: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        logo: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!shop) {
      return sendError(res, 404, 'Shop not found or not approved');
    }

    return sendSuccess(res, 200, 'Shop details retrieved successfully', { shop });
  } catch (error) {
    console.error('Error in getApprovedShopById controller:', error);
    return sendError(res, 500, 'Failed to retrieve shop details', error.message);
  }
};

/**
 * Get current vendor's shop details
 * GET /api/v1/shops/my-shop (Authenticated)
 */
const getMyShop = async (req, res) => {
  try {
    const userId = req.user.id;

    const shop = await prisma.shop.findUnique({
      where: { ownerId: userId },
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
      return sendError(res, 404, 'No shop found for current account');
    }

    return sendSuccess(res, 200, 'Own shop details retrieved successfully', { shop });
  } catch (error) {
    console.error('Error in getMyShop controller:', error);
    return sendError(res, 500, 'Failed to retrieve your shop details', error.message);
  }
};

/**
 * Update own shop details
 * PATCH /api/v1/shops/my-shop (Vendor only)
 */
const updateMyShop = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, logo } = req.body;

    const shop = await prisma.shop.findUnique({
      where: { ownerId: userId },
    });

    if (!shop) {
      return sendError(res, 404, 'Shop not found for current vendor');
    }

    const updateData = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return sendError(res, 400, 'Shop name cannot be empty');
      }
      const trimmedName = name.trim();
      if (trimmedName !== shop.name) {
        // Check uniqueness if name is changed
        const duplicate = await prisma.shop.findUnique({
          where: { name: trimmedName },
        });
        if (duplicate && duplicate.id !== shop.id) {
          return sendError(res, 409, `Shop name '${trimmedName}' is already taken`);
        }
      }
      updateData.name = trimmedName;
    }

    if (description !== undefined) {
      updateData.description = typeof description === 'string' ? description.trim() : null;
    }

    if (logo !== undefined) {
      updateData.logo = typeof logo === 'string' ? logo.trim() : null;
    }

    const updatedShop = await prisma.shop.update({
      where: { id: shop.id },
      data: updateData,
    });

    return sendSuccess(res, 200, 'Shop details updated successfully', { shop: updatedShop });
  } catch (error) {
    console.error('Error in updateMyShop controller:', error);
    if (error.code === 'P2002') {
      return sendError(res, 409, 'Shop name is already in use');
    }
    return sendError(res, 500, 'Failed to update shop details', error.message);
  }
};

module.exports = {
  createShop,
  getAllApprovedShops,
  getApprovedShopById,
  getMyShop,
  updateMyShop,
};
