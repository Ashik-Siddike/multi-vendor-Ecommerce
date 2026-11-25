const express = require('express');
const router = express.Router();
const { getMyReviews, deleteReview } = require('../controllers/review.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// Customer get own reviews
router.get('/my-reviews', verifyToken, getMyReviews);

// Customer or Admin delete review
router.delete('/:id', verifyToken, deleteReview);

module.exports = router;
