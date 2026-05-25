const { parseBody, sendJson } = require("../lib/httpUtils");
const { readWhatsappIncoming } = require("../models/whatsappIncoming");
const { readUsers } = require("../models/users");
const { snapshotWhatsappState, startWhatsappSession, stopWhatsappSession } = require("../services/whatsapp");

function isCounselorRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return (
    normalized === "counselor" ||
    normalized === "consultor" ||
    normalized === "counsellor" ||
    normalized === "visa officer" ||
    normalized === "visa officer & counselor" ||
    normalized === "visa officer & counsellor"
  );
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

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/whatsapp/status") {
    try {
      const userId = String(url.searchParams.get("userId") || "").trim();
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "userId is required." });
        return true;
      }
      const counselor = await resolveCounselor(userId);
      if (!counselor) {
        sendJson(res, 404, { ok: false, error: "Counselor account not found." });
        return true;
      }
      sendJson(res, 200, { ok: true, data: snapshotWhatsappState(counselor.id) });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load WhatsApp status." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/whatsapp/incoming") {
    try {
      const userId = String(url.searchParams.get("userId") || "").trim();
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "userId is required." });
        return true;
      }
      const counselor = await resolveCounselor(userId);
      if (!counselor) {
        sendJson(res, 404, { ok: false, error: "Counselor account not found." });
        return true;
      }
      const all = await readWhatsappIncoming();
      const data = all
        .filter((row) => String(row.counselorId || "") === counselor.id && row.isGroup !== true)
        .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
        .slice(0, 100);
      sendJson(res, 200, { ok: true, data });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load incoming WhatsApp messages." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/whatsapp/connect") {
    try {
      const body = await parseBody(req);
      const userId = String(body.userId || "").trim();
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "userId is required." });
        return true;
      }
      const counselor = await resolveCounselor(userId);
      if (!counselor) {
        sendJson(res, 404, { ok: false, error: "Counselor account not found." });
        return true;
      }
      const data = await startWhatsappSession(counselor.id);
      sendJson(res, 200, { ok: true, data });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to start WhatsApp connection." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/whatsapp/disconnect") {
    try {
      const body = await parseBody(req);
      const userId = String(body.userId || "").trim();
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "userId is required." });
        return true;
      }
      const counselor = await resolveCounselor(userId);
      if (!counselor) {
        sendJson(res, 404, { ok: false, error: "Counselor account not found." });
        return true;
      }
      const data = await stopWhatsappSession(counselor.id);
      sendJson(res, 200, { ok: true, data });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to disconnect WhatsApp." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
