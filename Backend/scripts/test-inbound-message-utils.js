const assert = require('assert');
const {
  normalizePhoneToE164,
  buildPhoneLookupCandidates,
  maskPhone,
} = require('../src/utils/phone');

assert.strictEqual(normalizePhoneToE164('9876543210', '91'), '+919876543210');
assert.strictEqual(normalizePhoneToE164('+919876543210', '91'), '+919876543210');
assert.strictEqual(normalizePhoneToE164('00919876543210', '91'), '+919876543210');

const candidates = buildPhoneLookupCandidates('+91 98765 43210', '91');
assert(candidates.includes('+919876543210'));
assert(candidates.includes('9876543210'));
assert.strictEqual(maskPhone('+919876543210'), '********3210');

console.log('Inbound message phone utility tests passed');
