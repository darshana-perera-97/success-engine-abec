const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const {
  whatsappSessions,
  whatsappSessionRecoveryChains,
  WHATSAPP_CONNECTIONS_DIR,
  WHATSAPP_RECONNECT_INTERVAL_MS,
} = require("../config");
const { readUsers } = require("../models/users");
const { readStudemts } = require("../models/students");
const { readChats, writeChats } = require("../models/chats");
const { resolveChatFileDiskPath, resolveStudentDocDiskPath } = require("../models/students");
const { isCounselorRole } = require("./roles");
const { isSupportedWhatsappMediaMime, storeChatAttachmentDataUrl } = require("./uploads");
const { appendWhatsappIncoming } = require("../models/whatsappIncoming");
const { logEvent } = require("../lib/logger");

const AUTHENTICATED_STUCK_TIMEOUT_MS = 90 * 1000;

function sanitizeUserIdForPath(userId) {
  return String(userId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

function ensureWhatsappState(userId) {
  const key = String(userId || "").trim();
  const existing = whatsappSessions.get(key);
  if (existing) return existing;
  const created = {
    status: "disconnected",
    qrCodeDataUrl: "",
    error: "",
    connectedAt: "",
    whatsappName: "",
    whatsappNumber: "",
    whatsappProfilePicUrl: "",
    lastUpdatedAt: new Date().toISOString(),
    client: null,
  };
  whatsappSessions.set(key, created);
  return created;
}

function snapshotWhatsappState(userId) {
  const state = ensureWhatsappState(userId);
  if (state.status === "authenticated") {
    const lastUpdateMs = new Date(state.lastUpdatedAt || 0).getTime();
    const isStaleAuthenticated =
      Number.isFinite(lastUpdateMs) && Date.now() - lastUpdateMs > AUTHENTICATED_STUCK_TIMEOUT_MS;
    if (isStaleAuthenticated) {
      state.status = "error";
      state.error = "WhatsApp sign-in is taking too long. Please disconnect and connect again.";
      state.lastUpdatedAt = new Date().toISOString();
    }
  }
  return {
    userId: String(userId || "").trim(),
    status: state.status,
    qrCodeDataUrl: state.qrCodeDataUrl,
    error: state.error,
    connectedAt: state.connectedAt,
    whatsappName: state.whatsappName,
    whatsappNumber: state.whatsappNumber,
    whatsappProfilePicUrl: state.whatsappProfilePicUrl,
    lastUpdatedAt: state.lastUpdatedAt,
  };
}

async function startWhatsappSession(userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) throw new Error("Counselor user id is required.");
  const state = ensureWhatsappState(cleanUserId);
  if (
    state.client &&
    (state.status === "connecting" ||
      state.status === "awaiting_qr_scan" ||
      state.status === "authenticated" ||
      state.status === "connected")
  ) {
    return snapshotWhatsappState(cleanUserId);
  }
  if (state.client) {
    try {
      await state.client.destroy();
    } catch {
      // Ignore cleanup failure and allow creating a fresh session.
    }
  }
  await fs.mkdir(path.join(WHATSAPP_CONNECTIONS_DIR, sanitizeUserIdForPath(cleanUserId)), { recursive: true });
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: sanitizeUserIdForPath(cleanUserId),
      dataPath: path.join(WHATSAPP_CONNECTIONS_DIR, sanitizeUserIdForPath(cleanUserId)),
    }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });
  state.client = client;
  state.status = "connecting";
  state.qrCodeDataUrl = "";
  state.error = "";
  state.connectedAt = "";
  state.whatsappName = "";
  state.whatsappNumber = "";
  state.whatsappProfilePicUrl = "";
  state.lastUpdatedAt = new Date().toISOString();

  client.on("qr", async (qr) => {
    try {
      state.qrCodeDataUrl = await QRCode.toDataURL(qr);
      state.status = "awaiting_qr_scan";
      state.error = "";
      state.lastUpdatedAt = new Date().toISOString();
    } catch {
      state.error = "Failed to render WhatsApp QR code.";
      state.lastUpdatedAt = new Date().toISOString();
    }
  });

  client.on("authenticated", () => {
    state.status = "authenticated";
    state.error = "";
    state.lastUpdatedAt = new Date().toISOString();
  });

  client.on("ready", async () => {
    const info = client.info || {};
    const widSerialized =
      (info.wid && (info.wid._serialized || info.wid.user)) || "";
    const numberFromWid =
      (info.wid && info.wid.user) || String(widSerialized).split("@")[0] || "";
    let profilePicUrl = "";
    if (widSerialized) {
      try {
        profilePicUrl = String((await client.getProfilePicUrl(widSerialized)) || "");
      } catch {
        profilePicUrl = "";
      }
    }
    state.status = "connected";
    state.qrCodeDataUrl = "";
    state.error = "";
    state.connectedAt = new Date().toISOString();
    state.whatsappName = String(info.pushname || info.platform || "WhatsApp User");
    state.whatsappNumber = String(numberFromWid || "");
    state.whatsappProfilePicUrl = profilePicUrl;
    state.lastUpdatedAt = new Date().toISOString();
  });

  client.on("auth_failure", (message) => {
    state.status = "auth_failed";
    state.error = String(message || "WhatsApp authentication failed.");
    state.lastUpdatedAt = new Date().toISOString();
  });

  client.on("disconnected", () => {
    state.status = "disconnected";
    state.qrCodeDataUrl = "";
    state.connectedAt = "";
    state.lastUpdatedAt = new Date().toISOString();
  });

  const handleIncomingMessage = async (message) => {
    try {
      await persistIncomingWhatsappMessage({ counselorId: cleanUserId, message });
    } catch (error) {
      console.error("Failed to persist incoming WhatsApp message:", error);
    }
  };

  // "message" is enough for inbound messages; keeping both causes duplicate logs.
  client.on("message", handleIncomingMessage);

  client
    .initialize()
    .catch((error) => {
      state.status = "error";
      state.error = String(error?.message || "Failed to initialize WhatsApp client.");
      state.lastUpdatedAt = new Date().toISOString();
    });

  return snapshotWhatsappState(cleanUserId);
}

async function stopWhatsappSession(userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return snapshotWhatsappState(cleanUserId);
  const state = ensureWhatsappState(cleanUserId);
  if (state.client) {
    try {
      await state.client.destroy();
    } catch {
      // Ignore cleanup failure and clear in-memory state anyway.
    }
  }
  state.client = null;
  state.status = "disconnected";
  state.qrCodeDataUrl = "";
  state.error = "";
  state.connectedAt = "";
  state.whatsappName = "";
  state.whatsappNumber = "";
  state.whatsappProfilePicUrl = "";
  state.lastUpdatedAt = new Date().toISOString();
  const userConnectionDir = path.join(WHATSAPP_CONNECTIONS_DIR, sanitizeUserIdForPath(cleanUserId));
  try {
    const entries = await fs.readdir(userConnectionDir);
    await Promise.all(
      entries.map((entry) =>
        fs.rm(path.join(userConnectionDir, entry), {
          recursive: true,
          force: true,
        })
      )
    );
  } catch (error) {
    if (!(error && error.code === "ENOENT")) {
      throw error;
    }
  }
  return snapshotWhatsappState(cleanUserId);
}

async function userHasSavedWhatsappSession(userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return false;
  const userConnectionDir = path.join(WHATSAPP_CONNECTIONS_DIR, sanitizeUserIdForPath(cleanUserId));
  try {
    const entries = await fs.readdir(userConnectionDir);
    return entries.length > 0;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function initializeWhatsappSessionsOnStartup() {
  try {
    const users = await readUsers();
    const counselors = users.filter((user) => isCounselorRole(user.role));
    for (const counselor of counselors) {
      const counselorId = String(counselor.id || "").trim();
      if (!counselorId) continue;
      const hasSavedSession = await userHasSavedWhatsappSession(counselorId);
      if (!hasSavedSession) continue;
      await startWhatsappSession(counselorId);
    }
  } catch (error) {
    console.error("Failed to initialize WhatsApp sessions on startup:", error);
  }
}

async function reconnectActiveWhatsappSessions() {
  for (const [userId, state] of whatsappSessions.entries()) {
    const status = String(state?.status || "");
    if (status !== "connected" && status !== "authenticated" && status !== "awaiting_qr_scan" && status !== "connecting") {
      continue;
    }
    try {
      await startWhatsappSession(userId);
    } catch (error) {
      console.error(`Failed to reconnect WhatsApp session for ${userId}:`, error);
    }
  }
}

function isWhatsappPuppeteerStaleSessionError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("detached frame") ||
    msg.includes("execution context was destroyed") ||
    msg.includes("navigating frame was detached") ||
    msg.includes("target closed") ||
    msg.includes("session closed") ||
    (msg.includes("protocol error") && msg.includes("target"))
  );
}

async function waitForWhatsappSessionConnected(userId, timeoutMs = 120000) {
  const key = String(userId || "").trim();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = ensureWhatsappState(key);
    const ready =
      state.client && (state.status === "connected" || state.status === "authenticated");
    if (ready) return;
    const terminal = state.status === "error" || state.status === "auth_failed";
    if (terminal) {
      throw new Error(String(state.error || "WhatsApp session failed after recovery."));
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("WhatsApp did not finish reconnecting in time.");
}

async function restartWhatsappBrowserSession(userId) {
  const key = String(userId || "").trim();
  if (!key) throw new Error("Counselor user id is required.");
  const previous = whatsappSessionRecoveryChains.get(key) || Promise.resolve();
  const recovery = previous.then(async () => {
    const state = ensureWhatsappState(key);
    if (state.client) {
      try {
        await state.client.destroy();
      } catch {
        // Ignore; session object may already be unusable.
      }
      state.client = null;
    }
    state.status = "disconnected";
    state.error = "";
    await startWhatsappSession(key);
    await waitForWhatsappSessionConnected(key, 120000);
  });
  whatsappSessionRecoveryChains.set(key, recovery.catch(() => {}));
  await recovery;
}

function toWhatsAppChatId(phone) {
  const digitsOnly = String(phone || "").replace(/[^\d]/g, "");
  if (!digitsOnly) return "";
  return `${digitsOnly}@c.us`;
}

function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

function normalizeSriLankaStudentPhone(phone) {
  const digitsOnly = normalizePhoneDigits(phone);
  if (!digitsOnly) return "";

  let localMobileDigits = "";
  if (/^94[7]\d{8}$/.test(digitsOnly)) {
    localMobileDigits = digitsOnly.slice(2);
  } else if (/^0[7]\d{8}$/.test(digitsOnly)) {
    localMobileDigits = digitsOnly.slice(1);
  } else if (/^[7]\d{8}$/.test(digitsOnly)) {
    localMobileDigits = digitsOnly;
  } else {
    return "";
  }

  return `+94${localMobileDigits}`;
}

async function resolveWhatsappThreadIdFromMessage(message) {
  try {
    if (!message || typeof message.getContact !== "function") return "";
    const contact = await message.getContact();
    const serialized = String(contact?.id?._serialized || "").trim();
    return serialized;
  } catch {
    return "";
  }
}

async function findStudentByWhatsappFrom(chatId) {
  const rawFrom = String(chatId || "");
  const numberPart = rawFrom.split("@")[0] || "";
  const incomingDigits = normalizePhoneDigits(numberPart);
  if (!incomingDigits) return null;
  const students = await readStudemts();
  return (
    students.find((student) => {
      const studentDigits = normalizePhoneDigits(student.phone || "");
      if (!studentDigits) return false;
      return incomingDigits.endsWith(studentDigits) || studentDigits.endsWith(incomingDigits);
    }) || null
  );
}

async function persistIncomingWhatsappMessage({ counselorId, message }) {
  const incomingId =
    String(message?.id?._serialized || "").trim() ||
    (() => {
      const from = String(message?.from || "").trim();
      const timestamp = String(message?.timestamp || "").trim();
      const body = String(message?.body || "").trim();
      if (!from || !timestamp) return "";
      return `fallback:${from}:${timestamp}:${body.slice(0, 50)}`;
    })();
  if (!incomingId) return;
  if (!message || message.fromMe === true) return;
  const from = String(message.from || "");
  const resolvedThreadId = await resolveWhatsappThreadIdFromMessage(message);
  const fromChatId = resolvedThreadId || from;
  if (!from || from.includes("@g.us") || from === "status@broadcast") return;
  const numberPart = fromChatId.split("@")[0] || "";
  const incomingContactNumber = normalizePhoneDigits(numberPart);
  const student = await findStudentByWhatsappFrom(fromChatId);
  const content = String(message.body || "").trim();
  let attachment = null;
  if (message?.hasMedia === true && typeof message.downloadMedia === "function") {
    try {
      const media = await message.downloadMedia();
      const mime = String(media?.mimetype || "").toLowerCase();
      if (media?.data && isSupportedWhatsappMediaMime(mime)) {
        const stored = await storeChatAttachmentDataUrl(
          `data:${mime};base64,${media.data}`,
          String(media?.filename || "whatsapp-media")
        );
        if (stored && !stored.error) {
          attachment = {
            name: stored.name,
            mime: stored.mime,
            size: stored.size,
            url: stored.url,
          };
        }
      }
    } catch {
      attachment = null;
    }
  }
  const normalizedContent =
    content || (attachment ? `Sent an attachment (${attachment.name || "file"}).` : "");
  if (!normalizedContent && !attachment) return;
  await appendWhatsappIncoming({
    id: `WAIN-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    counselorId: String(counselorId || ""),
    from: fromChatId,
    contactNumber: incomingContactNumber || numberPart || "",
    message: normalizedContent,
    timestamp: message.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : new Date().toISOString(),
    isGroup: false,
    mappedStudentId: String(student?.id || ""),
  });
  if (!student || !student.id) return;
  const chats = await readChats();
  if (chats.some((chat) => String(chat.whatsappMessageId || "") === incomingId)) {
    return;
  }
  const chat = {
    id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
    senderId: String(student.id),
    receiverId: String(counselorId),
    content: normalizedContent,
    timestamp: message.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : new Date().toISOString(),
    read: false,
    platform: "whatsapp",
    attachment,
    whatsappMessageId: incomingId,
    whatsappDelivery: {
      attempted: true,
      status: "received",
      channel: "whatsapp",
      chatId: fromChatId,
    },
  };
  await writeChats([...chats, chat]);
}

async function deliverCounselorMessageToStudentWhatsapp({ senderId, receiverId, content, attachment = null }) {
  const sender = await resolveCounselor(senderId);
  if (!sender) {
    return { attempted: false, status: "skipped", reason: "Sender is not a counselor account." };
  }
  const studentId = String(receiverId || "").trim();
  if (!studentId) {
    return { attempted: false, status: "skipped", reason: "Student receiver id is missing." };
  }
  const students = await readStudemts();
  const student = students.find((item) => String(item.id || "") === studentId);
  if (!student) {
    return { attempted: false, status: "skipped", reason: "Student record not found." };
  }
  const phone = String(student.phone || "").trim();
  const chatId = toWhatsAppChatId(phone);
  if (!chatId) {
    return { attempted: false, status: "skipped", reason: "Student phone number is missing." };
  }
  const messageText = String(content || "").trim();
  const outgoingAttachment = attachment && typeof attachment === "object" ? attachment : null;
  let preparedMedia = null;
  let preparedMediaMime = "";
  if (outgoingAttachment && outgoingAttachment.url) {
    preparedMediaMime = String(outgoingAttachment.mime || "").toLowerCase();
    if (!isSupportedWhatsappMediaMime(preparedMediaMime)) {
      return {
        attempted: false,
        status: "skipped",
        reason: "Only PDF and image attachments can be sent via WhatsApp.",
      };
    }
    const mediaPath =
      resolveChatFileDiskPath(String(outgoingAttachment.url || "")) ||
      resolveStudentDocDiskPath(String(outgoingAttachment.url || ""));
    if (!mediaPath) {
      return {
        attempted: false,
        status: "skipped",
        reason: "Attachment file path is invalid.",
      };
    }
    preparedMedia = MessageMedia.fromFilePath(mediaPath);
  } else if (!messageText) {
    return {
      attempted: false,
      status: "skipped",
      reason: "Message text or attachment is required.",
    };
  }

  const senderState = ensureWhatsappState(sender.id);
  if (!senderState.client || (senderState.status !== "connected" && senderState.status !== "authenticated")) {
    return { attempted: true, status: "failed", reason: "Counselor WhatsApp is not connected." };
  }

  const performSend = async () => {
    const live = ensureWhatsappState(sender.id);
    if (!live.client || (live.status !== "connected" && live.status !== "authenticated")) {
      throw new Error("Counselor WhatsApp is not connected.");
    }
    if (preparedMedia) {
      await live.client.sendMessage(chatId, preparedMedia, messageText ? { caption: messageText } : {});
    } else {
      await live.client.sendMessage(chatId, messageText);
    }
  };

  const logSent = () => {
    if (preparedMedia) {
      logEvent("whatsapp", "media message sent", { from: sender.id, to: receiverId, chatId, mime: preparedMediaMime });
    } else {
      logEvent("whatsapp", "message sent", { from: sender.id, to: receiverId, chatId });
    }
  };

  try {
    await performSend();
    logSent();
    return { attempted: true, status: "sent", channel: "whatsapp", chatId };
  } catch (error) {
    if (isWhatsappPuppeteerStaleSessionError(error)) {
      logEvent("whatsapp", "stale session detected; restarting client", {
        from: sender.id,
        to: receiverId,
        reason: String(error?.message || ""),
      });
      try {
        await restartWhatsappBrowserSession(sender.id);
        await performSend();
        logSent();
        return { attempted: true, status: "sent", channel: "whatsapp", chatId };
      } catch (errorAfter) {
        logEvent("whatsapp", "message send failed", {
          from: sender.id,
          to: receiverId,
          reason: String(errorAfter?.message || ""),
        });
        return {
          attempted: true,
          status: "failed",
          reason: String(errorAfter?.message || "Failed to send message via WhatsApp."),
        };
      }
    }
    logEvent("whatsapp", "message send failed", { from: sender.id, to: receiverId, reason: String(error?.message || "") });
    return {
      attempted: true,
      status: "failed",
      reason: String(error?.message || "Failed to send message via WhatsApp."),
    };
  }
}

async function resolveCounselor(userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const users = await readUsers();
  const matched = users.find((user) => String(user.id || "") === id);
  if (!matched) return null;
  if (!isCounselorRole(matched.role)) return null;
  return matched;
}

module.exports = {
  sanitizeUserIdForPath,
  ensureWhatsappState,
  snapshotWhatsappState,
  startWhatsappSession,
  stopWhatsappSession,
  userHasSavedWhatsappSession,
  initializeWhatsappSessionsOnStartup,
  reconnectActiveWhatsappSessions,
  isWhatsappPuppeteerStaleSessionError,
  waitForWhatsappSessionConnected,
  restartWhatsappBrowserSession,
  toWhatsAppChatId,
  normalizePhoneDigits,
  normalizeSriLankaStudentPhone,
  resolveWhatsappThreadIdFromMessage,
  findStudentByWhatsappFrom,
  persistIncomingWhatsappMessage,
  deliverCounselorMessageToStudentWhatsapp,
  resolveCounselor,
};
