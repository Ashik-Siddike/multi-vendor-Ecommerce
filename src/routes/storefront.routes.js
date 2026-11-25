const express = require('express');
const router = express.Router();
const { getStorefrontBySlug } = require('../controllers/saas.controller');

router.get('/:slug', getStorefrontBySlug);

module.exports = router;
