const express = require('express');
const router = express.Router();
const {
  getCart,
  addItemToCart,
  updateCartItem,
  deleteCartItem,
} = require('../controllers/cart.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

// All cart routes require CUSTOMER or ADMIN role
router.use(verifyToken, checkRole(['CUSTOMER', 'ADMIN']));

router.get('/', getCart);
router.post('/items', addItemToCart);
router.patch('/items/:itemId', updateCartItem);
router.delete('/items/:itemId', deleteCartItem);

module.exports = router;
