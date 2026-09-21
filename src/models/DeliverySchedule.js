const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['initiated', 'arriving_soon', 'out_for_delivery', 'upon_arrival', 'delivered', 'failed'],
      required: true,
    },
    updatedAt: { type: Date, required: true },
    smsId: { type: mongoose.Schema.Types.ObjectId, ref: 'SmsLog', default: null },
    messageSummary: { type: String, default: '' },
  },
  { _id: false }
);

const deliveryScheduleSchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    source: {
      type: String,
      enum: ['sms', 'manual', 'notification', 'integration', 'ecommerce', 'tablet'],
      default: 'sms',
      index: true,
    },

    // Grouping & Reference
    scheduleGroupId: { type: String, sparse: true, index: true },
    referenceId: { type: String, trim: true, required: true, index: true },
    deliveryCompany: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    // Current Status
    currentStatus: {
      type: String,
      enum: ['initiated', 'arriving_soon', 'out_for_delivery', 'upon_arrival', 'delivered', 'failed'],
      default: 'initiated',
      index: true,
    },
    statusHistory: [statusHistorySchema],

    // Customer & Delivery Info
    customerName: { type: String, trim: true, default: '' },
    receiverAddress: { type: String, trim: true, default: '' },
    phoneNumber: { type: String, trim: true, default: '' },

    // Delivery Timeline
    expectedDeliveryDate: { type: Date, default: null },
    deliveryTimeWindow: { type: String, default: '' },
    scheduledAt: { type: Date, default: () => new Date() },
    confirmationRequired: { type: Boolean, default: false, index: true },
    confirmedAt: { type: Date, default: null },
    reminderLeadMinutes: { type: Number, min: 5, max: 1440, default: 60 },

    // Latest Info (from most recent SMS)
    latestSmsId: { type: mongoose.Schema.Types.ObjectId, ref: 'SmsLog', default: null },
    riderName: { type: String, trim: true, default: '' },
    riderPhone: { type: String, trim: true, default: '' },
    otpCode: { type: String, trim: true, default: '' },
    orderHint: { type: String, trim: true, default: '' },
    awbNumber: { type: String, trim: true, default: '' },
    verificationMethod: {
      type: String,
      enum: ['none', 'nfc', 'app'],
      default: 'none',
      index: true,
    },
    manualIdempotencyKey: { type: String, trim: true },
    manualPayloadHash: { type: String, trim: true },
    manualIdempotencyStatusCode: { type: Number, default: null },

    // Product Info
    sellerName: { type: String, trim: true, default: '' },
    productSummary: { type: String, trim: true, default: '' },

    // Delivery Details
    smsCount: { type: Number, default: 0 },
    smsIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SmsLog' }],
    notificationSourcePackage: { type: String, trim: true, default: '' },
    notificationEventCount: { type: Number, default: 0 },
    notificationEventIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryNotificationEvent' }],
    latestNotificationEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryNotificationEvent',
      default: null,
    },

    // Completion Status
    completedAt: { type: Date, default: null },
    markedDelivered: { type: Boolean, default: false },
    rating: { type: Number, min: 1, max: 5, default: null },
    ratingComment: { type: String, trim: true, default: '' },
    ratedAt: { type: Date, default: null },

    // Tablet scan correlation: when a delivery is scanned on the tablet, we attach the
    // active DeliverySession id so mobile approve/reject can update the exact session.
    activeTabletDeliverySessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliverySession', default: null, index: true },
    activeTabletDeliverySessionAt: { type: Date, default: null },

    notifications: {
      upcomingScheduledSentAt: { type: Date, default: null },
      deliveryBoyAtDoorSentAt: { type: Date, default: null },
    },

    // Metadata
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

deliveryScheduleSchema.index({ homeId: 1, currentStatus: 1, createdAt: -1 });
deliveryScheduleSchema.index({ homeId: 1, expectedDeliveryDate: 1, currentStatus: 1 });
deliveryScheduleSchema.index({ homeId: 1, deliveryCompany: 1, createdAt: -1 });
deliveryScheduleSchema.index({ homeId: 1, source: 1, confirmationRequired: 1, createdAt: -1 });
deliveryScheduleSchema.index(
  { homeId: 1, scheduleGroupId: 1 },
  { unique: true, sparse: true }
);
deliveryScheduleSchema.index(
  { homeId: 1, manualIdempotencyKey: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('DeliverySchedule', deliveryScheduleSchema);
