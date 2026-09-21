const express = require('express');
const { body } = require('express-validator');

const requireAuth = require('../middleware/requireAuth');
const { validate } = require('../middleware/validate');
const auth = require('../controllers/auth.controller');

const router = express.Router();

router.post(
  '/google',
  [body('idToken').isString().trim().notEmpty().withMessage('idToken required')],
  validate,
  auth.googleSignIn
);

router.post(
  '/link-identifier/request',
  requireAuth,
  [body('identifier').isString().trim().notEmpty().withMessage('identifier required')],
  validate,
  auth.requestLinkOtp
);

router.post(
  '/link-identifier/verify',
  requireAuth,
  [
    body('identifier').optional().isString().trim().notEmpty(),
    body('otpSessionId').optional().isString().trim().notEmpty(),
    body('requestId').optional().isString().trim().notEmpty(),
    body('code').isString().trim().isLength({ min: 4, max: 8 }).withMessage('Invalid OTP length'),
  ],
  validate,
  auth.verifyLinkOtp
);

router.post(
  '/whatsapp-otp',
  (req, res, next) => {
    if (req.body && req.body.purpose === 'link_identifier') return requireAuth(req, res, next);
    return next();
  },
  [
    body('identifier').isString().trim().notEmpty().withMessage('identifier required'),
    body('purpose').optional().isIn(['login', 'register', 'link_identifier']),
  ],
  validate,
  auth.requestWhatsappOtp
);

router.post(
  '/request-otp',
  [body('identifier').isString().trim().notEmpty().withMessage('identifier required')],
  validate,
  auth.requestOtp
);

router.post(
  '/verify-otp',
  [
    body('identifier').optional().isString().trim().notEmpty(),
    body('otpSessionId').optional().isString().trim().notEmpty(),
    body('requestId').optional().isString().trim().notEmpty(),
    body('code').isString().trim().isLength({ min: 4, max: 8 }).withMessage('Invalid OTP length'),
  ],
  validate,
  auth.verifyLoginOtp
);

router.post(
  '/device-registration-request-otp',
  [
    body('name').isString().trim().notEmpty(),
    body('email').isString().trim().notEmpty(),
    body('phone').isString().trim().notEmpty(),
  ],
  validate,
  auth.deviceRegistrationRequestOtp
);

router.post(
  '/device-registration-verify-otp',
  [
    body('identifier').optional().isString().trim().notEmpty(),
    body('otpSessionId').optional().isString().trim().notEmpty(),
    body('requestId').optional().isString().trim().notEmpty(),
    body('code').isString().trim().isLength({ min: 4, max: 8 }),
  ],
  validate,
  auth.deviceRegistrationVerifyOtp
);

router.post(
  '/resend-otp',
  [
    body('identifier').isString().trim().notEmpty(),
    body('purpose').optional().isIn(['login', 'register']),
  ],
  validate,
  auth.resend
);

router.post('/refresh', [body('refreshToken').isString().notEmpty()], validate, auth.refresh);
router.post('/logout', [body('refreshToken').optional().isString()], validate, auth.logout);
router.get('/me', requireAuth, auth.getMe);
router.get('/sessions', requireAuth, auth.listSessions);
router.post('/logout-all', requireAuth, auth.logoutAll);

module.exports = router;