const express = require('express');
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getVendorOrders,
  updateOrderItemStatus,
} = require('../controllers/order.controller');
const {
  addTrackingEvent,
  getTrackingTimeline,
} = require('../controllers/return-tracking.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

// Customer order routes
router.post('/', verifyToken, checkRole(['CUSTOMER', 'ADMIN']), createOrder);
router.get('/my-orders', verifyToken, checkRole(['CUSTOMER', 'ADMIN']), getMyOrders);

// Vendor order routes
router.get('/vendor-orders', verifyToken, checkRole(['VENDOR', 'ADMIN']), getVendorOrders);
router.patch('/items/:itemId/status', verifyToken, checkRole(['VENDOR', 'ADMIN']), updateOrderItemStatus);

// Courier Tracking Timeline
router.post('/items/:itemId/tracking', verifyToken, checkRole(['VENDOR', 'ADMIN']), addTrackingEvent);
router.get('/items/:itemId/tracking', verifyToken, getTrackingTimeline);

module.exports = router;
