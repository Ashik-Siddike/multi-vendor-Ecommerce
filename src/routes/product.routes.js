const express = require('express');
const router = express.Router();
const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require('../controllers/product.controller');
const {
  createProductReview,
  getProductReviews,
} = require('../controllers/review.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');
const { uploadProductImages } = require('../middlewares/upload.middleware');

// Public routes
router.get('/', getAllProducts);
router.get('/:id', getProductById);
router.get('/:productId/reviews', getProductReviews);

// Customer Review route (Verified Purchase required)
router.post('/:productId/reviews', verifyToken, checkRole(['CUSTOMER']), createProductReview);

// Vendor-protected routes
router.post('/', verifyToken, checkRole(['VENDOR', 'ADMIN']), uploadProductImages, createProduct);
router.patch('/:id', verifyToken, checkRole(['VENDOR', 'ADMIN']), uploadProductImages, updateProduct);
router.delete('/:id', verifyToken, checkRole(['VENDOR', 'ADMIN']), deleteProduct);

module.exports = router;
