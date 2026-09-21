const crypto = require('crypto');

function generateOtp(length = 6) {
  const max = 10 ** Number(length);
  const min = 10 ** (Number(length) - 1);
  return String(crypto.randomInt(min, max));
}

module.exports = { generateOtp };
