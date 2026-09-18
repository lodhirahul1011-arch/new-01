const fs = require('fs');

const tabletService = require('../services/tablet.service');
const tabletLiveService = require('../services/tabletLive.service');
const realtime = require('../services/realtime.service');
const { writeAudit } = require('../services/audit.service');
const { resolveHomeId } = require('../utils/home');

async function createPairingSession(req, res, next) {
  try {
    const data = await tabletService.createTabletPairingSession(req.body);
    return res.status(201).json({ ok: true, message: 'Tablet pairing session created successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function claimPairing(req, res, next) {
  try {
    const data = await tabletService.claimTabletPairing(req.user, req.body);
    await writeAudit({ scope: 'tablet', action: 'pair_claim', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, message: 'Tablet linked successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function subscribeUserEvents(req, res) {
  const homeId = resolveHomeId(req.user);
  realtime.registerSseClient({ req, res, userId: req.user._id, homeId, meta: { actor: 'mobile' } });
}

async function subscribeDeviceEvents(req, res) {
  const homeId = req.device.linkedHomeId || req.device.ownerUserId || null;
  realtime.registerSseClient({ req, res, userId: req.device.ownerUserId, homeId, deviceId: req.device.deviceId, meta: { actor: 'tablet' } });
}

async function getConfig(req, res, next) {
  try {
    const data = await tabletService.getTabletConfig(req.device);
    return res.json({ ok: true, message: 'Tablet config fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function patchSetup(req, res, next) {
  try {
    const data = await tabletService.updateTabletSetup(req.device, req.body);
    return res.json({ ok: true, message: 'Tablet setup updated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function patchWifi(req, res, next) {
  try {
    const data = await tabletService.updateTabletWifi(req.device, req.body);
    return res.json({ ok: true, message: 'Tablet Wi-Fi updated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function heartbeat(req, res, next) {
  try {
    const data = await tabletService.tabletHeartbeat(req.device, req.body || {});
    return res.json({ ok: true, message: 'Tablet heartbeat recorded', data });
  } catch (err) {
    return next(err);
  }
}

async function listDevices(req, res, next) {
  try {
    const data = await tabletService.listTabletDevices(req.user, req.query);
    return res.json({ ok: true, message: 'Tablet devices fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getDevice(req, res, next) {
  try {
    const data = await tabletService.getTabletDeviceForUser(req.user, req.params.deviceId);
    return res.json({ ok: true, message: 'Tablet device fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function patchDevice(req, res, next) {
  try {
    const data = await tabletService.updateTabletDeviceForUser(req.user, req.params.deviceId, req.body);
    return res.json({ ok: true, message: 'Tablet device updated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function createVisitorSession(req, res, next) {
  try {
    const data = await tabletService.createVisitorSession(req.device, req.body || {});
    return res.status(201).json({ ok: true, message: 'Visitor session created successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function listVisitorSessions(req, res, next) {
  try {
    const data = await tabletService.listVisitorSessions(req.user);
    return res.json({ ok: true, message: 'Visitor sessions fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getVisitorSession(req, res, next) {
  try {
    const data = await tabletService.getVisitorSessionForDevice(req.device, req.params.sessionId);
    return res.json({ ok: true, message: 'Visitor session fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function respondVisitorSession(req, res, next) {
  try {
    const data = await tabletService.respondVisitorSession(req.user, req.params.sessionId, req.body);
    return res.json({ ok: true, message: 'Visitor session updated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function startDeliverySession(req, res, next) {
  try {
    const data = await tabletService.startDeliverySession(req.device, req.body);
    return res.status(201).json({ ok: true, message: 'Tablet delivery session started successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function listDeliverySessions(req, res, next) {
  try {
    const data = await tabletService.listDeliverySessions(req.user);
    return res.json({ ok: true, message: 'Tablet delivery sessions fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getDeliverySession(req, res, next) {
  try {
    const data = await tabletService.getDeliverySessionForUser(req.user, req.params.sessionId);
    return res.json({ ok: true, message: 'Tablet delivery session fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getDeviceDeliverySession(req, res, next) {
  try {
    const data = await tabletService.getDeliverySessionForDevice(req.device, req.params.sessionId);
    return res.json({ ok: true, message: 'Tablet delivery session fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function verifyDeliveryOtp(req, res, next) {
  try {
    const data = await tabletService.verifyDeliverySessionOtp(req.device, req.params.sessionId, req.body.code);
    return res.json({ ok: true, message: 'Tablet delivery OTP verified successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function verifyDeliveryNfc(req, res, next) {
  try {
    const data = await tabletService.verifyDeliverySessionNfc(req.device, req.params.sessionId, req.body.uid);
    return res.json({ ok: true, message: 'Tablet delivery NFC verified successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function verifyAccessCode(req, res, next) {
  try {
    const data = await tabletService.verifyAccessCode(req.device, req.body);
    return res.json({ ok: true, message: 'Tablet access code verified successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function initiateCall(req, res, next) {
  try {
    const data = await tabletLiveService.initiateCall(req.device, req.body || {});
    return res.status(201).json({ ok: true, message: 'Tablet live call initiated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function listCalls(req, res, next) {
  try {
    const data = await tabletLiveService.listCalls(req.user, req.query || {});
    return res.json({ ok: true, message: 'Tablet calls fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function startLiveFeedSession(req, res, next) {
  try {
    const data = await tabletLiveService.startOrReuseLiveFeedSession(req.user);
    return res.status(201).json({ ok: true, message: 'Live feed session prepared successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getLiveFeedSession(req, res, next) {
  try {
    const data = await tabletLiveService.getLiveFeedSessionForUser(req.user);
    return res.json({ ok: true, message: 'Live feed session fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getCall(req, res, next) {
  try {
    const data = await tabletLiveService.getCallForUser(req.user, req.params.callId);
    return res.json({ ok: true, message: 'Tablet call fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getCallSignaling(req, res, next) {
  try {
    const data = await tabletLiveService.getCallSignalingForUser(req.user, req.params.callId);
    return res.json({ ok: true, message: 'Call signaling fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getDeviceCall(req, res, next) {
  try {
    const data = await tabletLiveService.getCallForDevice(req.device, req.params.callId);
    return res.json({ ok: true, message: 'Tablet call fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getDeviceCallSignaling(req, res, next) {
  try {
    const data = await tabletLiveService.getCallSignalingForDevice(req.device, req.params.callId);
    return res.json({ ok: true, message: 'Call signaling fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getActiveDeviceCall(req, res, next) {
  try {
    const data = await tabletLiveService.getActiveCallForDevice(req.device);
    return res.json({ ok: true, message: 'Active tablet call fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getDeviceLiveFeedSession(req, res, next) {
  try {
    const data = await tabletLiveService.getLiveFeedSessionForDevice(req.device);
    return res.json({ ok: true, message: 'Tablet live feed session fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function answerCall(req, res, next) {
  try {
    const data = await tabletLiveService.answerCall(req.user, req.params.callId, req.body || {});
    return res.json({ ok: true, message: 'Tablet call answered successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function rejectCall(req, res, next) {
  try {
    const data = await tabletLiveService.rejectCall(req.user, req.params.callId, req.body || {});
    return res.json({ ok: true, message: 'Tablet call rejected successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function endCall(req, res, next) {
  try {
    const data = await tabletLiveService.endCallByUser(req.user, req.params.callId, req.body || {});
    return res.json({ ok: true, message: 'Tablet call ended successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function endDeviceCall(req, res, next) {
  try {
    const data = await tabletLiveService.endCallByDevice(req.device, req.params.callId, req.body || {});
    return res.json({ ok: true, message: 'Tablet call ended successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function pauseDeviceCall(req, res, next) {
  try {
    const data = await tabletLiveService.pauseCallByDevice(req.device, req.params.callId, req.body || {});
    return res.json({ ok: true, message: 'Tablet call paused successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function resumeDeviceCall(req, res, next) {
  try {
    const data = await tabletLiveService.resumeCallByDevice(req.device, req.params.callId, req.body || {});
    return res.json({ ok: true, message: 'Tablet call resumed successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function sendCallSignal(req, res, next) {
  try {
    const data = await tabletLiveService.sendSignalAsUser(req.user, req.params.callId, req.body || {});
    return res.json({ ok: true, message: 'Tablet call signal sent successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function sendDeviceCallSignal(req, res, next) {
  try {
    const data = await tabletLiveService.sendSignalAsDevice(req.device, req.params.callId, req.body || {});
    return res.json({ ok: true, message: 'Tablet call signal sent successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function showOtp(req, res, next) {
  try {
    const data = await tabletLiveService.showOtpOnTablet(req.user, req.params.callId, req.body || {});
    return res.json({ ok: true, message: 'OTP pushed to tablet successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function requestRecording(req, res, next) {
  try {
    const data = await tabletLiveService.requestRecording(req.user, req.params.callId, req.body || {});
    return res.json({ ok: true, message: 'Tablet recording command sent successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function updateRecordingStatus(req, res, next) {
  try {
    const data = await tabletLiveService.updateRecordingStatus(req.device, req.params.callId, req.body || {});
    return res.json({ ok: true, message: 'Tablet recording status updated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function uploadRecording(req, res, next) {
  try {
    const data = await tabletLiveService.uploadRecording(req.device, req.params.callId, req.file, req.body || {});
    return res.status(201).json({ ok: true, message: 'Tablet recording uploaded successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function uploadDeliveryRecording(req, res, next) {
  try {
    const data = await tabletService.uploadDeliveryRecording(req.device, req.params.sessionId, req.file, req.body || {});
    return res.status(201).json({ ok: true, message: 'Delivery recording uploaded successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function uploadDeliveryImage(req, res, next) {
  try {
    const data = await tabletService.uploadDeliveryImage(req.device, req.params.sessionId, req.file, req.body || {});
    return res.status(201).json({ ok: true, message: 'Delivery image uploaded successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function listRecordings(req, res, next) {
  try {
    const data = await tabletLiveService.listRecordings(req.user, req.query || {});
    return res.json({ ok: true, message: 'Tablet recordings fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getRecording(req, res, next) {
  try {
    const data = await tabletLiveService.getRecordingDetail(req.user, req.params.recordingId);
    return res.json({ ok: true, message: 'Tablet recording fetched successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getRecordingLink(req, res, next) {
  try {
    const data = await tabletLiveService.createRecordingLink(req.user, req.params.recordingId, Number(req.query.expiresIn || 900));
    return res.json({ ok: true, message: 'Tablet recording temp link generated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getRecordingThumbnail(req, res, next) {
  try {
    const file = await tabletLiveService.getRecordingThumbnail(req.user, req.params.recordingId);
    if (file.redirectUrl) return res.redirect(file.redirectUrl);
    if (!fs.existsSync(file.absolutePath)) {
      return res.status(404).json({ ok: false, code: 'THUMBNAIL_NOT_FOUND', message: 'Thumbnail file not found', error: 'Thumbnail file not found' });
    }
    res.setHeader('Content-Type', file.mimeType || 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName || 'thumbnail.png'}"`);
    return fs.createReadStream(file.absolutePath).pipe(res);
  } catch (err) {
    return next(err);
  }
}

async function accessTempRecording(req, res, next) {
  try {
    const file = await tabletLiveService.accessTempRecording(req.params.token);
    if (file.redirectUrl) return res.redirect(file.redirectUrl);
    if (!fs.existsSync(file.absolutePath)) {
      return res.status(404).json({ ok: false, code: 'RECORDING_NOT_FOUND', message: 'Recording file not found', error: 'Recording file not found' });
    }
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName || 'recording.mp4'}"`);
    return fs.createReadStream(file.absolutePath).pipe(res);
  } catch (err) {
    return next(err);
  }
}

async function confirmDelivery(req, res, next) {
  try {
    const data = await tabletLiveService.confirmDelivery(req.user, req.params.callId, req.body || {});
    return res.json({ ok: true, message: 'Tablet delivery confirmed successfully', data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createPairingSession,
  claimPairing,
  subscribeUserEvents,
  subscribeDeviceEvents,
  getConfig,
  patchSetup,
  patchWifi,
  heartbeat,
  listDevices,
  getDevice,
  patchDevice,
  createVisitorSession,
  listVisitorSessions,
  getVisitorSession,
  respondVisitorSession,
  startDeliverySession,
  listDeliverySessions,
  getDeliverySession,
  getDeviceDeliverySession,
  verifyDeliveryOtp,
  verifyDeliveryNfc,
  verifyAccessCode,
  initiateCall,
  listCalls,
  startLiveFeedSession,
  getLiveFeedSession,
  getCall,
  getCallSignaling,
  getDeviceCall,
  getDeviceCallSignaling,
  getActiveDeviceCall,
  getDeviceLiveFeedSession,
  answerCall,
  rejectCall,
  endCall,
  endDeviceCall,
  pauseDeviceCall,
  resumeDeviceCall,
  sendCallSignal,
  sendDeviceCallSignal,
  showOtp,
  requestRecording,
  updateRecordingStatus,
  uploadRecording,
  uploadDeliveryRecording,
  uploadDeliveryImage,
  listRecordings,
  getRecording,
  getRecordingLink,
  getRecordingThumbnail,
  accessTempRecording,
  confirmDelivery,
};
