const express = require('express');
const multer = require('multer');

const requireAuth = require('../middleware/requireAuth');
const requireDeviceAuth = require('../middleware/requireDeviceAuth');
const requireTabletBootstrap = require('../middleware/requireTabletBootstrap');
const { validateBody, validateQuery } = require('../middleware/validateZod');
const tablet = require('../controllers/tablet.controller');
const {
  pairingSessionSchema,
  pairingClaimSchema,
  tabletConfigPatchSchema,
  tabletWifiSchema,
  tabletHeartbeatSchema,
  visitorSessionCreateSchema,
  visitorRespondSchema,
  tabletListQuerySchema,
  deliverySessionStartSchema,
  deliveryOtpVerifySchema,
  deliveryNfcVerifySchema,
  accessCodeVerifySchema,
  callInitiateSchema,
  callListQuerySchema,
  callAnswerSchema,
  callRejectSchema,
  callEndSchema,
  callPauseSchema,
  callResumeSchema,
  callSignalSchema,
  callShowOtpSchema,
  recordingCommandSchema,
  recordingStatusSchema,
  recordingListQuerySchema,
  recordingLinkQuerySchema,
  confirmDeliverySchema,
} = require('../schemas/tablet.schemas');

const router = express.Router();

// These endpoints are polled frequently from mobile/tablet apps.
// Express + OkHttp can negotiate conditional GETs (ETag -> 304) which breaks JSON parsing
// in some clients and prevents state transitions (e.g. approved -> OTP screen).
// Force fresh JSON responses for tablet module routes.
router.use((req, res, next) => {
  try {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  } catch (e) {
    // ignore
  }
  next();
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'private_uploads/recordings/uploads'),
  filename: (req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || 'mp4').toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('video/')) return cb(new Error('Only video uploads are allowed'));
    return cb(null, true);
  },
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('image/')) return cb(new Error('Only image uploads are allowed'));
    return cb(null, true);
  },
});

router.get('/recordings/temp/:token', tablet.accessTempRecording);

// Tablet bootstrap + pairing
router.post('/pairing/session', requireTabletBootstrap, validateBody(pairingSessionSchema), tablet.createPairingSession);
router.post('/pairing/claim', requireAuth, validateBody(pairingClaimSchema), tablet.claimPairing);

// Mobile app managing linked tablets / live events
router.get('/realtime/events', requireAuth, tablet.subscribeUserEvents);
router.get('/devices', requireAuth, validateQuery(tabletListQuerySchema), tablet.listDevices);
router.get('/devices/:deviceId', requireAuth, tablet.getDevice);
router.patch('/devices/:deviceId', requireAuth, validateBody(tabletConfigPatchSchema), tablet.patchDevice);
router.get('/visitor-sessions', requireAuth, tablet.listVisitorSessions);
router.patch('/visitor-sessions/:sessionId/respond', requireAuth, validateBody(visitorRespondSchema), tablet.respondVisitorSession);
router.get('/delivery-sessions', requireAuth, tablet.listDeliverySessions);
router.get('/delivery-sessions/:sessionId', requireAuth, tablet.getDeliverySession);
router.post('/live-feed/session', requireAuth, tablet.startLiveFeedSession);
router.get('/live-feed/session', requireAuth, tablet.getLiveFeedSession);
router.get('/calls', requireAuth, validateQuery(callListQuerySchema), tablet.listCalls);
router.get('/calls/:callId', requireAuth, tablet.getCall);
router.get('/calls/:callId/signaling', requireAuth, tablet.getCallSignaling);
router.post('/calls/:callId/answer', requireAuth, validateBody(callAnswerSchema), tablet.answerCall);
router.post('/calls/:callId/reject', requireAuth, validateBody(callRejectSchema), tablet.rejectCall);
router.post('/calls/:callId/end', requireAuth, validateBody(callEndSchema), tablet.endCall);
router.post('/calls/:callId/signal', requireAuth, validateBody(callSignalSchema), tablet.sendCallSignal);
router.post('/calls/:callId/show-otp', requireAuth, validateBody(callShowOtpSchema), tablet.showOtp);
router.post('/calls/:callId/recording-command', requireAuth, validateBody(recordingCommandSchema), tablet.requestRecording);
router.post('/calls/:callId/confirm-delivery', requireAuth, validateBody(confirmDeliverySchema), tablet.confirmDelivery);
router.get('/recordings', requireAuth, validateQuery(recordingListQuerySchema), tablet.listRecordings);
router.get('/recordings/:recordingId', requireAuth, tablet.getRecording);
router.get('/recordings/:recordingId/thumbnail', requireAuth, tablet.getRecordingThumbnail);
router.get('/recordings/:recordingId/link', requireAuth, validateQuery(recordingLinkQuerySchema), tablet.getRecordingLink);

// Tablet device-auth endpoints
router.get('/:deviceId/realtime/events', requireDeviceAuth, tablet.subscribeDeviceEvents);
router.get('/:deviceId/config', requireDeviceAuth, tablet.getConfig);
router.patch('/:deviceId/setup', requireDeviceAuth, validateBody(tabletConfigPatchSchema), tablet.patchSetup);
router.post('/:deviceId/setup/wifi', requireDeviceAuth, validateBody(tabletWifiSchema), tablet.patchWifi);
router.post('/:deviceId/heartbeat', requireDeviceAuth, validateBody(tabletHeartbeatSchema), tablet.heartbeat);
router.post('/:deviceId/visitor-sessions', requireDeviceAuth, validateBody(visitorSessionCreateSchema), tablet.createVisitorSession);
router.get('/:deviceId/visitor-sessions/:sessionId', requireDeviceAuth, tablet.getVisitorSession);
router.post('/:deviceId/delivery-sessions/start', requireDeviceAuth, validateBody(deliverySessionStartSchema), tablet.startDeliverySession);
router.get('/:deviceId/delivery-sessions/:sessionId', requireDeviceAuth, tablet.getDeviceDeliverySession);
router.get('/:deviceId/live-feed/session', requireDeviceAuth, tablet.getDeviceLiveFeedSession);
router.post('/:deviceId/delivery-sessions/:sessionId/verify-otp', requireDeviceAuth, validateBody(deliveryOtpVerifySchema), tablet.verifyDeliveryOtp);
router.post('/:deviceId/delivery-sessions/:sessionId/verify-nfc', requireDeviceAuth, validateBody(deliveryNfcVerifySchema), tablet.verifyDeliveryNfc);
// Tablet delivery proof image captured while OTP is shown.
router.post('/:deviceId/delivery-sessions/:sessionId/image/upload', requireDeviceAuth, imageUpload.single('image'), tablet.uploadDeliveryImage);
// Legacy tablet snap video recording for delivery sessions (short proof clip)
router.post('/:deviceId/delivery-sessions/:sessionId/recording/upload', requireDeviceAuth, upload.single('recording'), tablet.uploadDeliveryRecording);
router.post('/:deviceId/access-code/verify', requireDeviceAuth, validateBody(accessCodeVerifySchema), tablet.verifyAccessCode);
router.post('/:deviceId/calls/initiate', requireDeviceAuth, validateBody(callInitiateSchema), tablet.initiateCall);
router.get('/:deviceId/calls/active', requireDeviceAuth, tablet.getActiveDeviceCall);
router.get('/:deviceId/calls/:callId', requireDeviceAuth, tablet.getDeviceCall);
router.get('/:deviceId/calls/:callId/signaling', requireDeviceAuth, tablet.getDeviceCallSignaling);
router.post('/:deviceId/calls/:callId/end', requireDeviceAuth, validateBody(callEndSchema), tablet.endDeviceCall);
router.post('/:deviceId/calls/:callId/pause', requireDeviceAuth, validateBody(callPauseSchema), tablet.pauseDeviceCall);
router.post('/:deviceId/calls/:callId/resume', requireDeviceAuth, validateBody(callResumeSchema), tablet.resumeDeviceCall);
router.post('/:deviceId/calls/:callId/signal', requireDeviceAuth, validateBody(callSignalSchema), tablet.sendDeviceCallSignal);
router.post('/:deviceId/calls/:callId/recording-status', requireDeviceAuth, validateBody(recordingStatusSchema), tablet.updateRecordingStatus);
router.post('/:deviceId/calls/:callId/recordings/upload', requireDeviceAuth, upload.single('recording'), tablet.uploadRecording);

module.exports = router;
