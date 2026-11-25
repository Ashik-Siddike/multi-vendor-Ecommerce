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
const {
  askQuestion,
  getProductQuestions,
} = require('../controllers/question.controller');
const {
  createVariant,
  getProductVariants,
} = require('../controllers/variant-flashsale.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');
const { uploadProductImages } = require('../middlewares/upload.middleware');

// Public routes
router.get('/', getAllProducts);
router.get('/:id', getProductById);
router.get('/:productId/reviews', getProductReviews);
router.get('/:productId/questions', getProductQuestions);
router.get('/:productId/variants', getProductVariants);

// Customer Review & Q&A routes
router.post('/:productId/reviews', verifyToken, checkRole(['CUSTOMER']), createProductReview);
router.post('/:productId/questions', verifyToken, checkRole(['CUSTOMER']), askQuestion);

// Vendor Variant route
router.post('/:productId/variants', verifyToken, checkRole(['VENDOR', 'ADMIN']), createVariant);

// Vendor-protected routes
router.post('/', verifyToken, checkRole(['VENDOR', 'ADMIN']), uploadProductImages, createProduct);
router.patch('/:id', verifyToken, checkRole(['VENDOR', 'ADMIN']), uploadProductImages, updateProduct);
router.delete('/:id', verifyToken, checkRole(['VENDOR', 'ADMIN']), deleteProduct);

module.exports = router;
