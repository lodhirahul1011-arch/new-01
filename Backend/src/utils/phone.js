function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhoneToE164(value, defaultCountryCode = '91') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^\+[1-9]\d{7,14}$/.test(raw)) return raw;

  let digits = digitsOnly(raw);
  const countryCode = digitsOnly(defaultCountryCode);
  if (!digits) return '';

  // Common international dialing prefix.
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (countryCode && digits.length === 10) {
    return `+${countryCode}${digits}`;
  }

  if (countryCode && digits.startsWith(countryCode) && digits.length > 10) {
    return `+${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return '';
}

function buildPhoneLookupCandidates(value, defaultCountryCode = '91') {
  const raw = String(value || '').trim();
  const digits = digitsOnly(raw);
  const e164 = normalizePhoneToE164(raw, defaultCountryCode);
  const countryCode = digitsOnly(defaultCountryCode);
  const candidates = new Set();

  if (raw) candidates.add(raw);
  if (e164) candidates.add(e164);
  if (digits) {
    candidates.add(digits);
    candidates.add(`+${digits}`);
  }

  const e164Digits = digitsOnly(e164);
  if (countryCode && e164Digits.startsWith(countryCode)) {
    const national = e164Digits.slice(countryCode.length);
    if (national) {
      candidates.add(national);
      candidates.add(`0${national}`);
    }
  }

  return Array.from(candidates).filter(Boolean);
}

function maskPhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return '';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

module.exports = {
  normalizePhoneToE164,
  buildPhoneLookupCandidates,
  maskPhone,
};
