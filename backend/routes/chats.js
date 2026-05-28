const crypto = require("crypto");
const { parseBody, sendJson } = require("../lib/httpUtils");
const { readChats, writeChats } = require("../models/chats");
const { readStudemts, publicChatFileUrl } = require("../models/students");
const { deliverCounselorMessageToStudentWhatsapp, resolveCounselor } = require("../services/whatsapp");
const { storeChatAttachmentDataUrl } = require("../services/uploads");

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/chats") {
    try {
      const userId = String(url.searchParams.get("userId") || "").trim();
      const normalizedUserId = normalizeId(userId);
      const shouldMarkRead = url.searchParams.get("markRead") !== "0";
      const chatsAll = await readChats();
      let chatsAllNext = chatsAll;
      if (userId && shouldMarkRead) {
        // Mark messages as read when the receiver opens their chat inbox.
        let hasReadUpdates = false;
        chatsAllNext = chatsAll.map((chat) => {
          if (normalizeId(chat.receiverId) === normalizedUserId && chat.read !== true) {
            hasReadUpdates = true;
            return { ...chat, read: true, readAt: new Date().toISOString() };
          }
          return chat;
        });
        if (hasReadUpdates) {
          await writeChats(chatsAllNext);
        }
      }
      let chatsForResponse = chatsAllNext;
      const counselor = userId ? await resolveCounselor(userId) : null;
      if (userId && counselor) {
        // Counselors can see the full conversation thread for any student they have handled
        // (current counselor, inquiry counselor, or counselor history), even if they were not
        // the sender/receiver for older messages.
        const students = await readStudemts();
        const visibleStudentIds = new Set(
          (students || [])
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
      }
      const withPublicUrls = chatsForResponse.map((chat) => {
        if (!chat || !chat.attachment || !chat.attachment.url) return chat;
        return {
          ...chat,
          attachment: {
            ...chat.attachment,
            url: publicChatFileUrl(req, chat.attachment.url),
          },
        };
      });
      if (!userId) {
        sendJson(res, 200, { ok: true, data: withPublicUrls });
        return true;
      }
      const scopedChats = withPublicUrls.filter(
        (chat) =>
          normalizeId(chat.senderId) === normalizedUserId || normalizeId(chat.receiverId) === normalizedUserId
      );
      // Counselors get chatsForResponse already scoped by handled students (includes prior counselor thread).
      sendJson(res, 200, { ok: true, data: counselor ? withPublicUrls : scopedChats });
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
      let attachment = null;
      if (incomingAttachment && incomingAttachment.dataUrl) {
        const stored = await storeChatAttachmentDataUrl(
          String(incomingAttachment.dataUrl || ""),
          String(incomingAttachment.name || "attachment")
        );
        if (!stored) {
          sendJson(res, 400, { ok: false, error: "Unsupported file type for chat attachment." });
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
        whatsappDelivery = await deliverCounselorMessageToStudentWhatsapp({
          senderId,
          receiverId,
          content,
          attachment,
        });
      }
      const chats = await readChats();
      const chat = {
        id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
        senderId,
        receiverId,
        content,
        timestamp: new Date().toISOString(),
        read: false,
        platform: platform || "portal",
        attachment,
        whatsappDelivery,
      };
      await writeChats([...chats, chat]);
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
