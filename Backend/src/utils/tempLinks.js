const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function createTempToken(payload, expiresInSeconds = 900) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: expiresInSeconds });
}

function verifyTempToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

module.exports = { createTempToken, verifyTempToken };
