const fs = require("fs/promises");
const path = require("path");
const {
  corsHeaders,
  sendJson,
  getContentType,
  sendFrontendFile,
  resolveFrontendRootDir,
  tryReadFrontendAssetFromBuildOutputs,
  parseBody,
} = require("../lib/httpUtils");
const {
  ACTIVE_PROFILE,
  COMPANY_NAME,
  FALLBACK_EXCHANGE_RATES_LKR,
  ASSETS_DIR,
  CHAT_FILES_DIR,
  STUDENT_CV_DIR,
  STUDENT_PERMISSIONS_DIR,
  PAYMENTS_DIR,
} = require("../config");
const { loadExchangeRatesFromApi } = require("../services/exchangeRates");
const { readSystemData, writeSystemData, normalizeSystemData } = require("../models/systemData");

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/company-profile") {
    sendJson(res, 200, {
      ok: true,
      data: {
        activeProfile: ACTIVE_PROFILE,
        companyName: COMPANY_NAME,
      },
    });
    return true;
  }

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

  if (req.method === "GET" && url.pathname === "/api/exchange-rates") {
    try {
      const data = await loadExchangeRatesFromApi();
      sendJson(res, 200, {
        ok: true,
        data: {
          rates: data.rates,
          updatedAt: data.updatedAt,
          live: data.live !== false,
        },
      });
    } catch (e) {
      sendJson(res, 200, {
        ok: true,
        data: {
          rates: FALLBACK_EXCHANGE_RATES_LKR,
          updatedAt: "Static rates (server error)",
          live: false,
        },
      });
    }
    return true;
  }

  return false;
}

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
    try {
      const fileName = path.basename(url.pathname);
      const filePath = path.join(ASSETS_DIR, fileName);
      const file = await fs.readFile(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const contentType =
        ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".svg"
              ? "image/svg+xml"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".gif"
                ? "image/gif"
                : "application/octet-stream";
      Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.end(file);
    } catch {
      try {
        const assetFromFrontend = await tryReadFrontendAssetFromBuildOutputs(url.pathname);
        if (!assetFromFrontend) {
          throw new Error("Asset missing in frontend build outputs.");
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", getContentType(assetFromFrontend.filePath));
        res.end(assetFromFrontend.file);
      } catch {
        sendJson(res, 404, { ok: false, error: "Asset not found." });
      }
    }
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/chat-files/")) {
    try {
      const fileName = path.basename(url.pathname);
      const filePath = path.join(CHAT_FILES_DIR, fileName);
      const file = await fs.readFile(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const contentType =
        ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".gif"
                ? "image/gif"
                : ext === ".pdf"
                  ? "application/pdf"
                  : ext === ".txt"
                    ? "text/plain; charset=utf-8"
                    : ext === ".doc"
                      ? "application/msword"
                      : ext === ".docx"
                        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        : ext === ".xls"
                          ? "application/vnd.ms-excel"
                          : ext === ".xlsx"
                            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            : "application/octet-stream";
      Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.end(file);
    } catch {
      sendJson(res, 404, { ok: false, error: "Chat file not found." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/student-docs/cv/")) {
    try {
      const fileName = path.basename(url.pathname);
      const filePath = path.join(STUDENT_CV_DIR, fileName);
      const file = await fs.readFile(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const contentType =
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".doc"
            ? "application/msword"
            : ext === ".docx"
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : "application/octet-stream";
      Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.end(file);
    } catch {
      sendJson(res, 404, { ok: false, error: "CV file not found." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/student-docs/permissions/")) {
    try {
      const fileName = path.basename(url.pathname);
      const filePath = path.join(STUDENT_PERMISSIONS_DIR, fileName);
      const file = await fs.readFile(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const contentType =
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".png"
            ? "image/png"
            : ext === ".jpg" || ext === ".jpeg"
              ? "image/jpeg"
              : ext === ".doc"
                ? "application/msword"
                : ext === ".docx"
                  ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  : "application/octet-stream";
      Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.end(file);
    } catch {
      sendJson(res, 404, { ok: false, error: "Permission document not found." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/payments/")) {
    try {
      const fileName = path.basename(url.pathname);
      const filePath = path.join(PAYMENTS_DIR, fileName);
      const file = await fs.readFile(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const contentType =
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".png"
            ? "image/png"
            : ext === ".jpg" || ext === ".jpeg"
              ? "image/jpeg"
              : "application/octet-stream";
      Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.end(file);
    } catch {
      sendJson(res, 404, { ok: false, error: "Payment proof not found." });
    }
    return true;
  }

  if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
    const frontendRoot = await resolveFrontendRootDir();
    const decodedPath = decodeURIComponent(url.pathname || "/");
    const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
    const requestExt = path.extname(requestedPath).toLowerCase();
    const isStaticAssetRequest = requestExt !== "";
    const normalizedPath = path
      .normalize(requestedPath)
      .replace(/^(\.\.[/\\])+/, "")
      .replace(/^[/\\]+/, "");
    const absolutePath = path.join(frontendRoot, normalizedPath);
    const distRoot = path.resolve(frontendRoot) + path.sep;
    const isInsideDist = absolutePath.startsWith(distRoot);

    if (isInsideDist) {
      try {
        await sendFrontendFile(res, absolutePath);
        return true;
      } catch {
        if (isStaticAssetRequest) {
          const assetFromOtherBuild = await tryReadFrontendAssetFromBuildOutputs(requestedPath);
          if (assetFromOtherBuild) {
            res.statusCode = 200;
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            res.setHeader("Content-Type", getContentType(assetFromOtherBuild.filePath));
            res.end(assetFromOtherBuild.file);
            return true;
          }
          sendJson(res, 404, { ok: false, error: "Frontend asset not found." });
          return true;
        }
      }
    }

    try {
      await sendFrontendFile(res, path.join(frontendRoot, "index.html"));
      return true;
    } catch {
      sendJson(res, 404, { ok: false, error: "Frontend build not found. Run frontend build first." });
      return true;
    }
  }

  return false;
}

module.exports = { handle, handleApi };
