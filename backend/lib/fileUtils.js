const fs = require("fs/promises");
const path = require("path");

const fileMutexes = new Map();

function withFileLock(filePath, operation) {
  if (!fileMutexes.has(filePath)) {
    fileMutexes.set(filePath, Promise.resolve());
  }
  const prev = fileMutexes.get(filePath);
  const next = prev.then(() => operation(), () => operation());
  fileMutexes.set(filePath, next.catch(() => {}));
  return next;
}

async function atomicWriteFile(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, data, "utf8");
  await fs.rename(tempFile, filePath);
}

function safeJsonParse(raw, filePath) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`[WARN] ${path.basename(filePath)} contains invalid JSON – treating as empty.`, error.message);
    return null;
  }
}

function parseJsonArray(parsed, arrayKeys = ["data", "invoices", "items"]) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of arrayKeys) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
  }
  return [];
}

module.exports = {
  fileMutexes,
  withFileLock,
  atomicWriteFile,
  safeJsonParse,
  parseJsonArray,
};
