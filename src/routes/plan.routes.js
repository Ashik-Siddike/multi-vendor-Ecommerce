const express = require('express');
const router = express.Router();
const { getAllPlans } = require('../controllers/saas.controller');

router.get('/', getAllPlans);

module.exports = router;
