#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const { logs } = require('../src/utils/logger');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function readArg(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();

  const index = process.argv.findIndex(arg => arg === `--${name}`);
  if (index >= 0) return String(process.argv[index + 1] || '').trim();

  return '';
}

async function readGraphJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Meta Graph request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.meta = data?.error || data;
    throw error;
  }
  return data;
}

async function run() {
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const apiVersion = String(process.env.WHATSAPP_GRAPH_API_VERSION || 'v26.0').replace(/^\/?/, '');
  const wabaId =
    readArg('waba-id') ||
    process.env.WHATSAPP_WABA_ID ||
    process.env.npm_config_waba_id ||
    '';

  if (!accessToken) {
    logs.error('[WHATSAPP_WEBHOOK_SUBSCRIBE] access token missing');
    process.exitCode = 1;
    return;
  }

  if (!wabaId) {
    logs.error('[WHATSAPP_WEBHOOK_SUBSCRIBE] WABA id missing', {
      hint: 'Pass --waba-id=<WhatsApp Business Account ID> or set WHATSAPP_WABA_ID in .env.',
    });
    process.exitCode = 1;
    return;
  }

  const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(wabaId)}/subscribed_apps`;
  logs.info('[WHATSAPP_WEBHOOK_SUBSCRIBE] subscribing app to WABA', {
    wabaId,
    apiVersion,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await readGraphJson(response);
  logs.info('[WHATSAPP_WEBHOOK_SUBSCRIBE] WABA subscription request completed', {
    wabaId,
    success: Boolean(data.success),
  });

  const verifyResponse = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const verifyData = await readGraphJson(verifyResponse);
  logs.info('[WHATSAPP_WEBHOOK_SUBSCRIBE] current subscribed apps fetched', {
    wabaId,
    count: Array.isArray(verifyData.data) ? verifyData.data.length : 0,
  });
}

run().catch(error => {
  logs.error('[WHATSAPP_WEBHOOK_SUBSCRIBE] failed', {
    status: error.status || null,
    error: error.message,
    code: error.meta?.code || null,
  });
  process.exitCode = 1;
});
