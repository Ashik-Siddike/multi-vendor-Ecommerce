const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Get logged-in customer's wishlist
 * GET /api/v1/wishlist (Customer only)
 */
const getWishlist = async (req, res) => {
  try {
    let wishlist = await prisma.wishlist.findUnique({
      where: { userId: req.user.id },
      include: {
        items: {
          orderBy: { createdAt: 'desc' },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                stock: true,
                images: true,
                averageRating: true,
                reviewCount: true,
                shop: {
                  select: { id: true, name: true, isApproved: true },
                },
                category: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
    });

    if (!wishlist) {
      wishlist = await prisma.wishlist.create({
        data: { userId: req.user.id },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  stock: true,
                  images: true,
                  averageRating: true,
                  reviewCount: true,
                  shop: { select: { id: true, name: true, isApproved: true } },
                  category: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });
    }

    return sendSuccess(res, 200, 'Wishlist retrieved successfully', {
      id: wishlist.id,
      itemCount: wishlist.items.length,
      items: wishlist.items,
    });
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    return sendError(res, 500, 'Failed to fetch wishlist');
  }
};

/**
 * Toggle product in wishlist (Add if not present, Remove if already present)
 * POST /api/v1/wishlist/:productId (Customer only)
 */
const toggleWishlistItem = async (req, res) => {
  try {
    const { productId } = req.params;

    // Verify product exists and belongs to an approved shop
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        shop: { isApproved: true },
      },
    });

    if (!product) {
      return sendError(res, 404, 'Product not found or unavailable.');
    }

    // Ensure wishlist exists
    let wishlist = await prisma.wishlist.findUnique({
      where: { userId: req.user.id },
    });

    if (!wishlist) {
      wishlist = await prisma.wishlist.create({
        data: { userId: req.user.id },
      });
    }

    // Check if product is already in wishlist
    const existingItem = await prisma.wishlistItem.findUnique({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId,
        },
      },
    });

    if (existingItem) {
      await prisma.wishlistItem.delete({
        where: { id: existingItem.id },
      });
      return sendSuccess(res, 200, 'Product removed from wishlist', {
        action: 'removed',
        inWishlist: false,
        productId,
      });
    }

    const newItem = await prisma.wishlistItem.create({
      data: {
        wishlistId: wishlist.id,
        productId,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            images: true,
            shop: { select: { id: true, name: true } },
          },
        },
      },
    });

    return sendSuccess(res, 201, 'Product added to wishlist', {
      action: 'added',
      inWishlist: true,
      item: newItem,
    });
  } catch (error) {
    console.error('Error toggling wishlist item:', error);
    return sendError(res, 500, 'Failed to update wishlist');
  }
};

/**
 * Remove a product from wishlist
 * DELETE /api/v1/wishlist/:productId (Customer only)
 */
const removeWishlistItem = async (req, res) => {
  try {
    const { productId } = req.params;

    const wishlist = await prisma.wishlist.findUnique({
      where: { userId: req.user.id },
    });

    if (!wishlist) {
      return sendError(res, 404, 'Wishlist not found.');
    }

    const existingItem = await prisma.wishlistItem.findUnique({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId,
        },
      },
    });

    if (!existingItem) {
      return sendError(res, 404, 'Product not found in your wishlist.');
    }

    await prisma.wishlistItem.delete({
      where: { id: existingItem.id },
    });

    return sendSuccess(res, 200, 'Product removed from wishlist');
  } catch (error) {
    console.error('Error removing wishlist item:', error);
    return sendError(res, 500, 'Failed to remove item from wishlist');
  }
};

module.exports = {
  getWishlist,
  toggleWishlistItem,
  removeWishlistItem,
};
