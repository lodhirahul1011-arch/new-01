const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const controller = require('../controllers/home.controller');

const router = express.Router();
router.get('/dashboard', requireAuth, controller.dashboard);
router.get('/activity', requireAuth, controller.activity);
router.get('/device-status', requireAuth, controller.deviceStatus);
module.exports = router;
