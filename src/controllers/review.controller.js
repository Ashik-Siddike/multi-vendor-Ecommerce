const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Create a new review for a product (Verified Purchase only)
 * POST /api/v1/products/:productId/reviews
 */
const createProductReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, comment } = req.body;

    const parsedRating = parseInt(rating, 10);
    if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
      return sendError(res, 400, 'Rating must be an integer between 1 and 5.');
    }

    // 1. Verify product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      return sendError(res, 404, 'Product not found.');
    }

    // 2. Strict Verified Purchase Check:
    // Customer must have an order with this product that has been DELIVERED
    const deliveredItem = await prisma.orderItem.findFirst({
      where: {
        productId,
        order: {
          userId: req.user.id,
        },
        status: 'DELIVERED',
      },
    });

    if (!deliveredItem) {
      // Check if user bought it but it is not yet delivered
      const anyPurchased = await prisma.orderItem.findFirst({
        where: {
          productId,
          order: {
            userId: req.user.id,
          },
        },
      });

      if (!anyPurchased) {
        return sendError(
          res,
          403,
          'Verified purchase required: You can only review products you have purchased.'
        );
      } else {
        return sendError(
          res,
          403,
          'You can only review products after they have been marked as DELIVERED.'
        );
      }
    }

    // 3. Check for existing review by this user on this product
    const existingReview = await prisma.review.findUnique({
      where: {
        userId_productId: {
          userId: req.user.id,
          productId,
        },
      },
    });
    if (existingReview) {
      return sendError(res, 409, 'You have already reviewed this product.');
    }

    // 4. Create review & update product aggregate stats atomically
    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          rating: parsedRating,
          comment: comment ? comment.trim() : null,
          userId: req.user.id,
          productId,
        },
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      });

      // Recalculate averageRating and reviewCount
      const aggregates = await tx.review.aggregate({
        where: { productId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      await tx.product.update({
        where: { id: productId },
        data: {
          averageRating: aggregates._avg.rating
            ? parseFloat(aggregates._avg.rating.toFixed(1))
            : 0,
          reviewCount: aggregates._count.rating || 0,
        },
      });

      return created;
    });

    return sendSuccess(res, 201, 'Review submitted successfully', review);
  } catch (error) {
    console.error('Error creating product review:', error);
    return sendError(res, 500, 'Failed to submit review');
  }
};

/**
 * Get all reviews for a product (Public)
 * GET /api/v1/products/:productId/reviews
 */
const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
    const skip = (page - 1) * limit;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, averageRating: true, reviewCount: true },
    });

    if (!product) {
      return sendError(res, 404, 'Product not found.');
    }

    const [total, reviews] = await Promise.all([
      prisma.review.count({ where: { productId } }),
      prisma.review.findMany({
        where: { productId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, 200, 'Product reviews retrieved successfully', {
      product,
      total,
      page,
      limit,
      totalPages,
      reviews,
    });
  } catch (error) {
    console.error('Error fetching product reviews:', error);
    return sendError(res, 500, 'Failed to fetch reviews');
  }
};

/**
 * Get logged-in user's own reviews
 * GET /api/v1/reviews/my-reviews
 */
const getMyReviews = async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            images: true,
            price: true,
            shop: { select: { id: true, name: true } },
          },
        },
      },
    });

    return sendSuccess(res, 200, 'User reviews retrieved successfully', reviews);
  } catch (error) {
    console.error('Error fetching user reviews:', error);
    return sendError(res, 500, 'Failed to retrieve your reviews');
  }
};

/**
 * Delete a review (Customer own review or Admin)
 * DELETE /api/v1/reviews/:id
 */
const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      return sendError(res, 404, 'Review not found.');
    }

    // Only owner or Admin can delete
    if (review.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 403, 'Forbidden: You can only delete your own review.');
    }

    const productId = review.productId;

    await prisma.$transaction(async (tx) => {
      await tx.review.delete({
        where: { id },
      });

      // Recalculate aggregates
      const aggregates = await tx.review.aggregate({
        where: { productId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      await tx.product.update({
        where: { id: productId },
        data: {
          averageRating: aggregates._avg.rating
            ? parseFloat(aggregates._avg.rating.toFixed(1))
            : 0,
          reviewCount: aggregates._count.rating || 0,
        },
      });
    });

    return sendSuccess(res, 200, 'Review deleted successfully');
  } catch (error) {
    console.error('Error deleting review:', error);
    return sendError(res, 500, 'Failed to delete review');
  }
};

module.exports = {
  createProductReview,
  getProductReviews,
  getMyReviews,
  deleteReview,
};
