const channels = new Map();

function serialize(payload) {
  return `id: ${payload.id}\nevent: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`;
}

function getBucket(key) {
  if (!channels.has(key)) channels.set(key, new Map());
  return channels.get(key);
}

function buildKeys({ userId, homeId, deviceId, callId }) {
  const keys = [];
  if (userId) keys.push(`user:${String(userId)}`);
  if (homeId) keys.push(`home:${String(homeId)}`);
  if (deviceId) keys.push(`device:${String(deviceId)}`);
  if (callId) keys.push(`call:${String(callId)}`);
  return keys;
}

function registerSseClient({ req, res, userId, homeId, deviceId, callId, meta = {} }) {
  const keys = buildKeys({ userId, homeId, deviceId, callId });
  const clientId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const write = (event, data) => {
    const payload = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      event,
      data,
    };
    res.write(serialize(payload));
  };

  for (const key of keys) {
    const bucket = getBucket(key);
    bucket.set(clientId, { write, meta, connectedAt: new Date() });
  }

  write('connected', {
    clientId,
    channels: keys,
    serverTime: new Date().toISOString(),
  });

  const keepAlive = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    for (const key of keys) {
      const bucket = channels.get(key);
      if (!bucket) continue;
      bucket.delete(clientId);
      if (!bucket.size) channels.delete(key);
    }
  });
}

function publish(keys, event, data) {
  const seen = new Set();
  for (const key of keys.filter(Boolean)) {
    const bucket = channels.get(key);
    if (!bucket) continue;
    for (const [clientId, client] of bucket.entries()) {
      if (seen.has(clientId)) continue;
      seen.add(clientId);
      client.write(event, data);
    }
  }
}

function publishToUser(userId, event, data) {
  publish([`user:${String(userId)}`], event, data);
}

function publishToHome(homeId, event, data) {
  publish([`home:${String(homeId)}`], event, data);
}

function publishToDevice(deviceId, event, data) {
  publish([`device:${String(deviceId)}`], event, data);
}

function publishToCall(callId, event, data) {
  publish([`call:${String(callId)}`], event, data);
}

function publishMany({ userId, homeId, deviceId, callId }, event, data) {
  publish(buildKeys({ userId, homeId, deviceId, callId }), event, data);
}

module.exports = {
  registerSseClient,
  publish,
  publishToUser,
  publishToHome,
  publishToDevice,
  publishToCall,
  publishMany,
};
