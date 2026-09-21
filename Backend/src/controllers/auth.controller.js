const User = require('../models/User');
const Otp = require('../models/Otp');
const { env } = require('../config/env');
const { normalizeIdentifier, inferChannel, isEmail, isE164Phone, maskIdentifier } = require('../utils/identifier');
const { createOrReplaceOtp, verifyOtp, resendOtp } = require('../services/otp.service');
const { sendOtp } = require('../services/notification.service');
const { sendOtpMessage: sendWhatsappOtpMessage } = require('../services/whatsappCloud.service');
const { verifyGoogleIdToken } = require('../services/googleAuth.service');
const { acceptPendingInviteForRegisteredUser } = require('../services/family.service');
const {
  issueTokens,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  listActiveSessions,
} = require('../services/token.service');
const { writeAudit } = require('../services/audit.service');
const { safeLog, logs } = require('../utils/logger');
const { activeUserFilter } = require('../utils/activeUser');
const {
  ensureReviewUser,
  getReviewOtp,
  isReviewIdentifier,
} = require('../services/playStoreReview.service');

function authUserPayload(user) {
  const verified = user.isVerified === true;
  return {
    id: user._id,
    _id: user._id,
    name: user.name || '',
    email: user.email || undefined,
    phone: user.phone || undefined,
    googleSub: user.googleSub || undefined,
    verified,
    isVerified: verified,
    emailVerified: typeof user.emailVerified === 'boolean' ? user.emailVerified : Boolean(user.email && verified),
    phoneVerified: typeof user.phoneVerified === 'boolean' ? user.phoneVerified : Boolean(user.phone && verified),
    dateOfBirth: user.dateOfBirth || '',
    gender: user.gender || '',
    avatar: user.avatar || { url: '' },
  };
}

async function findIdentifierConflict(identifier, currentUserId) {
  const query = isEmail(identifier) ? { email: identifier } : { phone: identifier };
  if (currentUserId) query._id = { $ne: currentUserId };
  return User.findOne(activeUserFilter(query));
}

function reqMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
    deviceName: req.get('x-device-name') || '',
  };
}

async function deliverOtpWithFallback({ channel, identifier, code, purpose, user }) {
  try {
    await sendOtp({ channel, to: identifier, code, purpose });
    return;
  } catch (err) {
    // If SMS delivery fails for login/resend, fall back to email if available.
    const canFallbackToEmail =
      channel === 'sms' &&
      user &&
      user.email &&
      typeof user.email === 'string' &&
      user.email.trim().length > 0;

    if (!canFallbackToEmail) {
      throw err;
    }

    safeLog('[OTP][FALLBACK]', 'sms_failed_try_email', {
      identifier,
      email: user.email,
      code: err.code,
      message: err.message,
    });

    await sendOtp({ channel: 'email', to: user.email.trim(), code, purpose });
  }
}

function errJson(err, fallbackCode) {
  return {
    ok: false,
    code: err.code || fallbackCode || 'BAD_REQUEST',
    message: err.message,
    error: err.message,
    ...(err.details ? { details: err.details } : {}),
  };
}

function withOtpDebug(payload, code) {
  if (!env.OTP_EXPOSE_CODE_IN_RESPONSE) {
    return payload;
  }

  return { ...payload, debugCode: code };
}

function isDuplicateKeyError(err) {
  return Number(err?.code) === 11000;
}

async function releaseDeletedCredentialConflicts({ email, phone }) {
  const deletedUsers = await User.find({
    isDeleted: true,
    $or: [{ email }, { phone }],
  }).select('_id email phone deletedEmail deletedPhone');

  if (!deletedUsers.length) {
    return 0;
  }

  for (const deletedUser of deletedUsers) {
    const tombstone = `deleted-${String(deletedUser._id)}-${Date.now()}`;
    const hadEmail = Boolean(deletedUser.email);
    const hadPhone = Boolean(deletedUser.phone);
    deletedUser.deletedEmail = deletedUser.deletedEmail || deletedUser.email || '';
    deletedUser.deletedPhone = deletedUser.deletedPhone || deletedUser.phone || '';
    deletedUser.email = hadEmail ? `${tombstone}@deleted.local` : '';
    deletedUser.phone = hadPhone ? `${tombstone}-${String(deletedUser.phone).replace(/[^\d+]/g, '')}` : '';
    await deletedUser.save();
  }

  logs.info('[REGISTER][CREDENTIAL_RELEASE] released soft-deleted credentials', {
    email,
    phone,
    count: deletedUsers.length,
  });
  return deletedUsers.length;
}

async function createRegisteredUser({ name, email, phone }) {
  try {
    return await User.create({ name, email, phone, emailVerified: false, phoneVerified: true, isVerified: true, verifiedAt: new Date(), lastLoginAt: new Date() });
  } catch (err) {
    if (!isDuplicateKeyError(err)) {
      throw err;
    }

    const releasedCount = await releaseDeletedCredentialConflicts({ email, phone });
    if (!releasedCount) {
      throw err;
    }

    return User.create({ name, email, phone, emailVerified: false, phoneVerified: true, isVerified: true, verifiedAt: new Date(), lastLoginAt: new Date() });
  }
}

async function requestOtp(req, res, next) {
  try {
    const raw = req.body.identifier;
    const identifier = normalizeIdentifier(raw);
    const channel = inferChannel(identifier);
    safeLog('[LOGIN][REQUEST_OTP]', 'started', { identifier });
    if (!identifier || !channel) {
      return res.status(400).json({ ok: false, code: 'INVALID_IDENTIFIER', message: 'Enter valid email or phone in E.164 format (e.g. +919876543210)', error: 'Enter valid email or phone in E.164 format (e.g. +919876543210)' });
    }

    const isReviewerLogin = isReviewIdentifier(identifier);
    if (isReviewerLogin) {
      logs.info('[PLAY_STORE_REVIEW][REQUEST_OTP] ensuring reviewer account', { identifier });
      await ensureReviewUser();
    }

    const query = isEmail(identifier) ? { email: identifier } : { phone: identifier };
    const user = await User.findOne(activeUserFilter({ ...query, isVerified: true }));
    const isExisting = Boolean(user);

    // This endpoint intentionally serves both login and first-step signup. The
    // delivery mechanism is unchanged: phone numbers still use the existing SMS
    // provider and email identifiers still use the existing email provider.
    const { code, expiresAt, otpSessionId } = await createOrReplaceOtp({
      identifier,
      channel,
      purpose: 'login',
      meta: reqMeta(req),
      ...(isReviewerLogin ? { codeOverride: getReviewOtp() } : {}),
    });

    if (isReviewerLogin) {
      logs.info('[PLAY_STORE_REVIEW][REQUEST_OTP] reviewer OTP prepared without external delivery', {
        identifier,
        otpSessionId,
      });
    } else {
      await deliverOtpWithFallback({ channel, identifier, code, purpose: 'login', user });
    }

    await writeAudit({
      scope: 'auth',
      action: 'login_request_otp',
      status: 'success',
      userId: user?._id,
      identifier,
      requestId: otpSessionId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      details: { isExisting },
    });
    safeLog('[LOGIN][REQUEST_OTP]', 'otp sent', { identifier, otpSessionId, isExisting });

    return res.json(withOtpDebug({
      ok: true,
      message: 'Verification code sent',
      to: maskIdentifier(identifier),
      expiresAt,
      otpSessionId,
      isExisting,
    }, code));
  } catch (err) {
    return next(err);
  }
}

async function verifyLoginOtp(req, res, next) {
  try {
    const identifier = normalizeIdentifier(req.body.identifier);
    const code = String(req.body.code || '').trim();
    const otpSessionId = req.body.otpSessionId || req.body.requestId || null;
    safeLog('[LOGIN][VERIFY_OTP]', 'started', { identifier, otpSessionId });
    if (!identifier && !otpSessionId) {
      return res.status(400).json({ ok: false, code: 'INVALID_IDENTIFIER', message: 'Invalid identifier', error: 'Invalid identifier' });
    }
    if (!code) return res.status(400).json({ ok: false, code: 'OTP_REQUIRED', message: 'OTP code required', error: 'OTP code required' });

    const otpDoc = await verifyOtp({ identifier, purpose: 'login', code, otpSessionId });
    const resolvedIdentifier = otpDoc.identifier;
    const query = isEmail(resolvedIdentifier) ? { email: resolvedIdentifier } : { phone: resolvedIdentifier };
    let user = await User.findOne(activeUserFilter({ ...query, isVerified: true }));
    const isNewUser = !user;

    if (!user) {
      const initialUser = {
        isVerified: true,
        verifiedAt: new Date(),
        lastLoginAt: new Date(),
      };
      if (isEmail(resolvedIdentifier)) {
        initialUser.email = resolvedIdentifier;
        initialUser.emailVerified = true;
      } else {
        initialUser.phone = resolvedIdentifier;
        initialUser.phoneVerified = true;
      }

      try {
        user = await User.create(initialUser);
      } catch (err) {
        // A concurrent request may have created the same account after our read.
        if (!isDuplicateKeyError(err)) throw err;
        user = await User.findOne(activeUserFilter(query));
        if (!user) throw err;
      }

      await acceptPendingInviteForRegisteredUser(user);
    } else {
      const loginUpdate = {
        lastLoginAt: new Date(),
        ...(isEmail(resolvedIdentifier) ? { emailVerified: true } : { phoneVerified: true }),
      };
      await User.updateOne({ _id: user._id }, { $set: loginUpdate });
      user = await User.findById(user._id);
    }

    if (isReviewIdentifier(resolvedIdentifier)) {
      logs.info('[PLAY_STORE_REVIEW][VERIFY_OTP] ensuring reviewer demo device', {
        identifier: resolvedIdentifier,
      });
      await ensureReviewUser();
    }

    const tokens = await issueTokens({ user, refreshMeta: reqMeta(req) });

    await writeAudit({
      scope: 'auth',
      action: 'login_verify_otp',
      status: 'success',
      userId: user._id,
      identifier: resolvedIdentifier,
      requestId: String(otpDoc._id),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      details: { isNewUser },
    });
    safeLog('[LOGIN][VERIFY_OTP]', 'success', { userId: String(user._id), otpSessionId: String(otpDoc._id), isNewUser });
    return res.json({ ok: true, ...tokens, isNewUser, user: authUserPayload(user) });
  } catch (err) {
    safeLog('[LOGIN][VERIFY_OTP]', 'failed', { code: err.code, message: err.message });
    await writeAudit({ scope: 'auth', action: 'login_verify_otp', status: 'failure', identifier: normalizeIdentifier(req.body.identifier), requestId: req.body.otpSessionId || req.body.requestId || null, ip: req.ip, userAgent: req.get('user-agent'), details: { code: err.code || 'VERIFY_FAILED', message: err.message } });
    return res.status(err.status || 400).json(errJson(err, 'OTP_VERIFY_FAILED'));
  }
}

async function deviceRegistrationRequestOtp(req, res, next) {
  try {
    const name = String(req.body.name || '').trim();
    const email = normalizeIdentifier(req.body.email);
    const phone = normalizeIdentifier(req.body.phone);
    safeLog('[REGISTER][REQUEST_OTP]', 'started', { email, phone });

    if (!name) return res.status(400).json({ ok: false, code: 'NAME_REQUIRED', message: 'Name is required', error: 'Name is required' });
    if (!email || !isEmail(email)) return res.status(400).json({ ok: false, code: 'EMAIL_INVALID', message: 'Valid email is required', error: 'Valid email is required' });
    if (!phone || !isE164Phone(phone)) return res.status(400).json({ ok: false, code: 'PHONE_INVALID', message: 'Valid phone in E.164 is required (e.g. +919876543210)', error: 'Valid phone in E.164 is required (e.g. +919876543210)' });

    logs.info('[REGISTER][REQUEST_OTP] checking active account uniqueness', { email, phone });
    const existing = await User.findOne(activeUserFilter({ $or: [{ email }, { phone }], isVerified: true }));
    if (existing) {
      await writeAudit({ scope: 'auth', action: 'register_request_otp', status: 'failure', identifier: phone, ip: req.ip, userAgent: req.get('user-agent'), details: { reason: 'USER_EXISTS' } });
      return res.status(409).json({ ok: false, code: 'USER_EXISTS', message: 'Account already exists. Please Sign in.', error: 'Account already exists. Please Sign in.' });
    }

    const identifier = phone;
    const channel = 'sms';
    const { code, expiresAt, otpSessionId } = await createOrReplaceOtp({ identifier, channel, purpose: 'register', meta: { ...reqMeta(req), name, email, phone } });
    await deliverOtpWithFallback({
      channel,
      identifier,
      code,
      purpose: 'register',
      user: { email },
    });
    await writeAudit({ scope: 'auth', action: 'register_request_otp', status: 'success', identifier, requestId: otpSessionId, ip: req.ip, userAgent: req.get('user-agent') });
    safeLog('[REGISTER][REQUEST_OTP]', 'otp sent', { identifier, otpSessionId });

    return res.status(201).json(withOtpDebug({ ok: true, message: 'Verification code sent', to: maskIdentifier(identifier), expiresAt, otpSessionId }, code));
  } catch (err) {
    logs.error('[REGISTER][REQUEST_OTP] failed', { code: err.code, message: err.message });
    return next(err);
  }
}

async function deviceRegistrationVerifyOtp(req, res, next) {
  try {
    const identifier = normalizeIdentifier(req.body.identifier);
    const code = String(req.body.code || '').trim();
    const otpSessionId = req.body.otpSessionId || req.body.requestId || null;
    safeLog('[REGISTER][VERIFY_OTP]', 'started', { identifier, otpSessionId });
    if (!identifier && !otpSessionId) {
      return res.status(400).json({ ok: false, code: 'INVALID_IDENTIFIER', message: 'Invalid identifier', error: 'Invalid identifier' });
    }
    if (!code) return res.status(400).json({ ok: false, code: 'OTP_REQUIRED', message: 'OTP code required', error: 'OTP code required' });

    const otpDoc = await verifyOtp({ identifier, purpose: 'register', code, otpSessionId });
    const meta = otpDoc.meta || {};
    const name = String(meta.name || '').trim();
    const email = normalizeIdentifier(meta.email || '');
    const phone = normalizeIdentifier(meta.phone || otpDoc.identifier || '');

    if (!name || !email || !phone) {
      return res.status(400).json({ ok: false, code: 'REGISTRATION_CONTEXT_MISSING', message: 'Registration data missing. Please request OTP again.', error: 'Registration data missing. Please request OTP again.' });
    }

    logs.info('[REGISTER][VERIFY_OTP] checking active account uniqueness', { email, phone });
    const existing = await User.findOne(activeUserFilter({ $or: [{ email }, { phone }], isVerified: true }));
    if (existing) {
      await writeAudit({ scope: 'auth', action: 'register_verify_otp', status: 'failure', identifier: phone, requestId: String(otpDoc._id), ip: req.ip, userAgent: req.get('user-agent'), details: { reason: 'USER_EXISTS' } });
      return res.status(409).json({ ok: false, code: 'USER_EXISTS', message: 'Account already exists. Please Sign in.', error: 'Account already exists. Please Sign in.' });
    }

    let user = await User.findOne(activeUserFilter({ $or: [{ email }, { phone }] }));
    if (!user) {
      user = await createRegisteredUser({ name, email, phone });
    } else {
      user.name = name;
      user.email = email;
      user.phone = phone;
      user.phoneVerified = true;
      user.isVerified = true;
      user.verifiedAt = new Date();
      user.lastLoginAt = new Date();
      await user.save();
    }

    await acceptPendingInviteForRegisteredUser(user);

    const tokens = await issueTokens({ user, refreshMeta: reqMeta(req) });
    await writeAudit({ scope: 'auth', action: 'register_verify_otp', status: 'success', userId: user._id, identifier: phone, requestId: String(otpDoc._id), ip: req.ip, userAgent: req.get('user-agent') });
    safeLog('[REGISTER][VERIFY_OTP]', 'success', { userId: String(user._id), otpSessionId: String(otpDoc._id) });
    return res.json({ ok: true, ...tokens, user: authUserPayload(user) });
  } catch (err) {
    logs.error('[REGISTER][VERIFY_OTP] failed', { code: err.code, message: err.message });
    safeLog('[REGISTER][VERIFY_OTP]', 'failed', { code: err.code, message: err.message });
    await writeAudit({ scope: 'auth', action: 'register_verify_otp', status: 'failure', identifier: normalizeIdentifier(req.body.identifier), requestId: req.body.otpSessionId || req.body.requestId || null, ip: req.ip, userAgent: req.get('user-agent'), details: { code: err.code || 'VERIFY_FAILED', message: err.message } });
    return res.status(err.status || 400).json(errJson(err, 'OTP_VERIFY_FAILED'));
  }
}


async function googleSignIn(req, res, next) {
  try {
    const idToken = String(req.body.idToken || '').trim();
    const payload = await verifyGoogleIdToken(idToken, [
      env.GOOGLE_WEB_CLIENT_ID,
      env.GOOGLE_ANDROID_CLIENT_ID,
    ]);

    const googleSub = String(payload.sub || '').trim();
    const email = normalizeIdentifier(payload.email || '');
    const emailVerified = payload.email_verified === true || String(payload.email_verified).toLowerCase() === 'true';
    if (!googleSub || !email || !isEmail(email) || !emailVerified) {
      return res.status(401).json({
        ok: false,
        code: 'GOOGLE_ACCOUNT_NOT_VERIFIED',
        message: 'Google account could not be verified',
        error: 'Google account could not be verified',
      });
    }

    let user = await User.findOne(activeUserFilter({ googleSub }));
    if (!user) user = await User.findOne(activeUserFilter({ email }));
    const isNewUser = !user;

    if (!user) {
      user = await User.create({
        name: payload.name ? String(payload.name).trim() : '',
        email,
        emailVerified: true,
        googleSub,
        avatar: payload.picture ? { url: payload.picture } : undefined,
        isVerified: true,
        verifiedAt: new Date(),
        lastLoginAt: new Date(),
      });
    } else {
      const emailConflict = await findIdentifierConflict(email, user._id);
      if (emailConflict) {
        return res.status(409).json({
          ok: false,
          code: 'GOOGLE_EMAIL_IN_USE',
          message: 'This Google email is already linked to another account.',
          error: 'This Google email is already linked to another account.',
        });
      }

      user.googleSub = googleSub;
      user.email = email;
      user.emailVerified = true;
      user.isVerified = true;
      if (!user.name && payload.name) {
        user.name = String(payload.name).trim();
      }
      if ((!user.avatar || !user.avatar.url) && payload.picture) {
        user.avatar = { url: payload.picture };
      }
      user.verifiedAt = user.verifiedAt || new Date();
      user.lastLoginAt = new Date();
      await user.save();
    }

    const tokens = await issueTokens({ user, refreshMeta: reqMeta(req) });
    await writeAudit({
      scope: 'auth',
      action: 'google_sign_in',
      status: 'success',
      userId: user._id,
      identifier: email,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      details: { isNewUser },
    });
    return res.json({ ok: true, ...tokens, isNewUser, user: authUserPayload(user) });
  } catch (err) {
    logs.error('[AUTH][GOOGLE] sign-in failed', { code: err.code, message: err.message });
    await writeAudit({
      scope: 'auth',
      action: 'google_sign_in',
      status: 'failure',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      details: { code: err.code || 'GOOGLE_SIGNIN_FAILED', message: err.message },
    });
    return res.status(err.status || 401).json({
      ok: false,
      code: err.code || 'GOOGLE_SIGNIN_FAILED',
      message: err.message || 'Google sign-in failed. Please try again.',
      error: err.message || 'Google sign-in failed. Please try again.',
    });
  }
}

async function requestLinkOtp(req, res, next) {
  try {
    const identifier = normalizeIdentifier(req.body.identifier);
    const channel = inferChannel(identifier);
    if (!identifier || !channel) {
      return res.status(400).json({ ok: false, code: 'INVALID_IDENTIFIER', message: 'Enter a valid email or phone number', error: 'Enter a valid email or phone number' });
    }

    const conflict = await findIdentifierConflict(identifier, req.user._id);
    if (conflict) {
      return res.status(409).json({ ok: false, code: isEmail(identifier) ? 'EMAIL_IN_USE' : 'PHONE_IN_USE', message: isEmail(identifier) ? 'Email already in use' : 'Phone already in use', error: isEmail(identifier) ? 'Email already in use' : 'Phone already in use' });
    }

    const { code, expiresAt, otpSessionId } = await createOrReplaceOtp({
      identifier,
      channel,
      purpose: 'link_identifier',
      meta: { ...reqMeta(req), userId: String(req.user._id) },
    });
    await deliverOtpWithFallback({ channel, identifier, code, purpose: 'link_identifier', user: req.user });
    await writeAudit({ scope: 'auth', action: 'link_identifier_request', status: 'success', userId: req.user._id, identifier, requestId: otpSessionId, ip: req.ip, userAgent: req.get('user-agent') });
    return res.json(withOtpDebug({ ok: true, message: 'Verification code sent', to: maskIdentifier(identifier), expiresAt, otpSessionId }, code));
  } catch (err) {
    return next(err);
  }
}

async function verifyLinkOtp(req, res) {
  try {
    const identifier = normalizeIdentifier(req.body.identifier);
    const code = String(req.body.code || '').trim();
    const otpSessionId = req.body.otpSessionId || req.body.requestId || null;
    const otpDoc = await verifyOtp({ identifier, purpose: 'link_identifier', code, otpSessionId });
    const resolvedIdentifier = otpDoc.identifier;

    const conflict = await findIdentifierConflict(resolvedIdentifier, req.user._id);
    if (conflict) {
      return res.status(409).json({ ok: false, code: isEmail(resolvedIdentifier) ? 'EMAIL_IN_USE' : 'PHONE_IN_USE', message: isEmail(resolvedIdentifier) ? 'Email already in use' : 'Phone already in use', error: isEmail(resolvedIdentifier) ? 'Email already in use' : 'Phone already in use' });
    }

    const user = await User.findOne(activeUserFilter({ _id: req.user._id }));
    if (!user) return res.status(404).json({ ok: false, code: 'USER_NOT_FOUND', message: 'User not found', error: 'User not found' });

    if (isEmail(resolvedIdentifier)) {
      user.email = resolvedIdentifier;
      user.emailVerified = true;
    } else {
      user.phone = resolvedIdentifier;
      user.phoneVerified = true;
    }
    user.isVerified = true;
    user.verifiedAt = user.verifiedAt || new Date();
    await user.save();

    await acceptPendingInviteForRegisteredUser(user);
    await writeAudit({ scope: 'auth', action: 'link_identifier_verify', status: 'success', userId: user._id, identifier: resolvedIdentifier, requestId: String(otpDoc._id), ip: req.ip, userAgent: req.get('user-agent') });
    return res.json({ ok: true, user: authUserPayload(user) });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err, 'LINK_IDENTIFIER_VERIFY_FAILED'));
  }
}

async function requestWhatsappOtp(req, res) {
  try {
    const identifier = normalizeIdentifier(req.body.identifier);
    const purpose = ['login', 'register', 'link_identifier'].includes(req.body.purpose) ? req.body.purpose : 'login';
    if (!identifier || !isE164Phone(identifier)) {
      return res.status(400).json({ ok: false, code: 'PHONE_INVALID', message: 'WhatsApp OTP requires a valid phone number', error: 'WhatsApp OTP requires a valid phone number' });
    }
    if (purpose === 'link_identifier' && !req.user) {
      return res.status(401).json({ ok: false, code: 'TOKEN_MISSING', message: 'Sign in before linking a phone number', error: 'Sign in before linking a phone number' });
    }

    let meta = reqMeta(req);
    if (purpose === 'login') {
      const user = await User.findOne(activeUserFilter({ phone: identifier, isVerified: true }));
      const pendingLoginOtp = await Otp.findOne({ identifier, purpose: 'login', consumedAt: null }).sort({ createdAt: -1 });
      // The new UI uses request-otp for both login and first-step signup. A
      // brand-new number is allowed to switch that already-issued OTP to
      // WhatsApp; calling this endpoint cold for an unknown number is rejected.
      if (!user && !pendingLoginOtp) {
        return res.status(404).json({ ok: false, code: 'OTP_NOT_FOUND', message: 'Request an OTP first.', error: 'Request an OTP first.' });
      }
    } else if (purpose === 'register') {
      const previous = await Otp.findOne({ identifier, purpose: 'register', consumedAt: null }).sort({ createdAt: -1 });
      if (!previous || !previous.meta?.email || !previous.meta?.name) {
        return res.status(400).json({ ok: false, code: 'REGISTRATION_CONTEXT_MISSING', message: 'Please start sign up again before requesting WhatsApp OTP.', error: 'Please start sign up again before requesting WhatsApp OTP.' });
      }
      meta = { ...(previous.meta.toObject ? previous.meta.toObject() : previous.meta), ...reqMeta(req) };
    } else {
      const conflict = await findIdentifierConflict(identifier, req.user._id);
      if (conflict) return res.status(409).json({ ok: false, code: 'PHONE_IN_USE', message: 'Phone already in use', error: 'Phone already in use' });
      meta = { ...meta, userId: String(req.user._id) };
    }

    const currentOtp = await Otp.findOne({ identifier, purpose, consumedAt: null }).sort({ createdAt: -1 });
    const canResendExistingWhatsapp =
      currentOtp &&
      currentOtp.channel === 'whatsapp' &&
      !currentOtp.verifiedAt &&
      currentOtp.expiresAt > new Date();

    const otpResult = canResendExistingWhatsapp
      ? await resendOtp({ identifier, purpose, meta })
      : await createOrReplaceOtp({
          identifier,
          channel: 'whatsapp',
          purpose,
          meta,
        });

    const { code, expiresAt, otpSessionId } = otpResult;
    const delivery = await sendWhatsappOtpMessage({ to: identifier, code, purpose });
    if (!delivery.sent) {
      return res.status(503).json({ ok: false, code: 'WHATSAPP_NOT_CONFIGURED', message: 'WhatsApp OTP is not configured yet. Please use SMS.', error: 'WhatsApp OTP is not configured yet. Please use SMS.' });
    }
    return res.json(withOtpDebug({ ok: true, message: 'OTP sent on WhatsApp', expiresAt, otpSessionId }, code));
  } catch (err) {
    logs.error('[AUTH][WHATSAPP_OTP] failed', { code: err.code, message: err.message });
    return res.status(err.status || 400).json(errJson(err, 'WHATSAPP_OTP_FAILED'));
  }
}

async function resend(req, res) {
  try {
    const identifier = normalizeIdentifier(req.body.identifier);
    const purpose = req.body.purpose === 'register' ? 'register' : 'login';
    if (!identifier) return res.status(400).json({ ok: false, code: 'INVALID_IDENTIFIER', message: 'Invalid identifier', error: 'Invalid identifier' });

    const isReviewerLogin = purpose === 'login' && isReviewIdentifier(identifier);
    if (isReviewerLogin) {
      logs.info('[PLAY_STORE_REVIEW][RESEND_OTP] reviewer resend requested', { identifier });
      await ensureReviewUser();
    }

    const { code, expiresAt, channel, otpSessionId } = await resendOtp({
      identifier,
      purpose,
      meta: reqMeta(req),
      ...(isReviewerLogin ? { codeOverride: getReviewOtp() } : {}),
    });

    // For phone-based login resends, allow the same SMS -> email fallback as request-otp.
    const query = isEmail(identifier) ? { email: identifier } : { phone: identifier };
    const user = await User.findOne(activeUserFilter({ ...query, isVerified: true }));
    if (isReviewerLogin) {
      logs.info('[PLAY_STORE_REVIEW][RESEND_OTP] reviewer OTP refreshed without external delivery', {
        identifier,
        otpSessionId,
      });
    } else {
      await deliverOtpWithFallback({ channel, identifier, code, purpose, user });
    }

    await writeAudit({ scope: 'auth', action: 'resend_otp', status: 'success', identifier, requestId: otpSessionId || null, ip: req.ip, userAgent: req.get('user-agent'), details: { purpose } });
    safeLog('[AUTH][RESEND_OTP]', 'success', { identifier, purpose, otpSessionId });
    return res.json(withOtpDebug({ ok: true, message: 'Verification code resent', expiresAt, otpSessionId }, code));
  } catch (err) {
    await writeAudit({ scope: 'auth', action: 'resend_otp', status: 'failure', identifier: normalizeIdentifier(req.body.identifier), ip: req.ip, userAgent: req.get('user-agent'), details: { purpose: req.body.purpose, code: err.code || 'RESEND_FAILED', message: err.message } });
    return res.status(err.status || 400).json(errJson(err, 'OTP_RESEND_FAILED'));
  }
}

async function refresh(req, res) {
  try {
    const refreshToken = req.body.refreshToken;
    if (!refreshToken) return res.status(400).json({ ok: false, code: 'REFRESH_TOKEN_REQUIRED', message: 'refreshToken required', error: 'refreshToken required' });
    const tokens = await rotateRefreshToken({ refreshToken, refreshMeta: reqMeta(req) });
    return res.json({ ok: true, ...tokens });
  } catch (err) {
    return res.status(err.status || 401).json(errJson(err, 'TOKEN_REFRESH_FAILED'));
  }
}

async function logout(req, res) {
  try {
    const refreshToken = req.body.refreshToken;
    let meta = null;
    if (refreshToken) meta = await revokeRefreshToken(refreshToken, 'logout');
    await writeAudit({ scope: 'auth', action: 'logout', status: 'success', userId: meta && meta.userId ? meta.userId : (req.user && req.user._id), sessionJti: meta && meta.sessionJti ? meta.sessionJti : undefined, ip: req.ip, userAgent: req.get('user-agent') });
    safeLog('[AUTH][LOGOUT]', 'success', { sessionJti: meta && meta.sessionJti ? meta.sessionJti : null });
    return res.json({ ok: true, message: 'Logged out' });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err, 'LOGOUT_FAILED'));
  }
}

async function listSessions(req, res) {
  try {
    const sessions = await listActiveSessions(req.user._id);
    return res.json({ ok: true, data: sessions });
  } catch (err) {
    return res.status(err.status || 400).json(errJson(err, 'SESSIONS_LIST_FAILED'));
  }
}

function getMe(req, res) {
  return res.json({ ok: true, user: authUserPayload(req.user) });
}

async function logoutAll(req, res) {
  try {
    const fcmToken = String(req.body?.fcmToken || '').trim();
    logs.info('[AUTH][LOGOUT_ALL] request received', {
      userId: String(req.user._id),
      hasClientFcmToken: Boolean(fcmToken),
    });

    const tokenCleanup = await User.updateOne(
      { _id: req.user._id },
      { $set: { fcmTokens: [] } },
    );
    logs.info('[AUTH][LOGOUT_ALL] all push tokens cleared', {
      userId: String(req.user._id),
      matchedCount: tokenCleanup.matchedCount,
      modifiedCount: tokenCleanup.modifiedCount,
    });

    await revokeAllUserRefreshTokens(req.user._id, 'logout_all');
    await writeAudit({ scope: 'auth', action: 'logout_all', status: 'success', userId: req.user._id, ip: req.ip, userAgent: req.get('user-agent') });
    safeLog('[AUTH][LOGOUT_ALL]', 'success', { userId: String(req.user._id) });
    return res.json({ ok: true, message: 'Logged out from all sessions' });
  } catch (err) {
    logs.error('[AUTH][LOGOUT_ALL] failed', {
      userId: req.user?._id ? String(req.user._id) : '',
      code: err.code,
      message: err.message,
    });
    return res.status(err.status || 400).json(errJson(err, 'LOGOUT_ALL_FAILED'));
  }
}

module.exports = {
  requestOtp,
  googleSignIn,
  requestLinkOtp,
  verifyLinkOtp,
  requestWhatsappOtp,
  getMe,
  verifyLoginOtp,
  deviceRegistrationRequestOtp,
  deviceRegistrationVerifyOtp,
  resend,
  refresh,
  logout,
  listSessions,
  logoutAll,
};
