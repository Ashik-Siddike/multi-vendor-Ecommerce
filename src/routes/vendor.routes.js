const express = require('express');
const router = express.Router();
const {
  getVendorWallet,
  requestPayout,
  getVendorAnalytics,
} = require('../controllers/vendor.controller');
const {
  updateVendorTheme,
  upgradeSubscription,
} = require('../controllers/saas.controller');
const { exportVendorOrdersCsv } = require('../controllers/return-tracking.controller');
const {
  addShopStaff,
  getShopStaff,
  removeShopStaff,
} = require('../controllers/staff-audit.controller');
const {
  generateApiKey,
  getApiKeys,
  revokeApiKey,
  createWebhook,
  getWebhooks,
  deleteWebhook,
} = require('../controllers/developer.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

// All vendor routes require VENDOR role
router.use(verifyToken, checkRole(['VENDOR', 'ADMIN']));

router.get('/wallet', getVendorWallet);
router.post('/payouts', requestPayout);
router.get('/analytics', getVendorAnalytics);
router.patch('/theme', updateVendorTheme);
router.post('/subscription/upgrade', upgradeSubscription);
router.get('/orders/export-csv', exportVendorOrdersCsv);
router.get('/staff', getShopStaff);
router.post('/staff', addShopStaff);
router.delete('/staff/:staffId', removeShopStaff);
router.get('/api-keys', getApiKeys);
router.post('/api-keys', generateApiKey);
router.delete('/api-keys/:id', revokeApiKey);
router.get('/webhooks', getWebhooks);
router.post('/webhooks', createWebhook);
router.delete('/webhooks/:id', deleteWebhook);

module.exports = router;
