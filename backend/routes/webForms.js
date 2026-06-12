const { parseBody, sendJson } = require("../lib/httpUtils");
const {
  listWebForms,
  getWebFormById,
  createWebForm,
  updateWebForm,
  deleteWebForm,
  normalizeWebFormRecord,
} = require("../models/webForms");

async function handle(req, res, url) {
  const publicMatch = url.pathname.match(/^\/api\/web-forms\/public\/([^/]+)$/);
  if (req.method === "GET" && publicMatch) {
    try {
      const form = await getWebFormById(decodeURIComponent(publicMatch[1]));
      if (!form) {
        sendJson(res, 404, { ok: false, error: "Form not found." });
        return true;
      }
      sendJson(res, 200, { ok: true, data: form });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load form." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/web-forms") {
    try {
      const forms = await listWebForms();
      sendJson(res, 200, { ok: true, data: forms });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load web forms." });
    }
    return true;
  }

  const itemMatch = url.pathname.match(/^\/api\/web-forms\/([^/]+)$/);
  if (itemMatch) {
    const formId = decodeURIComponent(itemMatch[1]);
    if (req.method === "GET") {
      try {
        const form = await getWebFormById(formId);
        if (!form) {
          sendJson(res, 404, { ok: false, error: "Form not found." });
          return true;
        }
        sendJson(res, 200, { ok: true, data: form });
      } catch {
        sendJson(res, 500, { ok: false, error: "Failed to load form." });
      }
      return true;
    }

    if (req.method === "PUT") {
      try {
        const body = await parseBody(req);
        const updated = await updateWebForm(formId, normalizeWebFormRecord({ ...body, id: formId }));
        if (!updated) {
          sendJson(res, 404, { ok: false, error: "Form not found." });
          return true;
        }
        sendJson(res, 200, { ok: true, data: updated });
      } catch {
        sendJson(res, 400, { ok: false, error: "Failed to save form." });
      }
      return true;
    }

    if (req.method === "DELETE") {
      try {
        const removed = await deleteWebForm(formId);
        if (!removed) {
          sendJson(res, 404, { ok: false, error: "Form not found." });
          return true;
        }
        sendJson(res, 200, { ok: true, data: { id: formId } });
      } catch {
        sendJson(res, 400, { ok: false, error: "Failed to delete form." });
      }
      return true;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/web-forms") {
    try {
      const body = await parseBody(req);
      const created = await createWebForm(normalizeWebFormRecord(body));
      sendJson(res, 201, { ok: true, data: created });
    } catch {
      sendJson(res, 400, { ok: false, error: "Failed to create form." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
