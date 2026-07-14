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

function normalizeReplyTo(replyTo) {
  if (!replyTo || typeof replyTo !== "object") return null;
  const id = String(replyTo.id || "").trim();
  if (!id) return null;
  const content = String(replyTo.content || "").trim();
  const attachmentName = String(replyTo.attachmentName || replyTo.attachment?.name || "").trim();
  return {
    id,
    senderId: String(replyTo.senderId || "").trim(),
    content: content.slice(0, 280),
    ...(attachmentName ? { attachmentName } : {}),
  };
}

async function appendPortalChatMessage({
  senderId,
  receiverId,
  content,
  platform = "portal",
  attachment = null,
  whatsappDelivery = null,
  replyTo = null,
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
  const normalizedReplyTo = normalizeReplyTo(replyTo);
  const chat = {
    id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
    senderId: from,
    receiverId: to,
    content: text || (chatAttachment ? `Sent an attachment (${chatAttachment.name || "file"}).` : ""),
    timestamp: new Date().toISOString(),
    read: false,
    platform: platform || "portal",
    attachment: chatAttachment,
    ...(normalizedReplyTo ? { replyTo: normalizedReplyTo } : {}),
    ...(whatsappDelivery ? { whatsappDelivery } : {}),
  };
  await writeChats([...chats, chat]);
  return chat;
}

module.exports = {
  readChats,
  writeChats,
  appendPortalChatMessage,
  normalizeReplyTo,
};
