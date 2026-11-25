const express = require('express');
const router = express.Router();
const {
  createCoupon,
  applyCoupon,
  getCoupons,
  deleteCoupon,
} = require('../controllers/coupon.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

// Public active coupons list
router.get('/', getCoupons);

// Apply coupon (Customer or Guest)
router.post('/apply', applyCoupon);

// Create coupon (Admin for platform-wide, Vendor for shop-specific)
router.post('/', verifyToken, checkRole(['ADMIN', 'VENDOR']), createCoupon);

// Delete coupon
router.delete('/:id', verifyToken, checkRole(['ADMIN', 'VENDOR']), deleteCoupon);

module.exports = router;
