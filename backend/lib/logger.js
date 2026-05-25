function logEvent(scope, message, meta = null) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${scope}] ${message}`;
  if (!meta) {
    console.log(base);
    return;
  }
  try {
    console.log(base, JSON.stringify(meta));
  } catch {
    console.log(base, meta);
  }
}

module.exports = { logEvent };
