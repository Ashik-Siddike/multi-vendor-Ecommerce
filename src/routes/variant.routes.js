const express = require('express');
const router = express.Router();
const { updateVariant, deleteVariant } = require('../controllers/variant-flashsale.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

router.patch('/:id', verifyToken, checkRole(['VENDOR', 'ADMIN']), updateVariant);
router.delete('/:id', verifyToken, checkRole(['VENDOR', 'ADMIN']), deleteVariant);

module.exports = router;
