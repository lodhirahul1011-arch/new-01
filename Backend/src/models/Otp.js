const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    identifier: { type: String, required: true, index: true },
    channel: { type: String, enum: ['sms', 'email', 'whatsapp'], required: true },
    purpose: { type: String, enum: ['login', 'register', 'link_identifier'], required: true, index: true },

    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    verifiedAt: { type: Date },
    consumedAt: { type: Date, index: true },

    verifyAttemptsLeft: { type: Number, required: true },
    resendCount: { type: Number, default: 0 },
    resendAvailableAt: { type: Date, default: () => new Date() },

    meta: {
      ip: { type: String },
      userAgent: { type: String },
      deviceName: { type: String },
      name: { type: String },
      email: { type: String },
      phone: { type: String },
    },
  },
  { timestamps: true }
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ identifier: 1, purpose: 1, createdAt: -1 });

module.exports = mongoose.model('Otp', otpSchema);
