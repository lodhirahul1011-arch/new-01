const express = require('express');

const requireAuth = require('../middleware/requireAuth');
const { validateBody } = require('../middleware/validateZod');
const nfc = require('../controllers/nfc.controller');
const { createNfcCardSchema, updateNfcCardSchema, verifyNfcAccessSchema } = require('../schemas/nfc.schemas');

const router = express.Router();

router.get('/cards/overview', requireAuth, nfc.overview);
router.get('/cards', requireAuth, nfc.list);
router.post('/cards', requireAuth, validateBody(createNfcCardSchema), nfc.create);
router.patch('/cards/:cardId', requireAuth, validateBody(updateNfcCardSchema), nfc.patch);
router.delete('/cards/:cardId', requireAuth, nfc.remove);
router.post('/verify-access', requireAuth, validateBody(verifyNfcAccessSchema), nfc.verifyAccess);
router.get('/access-logs', requireAuth, nfc.accessLogs);

module.exports = router;
