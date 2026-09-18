const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

function getProvider() {
  return String(process.env.STORAGE_PROVIDER || 'local').toLowerCase() === 's3' ? 's3' : 'local';
}

function localBaseDir() {
  return path.join(process.cwd(), 'private_uploads', 'recordings');
}

function ensureDirForKey(key) {
  const full = path.join(localBaseDir(), path.dirname(key));
  fs.mkdirSync(full, { recursive: true });
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmacHex(key, value, encoding = 'hex') {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function awsConfig() {
  return {
    bucket: process.env.S3_BUCKET || '',
    region: process.env.AWS_REGION || 'ap-south-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
    endpoint: process.env.S3_ENDPOINT || '',
    forcePathStyle: ['1', 'true', 'yes'].includes(String(process.env.S3_FORCE_PATH_STYLE || '').toLowerCase()),
  };
}

function getS3Base() {
  const cfg = awsConfig();
  if (cfg.endpoint) {
    const url = new URL(cfg.endpoint);
    return { protocol: url.protocol, host: url.host, pathname: url.pathname.replace(/\/$/, '') };
  }
  return { protocol: 'https:', host: `s3.${cfg.region}.amazonaws.com`, pathname: '' };
}

function getS3RequestPath(key) {
  const cfg = awsConfig();
  const base = getS3Base();
  const normalizedKey = key.split(path.sep).join('/');
  const prefix = base.pathname || '';
  if (cfg.forcePathStyle || cfg.endpoint) {
    return `${prefix}/${cfg.bucket}/${normalizedKey}`.replace(/\/+/g, '/');
  }
  return `${prefix}/${normalizedKey}`.replace(/\/+/g, '/');
}

function getS3Host() {
  const cfg = awsConfig();
  const base = getS3Base();
  if (cfg.forcePathStyle || cfg.endpoint) return base.host;
  return `${cfg.bucket}.${base.host}`;
}

function awsDate(now = new Date()) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function ymd(now = new Date()) {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

function getSigningKey(secretKey, dateStamp, region, service) {
  const kDate = crypto.createHmac('sha256', `AWS4${secretKey}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  return crypto.createHmac('sha256', kService).update('aws4_request').digest();
}

async function putObject({ key, buffer, contentType }) {
  const provider = getProvider();
  if (provider === 'local') {
    ensureDirForKey(key);
    const full = path.join(localBaseDir(), key);
    fs.writeFileSync(full, buffer);
    return { provider: 'local', key };
  }

  const cfg = awsConfig();
  if (!cfg.bucket || !cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error('S3 storage is enabled but S3 credentials are missing');
  }

  const now = new Date();
  const amzDate = awsDate(now);
  const dateStamp = ymd(now);
  const host = getS3Host();
  const requestPath = getS3RequestPath(key);
  const payloadHash = sha256Hex(buffer);
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['PUT', requestPath, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = getSigningKey(cfg.secretAccessKey, dateStamp, cfg.region, 's3');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const base = getS3Base();
  const transport = base.protocol === 'http:' ? http : https;

  await new Promise((resolve, reject) => {
    const req = transport.request(
      {
        method: 'PUT',
        host,
        path: requestPath,
        headers: {
          'Content-Type': contentType,
          'Content-Length': buffer.length,
          'x-amz-content-sha256': payloadHash,
          'x-amz-date': amzDate,
          Authorization: authorization,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve();
          return reject(new Error(`S3 upload failed (${res.statusCode}): ${Buffer.concat(chunks).toString('utf8')}`));
        });
      }
    );
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });

  return { provider: 's3', key };
}

function createPresignedGetUrl(key, expiresInSeconds = 900, responseFileName = '') {
  const cfg = awsConfig();
  if (!cfg.bucket || !cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error('S3 credentials are missing');
  }
  const now = new Date();
  const amzDate = awsDate(now);
  const dateStamp = ymd(now);
  const host = getS3Host();
  const requestPath = getS3RequestPath(key);
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${cfg.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
  });
  if (responseFileName) {
    query.set('response-content-disposition', `inline; filename="${responseFileName.replace(/"/g, '')}"`);
  }
  const canonicalQueryString = Array.from(query.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const canonicalRequest = ['GET', requestPath, canonicalQueryString, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = getSigningKey(cfg.secretAccessKey, dateStamp, cfg.region, 's3');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  query.set('X-Amz-Signature', signature);
  const base = getS3Base();
  return `${base.protocol}//${host}${requestPath}?${query.toString()}`;
}

function getLocalAbsolutePath(key) {
  return path.join(localBaseDir(), key);
}

function readLocalStream(key) {
  return fs.createReadStream(getLocalAbsolutePath(key));
}

module.exports = {
  getProvider,
  putObject,
  createPresignedGetUrl,
  getLocalAbsolutePath,
  readLocalStream,
};
