#!/usr/bin/env node

const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
const { logs } = require('../src/utils/logger');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DEFAULT_PROXY_PORT = 5055;
const DEFAULT_BACKEND_URL = 'http://localhost:5000';
const WEBHOOK_PATH = '/api/v1/whatsapp/webhook';

function readArg(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();

  const index = process.argv.findIndex(arg => arg === `--${name}`);
  if (index >= 0) return String(process.argv[index + 1] || '').trim();

  return '';
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function stripHopByHopHeaders(headers) {
  const sanitized = { ...headers };
  delete sanitized.host;
  delete sanitized.connection;
  delete sanitized['content-length'];
  delete sanitized['transfer-encoding'];
  delete sanitized.upgrade;
  delete sanitized['proxy-authorization'];
  delete sanitized['proxy-authenticate'];
  return sanitized;
}

function isAllowedRequest(req, pathname) {
  return pathname === WEBHOOK_PATH && ['GET', 'POST'].includes(req.method);
}

async function forwardToBackend(req, res, targetUrl) {
  const incomingUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const backendUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, targetUrl);
  const body = req.method === 'POST' ? await readRequestBody(req) : undefined;
  const headers = stripHopByHopHeaders(req.headers);

  if (body) headers['content-length'] = String(body.length);
  headers['x-whatsapp-webhook-proxy'] = 'true';

  logs.info('[WHATSAPP_WEBHOOK_PROXY] forwarding request', {
    method: req.method,
    path: incomingUrl.pathname,
    hasSignature: Boolean(req.headers['x-hub-signature-256']),
  });

  const backendResponse = await fetch(backendUrl, {
    method: req.method,
    headers,
    body,
  });

  const responseBody = Buffer.from(await backendResponse.arrayBuffer());
  backendResponse.headers.forEach((value, key) => {
    if (!['connection', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });

  res.statusCode = backendResponse.status;
  res.end(responseBody);

  logs.info('[WHATSAPP_WEBHOOK_PROXY] forwarded response', {
    method: req.method,
    path: incomingUrl.pathname,
    status: backendResponse.status,
  });
}

async function handleRequest(req, res, targetUrl) {
  const incomingUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (!isAllowedRequest(req, incomingUrl.pathname)) {
    logs.error('[WHATSAPP_WEBHOOK_PROXY] blocked request', {
      method: req.method,
      path: incomingUrl.pathname,
    });
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  try {
    await forwardToBackend(req, res, targetUrl);
  } catch (error) {
    logs.error('[WHATSAPP_WEBHOOK_PROXY] forward failed', {
      method: req.method,
      path: incomingUrl.pathname,
      error: error.message,
    });
    res.statusCode = 502;
    res.end('Bad Gateway');
  }
}

function run() {
  const port = Number(readArg('port') || process.env.WHATSAPP_WEBHOOK_PROXY_PORT || DEFAULT_PROXY_PORT);
  const targetUrl = String(
    readArg('target') || process.env.WHATSAPP_WEBHOOK_BACKEND_URL || DEFAULT_BACKEND_URL,
  ).replace(/\/+$/, '');

  const server = http.createServer((req, res) => {
    handleRequest(req, res, targetUrl);
  });

  server.on('error', error => {
    logs.error('[WHATSAPP_WEBHOOK_PROXY] server failed', {
      port,
      targetUrl,
      error: error.message,
    });
    process.exitCode = 1;
  });

  server.listen(port, () => {
    logs.info('[WHATSAPP_WEBHOOK_PROXY] server listening', {
      port,
      targetUrl,
      allowedPath: WEBHOOK_PATH,
    });
  });
}

run();
