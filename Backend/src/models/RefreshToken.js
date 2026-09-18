const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },

    revokedAt: { type: Date },
    revokedReason: { type: String, trim: true },
    replacedByJti: { type: String, trim: true },
    lastUsedAt: { type: Date },

    meta: {
      ip: { type: String },
      userAgent: { type: String },
      deviceName: { type: String },
    },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
