const { parseBody, sendJson } = require("../lib/httpUtils");
const { readSystemData, writeSystemData, normalizeSystemData } = require("../models/systemData");

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/system-data") {
    try {
      const data = await readSystemData();
      sendJson(res, 200, { ok: true, data });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load system settings." });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname === "/api/system-data") {
    try {
      const body = await parseBody(req);
      const current = await readSystemData();
      const normalized = normalizeSystemData({ ...current, ...body });
      await writeSystemData(normalized);
      sendJson(res, 200, { ok: true, data: normalized });
    } catch {
      sendJson(res, 400, { ok: false, error: "Failed to save system settings." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
