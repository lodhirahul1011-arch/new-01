const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_REGEX = /^\+[1-9]\d{7,14}$/;

function isEmail(value) {
  return EMAIL_REGEX.test(String(value).trim().toLowerCase());
}

function isE164Phone(value) {
  return E164_REGEX.test(String(value).trim());
}

function inferChannel(identifier) {
  if (isEmail(identifier)) return 'email';
  if (isE164Phone(identifier)) return 'sms';
  return null;
}

function normalizeIdentifier(identifier) {
  const v = String(identifier || '').trim();
  if (isEmail(v)) return v.toLowerCase();
  if (isE164Phone(v)) return v;
  return null;
}

function maskIdentifier(identifier) {
  const norm = normalizeIdentifier(identifier);
  if (!norm) return '';
  if (isEmail(norm)) {
    const [u, d] = norm.split('@');
    const uMasked = u.length <= 2 ? `${u[0]}*` : `${u.slice(0, 2)}***`;
    return `${uMasked}@${d}`;
  }
  // Phone mask: keep last 2-3 digits
  const last = norm.slice(-3);
  return `${norm.slice(0, 2)}******${last}`;
}

module.exports = { isEmail, isE164Phone, inferChannel, normalizeIdentifier, maskIdentifier };
