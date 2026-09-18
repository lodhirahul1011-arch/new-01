function safeLog(scope, message, extra) {
  const ts = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[${ts}] ${scope} ${message}`);
    return;
  }
  console.log(`[${ts}] ${scope} ${message}`, extra);
}

const logs = {
  info: (message, extra) => safeLog('[INFO]', message, extra),
  error: (message, extra) => safeLog('[ERROR]', message, extra),
};

module.exports = { safeLog, logs };
