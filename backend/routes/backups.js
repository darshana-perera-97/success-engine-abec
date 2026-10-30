const { createReadStream } = require("fs");
const { corsHeaders, sendJson } = require("../lib/httpUtils");
const { deleteBackup, getBackupJob, listBackups, resolveBackupPath, startBackup } = require("../services/dataBackup");
const fs = require("fs/promises");

function backupNameFromPath(pathname) {
  const prefix = "/api/backups/";
  if (!pathname.startsWith(prefix)) return "";
  const raw = pathname.slice(prefix.length);
  if (!raw || raw.includes("/")) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

function sendBackupError(res, error, fallback) {
  const status = Number(error?.status) || 500;
  sendJson(res, status, { ok: false, error: error?.message || fallback });
}

async function sendBackupFile(res, name) {
  const full = resolveBackupPath(name);
  let stat;
  try {
    stat = await fs.stat(full);
  } catch {
    sendJson(res, 404, { ok: false, error: "Backup file was not found." });
    return;
  }
  if (!stat.isFile()) {
    sendJson(res, 404, { ok: false, error: "Backup file was not found." });
    return;
  }

  res.statusCode = 200;
  Object.entries(corsHeaders()).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("Content-Disposition", `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  createReadStream(full).pipe(res);
}

async function handle(req, res, url) {
  if (url.pathname === "/api/backups" && req.method === "GET") {
    try {
      const data = await listBackups();
      sendJson(res, 200, { ok: true, data, job: getBackupJob() });
    } catch (error) {
      sendBackupError(res, error, "Failed to load backups.");
    }
    return true;
  }

  if (url.pathname === "/api/backups" && req.method === "POST") {
    try {
      const job = startBackup();
      sendJson(res, 202, { ok: true, job });
    } catch (error) {
      const status = Number(error?.status) || 500;
      sendJson(res, status, {
        ok: false,
        error: error?.message || "Failed to create backup.",
        job: error?.job || getBackupJob(),
      });
    }
    return true;
  }

  if (url.pathname.startsWith("/api/backups/") && (req.method === "GET" || req.method === "DELETE")) {
    const name = backupNameFromPath(url.pathname);
    if (!name) {
      sendJson(res, 400, { ok: false, error: "Invalid backup file." });
      return true;
    }
    if (req.method === "GET") {
      try {
        await sendBackupFile(res, name);
      } catch (error) {
        if (!res.headersSent) sendBackupError(res, error, "Failed to download backup.");
      }
      return true;
    }
    try {
      const data = await deleteBackup(name);
      sendJson(res, 200, { ok: true, data, job: getBackupJob() });
    } catch (error) {
      sendBackupError(res, error, "Failed to delete backup.");
    }
    return true;
  }

  return false;
}

module.exports = { handle };
