const express = require('express');
const router = express.Router();
const { createCategory, getAllCategories } = require('../controllers/category.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

// Public route
router.get('/', getAllCategories);

// Admin-only route
router.post('/', verifyToken, checkRole('ADMIN'), createCategory);

module.exports = router;
