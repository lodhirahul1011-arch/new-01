const mongoose = require('mongoose');

const tabletRecordingSchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    tabletDeviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true, index: true },
    residentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    callSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TabletCallSession', default: null, index: true },
    visitorSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'VisitorSession', default: null, index: true },
    deliverySessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliverySession', default: null, index: true },
    deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', default: null, index: true },
    type: { type: String, enum: ['delivery', 'doorbell', 'visitor', 'other'], default: 'other', index: true },
    status: { type: String, enum: ['uploaded', 'processing', 'ready', 'failed'], default: 'processing', index: true },
    storageProvider: { type: String, enum: ['local', 's3', 'imagekit'], default: 'local' },
    storageKey: { type: String, required: true },
    thumbnailStorageKey: { type: String, default: '' },
    fileName: { type: String, required: true },
    mimeType: { type: String, default: 'video/mp4' },
    sizeBytes: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: null },
    sha256: { type: String, default: '' },
    uploadedBy: { type: String, enum: ['tablet', 'mobile', 'system'], default: 'tablet' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    readyAt: { type: Date, default: null },
  },
  { timestamps: true }
);

tabletRecordingSchema.index({ homeId: 1, createdAt: -1 });
tabletRecordingSchema.index({ deliveryId: 1, createdAt: -1 });

module.exports = mongoose.model('TabletRecording', tabletRecordingSchema);
