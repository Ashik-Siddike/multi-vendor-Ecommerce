const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');
const { createNotification } = require('../utils/notify');
const { recordAuditLog } = require('../utils/audit');

/**
 * Customer: Request a return/refund for a delivered order item
 * POST /api/v1/returns (Customer only)
 */
const requestReturn = async (req, res) => {
  try {
    const { orderItemId, reason, images = [] } = req.body;

    if (!orderItemId || !reason || typeof reason !== 'string' || !reason.trim()) {
      return sendError(res, 400, 'orderItemId and reason are required');
    }

    const orderItem = await prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: { order: true, shop: true, product: { select: { name: true } } },
    });

    if (!orderItem) {
      return sendError(res, 404, 'Order item not found');
    }
    if (orderItem.order.userId !== req.user.id) {
      return sendError(res, 403, 'Forbidden: You can only request returns for your own orders');
    }
    if (orderItem.status !== 'DELIVERED') {
      return sendError(res, 400, 'Only DELIVERED items are eligible for return requests');
    }

    const existing = await prisma.returnRequest.findFirst({
      where: { orderItemId, status: { notIn: ['CLOSED'] } },
    });
    if (existing) {
      return sendError(res, 409, 'A return request already exists for this order item');
    }

    const refundAmount = parseFloat((orderItem.price * orderItem.quantity).toFixed(2));

    const returnReq = await prisma.returnRequest.create({
      data: {
        orderItemId,
        userId: req.user.id,
        reason: reason.trim(),
        images: Array.isArray(images) ? images : [],
        refundAmount,
        status: 'REQUESTED',
      },
    });

    await createNotification({
      userId: orderItem.shop.ownerId,
      title: 'New Return Request',
      message: `Customer requested a return for "${orderItem.product.name}". Reason: ${reason.trim()}`,
      type: 'ORDER_UPDATE',
    });

    return sendSuccess(res, 201, 'Return request submitted successfully', { returnRequest: returnReq });
  } catch (error) {
    console.error('Error requesting return:', error);
    return sendError(res, 500, 'Failed to submit return request');
  }
};

/**
 * Customer: Get my return requests
 * GET /api/v1/returns/my-returns
 */
const getMyReturns = async (req, res) => {
  try {
    const returns = await prisma.returnRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        orderItem: {
          include: {
            product: { select: { id: true, name: true, images: true } },
            shop: { select: { id: true, name: true } },
          },
        },
      },
    });
    return sendSuccess(res, 200, 'Return requests retrieved successfully', { returns });
  } catch (error) {
    console.error('Error fetching returns:', error);
    return sendError(res, 500, 'Failed to fetch return requests');
  }
};

/**
 * Vendor: Approve or Reject a return request (Strict Shop Ownership)
 * PATCH /api/v1/returns/:id/vendor
 */
const vendorProcessReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, vendorNote } = req.body;

    if (!status || !['VENDOR_APPROVED', 'VENDOR_REJECTED'].includes(status.toUpperCase())) {
      return sendError(res, 400, 'status must be VENDOR_APPROVED or VENDOR_REJECTED');
    }

    const normalizedStatus = status.toUpperCase();
    const returnReq = await prisma.returnRequest.findUnique({
      where: { id },
      include: {
        orderItem: { include: { shop: true, product: true } },
      },
    });

    if (!returnReq) {
      return sendError(res, 404, 'Return request not found');
    }
    if (returnReq.orderItem.shop.ownerId !== req.user.id) {
      return sendError(res, 403, 'Forbidden: Only the owning vendor can process this return');
    }
    if (returnReq.status !== 'REQUESTED') {
      return sendError(res, 400, `Return request is already ${returnReq.status}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const finalStatus = normalizedStatus === 'VENDOR_APPROVED' ? 'REFUNDED' : 'VENDOR_REJECTED';

      const upd = await tx.returnRequest.update({
        where: { id },
        data: {
          status: finalStatus,
          vendorNote: vendorNote ? vendorNote.trim() : null,
        },
      });

      // If approved & refunded, restore product stock and adjust wallet if settled
      if (finalStatus === 'REFUNDED') {
        await tx.product.update({
          where: { id: returnReq.orderItem.productId },
          data: { stock: { increment: returnReq.orderItem.quantity } },
        });

        if (returnReq.orderItem.isSettled && returnReq.orderItem.vendorEarning > 0) {
          await tx.shop.update({
            where: { id: returnReq.orderItem.shopId },
            data: {
              walletBalance: { decrement: returnReq.orderItem.vendorEarning },
            },
          });
        }
      }

      await createNotification(
        {
          userId: returnReq.userId,
          title: `Return Request ${finalStatus}`,
          message:
            finalStatus === 'REFUNDED'
              ? `Your return for "${returnReq.orderItem.product.name}" was approved ($${returnReq.refundAmount} refunded).`
              : `Your return for "${returnReq.orderItem.product.name}" was rejected by the vendor. You may escalate to Admin Dispute.`,
          type: 'ORDER_UPDATE',
        },
        tx
      );

      await recordAuditLog(
        {
          actorId: req.user.id,
          action: `RETURN_${finalStatus}`,
          entity: 'ReturnRequest',
          entityId: id,
          details: { orderItemId: returnReq.orderItemId, refundAmount: returnReq.refundAmount },
          req,
        },
        tx
      );

      return upd;
    });

    return sendSuccess(res, 200, `Return request processed (${updated.status})`, { returnRequest: updated });
  } catch (error) {
    console.error('Error processing return:', error);
    return sendError(res, 500, 'Failed to process return request');
  }
};

/**
 * Customer: Escalate rejected return to Admin Dispute
 * PATCH /api/v1/returns/:id/dispute
 */
const escalateReturnDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const returnReq = await prisma.returnRequest.findUnique({ where: { id } });

    if (!returnReq) {
      return sendError(res, 404, 'Return request not found');
    }
    if (returnReq.userId !== req.user.id) {
      return sendError(res, 403, 'Forbidden');
    }
    if (returnReq.status !== 'VENDOR_REJECTED') {
      return sendError(res, 400, 'Only VENDOR_REJECTED returns can be escalated to DISPUTED');
    }

    const updated = await prisma.returnRequest.update({
      where: { id },
      data: { status: 'DISPUTED' },
    });

    return sendSuccess(res, 200, 'Return escalated to Admin Dispute successfully', { returnRequest: updated });
  } catch (error) {
    console.error('Error escalating dispute:', error);
    return sendError(res, 500, 'Failed to escalate dispute');
  }
};

/**
 * Admin: Resolve a disputed return request
 * PATCH /api/v1/admin/returns/:id
 */
const adminResolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    if (!status || !['REFUNDED', 'CLOSED'].includes(status.toUpperCase())) {
      return sendError(res, 400, 'status must be REFUNDED or CLOSED');
    }

    const normalizedStatus = status.toUpperCase();
    const returnReq = await prisma.returnRequest.findUnique({
      where: { id },
      include: { orderItem: { include: { product: true } } },
    });

    if (!returnReq) {
      return sendError(res, 404, 'Return request not found');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.returnRequest.update({
        where: { id },
        data: {
          status: normalizedStatus,
          adminNote: adminNote ? adminNote.trim() : null,
        },
      });

      if (normalizedStatus === 'REFUNDED' && returnReq.status !== 'REFUNDED') {
        await tx.product.update({
          where: { id: returnReq.orderItem.productId },
          data: { stock: { increment: returnReq.orderItem.quantity } },
        });
        if (returnReq.orderItem.isSettled && returnReq.orderItem.vendorEarning > 0) {
          await tx.shop.update({
            where: { id: returnReq.orderItem.shopId },
            data: { walletBalance: { decrement: returnReq.orderItem.vendorEarning } },
          });
        }
      }

      await createNotification(
        {
          userId: returnReq.userId,
          title: `Dispute Resolved: ${normalizedStatus}`,
          message: `Admin resolved your return dispute for "${returnReq.orderItem.product.name}" as ${normalizedStatus}.`,
          type: 'ORDER_UPDATE',
        },
        tx
      );

      await recordAuditLog(
        {
          actorId: req.user.id,
          action: `ADMIN_DISPUTE_${normalizedStatus}`,
          entity: 'ReturnRequest',
          entityId: id,
          details: { adminNote },
          req,
        },
        tx
      );

      return upd;
    });

    return sendSuccess(res, 200, `Dispute resolved as ${normalizedStatus}`, { returnRequest: updated });
  } catch (error) {
    console.error('Error resolving dispute:', error);
    return sendError(res, 500, 'Failed to resolve dispute');
  }
};

/**
 * Vendor: Add courier tracking event to an order item
 * POST /api/v1/orders/items/:itemId/tracking
 */
const addTrackingEvent = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { status, courierName, trackingNumber, note } = req.body;

    if (!status || typeof status !== 'string') {
      return sendError(res, 400, 'Tracking status is required (e.g., PACKED, HANDED_TO_COURIER)');
    }

    const orderItem = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { shop: true, order: true },
    });

    if (!orderItem) {
      return sendError(res, 404, 'Order item not found');
    }
    if (orderItem.shop.ownerId !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 403, 'Forbidden: You do not own this order item');
    }

    const event = await prisma.orderTrackingEvent.create({
      data: {
        orderItemId: itemId,
        status: status.trim().toUpperCase(),
        courierName: courierName ? courierName.trim() : null,
        trackingNumber: trackingNumber ? trackingNumber.trim() : null,
        note: note ? note.trim() : null,
      },
    });

    await createNotification({
      userId: orderItem.order.userId,
      title: `Shipment Update: ${event.status}`,
      message: courierName
        ? `Courier: ${courierName} (${trackingNumber || 'N/A'}) - ${event.status}`
        : `Your shipment status is now ${event.status}.`,
      type: 'ORDER_UPDATE',
    });

    return sendSuccess(res, 201, 'Tracking event added successfully', { trackingEvent: event });
  } catch (error) {
    console.error('Error adding tracking event:', error);
    return sendError(res, 500, 'Failed to add tracking event');
  }
};

/**
 * Get courier tracking timeline for an order item
 * GET /api/v1/orders/items/:itemId/tracking
 */
const getTrackingTimeline = async (req, res) => {
  try {
    const { itemId } = req.params;
    const orderItem = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: {
        order: { select: { userId: true } },
        shop: { select: { ownerId: true } },
        trackingEvents: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!orderItem) {
      return sendError(res, 404, 'Order item not found');
    }

    const isAllowed =
      req.user.role === 'ADMIN' ||
      orderItem.order.userId === req.user.id ||
      orderItem.shop.ownerId === req.user.id;

    if (!isAllowed) {
      return sendError(res, 403, 'Forbidden');
    }

    return sendSuccess(res, 200, 'Tracking timeline retrieved successfully', {
      orderItemId: itemId,
      currentStatus: orderItem.status,
      timeline: orderItem.trackingEvents,
    });
  } catch (error) {
    console.error('Error fetching tracking timeline:', error);
    return sendError(res, 500, 'Failed to fetch tracking timeline');
  }
};

/**
 * Vendor: Export vendor orders as CSV
 * GET /api/v1/vendor/orders/export-csv
 */
const exportVendorOrdersCsv = async (req, res) => {
  try {
    const shop = await prisma.shop.findUnique({ where: { ownerId: req.user.id } });
    if (!shop) {
      return sendError(res, 404, 'Shop not found');
    }

    const items = await prisma.orderItem.findMany({
      where: { shopId: shop.id },
      include: {
        product: { select: { name: true } },
        order: {
          select: {
            id: true,
            paymentMethod: true,
            paymentStatus: true,
            address: true,
            phone: true,
            createdAt: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    const header = 'OrderItemID,OrderID,Product,Quantity,UnitPrice,Status,PaymentMethod,PaymentStatus,Phone,CreatedAt\n';
    const rows = items
      .map((item) => {
        const safeName = `"${(item.product?.name || '').replace(/"/g, '""')}"`;
        return [
          item.id,
          item.orderId,
          safeName,
          item.quantity,
          item.price,
          item.status,
          item.order.paymentMethod,
          item.order.paymentStatus,
          `"${item.order.phone}"`,
          item.order.createdAt.toISOString(),
        ].join(',');
      })
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vendor-orders.csv"');
    return res.status(200).send(header + rows);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    return sendError(res, 500, 'Failed to export vendor orders CSV');
  }
};

module.exports = {
  requestReturn,
  getMyReturns,
  vendorProcessReturn,
  escalateReturnDispute,
  adminResolveDispute,
  addTrackingEvent,
  getTrackingTimeline,
  exportVendorOrdersCsv,
};
