const mongoose = require('mongoose');

const deviceIntegrationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceMongoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    provider: { type: String, enum: ['amazon', 'flipkart'], required: true, index: true },
    providerLabel: { type: String, trim: true },
    status: { type: String, enum: ['disconnected', 'pending_verification', 'connected'], default: 'pending_verification', index: true },
    accountIdentifier: { type: String, trim: true, maxlength: 120 },
    maskedAccountIdentifier: { type: String, trim: true, maxlength: 120 },
    verification: {
      codeHash: { type: String },
      codeExpiresAt: { type: Date },
      attempts: { type: Number, default: 0 },
      verifiedAt: { type: Date },
      lastSentAt: { type: Date },
    },
    connectedAt: { type: Date },
    disconnectedAt: { type: Date },
    lastSyncAt: { type: Date },
    meta: {
      source: { type: String, trim: true, default: 'settings' },
      note: { type: String, trim: true, maxlength: 200 },
    },
  },
  { timestamps: true }
);

deviceIntegrationSchema.index({ deviceMongoId: 1, provider: 1 }, { unique: true });

deviceIntegrationSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    deviceId: this.deviceId,
    provider: this.provider,
    providerLabel: this.providerLabel,
    status: this.status,
    accountIdentifier: this.maskedAccountIdentifier || '',
    connectedAt: this.connectedAt,
    lastSyncAt: this.lastSyncAt,
    verificationRequired: this.status === 'pending_verification',
    verificationExpiresAt: this.verification?.codeExpiresAt || null,
  };
};

module.exports = mongoose.model('DeviceIntegration', deviceIntegrationSchema);
