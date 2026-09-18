const express = require('express');
const multer = require('multer');

const requireAuth = require('../middleware/requireAuth');
const requireDeviceAuth = require('../middleware/requireDeviceAuth');
const requireInternal = require('../middleware/requireInternal');
const { validateBody } = require('../middleware/validateZod');
const {
  provisionSchema,
  linkDeviceSchema,
  updateDeviceSchema,
  heartbeatSchema,
  connectIntegrationSchema,
  verifyIntegrationSchema,
} = require('../schemas/device.schemas');
const device = require('../controllers/device.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads are allowed'));
    cb(null, true);
  },
});

const router = express.Router();

/**
 * Provision endpoint (testing/manufacturing).
 * In production, protect this route (admin-only or internal).
 */
router.post('/provision', requireInternal, validateBody(provisionSchema), device.provision);

// User routes
router.post('/link', requireAuth, validateBody(linkDeviceSchema), device.link);
router.post('/link/scan', requireAuth, validateBody(linkDeviceSchema), device.link);
router.get('/linked/summary', requireAuth, device.linkedSummary);
router.get('/wallpapers', requireAuth, device.wallpapers);
router.get('/', requireAuth, device.list);
router.get('/:deviceId', requireAuth, device.getOne);
router.patch('/:deviceId', requireAuth, validateBody(updateDeviceSchema), device.patch);
router.post('/:deviceId/unlink', requireAuth, device.unlink);
router.get('/:deviceId/status', requireAuth, device.status);
router.put('/:deviceId/wallpaper/select', requireAuth, device.selectWallpaper);
router.post('/:deviceId/wallpaper/gallery', requireAuth, upload.single('wallpaper'), device.uploadWallpaper);
router.get('/:deviceId/integrations', requireAuth, device.listIntegrations);
router.post('/:deviceId/integrations/connect', requireAuth, validateBody(connectIntegrationSchema), device.connectIntegration);
router.post('/:deviceId/integrations/:provider/verify', requireAuth, validateBody(verifyIntegrationSchema), device.verifyIntegration);
router.post('/:deviceId/integrations/:provider/disconnect', requireAuth, device.disconnectIntegration);

// Device -> backend heartbeat
router.post('/:deviceId/heartbeat', requireDeviceAuth, validateBody(heartbeatSchema), device.heartbeat);

module.exports = router;
