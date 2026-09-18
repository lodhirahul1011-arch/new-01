const fs = require('fs');
const path = require('path');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dvaari_test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const checks = [
  ['src/models/TabletCallSession.js', ['ringCount', 'liveVideoRequested', 'recording']],
  ['src/models/TabletRecording.js', ['storageProvider', 'thumbnailStorageKey', 'deliveryId']],
  ['src/services/tabletLive.service.js', ['initiateCall', 'uploadRecording', 'confirmDelivery', 'createRecordingLink', 'assertCallStateAllowsAction', 'notifyResidentCallEnded', 'auditTabletCallCheckpoint']],
  ['src/services/pushNotification.service.js', ['sendIncomingCallNotification', 'sendCallEndedNotification', "type: 'call_ended'"]],
  ['src/services/realtime.service.js', ['registerSseClient', 'publishToDevice', 'publishMany']],
  ['src/routes/tablet.routes.js', ['/realtime/events', '/calls/:callId/show-otp', '/recordings/temp/:token', '/calls/:callId/recordings/upload']],
  ['src/controllers/tablet.controller.js', ['subscribeUserEvents', 'uploadRecording', 'confirmDelivery']],
  ['src/utils/objectStorage.js', ['putObject', 'createPresignedGetUrl']],
];

let failed = false;
for (const [file, snippets] of checks) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) {
    console.error(`Missing file: ${file}`);
    failed = true;
    continue;
  }
  const content = fs.readFileSync(full, 'utf8');
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      console.error(`Missing snippet in ${file}: ${snippet}`);
      failed = true;
    }
  }
}

try {
  require(path.join(process.cwd(), 'src/models/TabletCallSession.js'));
  require(path.join(process.cwd(), 'src/models/TabletRecording.js'));
  require(path.join(process.cwd(), 'src/services/realtime.service.js'));
  require(path.join(process.cwd(), 'src/services/tabletLive.service.js'));
  require(path.join(process.cwd(), 'src/routes/tablet.routes.js'));
} catch (err) {
  console.error('Require check failed:', err.message);
  failed = true;
}

if (failed) process.exit(1);
console.log('Tablet live module smoke checks passed');
