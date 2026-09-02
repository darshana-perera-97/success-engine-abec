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

function collectChatDedupKeys(chat) {
  const keys = [];
  const waId = String(chat?.whatsappMessageId || "").trim();
  const incomingId = String(chat?.whatsappIncomingId || "").trim();
  if (waId) keys.push(`wa:${waId}`);
  if (incomingId) {
    keys.push(`incoming:${incomingId}`);
    keys.push(`wa:incoming-row:${incomingId}`);
  }
  return keys;
}

async function appendUniqueChats(rows) {
  const incoming = (Array.isArray(rows) ? rows : []).filter(Boolean);
  if (!incoming.length) return 0;
  return withFileLock(CHATS_FILE, async () => {
    let chats = [];
    try {
      chats = await readJsonCached(CHATS_FILE, (parsed) => (Array.isArray(parsed) ? parsed : []));
    } catch (error) {
      if (!(error && error.code === "ENOENT")) throw error;
    }
    const existingKeys = new Set();
    for (const chat of chats) {
      for (const key of collectChatDedupKeys(chat)) existingKeys.add(key);
    }
    const toAdd = [];
    for (const row of incoming) {
      const keys = collectChatDedupKeys(row);
      if (keys.some((key) => existingKeys.has(key))) continue;
      toAdd.push(row);
      keys.forEach((key) => existingKeys.add(key));
    }
    if (!toAdd.length) return 0;
    await atomicWriteFile(CHATS_FILE, JSON.stringify([...chats, ...toAdd], null, 2));
    return toAdd.length;
  });
}

async function updateChats(mutator) {
  return withFileLock(CHATS_FILE, async () => {
    let chats = [];
    try {
      chats = await readJsonCached(CHATS_FILE, (parsed) => (Array.isArray(parsed) ? parsed : []));
    } catch (error) {
      if (!(error && error.code === "ENOENT")) throw error;
    }
    const next = typeof mutator === "function" ? mutator(chats) : chats;
    if (!Array.isArray(next) || next === chats) return chats;
    await atomicWriteFile(CHATS_FILE, JSON.stringify(next, null, 2));
    return next;
  });
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
  await appendUniqueChats([chat]);
  return chat;
}

module.exports = {
  readChats,
  writeChats,
  appendUniqueChats,
  updateChats,
  appendPortalChatMessage,
  normalizeReplyTo,
};
