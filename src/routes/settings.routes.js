const express = require('express');

const requireAuth = require('../middleware/requireAuth');
const { validateBody } = require('../middleware/validateZod');
const settings = require('../controllers/settings.controller');
const {
  notificationSettingsSchema,
  languageSchema,
  supportContactSchema,
} = require('../schemas/settings.schemas');

const router = express.Router();

router.get('/', requireAuth, settings.overview);
router.get('/notifications', requireAuth, settings.getNotifications);
router.put('/notifications', requireAuth, validateBody(notificationSettingsSchema), settings.putNotifications);
router.get('/language', requireAuth, settings.getLanguage);
router.put('/language', requireAuth, validateBody(languageSchema), settings.putLanguage);
router.get('/help', requireAuth, settings.getHelp);
router.post('/help/contact', requireAuth, validateBody(supportContactSchema), settings.contactSupport);

module.exports = router;
