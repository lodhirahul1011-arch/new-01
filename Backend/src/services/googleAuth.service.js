const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let jwksCache = {
  keysByKid: new Map(),
  expiresAt: 0,
};

function parseMaxAge(cacheControl) {
  const match = String(cacheControl || '').match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Math.max(60, Number(match[1])) : 3600;
}

async function fetchGoogleKeys({ force = false } = {}) {
  const now = Date.now();
  if (!force && jwksCache.keysByKid.size > 0 && jwksCache.expiresAt > now) {
    return jwksCache.keysByKid;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetch(GOOGLE_JWKS_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const err = new Error(`Unable to load Google signing keys (${response.status})`);
    err.code = 'GOOGLE_JWKS_UNAVAILABLE';
    err.status = 503;
    throw err;
  }

  const payload = await response.json();
  const keysByKid = new Map();
  for (const jwk of payload?.keys || []) {
    if (!jwk?.kid) continue;
    const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    keysByKid.set(String(jwk.kid), keyObject);
  }

  if (keysByKid.size === 0) {
    const err = new Error('Google signing keys were empty');
    err.code = 'GOOGLE_JWKS_EMPTY';
    err.status = 503;
    throw err;
  }

  const maxAgeSeconds = parseMaxAge(response.headers.get('cache-control'));
  jwksCache = {
    keysByKid,
    expiresAt: now + maxAgeSeconds * 1000,
  };
  return keysByKid;
}

async function verifyGoogleIdToken(idToken, audience) {
  const token = String(idToken || '').trim();
  const expectedAudience = String(audience || '').trim();
  if (!token) {
    const err = new Error('Google ID token is required');
    err.code = 'GOOGLE_ID_TOKEN_REQUIRED';
    err.status = 400;
    throw err;
  }
  if (!expectedAudience) {
    const err = new Error('Google sign-in is not configured');
    err.code = 'GOOGLE_SIGNIN_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }

  const decoded = jwt.decode(token, { complete: true });
  const kid = decoded?.header?.kid;
  const alg = decoded?.header?.alg;
  if (!kid || alg !== 'RS256') {
    const err = new Error('Google ID token header is invalid');
    err.code = 'GOOGLE_TOKEN_INVALID';
    err.status = 401;
    throw err;
  }

  let keys = await fetchGoogleKeys();
  let key = keys.get(String(kid));
  if (!key) {
    // Google rotates keys. Force one refresh before rejecting a new kid.
    keys = await fetchGoogleKeys({ force: true });
    key = keys.get(String(kid));
  }
  if (!key) {
    const err = new Error('Google signing key was not found');
    err.code = 'GOOGLE_SIGNING_KEY_NOT_FOUND';
    err.status = 401;
    throw err;
  }

  let payload;
  try {
    payload = jwt.verify(token, key, {
      algorithms: ['RS256'],
      audience: expectedAudience,
      issuer: GOOGLE_ISSUERS,
      clockTolerance: 5,
    });
  } catch (cause) {
    const err = new Error('Google sign-in token is invalid or expired');
    err.code = 'GOOGLE_TOKEN_INVALID';
    err.status = 401;
    err.cause = cause;
    throw err;
  }

  if (!payload || typeof payload !== 'object') {
    const err = new Error('Google sign-in token payload is invalid');
    err.code = 'GOOGLE_TOKEN_INVALID';
    err.status = 401;
    throw err;
  }

  return payload;
}

module.exports = {
  verifyGoogleIdToken,
};
