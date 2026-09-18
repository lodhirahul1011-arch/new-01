process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dvaari_test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const assert = require('assert');

require('../src/models/NfcCard');
require('../src/models/SupportTicket');
require('../src/models/DeviceIntegration');
require('../src/routes/settings.routes');
require('../src/routes/nfc.routes');
require('../src/routes/device.routes');
const app = require('../src/app');

assert(app, 'app should load');
console.log('SETTINGS_MODULE_IMPORT_OK');
