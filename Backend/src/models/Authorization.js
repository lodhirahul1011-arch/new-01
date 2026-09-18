const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['TODAY', 'DAILY', 'CUSTOM'], required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    startTime: { type: String, trim: true, default: '' },
    endTime: { type: String, trim: true, default: '' },
    timezone: { type: String, trim: true, default: 'UTC' },
    validFromAt: { type: Date },
    validUntilAt: { type: Date },
  },
  { _id: false }
);

const statusSchema = new mongoose.Schema(
  {
    current: {
      type: String,
      enum: ['ACTIVE', 'USED', 'EXPIRED', 'CANCELLED'],
      default: 'ACTIVE',
      index: true,
    },
    reason: { type: String, trim: true, default: '' },
    usedAt: { type: Date },
    expiredAt: { type: Date },
    revokedAt: { type: Date },
  },
  { _id: false }
);

const verificationSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ['access_code', 'otp', 'nfc', 'app'],
      default: 'access_code',
    },
    otpRequired: { type: Boolean, default: false },
    otpVerified: { type: Boolean, default: false },
    otpVerifiedAt: { type: Date },
    status: {
      type: String,
      enum: ['pending', 'verified', 'failed', 'not_required'],
      default: 'not_required',
    },
  },
  { _id: false }
);

const usageSchema = new mongoose.Schema(
  {
    singleUse: { type: Boolean, default: true },
    usesCount: { type: Number, default: 0, min: 0 },
    maxUses: { type: Number, default: 1, min: 1 },
    firstUsedAt: { type: Date },
    lastUsedAt: { type: Date },
    usedByDeliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery' },
    usedByDeviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
    usedByName: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const detailsSchema = new mongoose.Schema(
  {
    company: { type: String, trim: true, default: '' },
    purpose: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    sourceScreen: { type: String, trim: true, default: 'authorization_create' },
    tags: { type: [String], default: [] },
  },
  { _id: false }
);

const authorizationSchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyMember' },
    linkedDeliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery' },

    name: { type: String, trim: true, required: true },
    accessCode: { type: String, trim: true, required: true },
    deliveryPersonName: { type: String, trim: true, default: '' },

    schedule: { type: scheduleSchema, required: true },
    status: { type: statusSchema, default: () => ({ current: 'ACTIVE' }) },
    verification: {
      type: verificationSchema,
      default: () => ({ method: 'access_code', otpRequired: false, otpVerified: false, status: 'not_required' }),
    },
    usage: {
      type: usageSchema,
      default: () => ({ singleUse: true, usesCount: 0, maxUses: 1 }),
    },
    details: { type: detailsSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    strict: true,
  }
);

authorizationSchema.index({ homeId: 1, 'status.current': 1, createdAt: -1 });
authorizationSchema.index({ homeId: 1, 'schedule.type': 1, createdAt: -1 });
authorizationSchema.index({ homeId: 1, accessCode: 1, 'status.current': 1 });
authorizationSchema.index(
  { homeId: 1, accessCode: 1 },
  {
    unique: true,
    partialFilterExpression: { 'status.current': 'ACTIVE' },
    name: 'uniq_active_access_code_per_home',
  }
);

authorizationSchema.index({ linkedDeliveryId: 1 });

authorizationSchema.set('toJSON', {
  versionKey: false,
  transform(doc, ret) {
    return ret;
  },
});

module.exports = mongoose.model('Authorization', authorizationSchema);
