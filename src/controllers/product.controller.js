const prisma = require('../config/prisma');
const { uploadBufferToCloudinary } = require('../config/cloudinary');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Helper to extract and normalize image URLs from files and/or body
 */
const resolveImages = async (req) => {
  const imageUrls = [];

  // 1. Process files uploaded via Multer to Cloudinary
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    try {
      const uploadPromises = req.files.map((file) => uploadBufferToCloudinary(file.buffer));
      const uploadedUrls = await Promise.all(uploadPromises);
      imageUrls.push(...uploadedUrls);
    } catch (err) {
      console.error('Cloudinary upload error:', err);
      throw new Error(`Cloudinary upload failed: ${err.message}`);
    }
  }

  // 2. Process image URLs passed in body (array or single string or JSON string)
  if (req.body.images) {
    if (Array.isArray(req.body.images)) {
      imageUrls.push(...req.body.images.filter((url) => typeof url === 'string' && url.trim()));
    } else if (typeof req.body.images === 'string') {
      try {
        const parsed = JSON.parse(req.body.images);
        if (Array.isArray(parsed)) {
          imageUrls.push(...parsed.filter((url) => typeof url === 'string' && url.trim()));
        } else if (typeof parsed === 'string' && parsed.trim()) {
          imageUrls.push(parsed.trim());
        }
      } catch {
        if (req.body.images.trim()) {
          imageUrls.push(req.body.images.trim());
        }
      }
    }
  }

  return imageUrls;
};

/**
 * Create a new product
 * POST /api/v1/products (Vendor only)
 */
const createProduct = async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify vendor's shop
    const shop = await prisma.shop.findUnique({
      where: { ownerId: userId },
    });

    if (!shop) {
      return sendError(res, 403, 'You do not own a shop. Please create a shop first.');
    }

    if (!shop.isApproved) {
      return sendError(
        res,
        403,
        'Your shop is pending admin approval. You cannot create products yet.'
      );
    }

    const { name, description, price, stock, categoryId } = req.body;

    // Field Validations
    if (!name || typeof name !== 'string' || !name.trim()) {
      return sendError(res, 400, 'Product name is required');
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      return sendError(res, 400, 'Product description is required');
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      return sendError(res, 400, 'Product price must be a positive number');
    }

    const numericStock = stock !== undefined ? parseInt(stock, 10) : 0;
    if (isNaN(numericStock) || numericStock < 0) {
      return sendError(res, 400, 'Product stock must be a non-negative integer');
    }

    if (!categoryId || typeof categoryId !== 'string' || !categoryId.trim()) {
      return sendError(res, 400, 'categoryId is required');
    }

    // Verify category exists
    const category = await prisma.category.findUnique({
      where: { id: categoryId.trim() },
    });

    if (!category) {
      return sendError(res, 404, 'Category not found');
    }

    // Process Images
    const imageUrls = await resolveImages(req);

    // Create product
    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        description: description.trim(),
        price: numericPrice,
        stock: numericStock,
        images: imageUrls,
        categoryId: category.id,
        shopId: shop.id,
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
        shop: {
          select: { id: true, name: true, logo: true, isApproved: true },
        },
      },
    });

    return sendSuccess(res, 201, 'Product created successfully', { product });
  } catch (error) {
    console.error('Error in createProduct controller:', error);
    return sendError(res, 500, 'Failed to create product', error.message);
  }
};

/**
 * List products with search, filter, sorting, and pagination
 * GET /api/v1/products (Public)
 */
const getAllProducts = async (req, res) => {
  try {
    const {
      search,
      categoryId,
      shopId,
      minPrice,
      maxPrice,
      page = 1,
      limit = 10,
      sortBy = 'newest',
    } = req.query;

    // Filter to only approved shops
    const where = {
      shop: {
        isApproved: true,
      },
    };

    if (categoryId && typeof categoryId === 'string' && categoryId.trim()) {
      where.categoryId = categoryId.trim();
    }

    if (shopId && typeof shopId === 'string' && shopId.trim()) {
      where.shopId = shopId.trim();
    }

    // Price range filtering
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined && !isNaN(parseFloat(minPrice))) {
        where.price.gte = parseFloat(minPrice);
      }
      if (maxPrice !== undefined && !isNaN(parseFloat(maxPrice))) {
        where.price.lte = parseFloat(maxPrice);
      }
    }

    // Search by name or description (case-insensitive)
    if (search && typeof search === 'string' && search.trim()) {
      const query = search.trim();
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    // Sorting
    let orderBy = { createdAt: 'desc' };
    if (sortBy === 'price_asc') {
      orderBy = { price: 'asc' };
    } else if (sortBy === 'price_desc') {
      orderBy = { price: 'desc' };
    } else if (sortBy === 'newest') {
      orderBy = { createdAt: 'desc' };
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limitNum,
        include: {
          category: {
            select: { id: true, name: true },
          },
          shop: {
            select: { id: true, name: true, logo: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    return sendSuccess(res, 200, 'Products retrieved successfully', {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      products,
    });
  } catch (error) {
    console.error('Error in getAllProducts controller:', error);
    return sendError(res, 500, 'Failed to retrieve products', error.message);
  }
};

/**
 * Get single product by ID
 * GET /api/v1/products/:id (Public)
 */
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findFirst({
      where: {
        id,
        shop: { isApproved: true },
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
        shop: {
          select: { id: true, name: true, logo: true, isApproved: true },
        },
      },
    });

    if (!product) {
      return sendError(res, 404, 'Product not found');
    }

    return sendSuccess(res, 200, 'Product details retrieved successfully', { product });
  } catch (error) {
    console.error('Error in getProductById controller:', error);
    return sendError(res, 500, 'Failed to retrieve product details', error.message);
  }
};

/**
 * Update a product
 * PATCH /api/v1/products/:id (Vendor only with strict ownership check)
 */
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return sendError(res, 404, 'Product not found');
    }

    // Strict Ownership Check
    const vendorShop = await prisma.shop.findUnique({
      where: { ownerId: userId },
    });

    if (!vendorShop || product.shopId !== vendorShop.id) {
      return sendError(
        res,
        403,
        'Access denied. You do not have permission to modify this product.'
      );
    }

    const { name, description, price, stock, categoryId } = req.body;
    const updateData = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return sendError(res, 400, 'Product name cannot be empty');
      }
      updateData.name = name.trim();
    }

    if (description !== undefined) {
      if (typeof description !== 'string' || !description.trim()) {
        return sendError(res, 400, 'Product description cannot be empty');
      }
      updateData.description = description.trim();
    }

    if (price !== undefined) {
      const numericPrice = parseFloat(price);
      if (isNaN(numericPrice) || numericPrice <= 0) {
        return sendError(res, 400, 'Product price must be a positive number');
      }
      updateData.price = numericPrice;
    }

    if (stock !== undefined) {
      const numericStock = parseInt(stock, 10);
      if (isNaN(numericStock) || numericStock < 0) {
        return sendError(res, 400, 'Product stock must be a non-negative integer');
      }
      updateData.stock = numericStock;
    }

    if (categoryId !== undefined) {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
      });
      if (!category) {
        return sendError(res, 404, 'Category not found');
      }
      updateData.categoryId = category.id;
    }

    // Handle Image updates if new images or files sent
    const newImages = await resolveImages(req);
    if (newImages.length > 0) {
      updateData.images = newImages;
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: {
          select: { id: true, name: true },
        },
        shop: {
          select: { id: true, name: true, logo: true },
        },
      },
    });

    return sendSuccess(res, 200, 'Product updated successfully', { product: updatedProduct });
  } catch (error) {
    console.error('Error in updateProduct controller:', error);
    return sendError(res, 500, 'Failed to update product', error.message);
  }
};

/**
 * Delete a product
 * DELETE /api/v1/products/:id (Vendor only with strict ownership check)
 */
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return sendError(res, 404, 'Product not found');
    }

    // Strict Ownership Check
    const vendorShop = await prisma.shop.findUnique({
      where: { ownerId: userId },
    });

    if (!vendorShop || product.shopId !== vendorShop.id) {
      return sendError(
        res,
        403,
        'Access denied. You do not have permission to delete this product.'
      );
    }

    await prisma.product.delete({
      where: { id },
    });

    return sendSuccess(res, 200, 'Product deleted successfully');
  } catch (error) {
    console.error('Error in deleteProduct controller:', error);
    return sendError(res, 500, 'Failed to delete product', error.message);
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
