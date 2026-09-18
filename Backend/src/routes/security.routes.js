const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const controller = require('../controllers/security.controller');

const router = express.Router();
router.get('/overview', requireAuth, controller.overview);
router.get('/events', requireAuth, controller.events);
router.get('/events/:id', requireAuth, controller.getEvent);
router.get('/recordings', requireAuth, controller.recordings);
router.get('/recordings/:id', requireAuth, controller.getRecording);
module.exports = router;
