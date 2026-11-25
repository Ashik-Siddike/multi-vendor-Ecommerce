const express = require('express');
const router = express.Router();
const {
  getWishlist,
  toggleWishlistItem,
  removeWishlistItem,
} = require('../controllers/wishlist.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

// All wishlist routes require authenticated CUSTOMER
router.use(verifyToken, checkRole(['CUSTOMER']));

router.get('/', getWishlist);
router.post('/:productId', toggleWishlistItem);
router.delete('/:productId', removeWishlistItem);

module.exports = router;
