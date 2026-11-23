const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Create a new category
 * POST /api/v1/categories (Admin only)
 */
const createCategory = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return sendError(res, 400, 'Category name is required');
    }

    const trimmedName = name.trim();

    // Check if category already exists
    const existing = await prisma.category.findUnique({
      where: { name: trimmedName },
    });

    if (existing) {
      return sendError(res, 409, `Category '${trimmedName}' already exists`);
    }

    const category = await prisma.category.create({
      data: { name: trimmedName },
    });

    return sendSuccess(res, 201, 'Category created successfully', { category });
  } catch (error) {
    console.error('Error in createCategory controller:', error);
    if (error.code === 'P2002') {
      return sendError(res, 409, 'Category with this name already exists');
    }
    return sendError(res, 500, 'Failed to create category', error.message);
  }
};

/**
 * List all categories
 * GET /api/v1/categories (Public)
 */
const getAllCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });

    return sendSuccess(res, 200, 'Categories retrieved successfully', { categories });
  } catch (error) {
    console.error('Error in getAllCategories controller:', error);
    return sendError(res, 500, 'Failed to retrieve categories', error.message);
  }
};

module.exports = {
  createCategory,
  getAllCategories,
};
