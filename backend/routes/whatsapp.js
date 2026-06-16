const { parseBody, sendJson } = require("../lib/httpUtils");
const { readWhatsappIncoming } = require("../models/whatsappIncoming");
const {
  snapshotWhatsappState,
  startWhatsappSession,
  stopWhatsappSession,
  resolveWhatsappMessenger,
} = require("../services/whatsapp");

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/whatsapp/status") {
    try {
      const userId = String(url.searchParams.get("userId") || "").trim();
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "userId is required." });
        return true;
      }
      const messenger = await resolveWhatsappMessenger(userId);
      if (!messenger) {
        sendJson(res, 404, { ok: false, error: "WhatsApp account not found." });
        return true;
      }
      sendJson(res, 200, { ok: true, data: snapshotWhatsappState(messenger.id) });
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
      const messenger = await resolveWhatsappMessenger(userId);
      if (!messenger) {
        sendJson(res, 404, { ok: false, error: "WhatsApp account not found." });
        return true;
      }
      const all = await readWhatsappIncoming();
      const data = all
        .filter((row) => String(row.counselorId || "") === messenger.id && row.isGroup !== true)
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
      const messenger = await resolveWhatsappMessenger(userId);
      if (!messenger) {
        sendJson(res, 404, { ok: false, error: "WhatsApp account not found." });
        return true;
      }
      const data = await startWhatsappSession(messenger.id);
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
      const messenger = await resolveWhatsappMessenger(userId);
      if (!messenger) {
        sendJson(res, 404, { ok: false, error: "WhatsApp account not found." });
        return true;
      }
      const data = await stopWhatsappSession(messenger.id);
      sendJson(res, 200, { ok: true, data });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to disconnect WhatsApp." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
