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
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

// All vendor routes require VENDOR role
router.use(verifyToken, checkRole(['VENDOR', 'ADMIN']));

router.get('/wallet', getVendorWallet);
router.post('/payouts', requestPayout);
router.get('/analytics', getVendorAnalytics);
router.patch('/theme', updateVendorTheme);
router.post('/subscription/upgrade', upgradeSubscription);

module.exports = router;
