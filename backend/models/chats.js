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

async function appendPortalChatMessage({
  senderId,
  receiverId,
  content,
  platform = "portal",
  attachment = null,
  whatsappDelivery = null,
}) {
  const from = String(senderId || "").trim();
  const to = String(receiverId || "").trim();
  const text = String(content || "").trim();
  const chatAttachment =
    attachment && typeof attachment === "object" && String(attachment.url || "").trim()
      ? {
          name: String(attachment.name || "attachment").trim(),
          mime: String(attachment.mime || "").trim(),
          size: attachment.size,
          url: String(attachment.url || "").trim(),
        }
      : null;
  if (!from || !to || (!text && !chatAttachment)) return null;
  const chats = await readChats();
  const chat = {
    id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
    senderId: from,
    receiverId: to,
    content: text || (chatAttachment ? `Sent an attachment (${chatAttachment.name || "file"}).` : ""),
    timestamp: new Date().toISOString(),
    read: false,
    platform: platform || "portal",
    attachment: chatAttachment,
    ...(whatsappDelivery ? { whatsappDelivery } : {}),
  };
  await writeChats([...chats, chat]);
  return chat;
}

module.exports = {
  readChats,
  writeChats,
  appendPortalChatMessage,
};
