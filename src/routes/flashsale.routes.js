const express = require('express');
const router = express.Router();
const { createFlashSale, getActiveFlashSales } = require('../controllers/variant-flashsale.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

router.get('/', getActiveFlashSales);
router.post('/', verifyToken, checkRole(['VENDOR', 'ADMIN']), createFlashSale);

module.exports = router;
