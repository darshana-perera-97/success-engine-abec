const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const {
  OPENAI_API_KEY,
  OPENAI_MODEL,
  buildAdminAiSystemPrompt,
} = require("../config");
const {
  readAdminChatsStore,
  writeAdminChatsStore,
  sanitizeAdminAiMessagesForStore,
  isAuthorizedAdminChatEmail,
} = require("../models/adminChats");
const { callOpenAiChatCompletion, normalizeAiHistory } = require("../services/ai");
const { buildAdminAiContext } = require("../services/adminData");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/ai/chat/status") {
    sendJson(res, 200, {
      ok: true,
      enabled: Boolean(OPENAI_API_KEY),
      model: OPENAI_MODEL,
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/chat") {
    try {
      if (!OPENAI_API_KEY) {
        sendJson(res, 503, {
          ok: false,
          error: "AI assistant is disabled. Add OPENAI_API_KEY to backend/.env and restart the server.",
        });
        return true;
      }
      const body = await parseBody(req);
      const message = String(body.message || body.question || "").trim();
      if (!message) {
        sendJson(res, 400, { ok: false, error: "Message is required." });
        return true;
      }
      if (message.length > 4000) {
        sendJson(res, 400, { ok: false, error: "Message is too long (max 4000 characters)." });
        return true;
      }

      const history = normalizeAiHistory(body.history);
      const context = await buildAdminAiContext();
      const systemPrompt = buildAdminAiSystemPrompt(context);

      const messages = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message },
      ];

      const result = await callOpenAiChatCompletion({ messages });
      if (!result.ok) {
        sendJson(res, result.status || 502, { ok: false, error: result.error });
        return true;
      }
      sendJson(res, 200, {
        ok: true,
        reply: result.reply,
        model: result.model,
        usage: result.usage,
      });
    } catch (error) {
      logEvent("openai", "Chat handler crashed", { message: String(error?.message || error) });
      sendJson(res, 500, { ok: false, error: "Failed to process AI request." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/admin-ai-chats") {
    try {
      const email = normalizeEmail(url.searchParams.get("email"));
      if (!email) {
        sendJson(res, 400, { ok: false, error: "email query parameter is required." });
        return true;
      }
      if (!(await isAuthorizedAdminChatEmail(email))) {
        sendJson(res, 403, { ok: false, error: "Not authorized for this chat history." });
        return true;
      }
      const store = await readAdminChatsStore();
      const entry = store[email];
      const list = Array.isArray(entry?.messages) ? entry.messages : [];
      sendJson(res, 200, { ok: true, data: list });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load admin chat history." });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname === "/api/admin-ai-chats") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      if (!email) {
        sendJson(res, 400, { ok: false, error: "email is required." });
        return true;
      }
      if (!(await isAuthorizedAdminChatEmail(email))) {
        sendJson(res, 403, { ok: false, error: "Not authorized for this chat history." });
        return true;
      }
      const messages = sanitizeAdminAiMessagesForStore(body.messages);
      const store = await readAdminChatsStore();
      store[email] = { messages, updatedAt: new Date().toISOString() };
      await writeAdminChatsStore(store);
      sendJson(res, 200, { ok: true, data: messages });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname === "/api/admin-ai-chats") {
    try {
      const email = normalizeEmail(url.searchParams.get("email"));
      if (!email) {
        sendJson(res, 400, { ok: false, error: "email query parameter is required." });
        return true;
      }
      if (!(await isAuthorizedAdminChatEmail(email))) {
        sendJson(res, 403, { ok: false, error: "Not authorized for this chat history." });
        return true;
      }
      const store = await readAdminChatsStore();
      delete store[email];
      await writeAdminChatsStore(store);
      sendJson(res, 200, { ok: true });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to clear admin chat history." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
