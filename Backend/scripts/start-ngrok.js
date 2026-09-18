#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');
const { setTimeout: sleep } = require('timers/promises');
const dotenv = require('dotenv');
const { logs } = require('../src/utils/logger');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DEFAULT_NGROK_API_URL = 'http://127.0.0.1:4040/api/tunnels';
const DEFAULT_PORT = 5000;

function readArg(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();

  const index = process.argv.findIndex(arg => arg === `--${name}`);
  if (index >= 0) return String(process.argv[index + 1] || '').trim();

  return '';
}

function buildNgrokArgs({ targetUrl, domain, region }) {
  const args = ['http', targetUrl];
  if (domain) args.push('--domain', domain);
  if (region) args.push('--region', region);
  return args;
}

function normalizeTarget(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();
}

function findPublicTunnel(tunnels, targetUrl, port) {
  const normalizedTarget = normalizeTarget(targetUrl);
  const portText = `:${port}`;
  const httpsTunnels = (Array.isArray(tunnels) ? tunnels : []).filter(tunnel =>
    String(tunnel?.public_url || '').startsWith('https://'),
  );

  return (
    httpsTunnels.find(tunnel => {
      const addr = normalizeTarget(tunnel?.config?.addr || '');
      return addr === normalizedTarget || addr.endsWith(portText);
    }) || httpsTunnels[0] || null
  );
}

async function waitForTunnel({ apiUrl, targetUrl, port }) {
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        const tunnel = findPublicTunnel(data.tunnels, targetUrl, port);
        if (tunnel?.public_url) return tunnel;
      }
    } catch (error) {
      if (attempt === 1) {
        logs.info('[NGROK] waiting for local ngrok API', {
          apiUrl,
          message: error.message,
        });
      }
    }

    await sleep(500);
  }

  return null;
}

function attachProcessLogging(child) {
  child.stdout.on('data', chunk => {
    const text = String(chunk || '').trim();
    if (text) logs.info('[NGROK] stdout', { text });
  });

  child.stderr.on('data', chunk => {
    const text = String(chunk || '').trim();
    if (text) logs.error('[NGROK] stderr', { text });
  });
}

async function run() {
  const port = Number(readArg('port') || process.env.NGROK_PORT || process.env.PORT || DEFAULT_PORT);
  const targetUrl = readArg('target') || process.env.NGROK_TARGET_URL || `http://localhost:${port}`;
  const domain = readArg('domain') || process.env.NGROK_DOMAIN || '';
  const region = readArg('region') || process.env.NGROK_REGION || '';
  const ngrokBin = readArg('bin') || process.env.NGROK_BIN || 'ngrok';
  const apiUrl = readArg('api-url') || process.env.NGROK_API_URL || DEFAULT_NGROK_API_URL;
  const args = buildNgrokArgs({ targetUrl, domain, region });

  logs.info('[NGROK] starting tunnel', {
    command: ngrokBin,
    targetUrl,
    domain: domain || 'random',
    region: region || 'default',
  });

  const child = spawn(ngrokBin, args, {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    shell: process.platform === 'win32',
  });

  attachProcessLogging(child);

  child.on('error', error => {
    logs.error('[NGROK] failed to start', {
      error: error.message,
      hint: 'Install ngrok or set NGROK_BIN to the ngrok executable path.',
    });
  });

  child.on('exit', (code, signal) => {
    if (code && code !== 0) {
      logs.error('[NGROK] tunnel exited', { code, signal });
      process.exitCode = code;
      return;
    }

    logs.info('[NGROK] tunnel stopped', { code, signal });
  });

  const tunnel = await waitForTunnel({ apiUrl, targetUrl, port });
  if (!tunnel) {
    logs.error('[NGROK] public tunnel was not discovered', {
      apiUrl,
      hint: 'Check ngrok auth/token setup and confirm the ngrok agent is running.',
    });
  } else {
    const publicUrl = String(tunnel.public_url).replace(/\/+$/, '');
    logs.info('[NGROK] public tunnel ready', {
      publicUrl,
      whatsappWebhookUrl: `${publicUrl}/api/v1/whatsapp/webhook`,
      metaVerifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
      metaSignatureSecretConfigured: Boolean(process.env.WHATSAPP_APP_SECRET),
      localTarget: targetUrl,
    });
  }

  process.on('SIGINT', () => {
    logs.info('[NGROK] stopping tunnel');
    child.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    logs.info('[NGROK] stopping tunnel');
    child.kill('SIGTERM');
  });
}

run().catch(error => {
  logs.error('[NGROK] helper failed', { error: error.message });
  process.exitCode = 1;
});
