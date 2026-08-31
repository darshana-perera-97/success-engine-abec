const fs = require("fs/promises");
const crypto = require("crypto");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { LOGIN_LOGS_FILE } = require("../config");

const MAX_LOGIN_LOGS = 2000;

async function readLoginLogs() {
  try {
    const raw = await fs.readFile(LOGIN_LOGS_FILE, "utf8");
    const parsed = safeJsonParse(raw, LOGIN_LOGS_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function appendLoginLog({ userId, username, email, role }) {
  const entry = {
    id: `LOGIN-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    userId: String(userId || "").trim(),
    username: String(username || "").trim(),
    email: String(email || "").trim(),
    role: String(role || "").trim(),
    loggedInAt: new Date().toISOString(),
  };
  return withFileLock(LOGIN_LOGS_FILE, async () => {
    const list = await readLoginLogs();
    list.push(entry);
    const trimmed = list.length > MAX_LOGIN_LOGS ? list.slice(list.length - MAX_LOGIN_LOGS) : list;
    await atomicWriteFile(LOGIN_LOGS_FILE, JSON.stringify(trimmed, null, 2));
    return entry;
  });
}

module.exports = {
  readLoginLogs,
  appendLoginLog,
};
