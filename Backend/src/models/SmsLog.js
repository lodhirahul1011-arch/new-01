const mongoose = require('mongoose');

const smsLogSchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    // Raw SMS Data
    rawText: { type: String, required: true },
    senderPhone: { type: String, trim: true, default: '' },
    messageId: { type: String, sparse: true, index: true },

    // Delivery Company & Detection
    deliveryCompany: {
      type: String,
      default: 'unknown',
      trim: true,
      lowercase: true,
      index: true,
    },
    detectedAt: { type: Date },
    confidenceScore: { type: Number, min: 0, max: 100, default: 0 },
    matchedPattern: { type: String, default: '' },

    // Extraction Results
    referenceId: { type: String, trim: true, index: true },
    referenceType: {
      type: String,
      enum: ['awb', 'tracking_id', 'order_id', 'unknown'],
      default: 'unknown',
    },
    status: {
      type: String,
      enum: ['initiated', 'arriving_soon', 'out_for_delivery', 'upon_arrival', 'delivered', 'failed', 'unknown'],
      default: 'unknown',
      index: true,
    },

    // Extracted Data
    extractedData: {
      riderName: { type: String, default: '' },
      riderPhone: { type: String, default: '' },
      customerName: { type: String, default: '' },
      awbNumber: { type: String, default: '' },
      otpCode: { type: String, default: '' },
      orderHint: { type: String, default: '' },
      expectedDeliveryDate: { type: String, default: '' },
      expectedDeliveryDateParsed: { type: Date, default: null },
      deliveryTimeWindow: { type: String, default: '' },
      productInfo: { type: String, default: '' },
      sellerName: { type: String, default: '' },
      receiverAddress: { type: String, default: '' },
      messageType: {
        type: String,
        enum: ['order_confirmation', 'status_update', 'otp_notification', 'delivery_confirmation', 'unknown'],
        default: 'unknown',
      },
    },

    // Parsing Metadata
    parsed: { type: Boolean, default: false },
    parseError: { type: String, default: null },

    // Tracking
    smsReceivedAt: { type: Date, default: () => new Date() },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

smsLogSchema.index({ homeId: 1, referenceId: 1, deliveryCompany: 1 });
smsLogSchema.index({ homeId: 1, deliveryCompany: 1, createdAt: -1 });
smsLogSchema.index({ homeId: 1, status: 1, createdAt: -1 });
smsLogSchema.index(
  { homeId: 1, messageId: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('SmsLog', smsLogSchema);
