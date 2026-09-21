const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { env } = require('../config/env');
const { safeLog, logs } = require('../utils/logger');

module.exports = async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [type, token] = header.split(' ');

    if (type !== 'Bearer' || !token) {
      return res.status(401).json({
        ok: false,
        code: 'TOKEN_MISSING',
        message: 'Missing token',
        error: 'Missing token',
      });
    }

    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    const userId = payload.sub || payload.userId || payload.id;
    if (!userId) {
      return res.status(401).json({
        ok: false,
        code: 'TOKEN_INVALID',
        message: 'Invalid token payload',
        error: 'Invalid token payload',
      });
    }

    let user = await User.findById(userId).select('_id name email phone emailVerified phoneVerified googleSub dateOfBirth gender avatar isVerified primaryHomeId preferences roles isDeleted deletedAt');
    
    // For development/testing: if user not found, create mock user from token
    if (!user) {
      // In development, allow SMS testing without user existing in DB
      if (env.NODE_ENV === 'development') {
        safeLog('[AUTH][DEV] User not found, recovering user from token payload');
        const recoveredUser = await User.create({
          _id: userId,
          name: payload.name || 'Test User',
          email: payload.email,
          phone: payload.phone || '',
          isVerified: true,
          verifiedAt: new Date(),
          primaryHomeId: userId,
        });
        user = await User.findById(recoveredUser._id).select('_id name email phone emailVerified phoneVerified googleSub dateOfBirth gender avatar isVerified primaryHomeId preferences roles isDeleted deletedAt');
        req.user = user;
        req.auth = payload;
        return next();
      }
      
      return res.status(401).json({
        ok: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found',
        error: 'User not found',
      });
    }

    if (user.isDeleted === true) {
      logs.info('[AUTH][MIDDLEWARE] blocked deleted user', { userId: String(user._id) });
      return res.status(401).json({
        ok: false,
        code: 'ACCOUNT_DELETED',
        message: 'Account has been deleted',
        error: 'Account has been deleted',
      });
    }

    req.user = user;
    req.auth = payload;
    return next();
  } catch (err) {
    logs.error('[AUTH][MIDDLEWARE] invalid token', { error: err.message });
    safeLog('[AUTH][MIDDLEWARE]', 'invalid token', { error: err.message });
    return res.status(401).json({
      ok: false,
      code: 'TOKEN_INVALID_OR_EXPIRED',
      message: 'Invalid/Expired token',
      error: 'Invalid/Expired token',
    });
  }
};
