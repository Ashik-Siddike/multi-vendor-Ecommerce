const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');
const { recordAuditLog } = require('../utils/audit');

/**
 * Create a variant for a product (Vendor only, strict shop ownership)
 * POST /api/v1/products/:productId/variants
 */
const createVariant = async (req, res) => {
  try {
    const { productId } = req.params;
    const { sku, name, attributes = {}, price, stock = 0 } = req.body;

    if (!sku || !name || price === undefined) {
      return sendError(res, 400, 'sku, name, and price are required');
    }

    const numericPrice = parseFloat(price);
    const numericStock = parseInt(stock, 10);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      return sendError(res, 400, 'price must be a positive number');
    }
    if (isNaN(numericStock) || numericStock < 0) {
      return sendError(res, 400, 'stock must be a non-negative integer');
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { shop: true },
    });

    if (!product) {
      return sendError(res, 404, 'Product not found');
    }
    if (product.shop.ownerId !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 403, 'Forbidden: You do not own this product');
    }

    const normalizedSku = sku.trim().toUpperCase();
    const existingSku = await prisma.productVariant.findUnique({ where: { sku: normalizedSku } });
    if (existingSku) {
      return sendError(res, 409, `Variant with SKU "${normalizedSku}" already exists`);
    }

    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: normalizedSku,
        name: name.trim(),
        attributes,
        price: numericPrice,
        stock: numericStock,
      },
    });

    await recordAuditLog({
      actorId: req.user.id,
      action: 'VARIANT_CREATED',
      entity: 'ProductVariant',
      entityId: variant.id,
      details: { productId, sku: normalizedSku, price: numericPrice, stock: numericStock },
      req,
    });

    return sendSuccess(res, 201, 'Product variant created successfully', { variant });
  } catch (error) {
    console.error('Error creating variant:', error);
    return sendError(res, 500, 'Failed to create product variant');
  }
};

/**
 * Get all variants for a product (Public)
 * GET /api/v1/products/:productId/variants
 */
const getProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;
    const variants = await prisma.productVariant.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
    });
    return sendSuccess(res, 200, 'Product variants retrieved successfully', { variants });
  } catch (error) {
    console.error('Error fetching variants:', error);
    return sendError(res, 500, 'Failed to fetch variants');
  }
};

/**
 * Update a product variant (Vendor only)
 * PATCH /api/v1/variants/:id
 */
const updateVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, attributes, price, stock } = req.body;

    const variant = await prisma.productVariant.findUnique({
      where: { id },
      include: { product: { include: { shop: true } } },
    });

    if (!variant) {
      return sendError(res, 404, 'Variant not found');
    }
    if (variant.product.shop.ownerId !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 403, 'Forbidden: You do not own this variant');
    }

    const updated = await prisma.productVariant.update({
      where: { id },
      data: {
        name: name ? name.trim() : variant.name,
        attributes: attributes !== undefined ? attributes : variant.attributes,
        price: price !== undefined ? parseFloat(price) : variant.price,
        stock: stock !== undefined ? parseInt(stock, 10) : variant.stock,
      },
    });

    return sendSuccess(res, 200, 'Variant updated successfully', { variant: updated });
  } catch (error) {
    console.error('Error updating variant:', error);
    return sendError(res, 500, 'Failed to update variant');
  }
};

/**
 * Delete a product variant (Vendor only)
 * DELETE /api/v1/variants/:id
 */
const deleteVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const variant = await prisma.productVariant.findUnique({
      where: { id },
      include: { product: { include: { shop: true } } },
    });

    if (!variant) {
      return sendError(res, 404, 'Variant not found');
    }
    if (variant.product.shop.ownerId !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 403, 'Forbidden: You do not own this variant');
    }

    await prisma.productVariant.delete({ where: { id } });
    return sendSuccess(res, 200, 'Variant deleted successfully');
  } catch (error) {
    console.error('Error deleting variant:', error);
    return sendError(res, 500, 'Failed to delete variant');
  }
};

/**
 * Create a time-bounded Flash Sale for a product (Vendor only)
 * POST /api/v1/flash-sales
 */
const createFlashSale = async (req, res) => {
  try {
    const { productId, flashPrice, startTime, endTime } = req.body;

    if (!productId || flashPrice === undefined || !startTime || !endTime) {
      return sendError(res, 400, 'productId, flashPrice, startTime, and endTime are required');
    }

    const numericFlashPrice = parseFloat(flashPrice);
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(numericFlashPrice) || numericFlashPrice <= 0) {
      return sendError(res, 400, 'flashPrice must be a positive number');
    }
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return sendError(res, 400, 'endTime must be a valid date after startTime');
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { shop: true },
    });

    if (!product) {
      return sendError(res, 404, 'Product not found');
    }
    if (product.shop.ownerId !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 403, 'Forbidden: You can only create flash sales for your own products');
    }
    if (numericFlashPrice >= product.price) {
      return sendError(res, 400, `flashPrice ($${numericFlashPrice}) must be lower than regular price ($${product.price})`);
    }

    const flashSale = await prisma.flashSale.create({
      data: {
        shopId: product.shopId,
        productId,
        flashPrice: numericFlashPrice,
        startTime: start,
        endTime: end,
      },
      include: {
        product: { select: { id: true, name: true, price: true } },
      },
    });

    return sendSuccess(res, 201, 'Flash sale campaign created successfully', { flashSale });
  } catch (error) {
    console.error('Error creating flash sale:', error);
    return sendError(res, 500, 'Failed to create flash sale');
  }
};

/**
 * Get all currently active Flash Sales (Public)
 * GET /api/v1/flash-sales
 */
const getActiveFlashSales = async (req, res) => {
  try {
    const now = new Date();
    const flashSales = await prisma.flashSale.findMany({
      where: {
        isActive: true,
        startTime: { lte: now },
        endTime: { gte: now },
      },
      include: {
        product: {
          select: { id: true, name: true, price: true, images: true, stock: true },
        },
        shop: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { endTime: 'asc' },
    });

    return sendSuccess(res, 200, 'Active flash sales retrieved successfully', { flashSales });
  } catch (error) {
    console.error('Error fetching flash sales:', error);
    return sendError(res, 500, 'Failed to fetch active flash sales');
  }
};

module.exports = {
  createVariant,
  getProductVariants,
  updateVariant,
  deleteVariant,
  createFlashSale,
  getActiveFlashSales,
};
