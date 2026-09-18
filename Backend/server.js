const path = require('path');

// Always load backend/.env regardless of the process working directory.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = require('./src/app');
const { connectDB } = require('./src/config/db');
const { env } = require('./src/config/env');
const { startDevicePresenceMonitor } = require('./src/services/devicePresenceMonitor.service');
const { logs } = require('./src/utils/logger');
const dns = require("dns");

// Change DNS
dns.setServers(["1.1.1.1", "8.8.8.8"]);

let server;

async function bootstrap() {
  await connectDB(env.MONGO_URI);
  startDevicePresenceMonitor();

  server = app.listen(env.PORT, () => {
    logs.info('[SERVER][BOOT] API listening', { port: env.PORT });
  });

  // Handle port in use error
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logs.error('[SERVER][BOOT] port already in use', { port: env.PORT });
      process.exit(1);
    }
    logs.error('[SERVER][BOOT] server error', { message: err.message });
    throw err;
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logs.info('[SERVER][SHUTDOWN] SIGTERM received');
    if (server) {
      server.close(() => {
        logs.info('[SERVER][SHUTDOWN] server closed');
        process.exit(0);
      });
    }
  });

  process.on('SIGINT', () => {
    logs.info('[SERVER][SHUTDOWN] SIGINT received');
    if (server) {
      server.close(() => {
        logs.info('[SERVER][SHUTDOWN] server closed');
        process.exit(0);
      });
    }
  });
}

bootstrap().catch((err) => {
  logs.error('[SERVER][BOOT] failed to start', { message: err.message });
  process.exit(1);
});
