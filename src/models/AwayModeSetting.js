const mongoose = require('mongoose');

const awayModeSettingSchema = new mongoose.Schema(
  {
    homeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    enabled: {
      type: Boolean,
      default: false,
      index: true,
    },

    modeStatus: {
      type: String,
      enum: ['inactive', 'active', 'scheduled'],
      default: 'inactive',
      index: true,
    },

    schedule: {
      timezone: {
        type: String,
        default: 'Asia/Kolkata',
      },
      startTime: {
        type: String,
        default: '08:30',
      },
      endTime: {
        type: String,
        default: '18:00',
      },
      repeatDays: {
        type: [String],
        default: ['mon', 'tue', 'wed', 'thu', 'fri'],
        enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      },
      preset: {
        type: String,
        default: 'business_hours',
        enum: ['business_hours', 'extended_hours', 'full_day', 'afternoon_evening', 'custom'],
      },
    },

    backupPerson: {
      enabled: {
        type: Boolean,
        default: false,
      },
      type: {
        type: String,
        enum: ['none', 'auto_generated', 'manual'],
        default: 'none',
      },
      name: {
        type: String,
        default: '',
      },
      memberId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      backupAssignmentId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
    },

    safeDrop: {
      enabled: {
        type: Boolean,
        default: true,
      },
      mode: {
        type: String,
        enum: ['disabled', 'low_value_only', 'always'],
        default: 'low_value_only',
      },
      maxValue: {
        type: Number,
        default: 2000,
      },
      currency: {
        type: String,
        default: 'INR',
      },
      instructions: {
        type: String,
        default: 'Package will be left at designated safe drop location with video recording.',
      },
    },

    videoRecording: {
      enabled: {
        type: Boolean,
        default: true,
      },
      mode: {
        type: String,
        enum: ['off', 'away_only', 'always'],
        default: 'away_only',
      },
    },

    temporaryCode: {
      codeHash: {
        type: String,
        default: '',
      },
      displayCode: {
        type: String,
        default: '',
      },
      status: {
        type: String,
        enum: ['inactive', 'active', 'expired', 'revoked', 'used'],
        default: 'inactive',
        index: true,
      },
      validFrom: {
        type: Date,
        default: null,
      },
      validUntil: {
        type: Date,
        default: null,
      },
      generatedAt: {
        type: Date,
        default: null,
      },
      usedAt: {
        type: Date,
        default: null,
      },
      revokedAt: {
        type: Date,
        default: null,
      },
    },

    autoAccept: {
      enabled: {
        type: Boolean,
        default: true,
      },
      maxValue: {
        type: Number,
        default: 2000,
      },
      currency: {
        type: String,
        default: 'INR',
      },
    },

    audit: {
      lastUpdatedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      lastUpdatedAt: {
        type: Date,
        default: null,
      },
    },
  },
  { timestamps: true }
);

// awayModeSettingSchema.index({ homeId: 1 }, { unique: true });

module.exports = mongoose.model('AwayModeSetting', awayModeSettingSchema);
