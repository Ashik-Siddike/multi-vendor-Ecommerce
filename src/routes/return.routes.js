const express = require('express');
const router = express.Router();
const {
  requestReturn,
  getMyReturns,
  vendorProcessReturn,
  escalateReturnDispute,
} = require('../controllers/return-tracking.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

router.post('/', verifyToken, checkRole(['CUSTOMER']), requestReturn);
router.get('/my-returns', verifyToken, checkRole(['CUSTOMER']), getMyReturns);
router.patch('/:id/dispute', verifyToken, checkRole(['CUSTOMER']), escalateReturnDispute);
router.patch('/:id/vendor', verifyToken, checkRole(['VENDOR', 'ADMIN']), vendorProcessReturn);

module.exports = router;
