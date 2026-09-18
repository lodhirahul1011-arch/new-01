const crypto = require('crypto');

const AwayModeSetting = require('../models/AwayModeSetting');
const AwayModeEvent = require('../models/AwayModeEvent');
const { writeAudit } = require('./audit.service');
const { safeLog } = require('../utils/logger');
const {
  createHttpError,
  resolveActorContext,
  assertCanRead,
  assertCanManage,
} = require('./homeAccess.service');
const {
  compareHHmm,
  formatTimeWindowLabel,
  formatCurrency,
  zonedLocalToUtc,
  getLocalParts,
  addDays,
  formatTimeLabel,
  isValidTimeZone,
} = require('../utils/time');

const DEFAULT_REPEAT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const HOW_IT_WORKS = [
  'Delivery comes – You get instant push notification',
  'Approve in 60 sec – Second alert expires at 60 sec',
  'Still no response in 30 sec – Second alert sent',
  'Backup uses code – You get final approval request with live video',
];

const PRESETS = [
  { key: 'business_hours', label: 'Business Hours', startTime: '09:00', endTime: '17:00' },
  { key: 'extended_hours', label: 'Extended Hours', startTime: '08:00', endTime: '18:00' },
  { key: 'full_day', label: 'Full Day', startTime: '07:00', endTime: '19:00' },
  { key: 'afternoon_evening', label: 'Afternoon/Evening', startTime: '12:00', endTime: '21:00' },
];

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function weekdayForDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  return WEEKDAY_KEYS[utcDate.getUTCDay()];
}

function defaultPayload(homeId, userId) {
  const now = new Date();
  return {
    homeId,
    enabled: false,
    modeStatus: 'inactive',
    schedule: {
      timezone: 'Asia/Kolkata',
      startTime: '08:30',
      endTime: '18:00',
      repeatDays: [...DEFAULT_REPEAT_DAYS],
      preset: 'business_hours',
    },
    backupPerson: {
      enabled: false,
      type: 'none',
      name: '',
      memberId: null,
      backupAssignmentId: null,
    },
    safeDrop: {
      enabled: true,
      mode: 'low_value_only',
      maxValue: 2000,
      currency: 'INR',
      instructions: 'Package will be left at designated safe drop location with video recording.',
    },
    videoRecording: {
      enabled: true,
      mode: 'away_only',
    },
    temporaryCode: {
      codeHash: '',
      displayCode: '',
      status: 'inactive',
      validFrom: null,
      validUntil: null,
      generatedAt: null,
      usedAt: null,
      revokedAt: null,
    },
    autoAccept: {
      enabled: true,
      maxValue: 2000,
      currency: 'INR',
    },
    audit: {
      lastUpdatedByUserId: userId || null,
      lastUpdatedAt: now,
    },
  };
}

async function findOrCreateSetting(homeId, userId) {
  let setting = await AwayModeSetting.findOne({ homeId });
  if (!setting) {
    setting = await AwayModeSetting.create(defaultPayload(homeId, userId));
  }
  return setting;
}

function computeWindows(setting, now = new Date()) {
  const schedule = setting.schedule || {};
  const timeZone = schedule.timezone || 'Asia/Kolkata';
  const startTime = schedule.startTime || '08:30';
  const endTime = schedule.endTime || '18:00';
  const repeatDays = Array.isArray(schedule.repeatDays) && schedule.repeatDays.length ? schedule.repeatDays : DEFAULT_REPEAT_DAYS;
  const localNow = getLocalParts(now, timeZone);
  const isRepeatDay = repeatDays.includes(localNow.weekday);
  const inTimeWindow = compareHHmm(localNow.time, startTime) >= 0 && compareHHmm(localNow.time, endTime) <= 0;

  let activeWindow = null;
  if (isRepeatDay) {
    activeWindow = {
      dateKey: localNow.dateKey,
      startAt: zonedLocalToUtc(localNow.dateKey, startTime, timeZone),
      endAt: zonedLocalToUtc(localNow.dateKey, endTime, timeZone),
    };
  }

  let nextWindow = null;
  for (let offset = 0; offset < 14; offset += 1) {
    const candidateDateKey = addDays(localNow.dateKey, offset);
    const candidateWeekday = weekdayForDateKey(candidateDateKey);
    if (!repeatDays.includes(candidateWeekday)) continue;
    if (offset === 0 && compareHHmm(localNow.time, endTime) > 0) continue;
    nextWindow = {
      dateKey: candidateDateKey,
      startAt: zonedLocalToUtc(candidateDateKey, startTime, timeZone),
      endAt: zonedLocalToUtc(candidateDateKey, endTime, timeZone),
    };
    break;
  }

  const isActive = Boolean(setting.enabled && isRepeatDay && inTimeWindow);
  const modeStatus = !setting.enabled ? 'inactive' : isActive ? 'active' : 'scheduled';

  return {
    timeZone,
    localNow,
    startTime,
    endTime,
    repeatDays,
    isRepeatDay,
    isActive,
    modeStatus,
    activeWindow,
    nextWindow,
  };
}

function computeSafeDropLabel(safeDrop) {
  const mode = safeDrop && safeDrop.mode ? safeDrop.mode : 'low_value_only';
  if (mode === 'disabled') return 'Disabled';
  if (mode === 'always') return 'For all items';
  return 'For low-value items';
}

function isTemporaryCodeExpired(setting, now = new Date()) {
  const code = setting.temporaryCode || {};
  return code.status === 'active' && code.validUntil && new Date(code.validUntil).getTime() < now.getTime();
}

async function syncTemporaryCodeIfNeeded(setting, now = new Date()) {
  if (!setting) return setting;
  if (isTemporaryCodeExpired(setting, now)) {
    setting.temporaryCode.status = 'expired';
    setting.audit = setting.audit || {};
    setting.audit.lastUpdatedAt = now;
    if (typeof setting.save === 'function') {
      await setting.save();
    } else {
      await AwayModeSetting.updateOne(
        { _id: setting._id },
        {
          $set: {
            'temporaryCode.status': 'expired',
            'audit.lastUpdatedAt': now,
          },
        }
      );
    }
  }
  return setting;
}

async function logEvent(setting, action, createdByUserId, meta) {
  try {
    await AwayModeEvent.create({
      homeId: setting.homeId,
      awayModeSettingId: setting._id,
      action,
      createdByUserId: createdByUserId || null,
      meta: meta || {},
    });
  } catch (err) {
    safeLog('[AWAY_MODE][EVENT]', 'failed to write event', { action, error: err.message });
  }
}

function buildOverviewPayload(setting, now = new Date()) {
  const schedule = setting.schedule || {};
  const windows = computeWindows(setting, now);
  const activeUntil = windows.isActive && windows.activeWindow ? windows.activeWindow.endAt : null;
  const nextWindowStart = !windows.isActive && windows.nextWindow ? windows.nextWindow.startAt : null;
  const temp = setting.temporaryCode || {};
  const tempAvailable = Boolean(temp.displayCode && temp.status === 'active' && temp.validUntil && new Date(temp.validUntil).getTime() >= now.getTime());
  const backup = setting.backupPerson || {};
  const autoAccept = setting.autoAccept || {};
  const safeDrop = setting.safeDrop || {};
  const videoRecording = setting.videoRecording || {};
  const scheduleLabel = formatTimeWindowLabel(schedule.startTime, schedule.endTime, 'UTC');

  let statusLabel = 'Away Mode Off';
  let activeUntilLabel = 'Away mode is off';
  if (setting.enabled && windows.isActive && activeUntil) {
    statusLabel = 'Currently Away';
    activeUntilLabel = `Active until ${formatTimeLabel(schedule.endTime, 'UTC')}`;
  } else if (setting.enabled) {
    statusLabel = 'Away Mode Scheduled';
    activeUntilLabel = nextWindowStart
      ? `Next active window starts ${formatTimeLabel(schedule.startTime, 'UTC')}`
      : 'Away mode scheduled';
  }

  return {
    enabled: Boolean(setting.enabled),
    modeStatus: windows.modeStatus,
    statusLabel,
    activeUntil,
    activeUntilLabel,
    temporaryCode: {
      available: tempAvailable,
      code: tempAvailable ? temp.displayCode : '',
      status: temp.status || 'inactive',
      validFrom: temp.validFrom || null,
      validUntil: temp.validUntil || null,
    },
    cards: {
      timeSchedule: {
        title: 'Time Schedule',
        value: scheduleLabel,
      },
      backupPerson: {
        title: 'Backup Person',
        value: backup.name || '',
        subLabel: backup.type === 'auto_generated' ? 'Auto-generated' : backup.type === 'manual' ? 'Assigned' : '',
        available: Boolean(backup.enabled && backup.name),
      },
      safeDropZone: {
        title: 'Safe Drop Zone',
        value: computeSafeDropLabel(safeDrop),
      },
      videoRecording: {
        title: 'Video Recording',
        value: videoRecording.enabled ? 'Active' : 'Off',
        indicator: videoRecording.enabled ? 'recording' : 'off',
      },
    },
    autoAccept: {
      enabled: Boolean(autoAccept.enabled),
      currency: autoAccept.currency || 'INR',
      maxValue: Number(autoAccept.maxValue || 0),
      label: `Auto-accept packages under ${formatCurrency(autoAccept.maxValue || 0, autoAccept.currency || 'INR')}`,
    },
    schedule: {
      timezone: schedule.timezone || 'Asia/Kolkata',
      startTime: schedule.startTime || '08:30',
      endTime: schedule.endTime || '18:00',
      repeatDays: Array.isArray(schedule.repeatDays) && schedule.repeatDays.length ? schedule.repeatDays : [...DEFAULT_REPEAT_DAYS],
      preset: schedule.preset || 'business_hours',
      selectedScheduleLabel: scheduleLabel,
    },
    howItWorks: [...HOW_IT_WORKS],
  };
}

function generateCode() {
  return crypto.randomInt(1000, 10000).toString();
}

function hashCode(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

async function ensureTemporaryCodeForHome(homeId, userId, options = {}) {
  const forceRegenerate = Boolean(options.forceRegenerate);
  const now = new Date();
  const setting = await findOrCreateSetting(homeId, userId);
  await syncTemporaryCodeIfNeeded(setting, now);

  const existing = setting.temporaryCode || {};
  const hasActiveCode = existing.status === 'active' && existing.displayCode && existing.validUntil && new Date(existing.validUntil).getTime() >= now.getTime();
  if (hasActiveCode && !forceRegenerate) {
    return {
      code: existing.displayCode,
      status: existing.status,
      validFrom: existing.validFrom || null,
      validUntil: existing.validUntil || null,
      setting,
    };
  }

  const windows = computeWindows(setting, now);
  const validUntil = windows.isActive && windows.activeWindow
    ? windows.activeWindow.endAt
    : windows.nextWindow
      ? windows.nextWindow.endAt
      : new Date(now.getTime() + 10 * 60 * 60 * 1000);

  const rawCode = generateCode();
  setting.temporaryCode = {
    codeHash: hashCode(rawCode),
    displayCode: rawCode,
    status: 'active',
    validFrom: now,
    validUntil,
    generatedAt: now,
    usedAt: null,
    revokedAt: null,
  };
  setting.audit = setting.audit || {};
  setting.audit.lastUpdatedByUserId = userId || null;
  setting.audit.lastUpdatedAt = now;
  if (typeof setting.save === 'function') {
    await setting.save();
  } else {
    await AwayModeSetting.updateOne(
      { _id: setting._id },
      {
        $set: {
          temporaryCode: setting.temporaryCode,
          audit: setting.audit,
        },
      }
    );
  }

  await logEvent(setting, 'temporary_code_generated', userId, {
    forceRegenerate,
    validUntil,
  });

  await writeAudit({
    scope: 'away_mode',
    action: 'temporary_code_generated',
    status: 'success',
    userId,
    details: { homeId: String(homeId), validUntil },
  });

  return {
    code: rawCode,
    status: 'active',
    validFrom: now,
    validUntil,
    setting,
  };
}

async function setBackupPersonLink(homeId, userId, payload) {
  const setting = await findOrCreateSetting(homeId, userId);
  const nextValue = {
    enabled: Boolean(payload && payload.enabled),
    type: payload && payload.type ? payload.type : 'none',
    name: payload && payload.name ? payload.name : '',
    memberId: payload && payload.memberId ? payload.memberId : null,
    backupAssignmentId: payload && payload.backupAssignmentId ? payload.backupAssignmentId : null,
  };
  setting.backupPerson = nextValue;
  setting.audit = setting.audit || {};
  setting.audit.lastUpdatedByUserId = userId || null;
  setting.audit.lastUpdatedAt = new Date();
  if (typeof setting.save === 'function') {
    await setting.save();
  } else {
    await AwayModeSetting.updateOne({ _id: setting._id }, { $set: { backupPerson: nextValue, audit: setting.audit } });
  }
  return setting;
}

async function getOverview(user) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanRead(actor);
  const setting = await findOrCreateSetting(homeId, user._id);
  await syncTemporaryCodeIfNeeded(setting);
  await logEvent(setting, 'overview_viewed', user._id, {});
  return buildOverviewPayload(setting);
}

async function toggleAwayMode(user, payload) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanManage(actor);
  const now = new Date();
  const setting = await findOrCreateSetting(homeId, user._id);
  setting.enabled = Boolean(payload.enabled);
  setting.modeStatus = computeWindows(setting, now).modeStatus;
  setting.audit = setting.audit || {};
  setting.audit.lastUpdatedByUserId = user._id;
  setting.audit.lastUpdatedAt = now;
  await setting.save();
  await logEvent(setting, 'toggled', user._id, { enabled: setting.enabled });
  return {
    enabled: setting.enabled,
    modeStatus: setting.modeStatus,
  };
}

async function saveSchedule(user, payload) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanManage(actor);
  if (!isValidTimeZone(payload.timezone)) {
    throw createHttpError(400, 'INVALID_TIMEZONE', 'Unsupported timezone');
  }
  if (compareHHmm(payload.endTime, payload.startTime) <= 0) {
    throw createHttpError(400, 'INVALID_TIME_RANGE', 'End time must be after start time');
  }

  const now = new Date();
  const setting = await findOrCreateSetting(homeId, user._id);
  setting.schedule = {
    timezone: payload.timezone,
    startTime: payload.startTime,
    endTime: payload.endTime,
    repeatDays: payload.repeatDays,
    preset: payload.preset,
  };
  setting.modeStatus = computeWindows(setting, now).modeStatus;
  setting.audit = setting.audit || {};
  setting.audit.lastUpdatedByUserId = user._id;
  setting.audit.lastUpdatedAt = now;

  if (setting.temporaryCode && setting.temporaryCode.status === 'active') {
    const windows = computeWindows(setting, now);
    setting.temporaryCode.validUntil = windows.isActive && windows.activeWindow
      ? windows.activeWindow.endAt
      : windows.nextWindow
        ? windows.nextWindow.endAt
        : setting.temporaryCode.validUntil;
  }

  await setting.save();
  await logEvent(setting, 'schedule_saved', user._id, { preset: payload.preset });

  return {
    timezone: setting.schedule.timezone,
    startTime: setting.schedule.startTime,
    endTime: setting.schedule.endTime,
    repeatDays: setting.schedule.repeatDays,
    preset: setting.schedule.preset,
    scheduleLabel: formatTimeWindowLabel(setting.schedule.startTime, setting.schedule.endTime, 'UTC'),
  };
}

async function generateTemporaryCodeForUser(user, payload) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanManage(actor);
  const data = await ensureTemporaryCodeForHome(homeId, user._id, payload || {});
  return {
    code: data.code,
    status: data.status,
    validFrom: data.validFrom,
    validUntil: data.validUntil,
  };
}

async function updateSafeDrop(user, payload) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanManage(actor);
  const setting = await findOrCreateSetting(homeId, user._id);
  const now = new Date();
  setting.safeDrop = {
    enabled: Boolean(payload.enabled),
    mode: payload.mode,
    maxValue: payload.maxValue,
    currency: payload.currency,
    instructions: payload.instructions,
  };
  setting.autoAccept = {
    enabled: Boolean(payload.enabled),
    maxValue: payload.maxValue,
    currency: payload.currency,
  };
  setting.audit = setting.audit || {};
  setting.audit.lastUpdatedByUserId = user._id;
  setting.audit.lastUpdatedAt = now;
  await setting.save();
  await logEvent(setting, 'safe_drop_updated', user._id, { mode: payload.mode });
  return JSON.parse(JSON.stringify(setting.safeDrop));
}

async function updateVideoRecording(user, payload) {
  const { homeId, actor } = await resolveActorContext(user);
  assertCanManage(actor);
  const setting = await findOrCreateSetting(homeId, user._id);
  const now = new Date();
  setting.videoRecording = {
    enabled: Boolean(payload.enabled),
    mode: payload.mode,
  };
  setting.audit = setting.audit || {};
  setting.audit.lastUpdatedByUserId = user._id;
  setting.audit.lastUpdatedAt = now;
  await setting.save();
  await logEvent(setting, 'video_recording_updated', user._id, { mode: payload.mode });
  return {
    enabled: setting.videoRecording.enabled,
    mode: setting.videoRecording.mode,
    label: setting.videoRecording.enabled ? 'Active' : 'Off',
  };
}

async function getPresets() {
  return PRESETS.map((entry) => ({ ...entry }));
}

module.exports = {
  PRESETS,
  HOW_IT_WORKS,
  findOrCreateSetting,
  ensureTemporaryCodeForHome,
  setBackupPersonLink,
  getOverview,
  toggleAwayMode,
  saveSchedule,
  generateTemporaryCodeForUser,
  updateSafeDrop,
  updateVideoRecording,
  getPresets,
};
