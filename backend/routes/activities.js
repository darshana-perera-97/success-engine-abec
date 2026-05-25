const crypto = require("crypto");
const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const { readActivities, writeActivities } = require("../models/activities");

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/activities") {
    try {
      const activities = await readActivities();
      sendJson(res, 200, { ok: true, data: activities });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load activities." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/activities") {
    try {
      const body = await parseBody(req);
      const action = String(body.action || "").trim();
      if (!action) {
        sendJson(res, 400, { ok: false, error: "Activity action is required." });
        return true;
      }
      const nowIso = new Date().toISOString();
      const activity = {
        id: String(body.id || `act-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`),
        user: String(body.user || "System"),
        role: String(body.role || "System"),
        action,
        target: String(body.target || ""),
        type: String(body.type || "system"),
        timestamp: String(body.timestamp || "Just now"),
        createdAt: String(body.createdAt || nowIso),
        actorName: String(body.actorName || body.user || "System"),
        counselorName: String(body.counselorName || ""),
        studentName: String(body.studentName || ""),
        studentId: String(body.studentId || ""),
      };
      const activities = await readActivities();
      await writeActivities([activity, ...activities]);
      logEvent("activity", "activity created", {
        id: activity.id,
        type: activity.type,
        action: activity.action,
        studentId: activity.studentId || "",
        user: activity.user,
      });
      sendJson(res, 201, { ok: true, data: activity });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
