const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { env } = require('./config/env');
const { notFoundHandler, errorHandler } = require('./middleware/error');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const deviceRoutes = require('./routes/device.routes');
const familyRoutes = require('./routes/family.routes');
const settingsRoutes = require('./routes/settings.routes');
const nfcRoutes = require('./routes/nfc.routes');
const deliveryAccessRoutes = require('./routes/deliveryAccess.routes');
const authorizationRoutes = require('./routes/authorization.routes');
const awayModeRoutes = require('./routes/awayMode.routes');
const backupRoutes = require('./routes/backup.routes');
const deliveryRoutes = require('./routes/delivery.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const homeRoutes = require('./routes/home.routes');
const securityRoutes = require('./routes/security.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const supportRoutes = require('./routes/support.routes');
const tabletRoutes = require('./routes/tablet.routes');
const smsRoutes = require('./routes/sms.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const earlyAccessRoutes = require('./routes/earlyAccess.routes');
const { ensureUploadDirs } = require('./utils/storage');
const { logs } = require('./utils/logger');

ensureUploadDirs();
logs.info('[APP][BOOT] ensured upload directories');

const app = express();

app.set('trust proxy', 1);
// Avoid 304 caching for API JSON responses (tablet/mobile pollers expect fresh bodies).
app.set('etag', false);

app.use(helmet());
app.use(compression());
const allowedCorsOrigins = env.CORS_ORIGIN === '*'
  ? ['*']
  : env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean);
logs.info('[APP][BOOT] CORS configured', {
  mode: allowedCorsOrigins.includes('*') ? 'wildcard' : 'allowlist',
  originCount: allowedCorsOrigins.length,
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedCorsOrigins.includes('*') || allowedCorsOrigins.includes(origin)) {
      return callback(null, true);
    }
    logs.error('[APP][CORS] blocked origin', { origin });
    return callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    // Meta WhatsApp webhook signatures are computed over the exact raw request body.
    req.rawBody = Buffer.from(buf);
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Prevent any intermediate caching for API responses. Tablet/mobile pollers must receive fresh JSON bodies.
app.use(['/api', '/tablet', '/sms', '/settings', '/nfc', '/deliveries', '/analytics', '/auth', '/family', '/backup', '/away-mode', '/authorizations'], (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  return next();
});

// Global API limiter: applied once at `/api`.
// Important: avoid double-applying it again on `/api/v1/*` mounts, otherwise polling clients
// (tablet/mobile) hit 429 very quickly.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.NODE_ENV === 'production' ? 120 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // `/api` mounted: req.path starts with `/v1/...`
    // Auth and tablet pollers have their own limiter to avoid stacking limits.
    return (
      req.path.startsWith('/v1/auth') ||
      req.path.startsWith('/v1/tablet/auth') ||
      req.path.startsWith('/v1/tablet')
    );
  },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.NODE_ENV === 'production' ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tablet endpoints poll frequently (config, calls/active, signaling). Give them a dedicated limiter.
const tabletLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.NODE_ENV === 'production' ? 600 : 6000,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);
app.use('/api/early-access', earlyAccessRoutes);

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'API Running...' });
});
app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbState = mongoose.connection && mongoose.connection.readyState === 1 ? 'up' : 'down';
  res.json({ ok: true, message: 'healthy', data: { db: dbState } });
});

app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/tablet/auth', authLimiter, authRoutes);
app.use('/api/v1/home', homeRoutes);
app.use('/api/v1/security', securityRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/support', supportRoutes);
app.use('/api/v1/tablet', tabletLimiter, tabletRoutes);
app.use('/tablet', tabletLimiter, tabletRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/user', apiLimiter, userRoutes);
app.use('/user', apiLimiter, userRoutes);
app.use('/uploads/avatars', express.static(path.join(process.cwd(), 'uploads', 'avatars')));
app.use('/uploads/wallpapers', express.static(path.join(process.cwd(), 'uploads', 'wallpapers')));
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/family', familyRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/settings', apiLimiter, settingsRoutes);
app.use('/api/v1/nfc', nfcRoutes);
app.use('/nfc', apiLimiter, nfcRoutes);
app.use('/api/v1/delivery-access', deliveryAccessRoutes);
app.use('/delivery-access', apiLimiter, deliveryAccessRoutes);

app.use('/api/v1/away-mode', awayModeRoutes);
app.use('/away-mode', apiLimiter, awayModeRoutes);

app.use('/api/v1/backup', backupRoutes);
app.use('/backup', apiLimiter, backupRoutes);
app.use('/api/v1/deliveries/backup', backupRoutes);
app.use('/deliveries/backup', apiLimiter, backupRoutes);

app.use('/api/v1/authorizations', authorizationRoutes);
app.use('/api/authorizations', apiLimiter, authorizationRoutes);
app.use('/authorizations', apiLimiter, authorizationRoutes);
app.use('/api/v1/deliveries/authorizations', authorizationRoutes);
app.use('/deliveries/authorizations', apiLimiter, authorizationRoutes);

app.use('/api/v1/deliveries', deliveryRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/sms', smsRoutes);
app.use('/api/v1/whatsapp', whatsappRoutes);

app.use('/auth', authLimiter, authRoutes);
app.use('/family', apiLimiter, familyRoutes);
app.use('/deliveries', apiLimiter, deliveryRoutes);
app.use('/analytics', apiLimiter, analyticsRoutes);
app.use('/sms', apiLimiter, smsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
