const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');

const VALID_ORDER_STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

/**
 * Place a multi-vendor order from active cart
 * POST /api/v1/orders (Customer only)
 */
const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { address, phone } = req.body;

    if (!address || typeof address !== 'string' || !address.trim()) {
      return sendError(res, 400, 'Shipping address is required');
    }

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return sendError(res, 400, 'Contact phone number is required');
    }

    // Execute atomic transaction for checkout
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch user's cart with items and fresh product info
      const cart = await tx.cart.findUnique({
        where: { userId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  shop: { select: { isApproved: true } },
                },
              },
            },
          },
        },
      });

      if (!cart || !cart.items || cart.items.length === 0) {
        throw { statusCode: 400, message: 'Your cart is empty. Add items before placing an order.' };
      }

      // 2. Validate stock and approved status for every item
      for (const item of cart.items) {
        if (!item.product) {
          throw { statusCode: 404, message: `A product in your cart is no longer available.` };
        }

        if (!item.product.shop || !item.product.shop.isApproved) {
          throw {
            statusCode: 400,
            message: `Product "${item.product.name}" belongs to an unapproved shop and cannot be ordered.`,
          };
        }

        if (item.product.stock < item.quantity) {
          throw {
            statusCode: 400,
            message: `Insufficient stock for "${item.product.name}". Available: ${item.product.stock}, in cart: ${item.quantity}.`,
          };
        }
      }

      // 3. Deduct stock for each product
      for (const item of cart.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });
      }

      // 4. Calculate total amount
      const totalAmount = cart.items.reduce(
        (sum, item) => sum + item.quantity * item.product.price,
        0
      );

      // 5. Create Order and OrderItems (multi-vendor split)
      const newOrder = await tx.order.create({
        data: {
          userId,
          totalAmount: parseFloat(totalAmount.toFixed(2)),
          address: address.trim(),
          phone: phone.trim(),
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              shopId: item.product.shopId,
              quantity: item.quantity,
              price: item.product.price,
              status: 'PENDING',
            })),
          },
        },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, images: true, price: true },
              },
              shop: {
                select: { id: true, name: true, logo: true },
              },
            },
          },
        },
      });

      // 6. Clear user's CartItems
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return newOrder;
    });

    return sendSuccess(res, 201, 'Order placed successfully', { order: result });
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.statusCode, error.message);
    }
    console.error('Error in createOrder controller:', error);
    return sendError(res, 500, 'Failed to place order', error.message);
  }
};

/**
 * Get all orders placed by the current customer
 * GET /api/v1/orders/my-orders (Customer only)
 */
const getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, images: true },
            },
            shop: {
              select: { id: true, name: true, logo: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 200, 'Orders retrieved successfully', { orders });
  } catch (error) {
    console.error('Error in getMyOrders controller:', error);
    return sendError(res, 500, 'Failed to retrieve orders', error.message);
  }
};

/**
 * Get orders relevant to the current vendor (vendor isolation)
 * GET /api/v1/orders/vendor-orders (Vendor only)
 */
const getVendorOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const vendorShop = await prisma.shop.findUnique({
      where: { ownerId: userId },
    });

    if (!vendorShop) {
      return sendError(res, 403, 'You do not own a shop');
    }

    // Return ONLY order items belonging to this vendor's shop
    const orderItems = await prisma.orderItem.findMany({
      where: { shopId: vendorShop.id },
      include: {
        order: {
          select: {
            id: true,
            address: true,
            phone: true,
            createdAt: true,
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        product: {
          select: { id: true, name: true, images: true, price: true },
        },
      },
      orderBy: { id: 'desc' },
    });

    return sendSuccess(res, 200, 'Vendor order items retrieved successfully', {
      shopId: vendorShop.id,
      shopName: vendorShop.name,
      orderItems,
    });
  } catch (error) {
    console.error('Error in getVendorOrders controller:', error);
    return sendError(res, 500, 'Failed to retrieve vendor orders', error.message);
  }
};

/**
 * Update the status of an individual order item
 * PATCH /api/v1/orders/items/:itemId/status (Vendor only)
 */
const updateOrderItemStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    const { status } = req.body;

    if (!status || !VALID_ORDER_STATUSES.includes(status.toUpperCase())) {
      return sendError(
        res,
        400,
        `Invalid status. Allowed values: ${VALID_ORDER_STATUSES.join(', ')}`
      );
    }

    const normalizedStatus = status.toUpperCase();

    // Check if order item exists
    const orderItem = await prisma.orderItem.findUnique({
      where: { id: itemId },
    });

    if (!orderItem) {
      return sendError(res, 404, 'Order item not found');
    }

    // Strict Ownership Check: only the vendor who owns this shop can update status
    const vendorShop = await prisma.shop.findUnique({
      where: { ownerId: userId },
    });

    if (!vendorShop || orderItem.shopId !== vendorShop.id) {
      return sendError(
        res,
        403,
        'Access denied. You do not have permission to manage this order item.'
      );
    }

    const updatedItem = await prisma.orderItem.update({
      where: { id: itemId },
      data: { status: normalizedStatus },
      include: {
        product: {
          select: { id: true, name: true },
        },
        shop: {
          select: { id: true, name: true },
        },
      },
    });

    return sendSuccess(res, 200, 'Order item status updated successfully', {
      orderItem: updatedItem,
    });
  } catch (error) {
    console.error('Error in updateOrderItemStatus controller:', error);
    return sendError(res, 500, 'Failed to update order item status', error.message);
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getVendorOrders,
  updateOrderItemStatus,
};
