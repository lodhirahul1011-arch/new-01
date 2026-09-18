const fs = require('fs');
const path = require('path');

const REQUIRED_DIRS = [
  'uploads',
  'uploads/support',
  'private_uploads',
  'private_uploads/proofs',
  'private_uploads/recordings',
  'private_uploads/recordings/uploads',
  'private_uploads/recordings/thumbnails',
  'private_uploads/recordings/object-store',
];

function ensureUploadDirs(baseDir = process.cwd()) {
  for (const rel of REQUIRED_DIRS) {
    const full = path.join(baseDir, rel);
    fs.mkdirSync(full, { recursive: true });
  }
}

module.exports = { ensureUploadDirs, REQUIRED_DIRS };
