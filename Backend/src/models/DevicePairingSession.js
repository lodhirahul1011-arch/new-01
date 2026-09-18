const mongoose = require('mongoose');

const devicePairingSessionSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, index: true },
    deviceMongoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', index: true },
    homeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    pairingCodeId: { type: String, required: true, index: true },
    pairingTokenHash: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'claimed', 'completed', 'expired', 'cancelled'],
      default: 'pending',
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    claimedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    claimedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    meta: {
      appVersion: { type: String, trim: true, default: '' },
      platform: { type: String, trim: true, default: 'android_tablet' },
      note: { type: String, trim: true, default: '' },
    },
  },
  { timestamps: true }
);

devicePairingSessionSchema.index({ deviceId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('DevicePairingSession', devicePairingSessionSchema);
