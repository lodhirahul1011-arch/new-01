const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');

const RefreshToken = require('../models/RefreshToken');
const User = require('../models/User');
const { env } = require('../config/env');
const { safeLog, logs } = require('../utils/logger');

function buildError(message, status, code, details) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details) err.details = details;
  return err;
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), roles: user.roles || ['user'] },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL }
  );
}

function signRefreshToken(user, jti) {
  return jwt.sign({ sub: String(user._id), jti }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

async function issueTokens({ user, refreshMeta }) {
  if (user && user.isDeleted === true) {
    logs.error('[AUTH][TOKEN] issue rejected for deleted user', { userId: String(user._id) });
    throw buildError('Account has been deleted', 401, 'ACCOUNT_DELETED');
  }

  const accessToken = signAccessToken(user);
  const jti = nanoid(24);
  const refreshToken = signRefreshToken(user, jti);
  const tokenHash = await bcrypt.hash(refreshToken, 10);
  const decoded = jwt.decode(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000);

  await RefreshToken.create({
    userId: user._id,
    jti,
    tokenHash,
    expiresAt,
    meta: refreshMeta || {},
    lastUsedAt: new Date(),
  });

  safeLog('[AUTH][TOKEN]', 'issued', { userId: String(user._id), sessionJti: jti });
  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: Math.max(1, decoded.exp - Math.floor(Date.now() / 1000)),
  };
}

async function revokeAllUserRefreshTokens(userId, reason) {
  await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason || 'manual_revoke' } }
  );
}

async function rotateRefreshToken({ refreshToken, refreshMeta }) {
  const payload = verifyRefreshToken(refreshToken);
  const tokenDoc = await RefreshToken.findOne({ jti: payload.jti, userId: payload.sub });
  if (!tokenDoc) throw buildError('Invalid refresh token', 401, 'TOKEN_INVALID');

  const ok = await bcrypt.compare(refreshToken, tokenDoc.tokenHash);
  if (!ok) {
    await revokeAllUserRefreshTokens(payload.sub, 'refresh_reuse_detected');
    safeLog('[AUTH][REFRESH]', 'reuse detected', { userId: String(payload.sub), sessionJti: payload.jti });
    throw buildError('Refresh token reuse detected. Please login again.', 401, 'TOKEN_REUSE_DETECTED');
  }
  if (tokenDoc.revokedAt) {
    await revokeAllUserRefreshTokens(payload.sub, 'revoked_token_reused');
    throw buildError('Refresh token revoked', 401, 'TOKEN_REVOKED');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw buildError('User not found', 401, 'USER_NOT_FOUND');
  if (user.isDeleted === true) {
    await revokeAllUserRefreshTokens(user._id, 'account_deleted');
    logs.info('[AUTH][REFRESH] blocked deleted user', { userId: String(user._id) });
    throw buildError('Account has been deleted', 401, 'ACCOUNT_DELETED');
  }

  const accessToken = signAccessToken(user);
  const newJti = nanoid(24);
  const newRefreshToken = signRefreshToken(user, newJti);
  const newHash = await bcrypt.hash(newRefreshToken, 10);
  const decoded = jwt.decode(newRefreshToken);
  const expiresAt = new Date(decoded.exp * 1000);

  tokenDoc.revokedAt = new Date();
  tokenDoc.revokedReason = 'rotated';
  tokenDoc.replacedByJti = newJti;
  tokenDoc.lastUsedAt = new Date();
  await tokenDoc.save();

  await RefreshToken.create({
    userId: user._id,
    jti: newJti,
    tokenHash: newHash,
    expiresAt,
    meta: refreshMeta || tokenDoc.meta || {},
    lastUsedAt: new Date(),
  });

  safeLog('[AUTH][REFRESH]', 'rotated', { userId: String(user._id), oldJti: tokenDoc.jti, newJti });
  return {
    accessToken,
    refreshToken: newRefreshToken,
    tokenType: 'Bearer',
    expiresIn: Math.max(1, decoded.exp - Math.floor(Date.now() / 1000)),
  };
}

async function revokeRefreshToken(refreshToken, reason) {
  try {
    const payload = verifyRefreshToken(refreshToken);
    const tokenDoc = await RefreshToken.findOne({ jti: payload.jti, userId: payload.sub });
    if (tokenDoc && !tokenDoc.revokedAt) {
      tokenDoc.revokedAt = new Date();
      tokenDoc.revokedReason = reason || 'logout';
      await tokenDoc.save();
    }
    return { userId: payload.sub, sessionJti: payload.jti };
  } catch {
    return null;
  }
}

async function listActiveSessions(userId) {
  const docs = await RefreshToken.find({ userId, revokedAt: null }).sort({ createdAt: -1 });
  return docs.map((doc) => ({
    id: String(doc._id),
    jti: doc.jti,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    lastUsedAt: doc.lastUsedAt,
    revokedAt: doc.revokedAt,
    meta: doc.meta || {},
  }));
}

module.exports = {
  issueTokens,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  listActiveSessions,
};
