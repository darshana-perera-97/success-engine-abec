const fs = require("fs/promises");
const crypto = require("crypto");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { readJsonCached } = require("../lib/jsonCache");
const { CHATS_FILE } = require("../config");

async function readChats() {
  try {
    return await readJsonCached(CHATS_FILE, (parsed) => (Array.isArray(parsed) ? parsed : []));
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeChats(chats) {
  return withFileLock(CHATS_FILE, () =>
    atomicWriteFile(CHATS_FILE, JSON.stringify(chats, null, 2))
  );
}

async function appendPortalChatMessage({ senderId, receiverId, content, platform = "portal" }) {
  const from = String(senderId || "").trim();
  const to = String(receiverId || "").trim();
  const text = String(content || "").trim();
  if (!from || !to || !text) return null;
  const chats = await readChats();
  const chat = {
    id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
    senderId: from,
    receiverId: to,
    content: text,
    timestamp: new Date().toISOString(),
    read: false,
    platform: platform || "portal",
    attachment: null,
  };
  await writeChats([...chats, chat]);
  return chat;
}

module.exports = {
  readChats,
  writeChats,
  appendPortalChatMessage,
};
