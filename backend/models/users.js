const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { USERS_FILE, ADMIN_EMAIL } = require("../config");

async function readUsers() {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = safeJsonParse(raw, USERS_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeUsers(users) {
  return withFileLock(USERS_FILE, () =>
    atomicWriteFile(USERS_FILE, JSON.stringify(users, null, 2))
  );
}

function stripUserSecrets(user) {
  if (!user || typeof user !== "object") return user;
  const { password, ...rest } = user;
  return rest;
}

function sanitizeAccount(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone || "",
    role: user.role,
    branch: user.branch,
    country: user.country || "",
    teamLeadId: user.teamLeadId,
    teamLeadName: user.teamLeadName,
    teamLeadEmail: user.teamLeadEmail,
    avatar: user.avatar,
  };
}

async function findResettableUserByEmail(email) {
  const { normalizeEmail } = require("../services/roles");
  const { readStudemts } = require("./students");
  const normalized = normalizeEmail(email);
  if (!normalized || normalized === ADMIN_EMAIL) return null;
  const users = await readUsers();
  const userIndex = users.findIndex((u) => normalizeEmail(u.email) === normalized);
  if (userIndex !== -1) return { kind: "user", list: users, index: userIndex };
  const students = await readStudemts();
  const studentIndex = students.findIndex((s) => normalizeEmail(s.email) === normalized);
  if (studentIndex !== -1) return { kind: "student", list: students, index: studentIndex };
  return null;
}

function splitAdminRecord(users) {
  const adminIndex = users.findIndex(
    (u) => (u.id === "ADM001" || String(u.email || "").toLowerCase() === ADMIN_EMAIL) && u.role === "Admin"
  );
  if (adminIndex === -1) {
    return { adminRecord: null, others: users };
  }
  return {
    adminRecord: users[adminIndex],
    others: users.filter((_, idx) => idx !== adminIndex),
  };
}

async function readSafe(reader, fallback) {
  try {
    const value = await reader();
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

module.exports = {
  readUsers,
  writeUsers,
  stripUserSecrets,
  sanitizeAccount,
  findResettableUserByEmail,
  splitAdminRecord,
  readSafe,
};
