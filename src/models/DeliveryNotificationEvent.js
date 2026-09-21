const mongoose = require('mongoose');

const deliveryNotificationEventSchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    deliveryScheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliverySchedule',
      default: null,
      index: true,
    },
    hashedNotificationId: { type: String, required: true, trim: true },
    payloadHash: { type: String, required: true, trim: true },
    sourcePackage: { type: String, required: true, trim: true },
    notificationPostedAt: { type: Date, required: true },
    merchantName: { type: String, trim: true, default: '' },
    courierName: { type: String, trim: true, default: '' },
    orderTrackingId: { type: String, trim: true, default: '' },
    deliveryDate: { type: Date, default: null },
    deliveryTimeWindow: { type: String, trim: true, default: '' },
    deliveryStatus: {
      type: String,
      enum: ['initiated', 'arriving_soon', 'out_for_delivery', 'scheduled', 'delivered', 'failed', 'unknown'],
      default: 'unknown',
      index: true,
    },
    confirmationRequired: { type: Boolean, default: false, index: true },
    confidence: { type: Number, min: 0, max: 100, default: 0 },
    timezone: { type: String, trim: true, default: '' },
    keywordMatches: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

deliveryNotificationEventSchema.index(
  { homeId: 1, hashedNotificationId: 1 },
  { unique: true }
);
deliveryNotificationEventSchema.index({ homeId: 1, deliveryScheduleId: 1, createdAt: -1 });
deliveryNotificationEventSchema.index({ homeId: 1, confirmationRequired: 1, createdAt: -1 });

module.exports = mongoose.model('DeliveryNotificationEvent', deliveryNotificationEventSchema);
