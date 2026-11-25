const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Create a new coupon
 * POST /api/v1/coupons (Admin or Vendor)
 */
const createCoupon = async (req, res) => {
  try {
    const { code, discountType = 'PERCENTAGE', discountValue, minOrderValue = 0, maxDiscount, expiryDate } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return sendError(res, 400, 'Coupon code is required');
    }

    const normalizedCode = code.trim().toUpperCase();

    const numericDiscount = parseFloat(discountValue);
    if (isNaN(numericDiscount) || numericDiscount <= 0) {
      return sendError(res, 400, 'discountValue must be a positive number');
    }

    if (discountType === 'PERCENTAGE' && numericDiscount > 100) {
      return sendError(res, 400, 'Percentage discount cannot exceed 100%');
    }

    if (!expiryDate || isNaN(Date.parse(expiryDate))) {
      return sendError(res, 400, 'A valid expiryDate is required');
    }

    const parsedExpiry = new Date(expiryDate);
    if (parsedExpiry <= new Date()) {
      return sendError(res, 400, 'expiryDate must be in the future');
    }

    // Check if code already exists
    const existing = await prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });
    if (existing) {
      return sendError(res, 409, `Coupon with code "${normalizedCode}" already exists`);
    }

    let shopId = null;
    if (req.user.role === 'VENDOR') {
      const vendorShop = await prisma.shop.findUnique({
        where: { ownerId: req.user.id },
      });
      if (!vendorShop || !vendorShop.isApproved) {
        return sendError(res, 403, 'Approved shop required to create vendor coupons');
      }
      shopId = vendorShop.id;
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: normalizedCode,
        discountType: discountType.toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
        discountValue: numericDiscount,
        minOrderValue: parseFloat(minOrderValue) || 0,
        maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
        expiryDate: parsedExpiry,
        shopId,
      },
    });

    return sendSuccess(res, 201, 'Coupon created successfully', { coupon });
  } catch (error) {
    console.error('Error in createCoupon:', error);
    return sendError(res, 500, 'Failed to create coupon');
  }
};

/**
 * Validate and apply coupon
 * POST /api/v1/coupons/apply (Customer or Public)
 */
const applyCoupon = async (req, res) => {
  try {
    const { code, orderAmount = 0 } = req.body;

    if (!code || typeof code !== 'string') {
      return sendError(res, 400, 'Coupon code is required');
    }

    const normalizedCode = code.trim().toUpperCase();
    const amount = parseFloat(orderAmount);

    const coupon = await prisma.coupon.findUnique({
      where: { code: normalizedCode },
      include: {
        shop: { select: { id: true, name: true } },
      },
    });

    if (!coupon || !coupon.isActive) {
      return sendError(res, 404, 'Invalid or inactive coupon code');
    }

    if (new Date(coupon.expiryDate) < new Date()) {
      return sendError(res, 400, 'This coupon has expired');
    }

    if (amount < coupon.minOrderValue) {
      return sendError(
        res,
        400,
        `Minimum order amount of $${coupon.minOrderValue} required for this coupon`
      );
    }

    let discountAmount = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      discountAmount = (amount * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else {
      discountAmount = Math.min(amount, coupon.discountValue);
    }

    discountAmount = parseFloat(discountAmount.toFixed(2));
    const finalAmount = parseFloat(Math.max(0, amount - discountAmount).toFixed(2));

    return sendSuccess(res, 200, 'Coupon applied successfully', {
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        shopId: coupon.shopId,
      },
      orderAmount: amount,
      discountAmount,
      finalAmount,
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    return sendError(res, 500, 'Failed to apply coupon');
  }
};

/**
 * List active coupons
 * GET /api/v1/coupons (Public / Authenticated)
 */
const getCoupons = async (req, res) => {
  try {
    const where = {
      isActive: true,
      expiryDate: { gt: new Date() },
    };

    const coupons = await prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        shop: { select: { id: true, name: true } },
      },
    });

    return sendSuccess(res, 200, 'Coupons retrieved successfully', { coupons });
  } catch (error) {
    console.error('Error in getCoupons:', error);
    return sendError(res, 500, 'Failed to fetch coupons');
  }
};

/**
 * Delete coupon
 * DELETE /api/v1/coupons/:id (Admin or Vendor owner)
 */
const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await prisma.coupon.findUnique({
      where: { id },
    });

    if (!coupon) {
      return sendError(res, 404, 'Coupon not found');
    }

    if (req.user.role === 'VENDOR') {
      const vendorShop = await prisma.shop.findUnique({
        where: { ownerId: req.user.id },
      });
      if (!vendorShop || coupon.shopId !== vendorShop.id) {
        return sendError(res, 403, 'Forbidden: You can only delete your own shop coupons');
      }
    }

    await prisma.coupon.delete({
      where: { id },
    });

    return sendSuccess(res, 200, 'Coupon deleted successfully');
  } catch (error) {
    console.error('Error deleting coupon:', error);
    return sendError(res, 500, 'Failed to delete coupon');
  }
};

module.exports = {
  createCoupon,
  applyCoupon,
  getCoupons,
  deleteCoupon,
};
