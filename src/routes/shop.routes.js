const express = require('express');
const router = express.Router();
const {
  createShop,
  getAllApprovedShops,
  getApprovedShopById,
  getMyShop,
  updateMyShop,
} = require('../controllers/shop.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

// Public routes
router.get('/', getAllApprovedShops);

// Specific named routes MUST be declared before parameterized route /:id
router.get('/my-shop', verifyToken, getMyShop);
router.patch('/my-shop', verifyToken, checkRole(['VENDOR', 'ADMIN']), updateMyShop);

// Single approved shop by ID
router.get('/:id', getApprovedShopById);

// Logged-in Customer requests to open a shop
router.post('/', verifyToken, createShop);

module.exports = router;
