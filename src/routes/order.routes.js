const express = require('express');
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getVendorOrders,
  updateOrderItemStatus,
} = require('../controllers/order.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

// Customer order routes
router.post('/', verifyToken, checkRole(['CUSTOMER', 'ADMIN']), createOrder);
router.get('/my-orders', verifyToken, checkRole(['CUSTOMER', 'ADMIN']), getMyOrders);

// Vendor order routes
router.get('/vendor-orders', verifyToken, checkRole(['VENDOR', 'ADMIN']), getVendorOrders);
router.patch('/items/:itemId/status', verifyToken, checkRole(['VENDOR', 'ADMIN']), updateOrderItemStatus);

module.exports = router;
