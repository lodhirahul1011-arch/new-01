const crypto = require('crypto');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PLACEHOLDER_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAoAAAAFoCAIAAABIUN0GAAAACXBIWXMAAAsSAAALEgHS3X78AAABHUlEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4G4B6AABlR5q1QAAAABJRU5ErkJggg==';

async function createPlaceholderThumbnail(outputPath) {
  fs.mkdirSync(require('path').dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(PLACEHOLDER_PNG_BASE64, 'base64'));
}

async function generateVideoThumbnail(inputPath, outputPath) {
  const ffmpeg = spawnSync('ffmpeg', ['-y', '-i', inputPath, '-ss', '00:00:01', '-vframes', '1', outputPath], {
    stdio: 'ignore',
  });
  if (ffmpeg.status === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    return { strategy: 'ffmpeg' };
  }
  await createPlaceholderThumbnail(outputPath);
  return { strategy: 'placeholder' };
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

module.exports = {
  generateVideoThumbnail,
  sha256File,
};
