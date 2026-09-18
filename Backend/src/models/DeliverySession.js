const mongoose = require('mongoose');

const deliverySessionSchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    tabletDeviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true, index: true },
    deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', default: null, index: true },
    orderId: { type: String, trim: true, default: '', index: true },
    awbCode: { type: String, trim: true, default: '' },
    company: { type: String, trim: true, default: '' },
    partnerName: { type: String, trim: true, default: '' },
    state: {
      type: String,
      enum: ['detected', 'lookup_pending', 'resident_notified', 'awaiting_nfc_card', 'otp_generated', 'verified', 'completed', 'failed', 'rejected'],
      default: 'detected',
      index: true,
    },
    otpCodeHash: { type: String, default: '' },
    otpPreview: { type: String, default: '' },
    otpExpiresAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    finalStatus: { type: String, trim: true, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

deliverySessionSchema.index({ homeId: 1, createdAt: -1 });

module.exports = mongoose.model('DeliverySession', deliverySessionSchema);
