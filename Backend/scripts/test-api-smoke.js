const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dvaari_test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.DEVICE_PROVISION_SECRET = process.env.DEVICE_PROVISION_SECRET || 'internal-secret';

const app = require('../src/app');
const { env } = require('../src/config/env');
const { REQUIRED_DIRS } = require('../src/utils/storage');

assert.strictEqual(env.OTP_LENGTH, 4, 'OTP length should default to 4');
assert.ok(Object.prototype.hasOwnProperty.call(env, 'SMS_API_KEY'), 'env should include SMS_API_KEY');
assert.ok(Object.prototype.hasOwnProperty.call(env, 'DEVICE_PROVISION_SECRET'), 'env should include DEVICE_PROVISION_SECRET');

for (const rel of REQUIRED_DIRS) {
  assert.ok(fs.existsSync(path.join(process.cwd(), rel)), `missing dir ${rel}`);
}

const stack = (app._router?.stack || []).map((layer) => String(layer.regexp || ''));
for (const expected of ['home', 'security', 'notifications', 'support', 'devices', 'deliveries', 'authorizations', 'away-mode', 'backup', 'nfc', 'tablet']) {
  assert.ok(stack.some((item) => item.includes(expected)), `missing mounted route for ${expected}`);
}

const requireAuth = fs.readFileSync(path.join(process.cwd(), 'src/middleware/requireAuth.js'), 'utf8');
assert.ok(requireAuth.includes('env.JWT_ACCESS_SECRET'), 'requireAuth should use env.JWT_ACCESS_SECRET');

const appJs = fs.readFileSync(path.join(process.cwd(), 'src/app.js'), 'utf8');
assert.ok(!appJs.includes("app.use('/uploads', express.static('uploads'))"), 'raw uploads folder should not be publicly exposed');
assert.ok(appJs.includes('/uploads/avatars'), 'avatars route should be public');
assert.ok(appJs.includes('/uploads/wallpapers'), 'wallpapers route should be public');

const deviceRoutes = fs.readFileSync(path.join(process.cwd(), 'src/routes/device.routes.js'), 'utf8');
assert.ok(deviceRoutes.includes("requireInternal"), 'device provision should be protected by requireInternal');

const familyService = fs.readFileSync(path.join(process.cwd(), 'src/services/family.service.js'), 'utf8');
assert.ok(familyService.includes("NODE_ENV !== 'production' ? { token } : {}"), 'family invite token should be hidden in production');

console.log('API smoke checks passed');
