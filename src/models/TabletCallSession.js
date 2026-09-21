const mongoose = require('mongoose');

const signalingCandidateSchema = new mongoose.Schema(
  {
    from: { type: String, enum: ['tablet', 'mobile'], required: true },
    candidate: { type: String, default: '' },
    sdpMid: { type: String, default: '' },
    sdpMLineIndex: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const tabletCallSessionSchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    tabletDeviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true, index: true },
    residentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    visitorSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'VisitorSession', default: null, index: true },
    deliverySessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliverySession', default: null, index: true },
    deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', default: null, index: true },
    type: {
      type: String,
      enum: ['doorbell', 'delivery', 'visitor', 'guest', 'live_feed'],
      default: 'doorbell',
      index: true,
    },
    state: {
      type: String,
      enum: ['ringing', 'calling', 'connecting', 'answered', 'paused', 'declined', 'ended', 'missed', 'failed'],
      default: 'ringing',
      index: true,
    },
    ringCount: { type: Number, default: 1 },
    autoStartThreshold: { type: Number, default: 3 },
    initiatedBy: { type: String, enum: ['tablet', 'mobile', 'system'], default: 'tablet' },
    liveVideoRequested: { type: Boolean, default: false },
    note: { type: String, trim: true, default: '' },
    callStartedAt: { type: Date, default: null },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    endReason: { type: String, trim: true, default: '' },
    otpDisplay: {
      code: { type: String, trim: true, default: '' },
      label: { type: String, trim: true, default: '' },
      shownAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      shownByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    recording: {
      status: {
        type: String,
        enum: ['idle', 'requested', 'recording', 'stopped', 'uploaded', 'failed'],
        default: 'idle',
      },
      requestedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      startedAt: { type: Date, default: null },
      stoppedAt: { type: Date, default: null },
      latestRecordingId: { type: mongoose.Schema.Types.ObjectId, ref: 'TabletRecording', default: null },
    },
    signaling: {
      offerSdp: { type: String, default: '' },
      answerSdp: { type: String, default: '' },
      offerCreatedAt: { type: Date, default: null },
      answerCreatedAt: { type: Date, default: null },
      iceCandidates: { type: [signalingCandidateSchema], default: [] },
    },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

tabletCallSessionSchema.index({ homeId: 1, createdAt: -1 });
tabletCallSessionSchema.index({ tabletDeviceId: 1, state: 1, createdAt: -1 });

module.exports = mongoose.model('TabletCallSession', tabletCallSessionSchema);
