const fs = require("fs/promises");
const path = require("path");
const {
  MAX_JSON_BODY_BYTES,
  FRONTEND_BUILD_DIR,
  FRONTEND_DIST_DIR,
} = require("../config");

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let rawBytes = 0;
    req.on("data", (chunk) => {
      rawBytes += chunk.length;
      if (rawBytes > MAX_JSON_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".map") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function sendFrontendFile(res, filePath) {
  const file = await fs.readFile(filePath);
  res.statusCode = 200;
  const isHtml = path.extname(filePath).toLowerCase() === ".html";
  if (isHtml) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  } else {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  res.setHeader("Content-Type", getContentType(filePath));
  res.end(file);
}

async function resolveFrontendRootDir() {
  try {
    await fs.access(path.join(FRONTEND_BUILD_DIR, "index.html"));
    return FRONTEND_BUILD_DIR;
  } catch {}
  return FRONTEND_DIST_DIR;
}

async function tryReadFrontendAssetFromBuildOutputs(assetPathname) {
  const relativeAssetPath = String(assetPathname || "").replace(/^[/\\]+/, "");
  const candidatePaths = [
    path.join(FRONTEND_DIST_DIR, relativeAssetPath),
    path.join(FRONTEND_BUILD_DIR, relativeAssetPath),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const file = await fs.readFile(candidatePath);
      return { file, filePath: candidatePath };
    } catch {
    }
  }
  return null;
}

module.exports = {
  corsHeaders,
  parseBody,
  sendJson,
  getContentType,
  sendFrontendFile,
  resolveFrontendRootDir,
  tryReadFrontendAssetFromBuildOutputs,
};
