const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { validateBody } = require('../middleware/validateZod');
const controller = require('../controllers/notifications.controller');
const { notificationSettingsSchema } = require('../schemas/settings.schemas');

const router = express.Router();
router.get('/', requireAuth, controller.getAll);
router.get('/simple-mode', requireAuth, controller.getAll);
router.put('/', requireAuth, validateBody(notificationSettingsSchema), controller.update);
router.post('/test', requireAuth, controller.test);
module.exports = router;
