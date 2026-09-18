const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    // Do NOT set `index: true` here when also declaring schema indexes below.
    // Keeping indexing in one place avoids duplicate index warnings.
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true }, // E.164 preferred
    emailVerified: { type: Boolean, default: undefined },
    phoneVerified: { type: Boolean, default: undefined },
    googleSub: { type: String, trim: true },
    dateOfBirth: { type: String, trim: true, default: '' }, // YYYY-MM-DD
    gender: { type: String, trim: true, default: '' },

    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },

    // Multi-home support (future). For now we use a primary homeId.
    // If not set, the API treats the user's own _id as their homeId.
    primaryHomeId: { type: mongoose.Schema.Types.ObjectId },

    // Profile (Settings → Edit profile)
    address: { type: String, trim: true, default: '' },
    avatar: {
      url: { type: String, default: '' },
      filename: { type: String, default: '' },
      fileId: { type: String, default: '' },
      storageProvider: { type: String, default: '' },
      mime: { type: String, default: '' },
      size: { type: Number, default: 0 },
      updatedAt: { type: Date },
    },

    // App-level preferences (Settings screens)
    preferences: {
      language: { type: String, default: 'en' },
      mode: { type: String, enum: ['active', 'away', 'simple'], default: 'active' },
      notifications: {
        doorbellAlerts: { type: Boolean, default: true },
        deliveryNotifications: { type: Boolean, default: true },
        visitorRecognition: { type: Boolean, default: true },
        securityAlerts: { type: Boolean, default: true },
        deviceStatus: { type: Boolean, default: false },
        weeklySummary: { type: Boolean, default: true },
      },
      sound: { type: String, default: 'default' },
      vibration: { type: Boolean, default: true },
    },

    // Push tokens (FCM)
    fcmTokens: [
      {
        token: { type: String },
        platform: { type: String, enum: ['ios', 'android', 'unknown'], default: 'unknown' },
        addedAt: { type: Date, default: () => new Date() },
      },
    ],

    // Useful for future modules (Deliveries, Recordings, Analytics, Scheduling)
    roles: { type: [String], default: ['user'] },
    lastLoginAt: { type: Date },

    // Soft delete keeps delivery/history references intact while blocking future access.
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletionReason: { type: String, trim: true, default: '' },
    deletionReasonCapturedAt: { type: Date, default: null },
    deletedEmail: { type: String, trim: true, lowercase: true, default: '' },
    deletedPhone: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

// Unique indexes only when field exists
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: 'string' },
      deletedAt: null,
    },
  }
);
userSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: {
      phone: { $type: 'string' },
      deletedAt: null,
    },
  }
);
userSchema.index(
  { googleSub: 1 },
  {
    unique: true,
    partialFilterExpression: {
      googleSub: { $type: 'string' },
      deletedAt: null,
    },
  }
);
userSchema.index({ isDeleted: 1, deletedAt: 1 });

module.exports = mongoose.model('User', userSchema);
