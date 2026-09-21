const fs = require('fs');
const path = require('path');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dvaari_test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const checks = [
  ['src/models/Device.js', ['tablet', 'linkedHomeId', 'simpleModeEnabled', 'wifi:']],
  ['src/models/DevicePairingSession.js', ['pairingCodeId', 'status', 'expiresAt']],
  ['src/models/VisitorSession.js', ['resident_notified', 'approved', 'rejected']],
  ['src/models/DeliverySession.js', ['otpCodeHash', 'otpPreview', 'verified']],
  ['src/services/tablet.service.js', ['createTabletPairingSession', 'claimTabletPairing', 'createVisitorSession', 'startDeliverySession', 'verifyAccessCode']],
  ['src/routes/tablet.routes.js', ['/pairing/session', '/pairing/claim', '/:deviceId/config', '/:deviceId/visitor-sessions', '/:deviceId/delivery-sessions/start']],
  ['src/app.js', ['/api/v1/tablet', '/tablet']],
  ['src/schemas/tablet.schemas.js', ['pairingSessionSchema', 'tabletWifiSchema', 'deliverySessionStartSchema']],
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
  require(path.join(process.cwd(), 'src/schemas/tablet.schemas.js'));
  require(path.join(process.cwd(), 'src/routes/tablet.routes.js'));
  require(path.join(process.cwd(), 'src/controllers/tablet.controller.js'));
  require(path.join(process.cwd(), 'src/services/tablet.service.js'));
} catch (err) {
  console.error('Require check failed:', err.message);
  failed = true;
}

if (failed) process.exit(1);
console.log('Tablet module smoke checks passed');
