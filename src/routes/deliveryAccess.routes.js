const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { validateBody, validateQuery } = require('../middleware/validateZod');
const controller = require('../controllers/deliveryAccess.controller');
const {
  dropZoneListQuerySchema,
  createDropZoneSchema,
  selectZoneSchema,
  selectVerificationMethodSchema,
} = require('../schemas/delivery.schemas');

const router = express.Router();

router.get('/methods', requireAuth, controller.methods);
router.get('/deliveries/:deliveryId/verify-context', requireAuth, controller.verifyContext);
router.get('/zones', requireAuth, validateQuery(dropZoneListQuerySchema), controller.zones);
router.post('/zones', requireAuth, validateBody(createDropZoneSchema), controller.createZone);
router.get('/zones/:zoneId/status', requireAuth, controller.zoneStatus);
router.post('/deliveries/:deliveryId/select-zone', requireAuth, validateBody(selectZoneSchema), controller.selectZone);
router.post('/deliveries/:deliveryId/select-verification-method', requireAuth, validateBody(selectVerificationMethodSchema), controller.selectVerificationMethod);

module.exports = router;
