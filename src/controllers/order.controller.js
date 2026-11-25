const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');
const { createNotification } = require('../utils/notify');
const { settleEligibleOrderItems } = require('../utils/settlement');
const { dispatchShopWebhook } = require('../utils/webhook');

const VALID_ORDER_STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const VALID_PAYMENT_METHODS = ['COD', 'MANUAL_BKASH', 'MANUAL_NAGAD', 'BANK_TRANSFER'];
const VALID_PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED'];
const VALID_ZONES = ['INSIDE_CITY', 'OUTSIDE_CITY'];

const SHIPPING_RATES = {
  INSIDE_CITY: 60,
  OUTSIDE_CITY: 120,
};
const FREE_SHIPPING_THRESHOLD = 2000;

/**
 * Place a multi-vendor order from active cart
 * POST /api/v1/orders (Customer only)
 */
const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      addressId = null,
      address,
      phone,
      shippingZone = null,
      paymentMethod = 'COD',
      transactionId = null,
      couponCode = null,
    } = req.body;

    let finalAddress = address;
    let finalPhone = phone;
    let finalZone = 'INSIDE_CITY';
    let applyShippingFee = false;

    // Resolve saved Address if addressId is provided
    if (addressId) {
      const savedAddress = await prisma.address.findUnique({
        where: { id: addressId },
      });
      if (!savedAddress || savedAddress.userId !== userId) {
        return sendError(res, 404, 'Saved address not found');
      }
      finalAddress = `${savedAddress.fullName}, ${savedAddress.street}, ${savedAddress.city}`;
      finalPhone = savedAddress.phone;
      finalZone = savedAddress.zone;
      applyShippingFee = true;
    } else {
      if (!finalAddress || typeof finalAddress !== 'string' || !finalAddress.trim()) {
        return sendError(res, 400, 'Shipping address is required');
      }
      if (!finalPhone || typeof finalPhone !== 'string' || !finalPhone.trim()) {
        return sendError(res, 400, 'Contact phone number is required');
      }
      if (shippingZone) {
        const upperZone = shippingZone.toUpperCase();
        if (!VALID_ZONES.includes(upperZone)) {
          return sendError(res, 400, `Invalid shippingZone. Allowed: ${VALID_ZONES.join(', ')}`);
        }
        finalZone = upperZone;
        applyShippingFee = true;
      }
    }

    const normalizedPaymentMethod = paymentMethod.toUpperCase();
    if (!VALID_PAYMENT_METHODS.includes(normalizedPaymentMethod)) {
      return sendError(
        res,
        400,
        `Invalid paymentMethod. Allowed: ${VALID_PAYMENT_METHODS.join(', ')}`
      );
    }

    // Require transactionId if not Cash On Delivery
    if (normalizedPaymentMethod !== 'COD') {
      if (!transactionId || typeof transactionId !== 'string' || !transactionId.trim()) {
        return sendError(
          res,
          400,
          `transactionId is required for manual payment method: ${normalizedPaymentMethod}`
        );
      }
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
                  shop: { select: { isApproved: true, ownerId: true } },
                },
              },
              variant: true,
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

        const stockToCheck = item.variant ? item.variant.stock : item.product.stock;
        if (stockToCheck < item.quantity) {
          throw {
            statusCode: 400,
            message: `Insufficient stock for "${item.product.name}". Available: ${stockToCheck}, in cart: ${item.quantity}.`,
          };
        }
      }

      // 3. Deduct stock for each product/variant & trigger low-stock alert if stock <= 5
      for (const item of cart.items) {
        if (item.variant) {
          await tx.productVariant.update({
            where: { id: item.variant.id },
            data: { stock: { decrement: item.quantity } },
          });
        } else {
          const updatedProduct = await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });

          if (updatedProduct.stock <= 5) {
            await createNotification(
              {
                userId: item.product.shop.ownerId,
                title: 'Low Stock Alert',
                message: `Product "${item.product.name}" is running low on stock (${updatedProduct.stock} remaining).`,
                type: 'LOW_STOCK',
              },
              tx
            );
          }
        }
      }

      // 4. Calculate subtotal & optional Coupon Discount
      const subtotal = cart.items.reduce((sum, item) => {
        const unitPrice = item.variant ? item.variant.price : item.product.price;
        return sum + item.quantity * unitPrice;
      }, 0);

      let discountAmount = 0;
      if (couponCode && typeof couponCode === 'string' && couponCode.trim()) {
        const coupon = await tx.coupon.findUnique({
          where: { code: couponCode.trim().toUpperCase() },
        });

        if (coupon && coupon.isActive && new Date(coupon.expiryDate) >= new Date()) {
          if (subtotal >= coupon.minOrderValue) {
            if (coupon.discountType === 'PERCENTAGE') {
              discountAmount = (subtotal * coupon.discountValue) / 100;
              if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
                discountAmount = coupon.maxDiscount;
              }
            } else {
              discountAmount = Math.min(subtotal, coupon.discountValue);
            }
          }
        }
      }

      // Dynamic Shipping Fee calculation
      let shippingFee = 0;
      if (applyShippingFee) {
        shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_RATES[finalZone];
      }

      const finalTotal = Math.max(0, subtotal - discountAmount + shippingFee);

      // 5. Create Order and OrderItems (multi-vendor split)
      const newOrder = await tx.order.create({
        data: {
          userId,
          totalAmount: parseFloat(finalTotal.toFixed(2)),
          shippingFee,
          shippingZone: finalZone,
          address: finalAddress.trim(),
          phone: finalPhone.trim(),
          paymentMethod: normalizedPaymentMethod,
          paymentStatus: 'PENDING',
          transactionId: transactionId ? transactionId.trim() : null,
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId || null,
              shopId: item.product.shopId,
              quantity: item.quantity,
              price: item.variant ? item.variant.price : item.product.price,
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

      // 7. Notify Customer
      await createNotification(
        {
          userId,
          title: 'Order Placed',
          message: `Your order #${newOrder.id.slice(0, 8)} for $${newOrder.totalAmount} has been placed successfully.`,
          type: 'ORDER_UPDATE',
        },
        tx
      );

      return newOrder;
    });

    // Dispatch order.created webhook per affected shop (non-blocking)
    const shopIds = [...new Set(result.items.map((i) => i.shopId))];
    for (const sId of shopIds) {
      dispatchShopWebhook(sId, 'order.created', {
        orderId: result.id,
        items: result.items.filter((i) => i.shopId === sId),
      }).catch(() => {});
    }

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
            paymentMethod: true,
            paymentStatus: true,
            transactionId: true,
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
      include: {
        order: true,
        product: { select: { name: true } },
      },
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

    const updatedItem = await prisma.$transaction(async (tx) => {
      const updated = await tx.orderItem.update({
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

      // Notify customer of status update
      await createNotification(
        {
          userId: orderItem.order.userId,
          title: `Order Item ${normalizedStatus}`,
          message: `Your item "${orderItem.product.name}" status has been updated to ${normalizedStatus}.`,
          type: 'ORDER_UPDATE',
        },
        tx
      );

      // If marked DELIVERED and paymentMethod is COD, update order paymentStatus to PAID
      if (normalizedStatus === 'DELIVERED' && orderItem.order.paymentMethod === 'COD') {
        await tx.order.update({
          where: { id: orderItem.orderId },
          data: { paymentStatus: 'PAID' },
        });
      }

      // Settle eligible delivered & paid items into vendor wallet
      if (normalizedStatus === 'DELIVERED') {
        await settleEligibleOrderItems(orderItem.orderId, tx);
      }

      return updated;
    });

    return sendSuccess(res, 200, 'Order item status updated successfully', {
      orderItem: updatedItem,
    });
  } catch (error) {
    console.error('Error in updateOrderItemStatus controller:', error);
    return sendError(res, 500, 'Failed to update order item status', error.message);
  }
};

/**
 * Admin verify manual mobile/bank payment
 * PATCH /api/v1/admin/orders/:orderId/verify-payment (Admin only)
 */
const verifyOrderPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentStatus } = req.body;

    if (!paymentStatus || !VALID_PAYMENT_STATUSES.includes(paymentStatus.toUpperCase())) {
      return sendError(
        res,
        400,
        `Invalid paymentStatus. Allowed values: ${VALID_PAYMENT_STATUSES.join(', ')}`
      );
    }

    const normalizedStatus = paymentStatus.toUpperCase();

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return sendError(res, 404, 'Order not found');
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: normalizedStatus },
      });

      await createNotification(
        {
          userId: order.userId,
          title: `Payment ${normalizedStatus}`,
          message: `Payment verification for your order #${orderId.slice(0, 8)} is now ${normalizedStatus}.`,
          type: 'ORDER_UPDATE',
        },
        tx
      );

      // Settle any already-delivered items now that payment is PAID
      if (normalizedStatus === 'PAID') {
        await settleEligibleOrderItems(orderId, tx);
      }

      return updated;
    });

    return sendSuccess(res, 200, `Order payment status updated to ${normalizedStatus}`, {
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Error in verifyOrderPayment:', error);
    return sendError(res, 500, 'Failed to verify payment', error.message);
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getVendorOrders,
  updateOrderItemStatus,
  verifyOrderPayment,
};
