const mongoose = require('mongoose');

const awayModeEventSchema = new mongoose.Schema(
  {
    homeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    awayModeSettingId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'overview_viewed',
        'toggled',
        'schedule_saved',
        'temporary_code_generated',
        'safe_drop_updated',
        'video_recording_updated',
      ],
      index: true,
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AwayModeEvent', awayModeEventSchema);
