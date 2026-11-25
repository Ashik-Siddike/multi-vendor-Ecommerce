const express = require('express');
const router = express.Router();
const {
  getPendingShops,
  approveShop,
  getDashboardStats,
} = require('../controllers/admin.controller');
const { verifyOrderPayment } = require('../controllers/order.controller');
const {
  getAllPayoutRequests,
  processPayoutRequest,
  updateShopCommission,
} = require('../controllers/vendor.controller');
const { adminResolveDispute } = require('../controllers/return-tracking.controller');
const { getAuditLogs } = require('../controllers/staff-audit.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

// All admin routes require ADMIN role
router.use(verifyToken, checkRole('ADMIN'));

// Dashboard stats endpoint
router.get('/dashboard-stats', getDashboardStats);

// Manual payment verification endpoint
router.patch('/orders/:orderId/verify-payment', verifyOrderPayment);

// Vendor Payouts & Commission Management
router.get('/payouts', getAllPayoutRequests);
router.patch('/payouts/:id', processPayoutRequest);
router.patch('/shops/:id/commission', updateShopCommission);

// Return Dispute & Audit Logs
router.patch('/returns/:id', adminResolveDispute);
router.get('/audit-logs', getAuditLogs);

// Shop management endpoints under /admin
router.get('/shops/pending', getPendingShops);
router.patch('/shops/:id/approve', approveShop);

// Backward-compatibility endpoints when router is mounted directly at /api/v1/admin/shops
router.get('/pending', getPendingShops);
router.patch('/:id/approve', approveShop);

module.exports = router;
