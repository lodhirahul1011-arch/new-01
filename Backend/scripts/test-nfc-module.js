const fs = require('fs');
const path = require('path');

const checks = [
  ['src/models/NfcCard.js', ['uidHash', 'serialMasked', 'totalAccessCount']],
  ['src/models/NfcAccessLog.js', ['result', 'reasonCode', 'scannedAt']],
  ['src/services/nfc.service.js', ['listCardsOverview', 'verifyAccess', 'listAccessLogs']],
  ['src/routes/nfc.routes.js', ['/cards/overview', '/verify-access', '/access-logs']],
  ['src/routes/deliveryAccess.routes.js', ['/methods']],
  ['src/app.js', ['/api/v1/delivery-access', '/api/v1/nfc']],
];

let failed = false;
for (const [file, snippets] of checks) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) {
    console.error(`Missing file: ${file}`);
    failed = true;
    continue;
  }
  const content = fs.readFileSync(full, 'utf8');
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      console.error(`Missing snippet in ${file}: ${snippet}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('NFC module smoke checks passed');
