const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../controllers/auth.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

// Public routes
router.post('/register', register);
router.post('/login', login);

// Authenticated routes
router.get('/me', verifyToken, getMe);

// Role-protected routes (demonstrating checkRole middleware)
router.get('/vendor-only', verifyToken, checkRole(['VENDOR', 'ADMIN']), (req, res) => {
  res.json({
    success: true,
    message: 'Access granted to Vendor / Admin area',
    user: req.user,
  });
});

router.get('/admin-only', verifyToken, checkRole('ADMIN'), (req, res) => {
  res.json({
    success: true,
    message: 'Access granted to Admin area',
    user: req.user,
  });
});

module.exports = router;
