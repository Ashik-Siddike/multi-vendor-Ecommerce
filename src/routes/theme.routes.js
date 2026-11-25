const express = require('express');
const router = express.Router();
const { getAllThemes, createTheme } = require('../controllers/saas.controller');
const { verifyToken, checkRole } = require('../middlewares/auth.middleware');

router.get('/', getAllThemes);
router.post('/', verifyToken, checkRole(['ADMIN']), createTheme);

module.exports = router;
