const fs = require('fs');
const path = require('path');

const TabletCallSession = require('../models/TabletCallSession');
const TabletRecording = require('../models/TabletRecording');
const VisitorSession = require('../models/VisitorSession');
const DeliverySession = require('../models/DeliverySession');
const Delivery = require('../models/Delivery');
const Device = require('../models/Device');
const User = require('../models/User');
const { resolveHomeId } = require('../utils/home');
const { safeLog } = require('../utils/logger');
const realtime = require('./realtime.service');
const { computeOnlineStatus } = require('./devicePresenceMonitor.service');
const { sendIncomingCallNotification, sendCallEndedNotification } = require('./pushNotification.service');
const { writeAudit } = require('./audit.service');
const { putObject, getProvider, createPresignedGetUrl, getLocalAbsolutePath } = require('../utils/objectStorage');
const { createTempToken, verifyTempToken } = require('../utils/tempLinks');
const { generateVideoThumbnail, sha256File } = require('../utils/video');

const ACTIVE_CALL_STATES = ['ringing', 'calling', 'connecting', 'answered'];
const OPEN_LIVE_FEED_CALL_STATES = [...ACTIVE_CALL_STATES, 'paused'];
const LIVE_FEED_CALL_TYPE = 'live_feed';
const BLOCKED_SDP_LINES = new Set(['a=extmap-allow-mixed']);
const MAX_SIGNALING_ICE_CANDIDATES = 80;
const NO_ANSWER_CALL_TIMEOUT_MS = 45_000;
const NO_ANSWER_TIMEOUT_REASON = 'no_answer_timeout';

function createHttpError(status, code, message, details) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details) err.details = details;
  return err;
}

function getHomeIdFromDevice(device) {
  return device.linkedHomeId || device.ownerUserId || null;
}

function sanitizeWebRtcSdp(rawSdp) {
  const normalizedLines = String(rawSdp || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0)
    .filter(line => !BLOCKED_SDP_LINES.has(line));

  if (!normalizedLines.length) {
    return '';
  }

  return `${normalizedLines.join('\r\n')}\r\n`;
}

function summarizeTabletDevice(device) {
  if (!device) return null;
  return {
    id: String(device._id),
    deviceId: device.deviceId,
    name: device.name || 'Dvaari Tablet',
    type: device.type || 'tablet',
    displayName: device.settings?.displayName || device.name || 'Dvaari Tablet',
    onlineStatus: computeOnlineStatus(device),
    lastSeenAt: device.lastSeenAt || null,
    linkedHomeId: device.linkedHomeId || null,
  };
}

async function findLinkedTabletForHome(homeId) {
  if (!homeId) return null;
  return Device.findOne({
    type: 'tablet',
    linkedHomeId: homeId,
    isLinked: true,
  }).sort({ lastSeenAt: -1, createdAt: -1 });
}

async function findActiveLiveFeedCall({ homeId, tabletDeviceId }) {
  return TabletCallSession.findOne({
    homeId,
    tabletDeviceId,
    type: LIVE_FEED_CALL_TYPE,
    state: { $in: ACTIVE_CALL_STATES },
  }).sort({ createdAt: -1 });
}

async function findResidentActiveAudioCall({ homeId, residentUserId, excludeCallId }) {
  if (!homeId || !residentUserId) return null;

  const call = await TabletCallSession.findOne({
    homeId,
    residentUserId,
    type: { $ne: LIVE_FEED_CALL_TYPE },
    state: { $in: ACTIVE_CALL_STATES },
    ...(excludeCallId ? { _id: { $ne: excludeCallId } } : {}),
  }).sort({ updatedAt: -1, createdAt: -1 });

  if (!call) return null;
  const nextCall = await expireNoAnswerCallIfNeeded(call);
  return ACTIVE_CALL_STATES.includes(String(nextCall.state || '')) ? nextCall : null;
}

async function findOpenLiveFeedCall({ homeId, tabletDeviceId }) {
  return TabletCallSession.findOne({
    homeId,
    tabletDeviceId,
    type: LIVE_FEED_CALL_TYPE,
    state: { $in: OPEN_LIVE_FEED_CALL_STATES },
  }).sort({ createdAt: -1 });
}

function resetLiveFeedNegotiation(call) {
  call.signaling = {
    offerSdp: '',
    answerSdp: '',
    offerCreatedAt: null,
    answerCreatedAt: null,
    iceCandidates: [],
  };
  call.answeredAt = null;
}

function resetAnswerForFreshOffer(call, offerSdp) {
  call.signaling.offerSdp = offerSdp;
  call.signaling.offerCreatedAt = new Date();
  call.signaling.answerSdp = '';
  call.signaling.answerCreatedAt = null;
  call.signaling.iceCandidates = [];
}

function appendUniqueIceCandidate(call, from, payload) {
  const candidate = String(payload.candidate || '').trim();
  if (!candidate) {
    return false;
  }

  const sdpMid = payload.sdpMid || '';
  const sdpMLineIndex = Number.isFinite(payload.sdpMLineIndex)
    ? payload.sdpMLineIndex
    : null;

  const candidates = Array.isArray(call.signaling?.iceCandidates)
    ? call.signaling.iceCandidates
    : [];

  const exists = candidates.some(item => (
    item.from === from &&
    item.candidate === candidate &&
    (item.sdpMid || '') === sdpMid &&
    (Number.isFinite(item.sdpMLineIndex) ? item.sdpMLineIndex : null) === sdpMLineIndex
  ));

  if (exists) {
    return false;
  }

  candidates.push({
    from,
    candidate,
    sdpMid,
    sdpMLineIndex,
    createdAt: new Date(),
  });

  if (candidates.length > MAX_SIGNALING_ICE_CANDIDATES) {
    candidates.splice(0, candidates.length - MAX_SIGNALING_ICE_CANDIDATES);
  }

  call.signaling.iceCandidates = candidates;
  return true;
}

function assertCallStateAllowsAction(call, action) {
  const state = String(call?.state || '').trim();
  if (ACTIVE_CALL_STATES.includes(state)) {
    return;
  }

  safeLog('[TabletLive]', 'Rejected stale tablet call action', {
    callId: String(call?._id || ''),
    action,
    state,
    endReason: String(call?.endReason || ''),
  });
  throw createHttpError(409, 'CALL_NOT_ACTIVE', 'Call session is no longer active', {
    state,
    endReason: call?.endReason || '',
  });
}

function shouldIgnoreResidentAudioCleanupEnd(call, reason) {
  if (!['ended_by_resident_audio_call', 'mobile_audio_cleanup'].includes(reason)) {
    return false;
  }

  const state = String(call?.state || '').trim();
  if (!['calling', 'connecting', 'answered'].includes(state)) {
    return false;
  }

  safeLog('[TabletLiveService]', 'ignored_resident_audio_cleanup_end', {
    callId: String(call._id || ''),
    state,
    reason,
    hasOffer: Boolean(call?.signaling?.offerSdp),
    hasAnswer: Boolean(call?.signaling?.answerSdp),
  });
  return true;
}

function shouldExpireNoAnswerCall(call, now = new Date()) {
  if (!call || call.type === LIVE_FEED_CALL_TYPE || call.answeredAt || call.endedAt) {
    return false;
  }

  const state = String(call.state || '').trim();
  if (!['ringing', 'calling', 'connecting'].includes(state)) {
    return false;
  }

  const startedAt = call.callStartedAt || call.createdAt || call.updatedAt;
  const startedAtMs = startedAt ? new Date(startedAt).getTime() : 0;
  if (!startedAtMs) {
    safeLog('[TabletLiveService]', 'no_answer_timeout_check_skipped', {
      callId: String(call._id || ''),
      reason: 'missing_started_at',
    });
    return false;
  }

  const ageMs = now.getTime() - startedAtMs;
  return ageMs >= NO_ANSWER_CALL_TIMEOUT_MS;
}

async function expireNoAnswerCallIfNeeded(call, options = {}) {
  if (!shouldExpireNoAnswerCall(call)) {
    return call;
  }

  const device = options.device || await Device.findById(call.tabletDeviceId).select('deviceId');
  call.state = 'missed';
  call.endedAt = new Date();
  call.endReason = NO_ANSWER_TIMEOUT_REASON;
  await call.save();

  safeLog('[TabletLiveService]', 'no_answer_timeout_expired', {
    callId: String(call._id),
    type: call.type,
    residentUserId: String(call.residentUserId || ''),
    tabletDeviceId: String(call.tabletDeviceId || ''),
    deviceId: String(device?.deviceId || ''),
  });

  auditTabletCallCheckpoint({
    action: 'tablet_call_no_answer_timeout',
    call,
    details: {
      reason: NO_ANSWER_TIMEOUT_REASON,
      timeoutMs: NO_ANSWER_CALL_TIMEOUT_MS,
      deviceId: String(device?.deviceId || ''),
    },
  });

  realtime.publishMany(
    {
      userId: call.residentUserId,
      homeId: call.homeId,
      deviceId: device?.deviceId,
      callId: call._id,
    },
    'tablet.call.ended',
    { call: summarizeCall(call), reason: NO_ANSWER_TIMEOUT_REASON }
  );
  await notifyResidentCallEnded(call, NO_ANSWER_TIMEOUT_REASON);
  return call;
}

async function notifyResidentCallEnded(call, reason) {
  if (!call?.residentUserId) {
    safeLog('[TabletLiveService]', 'call_ended_push_skipped', {
      callId: String(call?._id || ''),
      reason: 'missing_resident_user',
    });
    return;
  }

  try {
    const residentUser = await User.findById(call.residentUserId).select('_id preferences fcmTokens');
    if (!residentUser) {
      safeLog('[TabletLiveService]', 'call_ended_push_skipped', {
        callId: String(call._id),
        residentUserId: String(call.residentUserId),
        reason: 'resident_user_not_found',
      });
      return;
    }

    const pushResult = await sendCallEndedNotification(residentUser, {
      callId: String(call._id),
      callType: call.type,
      reason,
      preferenceKey: call.type === 'delivery' ? 'deliveryNotifications' : 'doorbellAlerts',
    });

    safeLog('[TabletLiveService]', 'call_ended_push_result', {
      callId: String(call._id),
      type: call.type,
      residentUserId: String(call.residentUserId),
      sent: Number(pushResult?.sent || 0),
      failed: Number(pushResult?.failed || 0),
      reason:
        pushResult?.reason ||
        pushResult?.error ||
        (pushResult?.skipped ? 'skipped' : ''),
    });
  } catch (error) {
    safeLog('[TabletLiveService]', 'call_ended_push_failed', {
      callId: String(call._id),
      residentUserId: String(call.residentUserId),
      error: error.message,
    });
  }
}

function auditTabletCallCheckpoint({ action, status = 'success', call, details = {} }) {
  writeAudit({
    scope: 'tablet_call',
    action,
    status,
    userId: call?.residentUserId || null,
    requestId: call?._id ? String(call._id) : undefined,
    details: {
      callId: call?._id ? String(call._id) : '',
      tabletDeviceId: call?.tabletDeviceId ? String(call.tabletDeviceId) : '',
      state: String(call?.state || ''),
      endReason: String(call?.endReason || ''),
      ...details,
    },
  }).catch(error => {
    safeLog('[TabletLiveService]', 'audit_checkpoint_failed', {
      action,
      callId: String(call?._id || ''),
      error: error.message,
    });
  });
}

function buildLiveFeedResponse({ status, tablet, call }) {
  return {
    status,
    tablet: summarizeTabletDevice(tablet),
    call: call ? summarizeCall(call) : null,
    signaling: call ? summarizeSignaling(call) : null,
  };
}

function canAccessHome(user, homeId) {
  const userHomeId = resolveHomeId(user);
  return userHomeId && String(userHomeId) === String(homeId);
}

async function resolveResidentUserId(device) {
  if (device.ownerUserId) return device.ownerUserId;
  const refreshed = await Device.findById(device._id).select('ownerUserId linkedHomeId');
  return refreshed?.ownerUserId || null;
}

function summarizeCall(call) {
  return {
    id: String(call._id),
    type: call.type,
    state: call.state,
    ringCount: call.ringCount,
    autoStartThreshold: call.autoStartThreshold,
    liveVideoRequested: Boolean(call.liveVideoRequested),
    note: call.note || '',
    callStartedAt: call.callStartedAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
    endReason: call.endReason || '',
    visitorSessionId: call.visitorSessionId || null,
    deliverySessionId: call.deliverySessionId || null,
    deliveryId: call.deliveryId || null,
    tabletDeviceId: call.tabletDeviceId,
    residentUserId: call.residentUserId || null,
    otpDisplay: {
      visible: Boolean(call.otpDisplay?.code),
      code: call.otpDisplay?.code || '',
      label: call.otpDisplay?.label || '',
      shownAt: call.otpDisplay?.shownAt || null,
      expiresAt: call.otpDisplay?.expiresAt || null,
    },
    recording: {
      status: call.recording?.status || 'idle',
      startedAt: call.recording?.startedAt || null,
      stoppedAt: call.recording?.stoppedAt || null,
      latestRecordingId: call.recording?.latestRecordingId || null,
    },
    signaling: {
      hasOffer: Boolean(call.signaling?.offerSdp),
      hasAnswer: Boolean(call.signaling?.answerSdp),
      iceCandidateCount: Array.isArray(call.signaling?.iceCandidates) ? call.signaling.iceCandidates.length : 0,
    },
    createdAt: call.createdAt,
    updatedAt: call.updatedAt,
  };
}

function summarizeSignaling(call) {
  return {
    callId: String(call._id),
    type: call.type,
    state: call.state,
    offerSdp: call.signaling?.offerSdp || '',
    answerSdp: call.signaling?.answerSdp || '',
    offerCreatedAt: call.signaling?.offerCreatedAt || null,
    answerCreatedAt: call.signaling?.answerCreatedAt || null,
    iceCandidates: Array.isArray(call.signaling?.iceCandidates) ? call.signaling.iceCandidates : [],
    updatedAt: call.updatedAt,
  };
}

function summarizeRecording(recording, tempUrl = '') {
  return {
    id: String(recording._id),
    type: recording.type,
    status: recording.status,
    storageProvider: recording.storageProvider,
    fileName: recording.fileName,
    mimeType: recording.mimeType,
    sizeBytes: recording.sizeBytes,
    durationSeconds: recording.durationSeconds,
    deliveryId: recording.deliveryId || null,
    deliverySessionId: recording.deliverySessionId || null,
    visitorSessionId: recording.visitorSessionId || null,
    callSessionId: recording.callSessionId || null,
    readyAt: recording.readyAt,
    thumbnailReady: Boolean(recording.thumbnailStorageKey),
    thumbnailUrl: recording.thumbnailStorageKey ? `/api/v1/tablet/recordings/${recording._id}/thumbnail` : '',
    tempUrl,
    createdAt: recording.createdAt,
  };
}

async function resolveDeliveryFromIdentifiers(homeId, { orderId, awbCode }) {
  const ors = [];
  if (orderId) ors.push({ orderId: String(orderId).trim() });
  if (awbCode) ors.push({ awbCode: String(awbCode).trim() });
  if (!ors.length) return null;
  return Delivery.findOne({ homeId, $or: ors });
}

async function resolveDeliverySessionForHome(homeId, deliverySessionId) {
  if (!deliverySessionId) return null;
  return DeliverySession.findOne({ _id: deliverySessionId, homeId });
}

async function initiateCall(device, payload = {}) {
  const homeId = getHomeIdFromDevice(device);
  if (!homeId) throw createHttpError(409, 'TABLET_NOT_LINKED', 'Tablet is not linked to a home');

  const type = payload.type || 'doorbell';
  const residentUserId = await resolveResidentUserId(device);
  let visitorSession = null;
  let deliverySession = null;
  let delivery = null;

  if (payload.visitorSessionId) {
    visitorSession = await VisitorSession.findOne({ _id: payload.visitorSessionId, homeId, tabletDeviceId: device._id });
    if (!visitorSession) throw createHttpError(404, 'VISITOR_SESSION_NOT_FOUND', 'Visitor session not found');
  }

  if (payload.deliverySessionId) {
    deliverySession = await resolveDeliverySessionForHome(homeId, payload.deliverySessionId);
    if (!deliverySession) throw createHttpError(404, 'DELIVERY_SESSION_NOT_FOUND', 'Delivery session not found');
    if (deliverySession.deliveryId) {
      delivery = await Delivery.findById(deliverySession.deliveryId);
    }
  } else if (payload.orderId || payload.awbCode) {
    delivery = await resolveDeliveryFromIdentifiers(homeId, payload);
  }

  const activeFilter = {
    homeId,
    tabletDeviceId: device._id,
    type,
    state: { $in: ACTIVE_CALL_STATES },
  };
  if (visitorSession) activeFilter.visitorSessionId = visitorSession._id;
  if (deliverySession) activeFilter.deliverySessionId = deliverySession._id;
  if (delivery) activeFilter.deliveryId = delivery._id;

  let call = await TabletCallSession.findOne(activeFilter).sort({ createdAt: -1 });
  if (call) {
    call = await expireNoAnswerCallIfNeeded(call, { device });
    if (!ACTIVE_CALL_STATES.includes(String(call.state || ''))) {
      call = null;
    }
  }
  const ringIncrement = Math.max(1, Number(payload.ringIncrement || 1));
  const autoStartThreshold = Math.max(1, Number(payload.autoStartThreshold || 3));
  if (!call) {
    call = await TabletCallSession.create({
      homeId,
      tabletDeviceId: device._id,
      residentUserId,
      visitorSessionId: visitorSession?._id || null,
      deliverySessionId: deliverySession?._id || null,
      deliveryId: delivery?._id || deliverySession?.deliveryId || null,
      type,
      state: 'ringing',
      ringCount: ringIncrement,
      autoStartThreshold,
      initiatedBy: 'tablet',
      liveVideoRequested: Boolean(payload.liveVideoRequested),
      note: payload.note || '',
      meta: {
        orderId: payload.orderId || delivery?.orderId || deliverySession?.orderId || '',
        awbCode: payload.awbCode || delivery?.awbCode || deliverySession?.awbCode || '',
        source: payload.source || 'tablet_screen',
      },
    });
  } else {
    call.ringCount += ringIncrement;
    if (payload.note) call.note = payload.note;
    if (typeof payload.liveVideoRequested === 'boolean') call.liveVideoRequested = payload.liveVideoRequested;
    call.autoStartThreshold = autoStartThreshold;
  }

  const shouldStartCall = Boolean(payload.forceStart) || type === LIVE_FEED_CALL_TYPE || call.ringCount >= call.autoStartThreshold;
  if (shouldStartCall && type !== LIVE_FEED_CALL_TYPE) {
    const busyCall = await findResidentActiveAudioCall({
      homeId,
      residentUserId,
      excludeCallId: call._id,
    });

    if (busyCall) {
      call.state = 'failed';
      call.endedAt = new Date();
      call.endReason = 'mobile_busy';
      await call.save();
      safeLog('[TabletLive]', 'Rejected tablet call because resident mobile is busy', {
        callId: String(call._id),
        busyCallId: String(busyCall._id),
        residentUserId: String(residentUserId || ''),
      });
      realtime.publishMany(
        {
          userId: residentUserId,
          homeId,
          deviceId: device.deviceId,
          callId: call._id,
        },
        'tablet.call.rejected',
        { call: summarizeCall(call), reason: 'mobile_busy' }
      );
      return {
        call: summarizeCall(call),
        thresholdReached: true,
      };
    }
  }

  if (shouldStartCall && !['connecting', 'answered', 'ended'].includes(call.state)) {
    call.state = 'calling';
    call.callStartedAt = call.callStartedAt || new Date();
  }
  await call.save();

  if (visitorSession) {
    visitorSession.state = shouldStartCall ? 'resident_notified' : visitorSession.state || 'initiated';
    await visitorSession.save();
  }

  realtime.publishMany(
    {
      userId: residentUserId,
      homeId,
      deviceId: device.deviceId,
      callId: call._id,
    },
    shouldStartCall ? 'tablet.call.started' : 'tablet.call.ringing',
    { call: summarizeCall(call), tabletDeviceId: device.deviceId }
  );

  if (
    shouldStartCall &&
    residentUserId &&
    type !== LIVE_FEED_CALL_TYPE
  ) {
    const incomingCallNotificationSentAt = call.meta?.incomingCallNotificationSentAt
      ? new Date(call.meta.incomingCallNotificationSentAt).getTime()
      : 0;
    const canSendIncomingCallNotification =
      !incomingCallNotificationSentAt ||
      Date.now() - incomingCallNotificationSentAt > 20000;

    try {
      if (canSendIncomingCallNotification) {
        const residentUser = await User.findById(residentUserId).select('_id preferences fcmTokens phone');
        if (residentUser) {
          safeLog('[TabletLiveService]', 'incoming_call_push_attempt', {
            callId: String(call._id),
            type,
            residentUserId: String(residentUser._id),
            tokenCount: Array.isArray(residentUser.fcmTokens) ? residentUser.fcmTokens.length : 0,
          });

          const pushResult = await sendIncomingCallNotification(residentUser, {
            callId: String(call._id),
            callType: type,
            title: 'Visitor at Door',
            tabletDisplayName: device.settings?.displayName || device.name || 'Dvaari Tablet',
            callerName: 'Visitor at Door',
            callerPhone: '',
            note: call.note || '',
            preferenceKey: type === 'delivery' ? 'deliveryNotifications' : 'doorbellAlerts',
          });

          safeLog('[TabletLiveService]', 'incoming_call_push_result', {
            callId: String(call._id),
            type,
            residentUserId: String(residentUser._id),
            sent: Number(pushResult?.sent || 0),
            failed: Number(pushResult?.failed || 0),
            reason:
              pushResult?.reason ||
              pushResult?.error ||
              (pushResult?.skipped ? 'skipped' : ''),
            errorCodes: pushResult?.errorCodes || [],
          });

          if (pushResult?.sent > 0) {
            call.meta = {
              ...(call.meta || {}),
              incomingCallNotificationSentAt: new Date(),
            };
            await call.save();
          }
        } else {
          safeLog('[TabletLiveService]', 'incoming_call_push_skipped', {
            callId: String(call._id),
            type,
            residentUserId: String(residentUserId),
            reason: 'resident_user_not_found',
          });
        }
      } else {
        safeLog('[TabletLiveService]', 'incoming_call_push_skipped', {
          callId: String(call._id),
          type,
          residentUserId: String(residentUserId),
          reason: 'recently_sent',
          incomingCallNotificationSentAt: call.meta?.incomingCallNotificationSentAt || null,
        });
      }
    } catch (error) {
      safeLog('[TabletLiveService]', 'incoming_call_push_failed', {
        callId: String(call._id),
        type,
        residentUserId: String(residentUserId),
        error: error.message,
      });
    }
  }

  return {
    call: summarizeCall(call),
    thresholdReached: shouldStartCall,
  };
}

async function listCalls(user, query = {}) {
  const homeId = resolveHomeId(user);
  const filter = { homeId };
  if (query.state) filter.state = query.state;
  if (query.type) filter.type = query.type;
  const items = await TabletCallSession.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(query.limit || 50), 100));
  return { items: items.map(summarizeCall) };
}

async function getCallSignalingForUser(user, callId) {
  const homeId = resolveHomeId(user);
  let call = await TabletCallSession.findOne({ _id: callId, homeId });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  call = await expireNoAnswerCallIfNeeded(call);
  return summarizeSignaling(call);
}

async function getCallSignalingForDevice(device, callId) {
  const homeId = getHomeIdFromDevice(device);
  let call = await TabletCallSession.findOne({ _id: callId, homeId, tabletDeviceId: device._id });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  call = await expireNoAnswerCallIfNeeded(call, { device });
  return summarizeSignaling(call);
}

async function getCallForUser(user, callId) {
  const homeId = resolveHomeId(user);
  let call = await TabletCallSession.findOne({ _id: callId, homeId });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  call = await expireNoAnswerCallIfNeeded(call);
  return summarizeCall(call);
}

async function getCallForDevice(device, callId) {
  const homeId = getHomeIdFromDevice(device);
  let call = await TabletCallSession.findOne({ _id: callId, homeId, tabletDeviceId: device._id });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  call = await expireNoAnswerCallIfNeeded(call, { device });
  return summarizeCall(call);
}

async function getActiveCallForDevice(device) {
  const homeId = getHomeIdFromDevice(device);
  let call = await TabletCallSession.findOne({
    homeId,
    tabletDeviceId: device._id,
    state: { $in: ACTIVE_CALL_STATES },
  }).sort({ createdAt: -1 });
  if (call) {
    call = await expireNoAnswerCallIfNeeded(call, { device });
  }
  return { item: call ? summarizeCall(call) : null };
}

async function startOrReuseLiveFeedSession(user) {
  const homeId = resolveHomeId(user);
  if (!homeId) {
    throw createHttpError(403, 'HOME_NOT_FOUND', 'Home context not found for live feed');
  }

  const tablet = await findLinkedTabletForHome(homeId);
  if (!tablet) {
    return buildLiveFeedResponse({ status: 'no_tablet_linked', tablet: null, call: null });
  }

  const tabletStatus = summarizeTabletDevice(tablet);
  if (tabletStatus?.onlineStatus !== 'online') {
    return buildLiveFeedResponse({ status: 'tablet_offline', tablet, call: null });
  }

  let call = await findOpenLiveFeedCall({ homeId, tabletDeviceId: tablet._id });
  if (call?.state === 'paused') {
    return buildLiveFeedResponse({ status: 'session_paused', tablet, call });
  }

  if (!call) {
    call = await TabletCallSession.create({
      homeId,
      tabletDeviceId: tablet._id,
      residentUserId: await resolveResidentUserId(tablet),
      type: LIVE_FEED_CALL_TYPE,
      state: 'calling',
      ringCount: 0,
      autoStartThreshold: 1,
      initiatedBy: 'mobile',
      liveVideoRequested: true,
      callStartedAt: new Date(),
      note: 'mobile_live_feed',
      meta: {
        source: 'mobile_live_feed',
        sessionKind: LIVE_FEED_CALL_TYPE,
      },
    });
  } else {
    resetLiveFeedNegotiation(call);
    call.liveVideoRequested = true;
    call.callStartedAt = call.callStartedAt || new Date();
    call.state = 'calling';
    await call.save();
  }

  realtime.publishMany(
    {
      userId: user._id,
      homeId,
      deviceId: tablet.deviceId,
      callId: call._id,
    },
    'tablet.call.started',
    { call: summarizeCall(call), tabletDeviceId: tablet.deviceId }
  );

  return buildLiveFeedResponse({ status: 'session_active', tablet, call });
}

async function getLiveFeedSessionForUser(user) {
  const homeId = resolveHomeId(user);
  if (!homeId) {
    throw createHttpError(403, 'HOME_NOT_FOUND', 'Home context not found for live feed');
  }

  const tablet = await findLinkedTabletForHome(homeId);
  if (!tablet) {
    return buildLiveFeedResponse({ status: 'no_tablet_linked', tablet: null, call: null });
  }

  const call = await findOpenLiveFeedCall({ homeId, tabletDeviceId: tablet._id });
  const tabletStatus = summarizeTabletDevice(tablet);

  if (call) {
    return buildLiveFeedResponse({
      status: call.state === 'paused' ? 'session_paused' : 'session_active',
      tablet,
      call,
    });
  }

  if (tabletStatus?.onlineStatus !== 'online') {
    return buildLiveFeedResponse({ status: 'tablet_offline', tablet, call: null });
  }

  return buildLiveFeedResponse({ status: 'tablet_ready', tablet, call: null });
}

async function getLiveFeedSessionForDevice(device) {
  const homeId = getHomeIdFromDevice(device);
  const call = await findOpenLiveFeedCall({ homeId, tabletDeviceId: device._id });
  if (call) {
    return buildLiveFeedResponse({
      status: call.state === 'paused' ? 'session_paused' : 'session_active',
      tablet: device,
      call,
    });
  }

  return buildLiveFeedResponse({ status: 'tablet_ready', tablet: device, call: null });
}

async function answerCall(user, callId, payload = {}) {
  const homeId = resolveHomeId(user);
  let call = await TabletCallSession.findOne({ _id: callId, homeId });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  call = await expireNoAnswerCallIfNeeded(call);
  assertCallStateAllowsAction(call, 'answer');
  const busyCall = await findResidentActiveAudioCall({
    homeId,
    residentUserId: user._id,
    excludeCallId: call._id,
  });
  if (busyCall) {
    call.state = 'declined';
    call.endedAt = new Date();
    call.endReason = 'mobile_busy';
    await call.save();
    safeLog('[TabletLive]', 'Rejected answer because resident mobile is busy', {
      callId: String(call._id),
      busyCallId: String(busyCall._id),
      residentUserId: String(user._id),
    });
    realtime.publishMany({ userId: user._id, homeId, callId: call._id }, 'tablet.call.rejected', { call: summarizeCall(call), reason: 'mobile_busy' });
    const busyDevice = await Device.findById(call.tabletDeviceId).select('deviceId');
    if (busyDevice?.deviceId) realtime.publishToDevice(busyDevice.deviceId, 'tablet.call.rejected', { call: summarizeCall(call), reason: 'mobile_busy' });
    throw createHttpError(409, 'MOBILE_BUSY', 'Resident mobile is busy on another call');
  }
  call.state = 'answered';
  call.answeredAt = new Date();
  call.callStartedAt = call.callStartedAt || new Date();
  if (typeof payload.liveVideoRequested === 'boolean') call.liveVideoRequested = payload.liveVideoRequested;
  await call.save();
  realtime.publishMany({ userId: user._id, homeId, callId: call._id }, 'tablet.call.answered', { call: summarizeCall(call) });
  const device = await Device.findById(call.tabletDeviceId).select('deviceId');
  if (device?.deviceId) realtime.publishToDevice(device.deviceId, 'tablet.call.answered', { call: summarizeCall(call) });
  return summarizeCall(call);
}

async function rejectCall(user, callId, payload = {}) {
  const homeId = resolveHomeId(user);
  const call = await TabletCallSession.findOne({ _id: callId, homeId });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  call.state = 'declined';
  call.endedAt = new Date();
  call.endReason = payload.reason || 'rejected_by_resident';
  await call.save();
  realtime.publishMany({ userId: user._id, homeId, callId: call._id }, 'tablet.call.rejected', { call: summarizeCall(call) });
  const device = await Device.findById(call.tabletDeviceId).select('deviceId');
  if (device?.deviceId) realtime.publishToDevice(device.deviceId, 'tablet.call.rejected', { call: summarizeCall(call) });
  return summarizeCall(call);
}

async function endCallByUser(user, callId, payload = {}) {
  const homeId = resolveHomeId(user);
  const call = await TabletCallSession.findOne({ _id: callId, homeId });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  const endReason = payload.reason || 'ended_by_resident';
  if (shouldIgnoreResidentAudioCleanupEnd(call, endReason)) {
    return summarizeCall(call);
  }
  call.state = 'ended';
  call.endedAt = new Date();
  call.endReason = endReason;
  if (call.recording?.status === 'recording') {
    call.recording.status = 'stopped';
    call.recording.stoppedAt = new Date();
  }
  await call.save();
  realtime.publishMany({ userId: user._id, homeId, callId: call._id }, 'tablet.call.ended', { call: summarizeCall(call) });
  const device = await Device.findById(call.tabletDeviceId).select('deviceId');
  if (device?.deviceId) realtime.publishToDevice(device.deviceId, 'tablet.call.ended', { call: summarizeCall(call) });
  return summarizeCall(call);
}

async function endCallByDevice(device, callId, payload = {}) {
  const homeId = getHomeIdFromDevice(device);
  const call = await TabletCallSession.findOne({ _id: callId, homeId, tabletDeviceId: device._id });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  call.state = 'ended';
  call.endedAt = new Date();
  const endReason = payload.reason || 'ended_by_tablet';
  call.endReason = endReason;
  if (call.recording?.status === 'recording') {
    call.recording.status = 'stopped';
    call.recording.stoppedAt = new Date();
  }
  await call.save();
  auditTabletCallCheckpoint({
    action: 'tablet_hangup_call',
    call,
    details: {
      reason: endReason,
      deviceId: device.deviceId,
    },
  });
  realtime.publishMany({ userId: call.residentUserId, homeId, deviceId: device.deviceId, callId: call._id }, 'tablet.call.ended', { call: summarizeCall(call) });
  await notifyResidentCallEnded(call, endReason);
  return summarizeCall(call);
}

async function pauseCallByDevice(device, callId, payload = {}) {
  const homeId = getHomeIdFromDevice(device);
  const call = await TabletCallSession.findOne({ _id: callId, homeId, tabletDeviceId: device._id });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  if (call.type !== LIVE_FEED_CALL_TYPE) {
    throw createHttpError(409, 'LIVE_FEED_REQUIRED', 'Only live feed sessions can be paused');
  }

  resetLiveFeedNegotiation(call);
  call.state = 'paused';
  call.note = 'live_feed_paused';
  call.meta = {
    ...(call.meta || {}),
    liveFeedPause: {
      reason: payload.reason || 'camera_in_use',
      pausedAt: new Date(),
    },
  };
  await call.save();

  realtime.publishMany(
    { userId: call.residentUserId, homeId, deviceId: device.deviceId, callId: call._id },
    'tablet.call.paused',
    { call: summarizeCall(call) }
  );
  return summarizeCall(call);
}

async function resumeCallByDevice(device, callId, payload = {}) {
  const homeId = getHomeIdFromDevice(device);
  const call = await TabletCallSession.findOne({ _id: callId, homeId, tabletDeviceId: device._id });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  if (call.type !== LIVE_FEED_CALL_TYPE) {
    throw createHttpError(409, 'LIVE_FEED_REQUIRED', 'Only live feed sessions can be resumed');
  }

  resetLiveFeedNegotiation(call);
  call.state = 'calling';
  call.liveVideoRequested = true;
  call.callStartedAt = call.callStartedAt || new Date();
  call.note = 'live_feed_resumed';
  call.meta = {
    ...(call.meta || {}),
    liveFeedPause: null,
    liveFeedResume: {
      reason: payload.reason || 'camera_released',
      resumedAt: new Date(),
    },
  };
  await call.save();

  realtime.publishMany(
    { userId: call.residentUserId, homeId, deviceId: device.deviceId, callId: call._id },
    'tablet.call.resumed',
    { call: summarizeCall(call) }
  );
  return summarizeCall(call);
}

async function sendSignalAsUser(user, callId, payload) {
  const homeId = resolveHomeId(user);
  let call = await TabletCallSession.findOne({ _id: callId, homeId });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  call = await expireNoAnswerCallIfNeeded(call);
  assertCallStateAllowsAction(call, 'mobile_signal');
  if (payload.signalType === 'offer') {
    resetAnswerForFreshOffer(call, sanitizeWebRtcSdp(payload.sdp));
    if (call.state === 'answered') {
      safeLog('[TabletLiveService]', 'mobile_offer_kept_answered_state', {
        callId: String(call._id),
        residentUserId: String(call.residentUserId || ''),
      });
    } else {
      call.state = 'connecting';
    }
  } else if (payload.signalType === 'answer') {
    call.signaling.answerSdp = sanitizeWebRtcSdp(payload.sdp);
    call.signaling.answerCreatedAt = new Date();
    if (call.state === 'answered') {
      safeLog('[TabletLiveService]', 'mobile_answer_kept_answered_state', {
        callId: String(call._id),
        residentUserId: String(call.residentUserId || ''),
      });
    } else {
      call.state = 'connecting';
    }
  } else if (payload.signalType === 'ice_candidate') {
    appendUniqueIceCandidate(call, 'mobile', payload);
  }
  await call.save();
  const device = await Device.findById(call.tabletDeviceId).select('deviceId');
  if (device?.deviceId) {
    realtime.publishToDevice(device.deviceId, 'tablet.call.signal', { callId: String(call._id), signal: payload, from: 'mobile' });
  }
  return summarizeCall(call);
}

async function sendSignalAsDevice(device, callId, payload) {
  const homeId = getHomeIdFromDevice(device);
  let call = await TabletCallSession.findOne({ _id: callId, homeId, tabletDeviceId: device._id });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  call = await expireNoAnswerCallIfNeeded(call, { device });
  assertCallStateAllowsAction(call, 'tablet_signal');
  if (payload.signalType === 'offer') {
    resetAnswerForFreshOffer(call, sanitizeWebRtcSdp(payload.sdp));
    if (call.state === 'answered') {
      safeLog('[TabletLiveService]', 'tablet_offer_kept_answered_state', {
        callId: String(call._id),
        deviceId: String(device.deviceId || ''),
      });
    } else {
      call.state = 'connecting';
    }
  } else if (payload.signalType === 'answer') {
    call.signaling.answerSdp = sanitizeWebRtcSdp(payload.sdp);
    call.signaling.answerCreatedAt = new Date();
    if (call.state === 'answered') {
      safeLog('[TabletLiveService]', 'tablet_answer_kept_answered_state', {
        callId: String(call._id),
        deviceId: String(device.deviceId || ''),
      });
    } else {
      call.state = 'connecting';
    }
  } else if (payload.signalType === 'ice_candidate') {
    appendUniqueIceCandidate(call, 'tablet', payload);
  }
  await call.save();
  realtime.publishMany({ userId: call.residentUserId, homeId, callId: call._id }, 'tablet.call.signal', { callId: String(call._id), signal: payload, from: 'tablet' });
  return summarizeCall(call);
}

async function showOtpOnTablet(user, callId, payload) {
  const homeId = resolveHomeId(user);
  const call = await TabletCallSession.findOne({ _id: callId, homeId });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  call.otpDisplay = {
    code: String(payload.code || '').trim(),
    label: payload.label || 'OTP ready',
    shownAt: new Date(),
    expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
    shownByUserId: user._id,
  };
  await call.save();
  const device = await Device.findById(call.tabletDeviceId).select('deviceId');
  if (device?.deviceId) {
    realtime.publishToDevice(device.deviceId, 'tablet.call.show_otp', { call: summarizeCall(call) });
  }
  return summarizeCall(call);
}

async function requestRecording(user, callId, payload) {
  const homeId = resolveHomeId(user);
  const call = await TabletCallSession.findOne({ _id: callId, homeId });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  const action = payload.action || 'start';
  if (action === 'start') {
    call.recording.status = 'requested';
    call.recording.requestedByUserId = user._id;
  } else if (action === 'stop') {
    call.recording.status = 'stopped';
    call.recording.stoppedAt = new Date();
  }
  await call.save();
  const device = await Device.findById(call.tabletDeviceId).select('deviceId');
  if (device?.deviceId) {
    realtime.publishToDevice(device.deviceId, 'tablet.call.recording_command', {
      callId: String(call._id),
      action,
      call: summarizeCall(call),
    });
  }
  return summarizeCall(call);
}

async function updateRecordingStatus(device, callId, payload) {
  const homeId = getHomeIdFromDevice(device);
  const call = await TabletCallSession.findOne({ _id: callId, homeId, tabletDeviceId: device._id });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  call.recording.status = payload.status;
  if (payload.status === 'recording') call.recording.startedAt = new Date();
  if (payload.status === 'stopped' || payload.status === 'uploaded') call.recording.stoppedAt = new Date();
  await call.save();
  realtime.publishMany({ userId: call.residentUserId, homeId, deviceId: device.deviceId, callId: call._id }, 'tablet.call.recording_status', {
    call: summarizeCall(call),
  });
  return summarizeCall(call);
}

function sanitizeName(value) {
  return String(value || 'recording').replace(/[^a-zA-Z0-9._-]+/g, '-');
}

async function uploadRecording(device, callId, file, payload = {}) {
  if (!file) throw createHttpError(400, 'RECORDING_FILE_REQUIRED', 'Recording file is required');
  const homeId = getHomeIdFromDevice(device);
  const call = await TabletCallSession.findOne({ _id: callId, homeId, tabletDeviceId: device._id });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');

  const ext = path.extname(file.originalname || '') || '.mp4';
  const baseName = sanitizeName(path.basename(file.originalname || `recording-${Date.now()}${ext}`));
  const objectKey = `object-store/${String(homeId)}/${String(device._id)}/${Date.now()}-${baseName}`;
  const thumbKey = `thumbnails/${String(homeId)}/${String(device._id)}/${Date.now()}-${path.parse(baseName).name}.png`;

  const fileBuffer = fs.readFileSync(file.path);
  const uploadResult = await putObject({ key: objectKey, buffer: fileBuffer, contentType: file.mimetype || 'video/mp4' });

  const localThumbPath = path.join(process.cwd(), 'private_uploads', 'recordings', thumbKey);
  fs.mkdirSync(path.dirname(localThumbPath), { recursive: true });
  await generateVideoThumbnail(file.path, localThumbPath);

  let thumbProvider = 'local';
  if (getProvider() === 's3') {
    const thumbBuffer = fs.readFileSync(localThumbPath);
    await putObject({ key: thumbKey, buffer: thumbBuffer, contentType: 'image/png' });
    thumbProvider = 's3';
  }

  const recording = await TabletRecording.create({
    homeId,
    tabletDeviceId: device._id,
    residentUserId: call.residentUserId || null,
    callSessionId: call._id,
    visitorSessionId: call.visitorSessionId || null,
    deliverySessionId: call.deliverySessionId || null,
    deliveryId: call.deliveryId || null,
    type: call.type === 'delivery' ? 'delivery' : call.type,
    status: 'ready',
    storageProvider: uploadResult.provider,
    storageKey: objectKey,
    thumbnailStorageKey: thumbKey,
    fileName: file.originalname || baseName,
    mimeType: file.mimetype || 'video/mp4',
    sizeBytes: file.size || fileBuffer.length,
    durationSeconds: payload.durationSeconds ? Number(payload.durationSeconds) : null,
    sha256: sha256File(file.path),
    uploadedBy: 'tablet',
    metadata: {
      note: payload.note || '',
      thumbnailProvider: thumbProvider,
    },
    readyAt: new Date(),
  });

  call.recording.status = 'uploaded';
  call.recording.latestRecordingId = recording._id;
  call.recording.stoppedAt = call.recording.stoppedAt || new Date();
  await call.save();

  if (call.deliveryId) {
    const delivery = await Delivery.findById(call.deliveryId);
    if (delivery) {
      delivery.recordingSaved = true;
      delivery.recordingUrl = `/api/v1/tablet/recordings/${recording._id}/link`;
      delivery.recordingThumbnailUrl = `/api/v1/tablet/recordings/${recording._id}/thumbnail`;
      delivery.recordingDurationSeconds = recording.durationSeconds;
      delivery.recordingSizeBytes = recording.sizeBytes;
      if (!delivery.recordingQuality) delivery.recordingQuality = 'HD';
      await delivery.save();
    }
  }

  fs.unlink(file.path, () => {});

  realtime.publishMany({ userId: call.residentUserId, homeId, deviceId: device.deviceId, callId: call._id }, 'tablet.recording.ready', {
    call: summarizeCall(call),
    recording: summarizeRecording(recording),
  });

  return {
    call: summarizeCall(call),
    recording: summarizeRecording(recording),
  };
}

async function listRecordings(user, query = {}) {
  const homeId = resolveHomeId(user);
  const filter = { homeId };
  if (query.deliveryId) filter.deliveryId = query.deliveryId;
  if (query.callSessionId) filter.callSessionId = query.callSessionId;
  if (query.type) filter.type = query.type;
  const items = await TabletRecording.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(query.limit || 50), 100));
  return { items: items.map((item) => summarizeRecording(item)) };
}

async function getRecordingOwned(user, recordingId) {
  const recording = await TabletRecording.findById(recordingId);
  if (!recording) throw createHttpError(404, 'RECORDING_NOT_FOUND', 'Recording not found');
  if (!canAccessHome(user, recording.homeId)) throw createHttpError(403, 'RECORDING_FORBIDDEN', 'Recording not accessible');
  return recording;
}

async function getRecordingDetail(user, recordingId) {
  const recording = await getRecordingOwned(user, recordingId);
  return summarizeRecording(recording);
}

async function getRecordingThumbnail(user, recordingId) {
  const recording = await getRecordingOwned(user, recordingId);
  if (!recording.thumbnailStorageKey) throw createHttpError(404, 'THUMBNAIL_NOT_FOUND', 'Thumbnail not found');
  if (recording.storageProvider === 's3') {
    return {
      redirectUrl: createPresignedGetUrl(recording.thumbnailStorageKey, 300, `${recording.fileName}.png`),
      mimeType: 'image/png',
      fileName: `${recording.fileName}.png`,
    };
  }
  return {
    absolutePath: getLocalAbsolutePath(recording.thumbnailStorageKey),
    mimeType: 'image/png',
    fileName: `${recording.fileName}.png`,
  };
}

async function createRecordingLink(user, recordingId, expiresInSeconds = 900) {
  const recording = await getRecordingOwned(user, recordingId);
  if (recording.storageProvider === 's3') {
    const tempUrl = createPresignedGetUrl(recording.storageKey, expiresInSeconds, recording.fileName);
    return { ...summarizeRecording(recording, tempUrl), expiresInSeconds };
  }
  const token = createTempToken({ recordingId: String(recording._id), mode: 'stream' }, expiresInSeconds);
  return {
    ...summarizeRecording(recording, `/api/v1/tablet/recordings/temp/${token}`),
    expiresInSeconds,
  };
}

async function accessTempRecording(token) {
  const decoded = verifyTempToken(token);
  const recording = await TabletRecording.findById(decoded.recordingId);
  if (!recording) throw createHttpError(404, 'RECORDING_NOT_FOUND', 'Recording not found');
  if (recording.storageProvider === 's3') {
    return {
      redirectUrl: createPresignedGetUrl(recording.storageKey, 300, recording.fileName),
      mimeType: recording.mimeType,
      fileName: recording.fileName,
    };
  }
  return {
    absolutePath: getLocalAbsolutePath(recording.storageKey),
    mimeType: recording.mimeType,
    fileName: recording.fileName,
  };
}

async function confirmDelivery(user, callId, payload = {}) {
  const homeId = resolveHomeId(user);
  const call = await TabletCallSession.findOne({ _id: callId, homeId });
  if (!call) throw createHttpError(404, 'CALL_NOT_FOUND', 'Call session not found');
  let delivery = null;
  if (call.deliveryId) delivery = await Delivery.findById(call.deliveryId);
  if (!delivery && payload.deliveryId) delivery = await Delivery.findOne({ _id: payload.deliveryId, homeId });
  if (!delivery) throw createHttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');

  delivery.status = 'delivered';
  delivery.deliveredAt = new Date();
  delivery.verificationMethod = payload.verificationMethod || 'app';
  if (call.otpDisplay?.code) delivery.verificationCode = call.otpDisplay.code;
  await delivery.save();

  if (call.deliverySessionId) {
    const session = await DeliverySession.findById(call.deliverySessionId);
    if (session) {
      session.state = 'completed';
      session.finalStatus = 'confirmed';
      session.verifiedAt = new Date();
      await session.save();
    }
  }

  call.state = 'ended';
  call.endedAt = new Date();
  call.endReason = payload.note || 'delivery_confirmed';
  await call.save();

  const response = {
    call: summarizeCall(call),
    delivery: {
      id: String(delivery._id),
      orderId: delivery.orderId,
      status: delivery.status,
      deliveredAt: delivery.deliveredAt,
      verificationMethod: delivery.verificationMethod,
    },
  };

  const device = await Device.findById(call.tabletDeviceId).select('deviceId');
  realtime.publishMany({ userId: user._id, homeId, callId: call._id }, 'tablet.delivery.confirmed', response);
  if (device?.deviceId) realtime.publishToDevice(device.deviceId, 'tablet.delivery.confirmed', response);
  return response;
}

module.exports = {
  initiateCall,
  listCalls,
  startOrReuseLiveFeedSession,
  getLiveFeedSessionForUser,
  getLiveFeedSessionForDevice,
  getCallForUser,
  getCallSignalingForUser,
  getCallForDevice,
  getCallSignalingForDevice,
  getActiveCallForDevice,
  answerCall,
  rejectCall,
  endCallByUser,
  endCallByDevice,
  pauseCallByDevice,
  resumeCallByDevice,
  sendSignalAsUser,
  sendSignalAsDevice,
  showOtpOnTablet,
  requestRecording,
  updateRecordingStatus,
  uploadRecording,
  listRecordings,
  getRecordingDetail,
  getRecordingThumbnail,
  createRecordingLink,
  accessTempRecording,
  confirmDelivery,
};
