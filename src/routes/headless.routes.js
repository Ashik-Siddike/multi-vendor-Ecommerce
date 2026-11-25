const express = require('express');
const router = express.Router();
const { getHeadlessProducts } = require('../controllers/developer.controller');
const { verifyApiKey } = require('../middlewares/apiKey.middleware');

router.use(verifyApiKey);
router.get('/products', getHeadlessProducts);

module.exports = router;
