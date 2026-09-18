const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    hardwareId: { type: String, default: '', index: true },
    type: { type: String, enum: ['box', 'doorbell', 'camera', 'tablet', 'other'], default: 'box', index: true },
    name: { type: String, default: 'Dvaari Device' },

    // Ownership / scoping
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    linkedHomeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    isLinked: { type: Boolean, default: false },
    pairingStatus: { type: String, enum: ['unpaired', 'pairing', 'paired', 'disabled'], default: 'unpaired', index: true },

    // Pairing via QR token (temporary)
    pairingCodeId: { type: String, index: true },
    pairingSecretHash: { type: String },
    pairingExpiresAt: { type: Date },

    // Device → backend auth
    deviceSecretHash: { type: String },

    // Status / health
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    onlineStatus: { type: String, enum: ['online', 'offline'], default: 'offline' },
    lastSeenAt: { type: Date },
    appVersion: { type: String, trim: true, default: '' },
    batteryLevel: { type: Number, min: 0, max: 100, default: null },
    networkType: { type: String, trim: true, default: '' },
    presence: {
      lastOnlineAt: { type: Date, default: null },
      lastOfflineDetectedAt: { type: Date, default: null },
      offlineNotificationSentAt: { type: Date, default: null },
    },

    // Setup / tablet-specific config
    configVersion: { type: Number, default: 1 },
    onboardingCompleted: { type: Boolean, default: false },
    simpleModeEnabled: { type: Boolean, default: false },
    capabilities: { type: [String], default: [] },

    wifi: {
      configured: { type: Boolean, default: false },
      ssid: { type: String, trim: true, default: '' },
      connected: { type: Boolean, default: false },
      signalStrength: { type: Number, default: null },
      ipAddress: { type: String, trim: true, default: '' },
      updatedAt: { type: Date },
    },

    // Device settings (used by Device Management / tablet UI)
    settings: {
      wallpaperUrl: { type: String, default: '' },
      wallpaperFileId: { type: String, default: '' },
      wallpaperStorageProvider: { type: String, default: '' },
      wallpaperUploadedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      customWallpaperUrl: { type: String, default: '' },
      customWallpaperFileId: { type: String, default: '' },
      customWallpaperUploadedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      wallpaperPreset: { type: String, default: '' },
      fontSize: { type: Number, default: 16 },
      theme: { type: String, default: 'light' },
      language: { type: String, default: 'en' },
      timezone: { type: String, default: 'Asia/Kolkata' },
      displayName: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

deviceSchema.index({ ownerUserId: 1, deviceId: 1 });
deviceSchema.index({ linkedHomeId: 1, type: 1, isLinked: 1 });

module.exports = mongoose.model('Device', deviceSchema);
