const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema(
  {
    score: { type: Number, min: 1, max: 5 },
    comment: { type: String, trim: true, default: '' },
    ratedByMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyMember' },
    ratedAt: { type: Date },
  },
  { _id: false }
);

const deliverySchema = new mongoose.Schema(
  {
    homeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    createdByDeviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },

    title: { type: String, trim: true, default: '' },
    orderId: { type: String, trim: true, required: true },
    awbCode: { type: String, trim: true, default: '', index: true },
    company: { type: String, trim: true, default: '' },
    partnerName: { type: String, trim: true, default: '' },
    partnerRating: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['unknown', 'prepaid', 'cod'], default: 'unknown' },
    price: { type: Number, default: null },
    currency: { type: String, trim: true, default: 'INR' },
    category: { type: String, enum: ['business', 'household', 'personal', 'other'], default: 'other', index: true },

    otp: { type: String, trim: true, default: '' },
    verificationCode: { type: String, trim: true, default: '' },
    verificationMethod: { type: String, enum: ['none', 'nfc', 'app'], default: 'none' },
    verificationStatus: { type: String, enum: ['not_started', 'method_selected', 'zone_selected', 'approved', 'rejected'], default: 'not_started', index: true },
    selectedZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'DropZone' },
    selectedZoneSnapshot: {
      name: { type: String, trim: true, default: '' },
      type: { type: String, trim: true, default: '' },
      locationDescription: { type: String, trim: true, default: '' },
    },

    status: { type: String, enum: ['upcoming', 'delivered', 'rejected'], default: 'upcoming', index: true },

    packageImageUrl: { type: String, trim: true, default: '' },

    approvedByMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyMember' },
    rejectedByMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyMember' },
    rejectionReason: { type: String, trim: true, default: '' },
    rejectionCode: { type: String, trim: true, default: '' },
    rejectedAt: { type: Date },
    deliveredAt: { type: Date },

    scheduledFor: { type: Date, index: true },
    specialInstruction: { type: String, trim: true, default: '' },
    scheduleStatus: {
      type: String,
      enum: ['none', 'confirmed', 'rescheduled', 'cancelled'],
      default: 'none',
      index: true,
    },
    autoAccessWindowMinutes: { type: Number, default: 30 },
    accessStartAt: { type: Date },
    accessEndAt: { type: Date },
    rescheduledAt: { type: Date },

    proofGeneratedAt: { type: Date },
    proofUrl: { type: String, trim: true, default: '' },
    recordingUrl: { type: String, trim: true, default: '' },
    recordingThumbnailUrl: { type: String, trim: true, default: '' },
    recordingSaved: { type: Boolean, default: true },
    recordingDurationSeconds: { type: Number, default: null },
    recordingSizeBytes: { type: Number, default: null },
    recordingQuality: { type: String, trim: true, default: '' },
    recordingMimeType: { type: String, trim: true, default: '' },
    recordingStorageProvider: { type: String, trim: true, default: '' },

    rating: ratingSchema,
  },
  { timestamps: true }
);

deliverySchema.index({ homeId: 1, orderId: 1 }, { unique: true });
deliverySchema.index({ homeId: 1, awbCode: 1 }, { sparse: true });
deliverySchema.index({ homeId: 1, status: 1, _id: -1 });
deliverySchema.index({ homeId: 1, scheduleStatus: 1, scheduledFor: 1 });

module.exports = mongoose.model('Delivery', deliverySchema);
