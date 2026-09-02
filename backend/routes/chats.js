const crypto = require("crypto");
const { parseBody, sendJson } = require("../lib/httpUtils");
const { readChats, appendUniqueChats, updateChats, normalizeReplyTo } = require("../models/chats");
const { readStudemts, publicChatFileUrl } = require("../models/students");
const { deliverCounselorMessageToStudentWhatsapp, resolveCounselor, syncWhatsappIncomingToChats, isWhatsappGroupChatRecord } = require("../services/whatsapp");
const { deliverStudentNotificationWhatsapp } = require("../services/notifications");
const { storeChatAttachmentDataUrl } = require("../services/uploads");

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

function isTruthyQueryParam(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

let incomingSyncInFlight = null;
function scheduleWhatsappIncomingSync() {
  if (incomingSyncInFlight) return incomingSyncInFlight;
  incomingSyncInFlight = Promise.resolve()
    .then(() => syncWhatsappIncomingToChats())
    .catch(() => 0)
    .finally(() => {
      incomingSyncInFlight = null;
    });
  return incomingSyncInFlight;
}

function withPublicAttachmentUrl(req, chat) {
  if (!chat || !chat.attachment || !chat.attachment.url) return chat;
  return {
    ...chat,
    attachment: {
      ...chat.attachment,
      url: publicChatFileUrl(req, chat.attachment.url),
    },
  };
}

function messageTimestampMs(chat) {
  const ms = new Date(chat?.timestamp || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function resolveInboxPeerId(chat, { userId, studentIds, staffView }) {
  const sid = String(chat?.senderId || "").trim();
  const rid = String(chat?.receiverId || "").trim();
  if (staffView) {
    if (sid && studentIds.has(sid)) return sid;
    if (rid && studentIds.has(rid)) return rid;
    return "";
  }
  const uid = String(userId || "").trim();
  if (!uid) return "";
  if (sid === uid) return rid;
  if (rid === uid) return sid;
  return "";
}

function isInboxUnread(chat, { userId, peerId, staffView }) {
  if (!chat || chat.read === true) return false;
  const sid = String(chat.senderId || "").trim();
  const rid = String(chat.receiverId || "").trim();
  const uid = String(userId || "").trim();
  if (uid) return rid === uid;
  return staffView && sid === peerId && rid !== peerId;
}

function buildInboxSummaries(chats, { userId, studentIds, staffView }) {
  const byPeer = new Map();
  for (const chat of chats || []) {
    const peerId = resolveInboxPeerId(chat, { userId, studentIds, staffView });
    if (!peerId) continue;
    let entry = byPeer.get(peerId);
    if (!entry) {
      entry = { peerId, unreadCount: 0, lastMessage: chat };
      byPeer.set(peerId, entry);
    }
    if (messageTimestampMs(chat) >= messageTimestampMs(entry.lastMessage)) {
      entry.lastMessage = chat;
    }
    if (isInboxUnread(chat, { userId, peerId, staffView })) {
      entry.unreadCount += 1;
    }
  }
  return Array.from(byPeer.values()).sort(
    (a, b) => messageTimestampMs(b.lastMessage) - messageTimestampMs(a.lastMessage)
  );
}

function filterThreadChats(chats, { userId, peerId, counselor }) {
  const normalizedPeerId = normalizeId(peerId);
  if (!normalizedPeerId) return chats;
  const staffView = Boolean(counselor) || !userId;
  const normalizedUserId = normalizeId(userId);
  return chats.filter((chat) => {
    const sid = normalizeId(chat.senderId);
    const rid = normalizeId(chat.receiverId);
    if (staffView) return sid === normalizedPeerId || rid === normalizedPeerId;
    return (
      (sid === normalizedUserId && rid === normalizedPeerId) ||
      (sid === normalizedPeerId && rid === normalizedUserId)
    );
  });
}

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/chats") {
    try {
      // Return already-synced chats immediately; merge newly received WhatsApp rows in the background.
      scheduleWhatsappIncomingSync();
      const userId = String(url.searchParams.get("userId") || "").trim();
      const peerId = String(url.searchParams.get("peerId") || "").trim();
      const normalizedUserId = normalizeId(userId);
      const normalizedPeerId = normalizeId(peerId);
      const shouldMarkRead = url.searchParams.get("markRead") !== "0";
      const wantSummary = isTruthyQueryParam(url.searchParams.get("summary"));
      const wantThread = isTruthyQueryParam(url.searchParams.get("thread"));
      let chatsAllNext = await readChats();
      if (userId && shouldMarkRead) {
        // Mark messages as read when the receiver opens a conversation.
        // If peerId is set, only mark unread messages from that peer (per-thread).
        chatsAllNext = await updateChats((chatsAll) => {
          let hasReadUpdates = false;
          const next = chatsAll.map((chat) => {
            if (normalizeId(chat.receiverId) !== normalizedUserId || chat.read === true) {
              return chat;
            }
            if (normalizedPeerId && normalizeId(chat.senderId) !== normalizedPeerId) {
              return chat;
            }
            hasReadUpdates = true;
            return { ...chat, read: true, readAt: new Date().toISOString() };
          });
          return hasReadUpdates ? next : chatsAll;
        });
      }
      let chatsForResponse = chatsAllNext.filter((chat) => !isWhatsappGroupChatRecord(chat));
      const counselor = userId ? await resolveCounselor(userId) : null;
      const staffView = Boolean(counselor) || !userId;
      let students = null;
      const loadStudents = async () => {
        if (!students) students = await readStudemts();
        return students || [];
      };
      let visibleStudentIds = null;
      if (userId && counselor) {
        // Counselors can see the full conversation thread for any student they have handled
        // (current counselor, inquiry counselor, or counselor history), even if they were not
        // the sender/receiver for older messages.
        const roster = await loadStudents();
        visibleStudentIds = new Set(
          roster
            .filter((s) => {
              const c = normalizeId(s.counselor);
              const inquiry = normalizeId(s.inquiryCounselorId);
              const history = Array.isArray(s.counselorHistory) ? s.counselorHistory : [];
              return (
                c === normalizedUserId ||
                inquiry === normalizedUserId ||
                history.some((id) => normalizeId(id) === normalizedUserId)
              );
            })
            .map((s) => String(s.id || "").trim())
            .filter(Boolean)
        );
        chatsForResponse = chatsForResponse.filter((chat) => {
          const sid = String(chat.senderId || "").trim();
          const rid = String(chat.receiverId || "").trim();
          return (
            normalizeId(sid) === normalizedUserId ||
            normalizeId(rid) === normalizedUserId ||
            visibleStudentIds.has(sid) ||
            visibleStudentIds.has(rid)
          );
        });
      } else if (userId && !counselor) {
        chatsForResponse = chatsForResponse.filter(
          (chat) =>
            normalizeId(chat.senderId) === normalizedUserId || normalizeId(chat.receiverId) === normalizedUserId
        );
      }
      if (wantThread && peerId) {
        chatsForResponse = filterThreadChats(chatsForResponse, { userId, peerId, counselor });
      }
      const withPublicUrls = chatsForResponse.map((chat) => withPublicAttachmentUrl(req, chat));
      if (wantSummary) {
        let studentIds = visibleStudentIds;
        if (staffView && !studentIds) {
          studentIds = new Set(
            (await loadStudents()).map((s) => String(s.id || "").trim()).filter(Boolean)
          );
        }
        sendJson(res, 200, {
          ok: true,
          data: buildInboxSummaries(withPublicUrls, {
            userId,
            studentIds: studentIds || new Set(),
            staffView,
          }),
        });
        return true;
      }
      sendJson(res, 200, { ok: true, data: withPublicUrls });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load chats." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/chats") {
    try {
      const body = await parseBody(req);
      const senderId = String(body.senderId || "").trim();
      const receiverId = String(body.receiverId || "").trim();
      const content = String(body.content || "").trim();
      const platform = String(body.platform || "portal").trim();
      const incomingAttachment =
        body.attachment && typeof body.attachment === "object" ? body.attachment : null;
      const replyTo = normalizeReplyTo(body.replyTo);
      let attachment = null;
      if (incomingAttachment && incomingAttachment.dataUrl) {
        const stored = await storeChatAttachmentDataUrl(
          String(incomingAttachment.dataUrl || ""),
          String(incomingAttachment.name || "attachment")
        );
        if (!stored) {
          sendJson(res, 400, {
            ok: false,
            error: "Unsupported file type for chat attachment. Use PDF, Word (.doc, .docx), Excel (.xls, .xlsx), TXT, or an image.",
          });
          return true;
        }
        if (stored.error) {
          sendJson(res, 400, { ok: false, error: stored.error });
          return true;
        }
        attachment = {
          name: stored.name,
          mime: stored.mime,
          size: stored.size,
          url: stored.url,
        };
      }
      if (!senderId || !receiverId || (!content && !attachment)) {
        sendJson(res, 400, { ok: false, error: "senderId, receiverId and message content or attachment are required." });
        return true;
      }
      let whatsappDelivery = null;
      if (content || attachment) {
        const students = await readStudemts();
        const receiverStudent = students.find((item) => String(item.id || "") === receiverId);
        const senderStudent = students.find((item) => String(item.id || "") === senderId);
        if (receiverStudent) {
          whatsappDelivery = await deliverStudentNotificationWhatsapp({
            student: receiverStudent,
            studentId: receiverId,
            content,
            attachment,
            preferredSenderIds: [senderId],
            persistToChat: false,
            replyTo,
          });
        } else if (senderStudent) {
          whatsappDelivery = {
            attempted: false,
            status: "skipped",
            reason: "Student portal message; stored in conversation history.",
          };
        } else {
          whatsappDelivery = await deliverCounselorMessageToStudentWhatsapp({
            senderId,
            receiverId,
            content,
            attachment,
            persistToChat: false,
            replyTo,
          });
        }
      }
      const sentWhatsappMessageId = String(whatsappDelivery?.whatsappMessageId || "").trim();
      const chat = {
        id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
        senderId,
        receiverId,
        content,
        timestamp: new Date().toISOString(),
        read: false,
        platform: platform || "portal",
        attachment,
        ...(replyTo ? { replyTo } : {}),
        ...(sentWhatsappMessageId ? { whatsappMessageId: sentWhatsappMessageId } : {}),
        whatsappDelivery,
      };
      await appendUniqueChats([chat]);
      sendJson(res, 201, {
        ok: true,
        data: {
          ...chat,
          attachment: chat.attachment
            ? { ...chat.attachment, url: publicChatFileUrl(req, chat.attachment.url) }
            : null,
        },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
