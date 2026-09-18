const mongoose = require('mongoose');

const nfcAccessLogSchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    nfcCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'NfcCard', default: null, index: true },
    uidHash: { type: String, required: true, trim: true, maxlength: 255, index: true },
    result: {
      type: String,
      enum: ['success', 'denied', 'unknown', 'blocked', 'removed', 'home_mismatch'],
      required: true,
      index: true,
    },
    reasonCode: { type: String, default: '', trim: true, maxlength: 100 },
    context: {
      flow: {
        type: String,
        enum: ['delivery_access', 'member_access', 'settings_test'],
        default: 'delivery_access',
      },
      deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', default: null },
      authorizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Authorization', default: null },
    },
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', default: null, index: true },
    verifiedBy: { type: String, default: 'api', trim: true, maxlength: 30 },
    ipAddress: { type: String, default: '', trim: true, maxlength: 64 },
    userAgent: { type: String, default: '', trim: true, maxlength: 300 },
    scannedAt: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true }
);

nfcAccessLogSchema.index({ homeId: 1, scannedAt: -1 });
nfcAccessLogSchema.index({ nfcCardId: 1, scannedAt: -1 });

module.exports = mongoose.model('NfcAccessLog', nfcAccessLogSchema);
