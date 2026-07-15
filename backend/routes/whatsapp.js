const { parseBody, sendJson } = require("../lib/httpUtils");
const { readWhatsappIncoming } = require("../models/whatsappIncoming");
const {
  snapshotWhatsappState,
  startWhatsappSession,
  stopWhatsappSession,
  regenerateWhatsappQrCode,
  resolveWhatsappMessenger,
  resolveWhatsappIntegrationContextForUser,
  prepareBranchWhatsappConnect,
  syncWhatsappChatHistoryForStudent,
  syncAllWhatsappChatHistory,
} = require("../services/whatsapp");
const {
  assertCanManageWhatsappConnection,
  sanitizeWhatsappStatusForViewer,
} = require("../services/branchWhatsapp");

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/whatsapp/integration-context") {
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
      const context = await resolveWhatsappIntegrationContextForUser(userId);
      sendJson(res, 200, { ok: true, data: context });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load WhatsApp integration context." });
    }
    return true;
  }

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
      const context = await resolveWhatsappIntegrationContextForUser(userId);
      const statusUserId = String(context.statusUserId || userId).trim() || userId;
      const statusMessenger = await resolveWhatsappMessenger(statusUserId);
      if (!statusMessenger && context.mode === "branch" && !context.canManage) {
        sendJson(res, 200, {
          ok: true,
          data: {
            status: "disconnected",
            qrCodeDataUrl: "",
            error: "",
            connectedAt: "",
            whatsappName: "",
            whatsappNumber: "",
            whatsappProfilePicUrl: "",
            lastUpdatedAt: new Date().toISOString(),
          },
          context,
        });
        return true;
      }
      sendJson(res, 200, {
        ok: true,
        data: sanitizeWhatsappStatusForViewer(snapshotWhatsappState(statusUserId), context),
        context,
      });
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
      const context = await resolveWhatsappIntegrationContextForUser(userId);
      const statusUserId = String(context.statusUserId || userId).trim() || userId;
      const all = await readWhatsappIncoming();
      const data = all
        .filter((row) => String(row.counselorId || "") === statusUserId && row.isGroup !== true)
        .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
        .slice(0, 100);
      sendJson(res, 200, { ok: true, data, context });
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
      const access = await assertCanManageWhatsappConnection(userId);
      if (!access.ok) {
        sendJson(res, 403, { ok: false, error: access.error || "You cannot manage WhatsApp for this branch." });
        return true;
      }
      const prepared = await prepareBranchWhatsappConnect(userId);
      if (!prepared.ok) {
        sendJson(res, 403, { ok: false, error: prepared.error || "You cannot manage WhatsApp for this branch." });
        return true;
      }
      const context = await resolveWhatsappIntegrationContextForUser(userId);
      const data = sanitizeWhatsappStatusForViewer(await startWhatsappSession(userId), context);
      sendJson(res, 200, { ok: true, data, context });
    } catch (error) {
      console.error("Failed to start WhatsApp connection:", error);
      const message = String(error?.message || "Failed to start WhatsApp connection.").trim();
      sendJson(res, 500, { ok: false, error: message || "Failed to start WhatsApp connection." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/whatsapp/regenerate-qr") {
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
      const access = await assertCanManageWhatsappConnection(userId);
      if (!access.ok) {
        sendJson(res, 403, { ok: false, error: access.error || "You cannot manage WhatsApp for this branch." });
        return true;
      }
      const context = await resolveWhatsappIntegrationContextForUser(userId);
      const data = sanitizeWhatsappStatusForViewer(await regenerateWhatsappQrCode(userId), context);
      sendJson(res, 200, { ok: true, data, context });
    } catch (error) {
      const message = String(error?.message || "Failed to regenerate WhatsApp QR code.");
      sendJson(res, 500, { ok: false, error: message });
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
      const access = await assertCanManageWhatsappConnection(userId);
      if (!access.ok) {
        sendJson(res, 403, { ok: false, error: access.error || "You cannot manage WhatsApp for this branch." });
        return true;
      }
      const context = await resolveWhatsappIntegrationContextForUser(userId);
      const data = sanitizeWhatsappStatusForViewer(await stopWhatsappSession(userId), context);
      sendJson(res, 200, { ok: true, data, context });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to disconnect WhatsApp." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/whatsapp/sync-history") {
    try {
      const body = await parseBody(req);
      const userId = String(body.userId || "").trim();
      const studentId = String(body.studentId || "").trim();
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "userId is required." });
        return true;
      }
      const messenger = await resolveWhatsappMessenger(userId);
      if (!messenger) {
        sendJson(res, 404, { ok: false, error: "WhatsApp account not found." });
        return true;
      }
      let result;
      if (studentId) {
        result = await syncWhatsappChatHistoryForStudent(userId, studentId);
      } else {
        result = await syncAllWhatsappChatHistory(userId);
      }
      if (result.error) {
        sendJson(res, 400, { ok: false, error: result.error, synced: result.synced || 0 });
        return true;
      }
      sendJson(res, 200, { ok: true, data: result });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: String(error?.message || "Failed to sync WhatsApp history.") });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
