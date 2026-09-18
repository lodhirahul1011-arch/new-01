const mongoose = require('mongoose');

const securityEventSchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    type: { type: String, enum: ['motion', 'doorbell', 'delivery', 'lock', 'recording'], required: true, index: true },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    title: { type: String, required: true, trim: true },
    relatedDeliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', default: null },
    recordingUrl: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

securityEventSchema.index({ homeId: 1, createdAt: -1 });

module.exports = mongoose.model('SecurityEvent', securityEventSchema);
