const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { ADMIN_CHATS_FILE, ADMIN_EMAIL, ADMIN_AI_CHAT_MAX_MESSAGES, ADMIN_AI_CHAT_MAX_CONTENT } = require("../config");

async function readAdminChatsStore() {
  try {
    const raw = await fs.readFile(ADMIN_CHATS_FILE, "utf8");
    const parsed = safeJsonParse(raw, ADMIN_CHATS_FILE);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error && error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeAdminChatsStore(store) {
  return withFileLock(ADMIN_CHATS_FILE, () =>
    atomicWriteFile(ADMIN_CHATS_FILE, JSON.stringify(store, null, 2))
  );
}

function sanitizeAdminAiMessagesForStore(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const role = item.role === "user" || item.role === "assistant" ? item.role : null;
    const id = String(item.id || "").trim().slice(0, 120);
    let content = typeof item.content === "string" ? item.content : "";
    content = content.slice(0, ADMIN_AI_CHAT_MAX_CONTENT);
    if (!role || !id || !content.trim()) continue;
    out.push({ id, role, content });
    if (out.length >= ADMIN_AI_CHAT_MAX_MESSAGES) break;
  }
  return out;
}

async function isAuthorizedAdminChatEmail(emailRaw) {
  const { normalizeEmail } = require("../services/roles");
  const { readUsers } = require("./users");
  const email = normalizeEmail(emailRaw);
  if (!email) return false;
  if (ADMIN_EMAIL && email === ADMIN_EMAIL) return true;
  const users = await readUsers();
  return users.some((u) => normalizeEmail(u.email) === email && String(u.role || "").trim() === "Admin");
}

module.exports = {
  readAdminChatsStore,
  writeAdminChatsStore,
  sanitizeAdminAiMessagesForStore,
  isAuthorizedAdminChatEmail,
};
