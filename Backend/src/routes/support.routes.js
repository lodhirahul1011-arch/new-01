const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { validateBody } = require('../middleware/validateZod');
const controller = require('../controllers/support.controller');
const { supportContactSchema } = require('../schemas/settings.schemas');

const router = express.Router();
router.get('/faqs', requireAuth, controller.faqs);
router.post('/contact', requireAuth, validateBody(supportContactSchema), controller.contact);
module.exports = router;
