const express = require('express');
const router = express.Router();
const { answerQuestion } = require('../controllers/question.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

// Vendor answers a product question
router.patch('/:id/answer', verifyToken, checkRole(['VENDOR', 'ADMIN']), answerQuestion);

module.exports = router;
