const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Helper to retrieve or create the active cart for a user
 */
const getOrCreateCart = async (userId) => {
  let cart = await prisma.cart.findUnique({
    where: { userId },
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
              shopId: true,
              shop: {
                select: { id: true, name: true, isApproved: true },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: { userId },
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
                shopId: true,
                shop: {
                  select: { id: true, name: true, isApproved: true },
                },
              },
            },
          },
        },
      },
    });
  }

  return cart;
};

/**
 * Get current user's cart with subtotal
 * GET /api/v1/cart (Customer only)
 */
const getCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = await getOrCreateCart(userId);

    const subtotal = cart.items.reduce(
      (sum, item) => sum + item.quantity * (item.product?.price || 0),
      0
    );
    const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    return sendSuccess(res, 200, 'Cart retrieved successfully', {
      cartId: cart.id,
      items: cart.items,
      subtotal: parseFloat(subtotal.toFixed(2)),
      totalItems,
    });
  } catch (error) {
    console.error('Error in getCart controller:', error);
    return sendError(res, 500, 'Failed to retrieve cart', error.message);
  }
};

/**
 * Add item to cart
 * POST /api/v1/cart/items (Customer only)
 */
const addItemToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId, quantity = 1 } = req.body;

    if (!productId || typeof productId !== 'string') {
      return sendError(res, 400, 'productId is required');
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return sendError(res, 400, 'Quantity must be a positive integer');
    }

    // Verify product exists and is available
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        shop: { select: { isApproved: true } },
      },
    });

    if (!product) {
      return sendError(res, 404, 'Product not found');
    }

    if (!product.shop || !product.shop.isApproved) {
      return sendError(res, 400, 'Product belongs to an unapproved shop and cannot be purchased');
    }

    if (product.stock < parsedQty) {
      return sendError(
        res,
        400,
        `Insufficient stock. Available stock: ${product.stock}`
      );
    }

    const cart = await getOrCreateCart(userId);

    // Check if product is already in the cart
    const existingItem = await prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: product.id,
        },
      },
    });

    let cartItem;
    if (existingItem) {
      const newQty = existingItem.quantity + parsedQty;
      if (newQty > product.stock) {
        return sendError(
          res,
          400,
          `Cannot add ${parsedQty} more. Adding this would exceed available stock of ${product.stock} (Currently in cart: ${existingItem.quantity})`
        );
      }

      cartItem = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQty },
        include: {
          product: {
            select: { id: true, name: true, price: true, stock: true },
          },
        },
      });
    } else {
      cartItem = await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          quantity: parsedQty,
        },
        include: {
          product: {
            select: { id: true, name: true, price: true, stock: true },
          },
        },
      });
    }

    return sendSuccess(res, 201, 'Item added to cart successfully', { item: cartItem });
  } catch (error) {
    console.error('Error in addItemToCart controller:', error);
    return sendError(res, 500, 'Failed to add item to cart', error.message);
  }
};

/**
 * Update cart item quantity
 * PATCH /api/v1/cart/items/:itemId (Customer only)
 */
const updateCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined) {
      return sendError(res, 400, 'Quantity is required');
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty)) {
      return sendError(res, 400, 'Quantity must be an integer');
    }

    // Verify cart item ownership
    const cartItem = await prisma.cartItem.findUnique({
      where: { id: itemId },
      include: {
        cart: true,
        product: true,
      },
    });

    if (!cartItem || cartItem.cart.userId !== userId) {
      return sendError(res, 404, 'Cart item not found');
    }

    // If quantity <= 0, remove item
    if (parsedQty <= 0) {
      await prisma.cartItem.delete({
        where: { id: itemId },
      });
      return sendSuccess(res, 200, 'Item removed from cart');
    }

    // Validate against stock
    if (parsedQty > cartItem.product.stock) {
      return sendError(
        res,
        400,
        `Requested quantity exceeds available stock of ${cartItem.product.stock}`
      );
    }

    const updated = await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: parsedQty },
      include: {
        product: {
          select: { id: true, name: true, price: true, stock: true },
        },
      },
    });

    return sendSuccess(res, 200, 'Cart item updated successfully', { item: updated });
  } catch (error) {
    console.error('Error in updateCartItem controller:', error);
    return sendError(res, 500, 'Failed to update cart item', error.message);
  }
};

/**
 * Remove an item from cart
 * DELETE /api/v1/cart/items/:itemId (Customer only)
 */
const deleteCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;

    const cartItem = await prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true },
    });

    if (!cartItem || cartItem.cart.userId !== userId) {
      return sendError(res, 404, 'Cart item not found');
    }

    await prisma.cartItem.delete({
      where: { id: itemId },
    });

    return sendSuccess(res, 200, 'Item removed from cart successfully');
  } catch (error) {
    console.error('Error in deleteCartItem controller:', error);
    return sendError(res, 500, 'Failed to remove item from cart', error.message);
  }
};

module.exports = {
  getCart,
  addItemToCart,
  updateCartItem,
  deleteCartItem,
};
