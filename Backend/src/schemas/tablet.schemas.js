const { z } = require('zod');

const pairingSessionSchema = z.object({
  deviceId: z.string().trim().min(3).max(120),
  hardwareId: z.string().trim().min(3).max(160).optional(),
  displayName: z.string().trim().min(2).max(80).optional(),
  appVersion: z.string().trim().min(1).max(30).optional(),
  platform: z.string().trim().min(2).max(30).optional(),
});

const pairingClaimSchema = z.object({
  qrToken: z.string().trim().min(10),
  displayName: z.string().trim().min(2).max(80).optional(),
});

const tabletConfigPatchSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  timezone: z.string().trim().min(2).max(60).optional(),
  language: z.string().trim().min(2).max(20).optional(),
  theme: z.string().trim().min(2).max(30).optional(),
  wallpaperPreset: z.string().trim().max(50).optional(),
  simpleModeEnabled: z.boolean().optional(),
  onboardingCompleted: z.boolean().optional(),
  fontSize: z.coerce.number().min(10).max(30).optional(),
});

const tabletWifiSchema = z.object({
  ssid: z.string().trim().min(1).max(120),
  connected: z.boolean().default(true),
  signalStrength: z.coerce.number().min(0).max(100).optional(),
  ipAddress: z.string().trim().max(64).optional(),
});

const tabletHeartbeatSchema = z.object({
  status: z.enum(['online', 'offline']).optional(),
  batteryLevel: z.coerce.number().min(0).max(100).optional(),
  networkType: z.string().trim().min(2).max(30).optional(),
  appVersion: z.string().trim().min(1).max(30).optional(),
});

const visitorSessionCreateSchema = z.object({
  type: z.enum(['visitor', 'doorbell']).optional(),
  visitorName: z.string().trim().min(2).max(80).optional(),
  note: z.string().trim().max(250).optional(),
});

const visitorRespondSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'missed']),
  note: z.string().trim().max(250).optional(),
});

const tabletListQuerySchema = z.object({
  status: z.enum(['all', 'online', 'offline']).optional().default('all'),
  type: z.enum(['tablet']).optional(),
});

const deliverySessionStartSchema = z.object({
  orderId: z.string().trim().min(1).optional(),
  awbCode: z.string().trim().min(1).optional(),
  company: z.string().trim().max(120).optional(),
  partnerName: z.string().trim().max(120).optional(),
  title: z.string().trim().max(120).optional(),
  awaitResidentDecision: z.boolean().optional(),
}).refine((value) => Boolean(value.orderId || value.awbCode), {
  message: 'orderId or awbCode is required',
  path: ['orderId'],
});

const deliveryOtpVerifySchema = z.object({
  code: z.string().trim().min(4).max(8),
});

const deliveryNfcVerifySchema = z.object({
  uid: z.string().trim().regex(/^\d{10}$/, 'NFC card number must be exactly 10 digits'),
});

const accessCodeVerifySchema = z.object({
  code: z.string().trim().min(4).max(8),
  sourceHint: z.enum(['authorization', 'away_mode', 'backup_assignment', 'auto']).optional().default('auto'),
  deliveryPersonName: z.string().trim().max(120).optional(),
});

const callInitiateSchema = z.object({
  type: z.enum(['doorbell', 'delivery', 'visitor', 'guest', 'live_feed']),
  visitorSessionId: z.string().trim().optional(),
  deliverySessionId: z.string().trim().optional(),
  orderId: z.string().trim().optional(),
  awbCode: z.string().trim().optional(),
  note: z.string().trim().max(250).optional(),
  source: z.string().trim().max(80).optional(),
  ringIncrement: z.coerce.number().min(1).max(10).optional(),
  autoStartThreshold: z.coerce.number().min(1).max(10).optional(),
  forceStart: z.boolean().optional(),
  liveVideoRequested: z.boolean().optional(),
});

const callListQuerySchema = z.object({
  state: z.enum(['ringing', 'calling', 'connecting', 'answered', 'paused', 'declined', 'ended', 'missed', 'failed']).optional(),
  type: z.enum(['doorbell', 'delivery', 'visitor', 'guest', 'live_feed']).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
});

const callAnswerSchema = z.object({
  liveVideoRequested: z.boolean().optional(),
});

const callRejectSchema = z.object({
  reason: z.string().trim().max(120).optional(),
});

const callEndSchema = z.object({
  reason: z.string().trim().max(120).optional(),
});

const callPauseSchema = z.object({
  reason: z.string().trim().max(120).optional(),
});

const callResumeSchema = z.object({
  reason: z.string().trim().max(120).optional(),
});

const callSignalSchema = z.object({
  signalType: z.enum(['offer', 'answer', 'ice_candidate']),
  sdp: z.string().trim().optional(),
  candidate: z.string().trim().optional(),
  sdpMid: z.string().trim().optional(),
  sdpMLineIndex: z.coerce.number().min(0).optional(),
});

const callShowOtpSchema = z.object({
  code: z.string().trim().min(4).max(8),
  label: z.string().trim().max(120).optional(),
  expiresAt: z.string().datetime().optional(),
});

const recordingCommandSchema = z.object({
  action: z.enum(['start', 'stop']),
});

const recordingStatusSchema = z.object({
  status: z.enum(['requested', 'recording', 'stopped', 'uploaded', 'failed']),
});

const recordingUploadMetaSchema = z.object({
  durationSeconds: z.coerce.number().min(0).max(86400).optional(),
  note: z.string().trim().max(250).optional(),
});

const recordingListQuerySchema = z.object({
  deliveryId: z.string().trim().optional(),
  callSessionId: z.string().trim().optional(),
  type: z.enum(['delivery', 'doorbell', 'visitor', 'other']).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
});

const recordingLinkQuerySchema = z.object({
  expiresIn: z.coerce.number().min(60).max(86400).optional().default(900),
});

const confirmDeliverySchema = z.object({
  deliveryId: z.string().trim().optional(),
  verificationMethod: z.enum(['app', 'webrtc', 'otp']).optional(),
  note: z.string().trim().max(250).optional(),
});

module.exports = {
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
  recordingUploadMetaSchema,
  recordingListQuerySchema,
  recordingLinkQuerySchema,
  confirmDeliverySchema,
};
