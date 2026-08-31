const { parseBody, sendJson } = require("../lib/httpUtils");
const { whatsappSessions, ADMIN_DISPLAY_NAME, ADMIN_EMAIL } = require("../config");
const { readLoginLogs } = require("../models/loginLogs");
const { readWhatsappIncoming } = require("../models/whatsappIncoming");
const { readChats } = require("../models/chats");
const { readUsers } = require("../models/users");
const { readStudemts } = require("../models/students");
const {
  snapshotWhatsappState,
  refreshWhatsappSessionHealth,
  stopWhatsappSession,
  reconnectWhatsappSessionForAdmin,
  listSavedWhatsappSessionUserIds,
  userHasSavedWhatsappSession,
} = require("../services/whatsapp");

const LOG_LIST_LIMIT = 500;

function sortByTimeDesc(a, b, field = "timestamp") {
  return new Date(b?.[field] || 0).getTime() - new Date(a?.[field] || 0).getTime();
}

function previewText(value, max = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function peekWhatsappSnapshot(userId) {
  const key = String(userId || "").trim();
  if (!key) {
    return { userId: "", status: "disconnected", whatsappName: "", whatsappNumber: "" };
  }
  if (whatsappSessions.has(key)) return snapshotWhatsappState(key);
  return { userId: key, status: "disconnected", whatsappName: "", whatsappNumber: "" };
}

function accountLabel(snap) {
  const name = String(snap?.whatsappName || "").trim();
  const number = String(snap?.whatsappNumber || "").trim();
  if (name && number) return `${name} (${number})`;
  return name || number || "";
}

async function buildPeopleDirectory() {
  const [users, students] = await Promise.all([readUsers(), readStudemts()]);
  const byId = new Map();
  byId.set("ADM001", {
    id: "ADM001",
    name: ADMIN_DISPLAY_NAME,
    email: ADMIN_EMAIL || "",
    role: "Admin",
  });
  for (const user of users) {
    const id = String(user?.id || "").trim();
    if (!id) continue;
    byId.set(id, {
      id,
      name: String(user.username || user.name || "").trim() || id,
      email: String(user.email || "").trim(),
      role: String(user.role || "").trim(),
    });
  }
  for (const student of students) {
    const id = String(student?.id || "").trim();
    if (!id) continue;
    byId.set(id, {
      id,
      name: String(student.name || student.username || "").trim() || id,
      email: String(student.email || "").trim(),
      role: "Student",
    });
  }
  return byId;
}

function personName(directory, userId, fallback = "") {
  const id = String(userId || "").trim();
  if (!id) return fallback;
  return directory.get(id)?.name || fallback || id;
}

async function listWhatsappIntegrations(directory) {
  const users = await readUsers();
  const savedIds = await listSavedWhatsappSessionUserIds(users);
  const ids = new Set([...savedIds, ...whatsappSessions.keys()]);
  const rows = [];
  for (const userId of ids) {
    const cleanId = String(userId || "").trim();
    if (!cleanId) continue;
    const snap = snapshotWhatsappState(cleanId);
    const hasSavedSession = savedIds.includes(cleanId) || (await userHasSavedWhatsappSession(cleanId));
    const status = String(snap.status || "disconnected");
    const visible =
      hasSavedSession ||
      (status && status !== "disconnected") ||
      Boolean(String(snap.whatsappName || "").trim() || String(snap.whatsappNumber || "").trim());
    if (!visible) continue;
    const person = directory.get(cleanId);
    rows.push({
      userId: cleanId,
      userName: person?.name || cleanId,
      email: person?.email || "",
      role: person?.role || "",
      account: accountLabel(snap) || "Not linked",
      whatsappName: String(snap.whatsappName || "").trim(),
      whatsappNumber: String(snap.whatsappNumber || "").trim(),
      status,
      error: String(snap.error || "").trim(),
      connectedAt: String(snap.connectedAt || "").trim(),
      lastUpdatedAt: String(snap.lastUpdatedAt || "").trim(),
      hasSavedSession,
      canLogout: status !== "disconnected" || hasSavedSession,
      healthScore: Number.isFinite(Number(snap.healthScore)) ? Number(snap.healthScore) : 0,
      healthLabel: String(snap.healthLabel || "").trim() || "Unknown",
      healthVerdict: String(snap.healthVerdict || "").trim(),
    });
  }
  await Promise.all(
    rows.map(async (row) => {
      try {
        const health = await refreshWhatsappSessionHealth(row.userId);
        row.healthScore = Number.isFinite(Number(health?.score)) ? Number(health.score) : row.healthScore;
        row.healthLabel = String(health?.label || row.healthLabel || "").trim() || "Unknown";
        row.healthVerdict = String(health?.verdict || row.healthVerdict || "").trim();
      } catch {
        // Keep cached snapshot health if a live probe fails.
      }
    })
  );
  rows.sort((a, b) => {
    const rank = (status) => {
      if (status === "connected" || status === "authenticated") return 0;
      if (status === "awaiting_qr_scan" || status === "connecting" || status === "reconnecting") return 1;
      if (status === "error" || status === "auth_failed") return 2;
      return 3;
    };
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;
    return String(a.userName || "").localeCompare(String(b.userName || ""));
  });
  return rows;
}

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/admin/logs/logins") {
    try {
      const logs = await readLoginLogs();
      const data = [...logs].sort((a, b) => sortByTimeDesc(a, b, "loggedInAt"));
      sendJson(res, 200, { ok: true, data });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load login logs." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/logs/whatsapp-sessions") {
    try {
      const directory = await buildPeopleDirectory();
      const data = await listWhatsappIntegrations(directory);
      sendJson(res, 200, { ok: true, data });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load WhatsApp integrations." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/logs/whatsapp-disconnect") {
    try {
      const body = await parseBody(req);
      const userId = String(body.userId || "").trim();
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "userId is required." });
        return true;
      }
      const data = await stopWhatsappSession(userId);
      sendJson(res, 200, { ok: true, data });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to log out WhatsApp account." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/logs/whatsapp-reconnect") {
    try {
      const body = await parseBody(req);
      const userId = String(body.userId || "").trim();
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "userId is required." });
        return true;
      }
      const data = await reconnectWhatsappSessionForAdmin(userId);
      sendJson(res, 200, { ok: true, data });
    } catch (error) {
      const message = String(error?.message || "Failed to reconnect WhatsApp account.").trim();
      sendJson(res, 500, { ok: false, error: message || "Failed to reconnect WhatsApp account." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/logs/whatsapp-incoming") {
    try {
      const directory = await buildPeopleDirectory();
      const incoming = await readWhatsappIncoming();
      const data = incoming
        .filter((row) => row && row.isGroup !== true)
        .sort((a, b) => sortByTimeDesc(a, b, "timestamp"))
        .slice(0, LOG_LIST_LIMIT)
        .map((row) => {
          const counselorId = String(row.counselorId || "").trim();
          const snap = counselorId ? peekWhatsappSnapshot(counselorId) : null;
          const message = String(row.message || "").trim();
          const mappedStudentId = String(row.mappedStudentId || "").trim();
          return {
            id: row.id,
            account: accountLabel(snap) || personName(directory, counselorId, counselorId || "Unknown account"),
            userName: personName(directory, counselorId, counselorId || "Unknown user"),
            counselorId,
            receivedNumber: String(row.contactNumber || row.from || "").trim(),
            messagePreview: previewText(message) || (row.attachment ? "Attachment" : ""),
            message,
            timestamp: row.timestamp || "",
            mappedStudentId,
            mappedStudentName: mappedStudentId ? personName(directory, mappedStudentId, "") : "",
            attachment: row.attachment || null,
            replyTo: row.replyTo || null,
          };
        });
      sendJson(res, 200, { ok: true, data });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load incoming WhatsApp messages." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/logs/whatsapp-outgoing") {
    try {
      const directory = await buildPeopleDirectory();
      const chats = await readChats();
      const data = chats
        .filter((chat) => {
          const status = String(chat?.whatsappDelivery?.status || "").trim();
          if (status === "received") return false;
          if (chat?.whatsappDelivery) return true;
          return String(chat?.platform || "").trim() === "whatsapp";
        })
        .sort((a, b) => sortByTimeDesc(a, b, "timestamp"))
        .slice(0, LOG_LIST_LIMIT)
        .map((chat) => {
          const delivery = chat.whatsappDelivery || {};
          const senderId = String(delivery.senderId || chat.senderId || "").trim();
          const receiverId = String(chat.receiverId || "").trim();
          const snap = senderId ? peekWhatsappSnapshot(senderId) : null;
          const message = String(chat.content || "").trim();
          const status = String(delivery.status || "pending").trim() || "pending";
          return {
            id: chat.id,
            userName: personName(directory, receiverId, receiverId || "Unknown recipient"),
            receiverId,
            senderId,
            senderName: personName(directory, senderId, ""),
            message,
            messagePreview: previewText(message) || (chat.attachment ? "Attachment" : ""),
            whatsappAccount: accountLabel(snap) || personName(directory, senderId, senderId || "Unknown account"),
            status,
            reason: String(delivery.reason || "").trim(),
            timestamp: chat.timestamp || delivery.sentAt || "",
            attachment: chat.attachment || null,
          };
        });
      sendJson(res, 200, { ok: true, data });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load outgoing WhatsApp messages." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
