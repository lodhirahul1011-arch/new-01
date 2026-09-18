const fs = require('fs');
const path = require('path');

const realtime = require(path.join(process.cwd(), 'src/services/realtime.service.js'));

function makeReq() {
  const listeners = {};
  return {
    on(event, handler) {
      listeners[event] = handler;
    },
    close() {
      if (listeners.close) listeners.close();
    },
  };
}

function makeRes(store) {
  return {
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    flushHeaders() {},
    write(chunk) {
      store.push(String(chunk));
    },
  };
}

let failed = false;
function assert(condition, message) {
  if (!condition) {
    console.error(message);
    failed = true;
  }
}

const mobileEvents = [];
const tabletEvents = [];

const mobileReq = makeReq();
const mobileRes = makeRes(mobileEvents);
realtime.registerSseClient({ req: mobileReq, res: mobileRes, userId: 'user-1', homeId: 'home-1', meta: { actor: 'mobile' } });

const tabletReq = makeReq();
const tabletRes = makeRes(tabletEvents);
realtime.registerSseClient({ req: tabletReq, res: tabletRes, userId: 'user-1', homeId: 'home-1', deviceId: 'tablet-1', meta: { actor: 'tablet' } });

realtime.publishMany({ userId: 'user-1', homeId: 'home-1', deviceId: 'tablet-1', callId: 'call-1' }, 'tablet.call.started', { ok: true });
realtime.publishToDevice('tablet-1', 'tablet.call.show_otp', { code: '1234' });
realtime.publishToUser('user-1', 'tablet.recording.ready', { recordingId: 'rec-1' });

assert(mobileEvents.some((chunk) => chunk.includes('event: connected')), 'Mobile SSE client did not receive connected event');
assert(tabletEvents.some((chunk) => chunk.includes('event: connected')), 'Tablet SSE client did not receive connected event');
assert(mobileEvents.some((chunk) => chunk.includes('event: tablet.call.started')), 'Mobile did not receive tablet.call.started');
assert(tabletEvents.some((chunk) => chunk.includes('event: tablet.call.started')), 'Tablet did not receive tablet.call.started');
assert(tabletEvents.some((chunk) => chunk.includes('event: tablet.call.show_otp')), 'Tablet did not receive show_otp event');
assert(mobileEvents.some((chunk) => chunk.includes('event: tablet.recording.ready')), 'Mobile did not receive recording.ready event');

mobileReq.close();
tabletReq.close();

const requiredFiles = [
  'postman/dvaari-tablet-production.postman_collection.json',
  'TABLET_PRODUCTION_TEST_CHECKLIST.md',
  'src/routes/tablet.routes.js',
  'src/services/tabletLive.service.js',
];
for (const file of requiredFiles) {
  assert(fs.existsSync(path.join(process.cwd(), file)), `Missing required file: ${file}`);
}

const routeContent = fs.readFileSync(path.join(process.cwd(), 'src/routes/tablet.routes.js'), 'utf8');
for (const snippet of ['/realtime/events', '/calls/:callId/recording-command', '/calls/:callId/confirm-delivery', '/recordings/:recordingId/link']) {
  assert(routeContent.includes(snippet), `Route missing expected snippet: ${snippet}`);
}

if (failed) process.exit(1);
console.log('Tablet sync module checks passed');
