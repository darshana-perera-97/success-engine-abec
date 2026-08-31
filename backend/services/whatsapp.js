const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

function isWhatsappPageBindingExistsError(error) {
  const msg = String(error?.message || error?.cause?.message || error || "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("failed to add page binding") ||
    (msg.includes("already exists") &&
      (msg.includes("window[") || msg.includes("page binding") || msg.includes("exposed function")))
  );
}

// Client.js captures exposeFunctionIfAbsent at require time. Patch the export
// before loading whatsapp-web.js or inject() still throws on page reload.
(function patchWhatsappExposeFunctionIfAbsent() {
  const puppeteerUtil = require("whatsapp-web.js/src/util/Puppeteer");
  if (puppeteerUtil.__seExposeFunctionIfAbsentPatched) return;
  puppeteerUtil.__seExposeFunctionIfAbsentPatched = true;
  const original = puppeteerUtil.exposeFunctionIfAbsent;
  puppeteerUtil.exposeFunctionIfAbsent = async function exposeFunctionIfAbsentSafe(page, name, fn) {
    try {
      return await original(page, name, fn);
    } catch (error) {
      if (isWhatsappPageBindingExistsError(error)) return;
      throw error;
    }
  };
})();

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const {
  whatsappSessions,
  whatsappSessionRecoveryChains,
  WHATSAPP_CONNECTIONS_DIR,
  WHATSAPP_WEB_VERSION_CACHE_REMOTE_PATH,
} = require("../config");
const { readUsers } = require("../models/users");
const { readSystemData } = require("../models/systemData");
const { readStudemts } = require("../models/students");
const { readChats, writeChats, appendPortalChatMessage, normalizeReplyTo } = require("../models/chats");
const { resolveChatFileDiskPath, resolveStudentDocDiskPath } = require("../models/students");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { isWhatsappIntegratedStaffRole } = require("./roles");
const {
  isBranchWhatsappManagerRole,
  isWhatsappSessionConnected,
  isBranchWhatsappEnabled,
  isBranchWhatsappSharedEnabled,
  resolveUserRecord,
  resolveBranchForUser,
  resolveBranchForStudent,
  findBranchWhatsappMessengerUser,
  setBranchWhatsappMessenger,
  clearBranchWhatsappMessenger,
  ensureSharedBranchMessenger,
  resolveEffectiveWhatsappSenderId,
  studentPrimaryWhatsappUnavailableReason,
  resolveWhatsappIntegrationContext,
  assertCanManageWhatsappConnection,
  onWhatsappSessionReady,
  onWhatsappSessionDisconnected,
  syncBranchWhatsappMessengersFromSessions,
} = require("./branchWhatsapp");

const BRANCH_WHATSAPP_ACTIVE_STATUSES = new Set([
  "connecting",
  "reconnecting",
  "awaiting_qr_scan",
  "authenticated",
  "connected",
]);

const STAFF_WHATSAPP_ROLES = new Set(["Admin", "Manager", "Team Lead"]);
const { isSupportedWhatsappMediaMime, storeChatAttachmentDataUrl, extensionFromFileName, mimeFromExtension } = require("./uploads");
const { appendWhatsappIncoming, readWhatsappIncoming } = require("../models/whatsappIncoming");
const { logEvent } = require("../lib/logger");
const { resolveWhatsappWebVersion, invalidateWhatsappWebVersionCache } = require("./whatsappWebVersion");

const AUTHENTICATED_STUCK_TIMEOUT_MS = 180 * 1000;
const WHATSAPP_BOOT_AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const WHATSAPP_AUTH_TIMEOUT_RECOVERY_MS = 15 * 1000;
const WHATSAPP_INIT_MAX_ATTEMPTS = 3;
const WHATSAPP_SILENT_RECONNECT_MAX_ATTEMPTS = 3;
const WHATSAPP_SILENT_RECONNECT_BASE_MS = 5 * 1000;
const WHATSAPP_SILENT_QR_GRACE_MS = 12 * 1000;
const WHATSAPP_BROWSER_RESTART_PAUSE_MS = 1500;
const WHATSAPP_BROWSER_ORPHAN_PAUSE_MS = 500;
const WHATSAPP_RECONNECT_QUEUE_GAP_MS = 800;
const WHATSAPP_HEALTH_PROBE_ATTEMPTS = 3;
const WHATSAPP_HEALTH_CACHE_MS = 20_000;
const WHATSAPP_HEALTH_FAIL_STREAK_LIMIT = 2;
const WHATSAPP_HEALTH_GRACE_MS = 60 * 1000;
const WHATSAPP_WARMING_STATES = new Set(["CONNECTING", "OPENING", "PAIRING", "UNLAUNCHED"]);
const WHATSAPP_TRANSIENT_SOCKET_STATES = new Set(["UNLAUNCHED", "UNPAIRED", "UNPAIRED_IDLE"]);
const WHATSAPP_TRANSIENT_DISCONNECT_GRACE_MS = 20 * 1000;
const WHATSAPP_BUSY_STATUSES = new Set([
  "connecting",
  "reconnecting",
  "awaiting_qr_scan",
  "authenticated",
  "connected",
]);
const WHATSAPP_SEND_WAIT_MS = 75 * 1000;
const WHATSAPP_SEND_WARMUP_MS = 8 * 1000;
const WHATSAPP_ACK_WAIT_MS = 8 * 1000;
const WHATSAPP_ACK_SERVER = 1;
const WHATSAPP_ACK_ERROR = -1;
const WHATSAPP_STARTUP_READY_TIMEOUT_MS = 90 * 1000;
const WHATSAPP_STARTUP_AUTHENTICATED_WAIT_MS = 150 * 1000;
const WHATSAPP_LOGOUT_REASON_RE = /logout|logged.?out/i;
const ADMIN_WHATSAPP_USER_ID = "ADM001";
const RESTORABLE_SESSIONS_FILE = path.join(WHATSAPP_CONNECTIONS_DIR, "restorable-sessions.json");
let isWhatsappShuttingDown = false;
let whatsappBootRestoreActive = false;
let whatsappInitChain = Promise.resolve();
let restorableSessionsCache = null;
const whatsappReconnectQueue = [];
const whatsappReconnectQueuedIds = new Set();
const whatsappReconnectQueueIdleWaiters = [];
let whatsappReconnectQueueRunning = false;
let whatsappReconnectActiveUserId = "";

function notifyWhatsappSessionDisconnected(userId) {
  if (isWhatsappShuttingDown) return;
  onWhatsappSessionDisconnected(userId).catch(() => {
    // Branch unlink is best-effort.
  });
}

// Puppeteer's bundled Chrome for linux_arm is often an invalid binary (shell reports
// `Syntax error: ")" unexpected`). Prefer an explicit path or system Chromium/Chrome.
function resolvePuppeteerExecutablePath() {
  const fromEnv = String(
    process.env.PUPPETEER_EXECUTABLE_PATH ||
      process.env.CHROME_PATH ||
      process.env.CHROMIUM_PATH ||
      ""
  ).trim();
  if (fromEnv) {
    if (!fsSync.existsSync(fromEnv)) {
      throw new Error(
        `PUPPETEER_EXECUTABLE_PATH is set to "${fromEnv}" but that file does not exist.`
      );
    }
    return fromEnv;
  }

  const candidates = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/snap/bin/chromium",
  ];
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }

  for (const name of ["chromium-browser", "chromium", "google-chrome-stable", "google-chrome"]) {
    try {
      const found = String(execFileSync("which", [name], { encoding: "utf8" })).trim();
      if (found && fsSync.existsSync(found)) return found;
    } catch {
      // Binary not on PATH.
    }
  }

  // On ARM Linux, Puppeteer's cached Chrome is commonly broken — fail with a clear fix.
  const arch = String(process.arch || "");
  if (process.platform === "linux" && (arch === "arm" || arch === "arm64")) {
    throw new Error(
      "No system Chromium/Chrome found. Puppeteer's bundled browser does not work on ARM Linux. " +
        "Install Chromium (e.g. `sudo apt-get install -y chromium-browser` or `chromium`) " +
        "and set PUPPETEER_EXECUTABLE_PATH to its path in backend/.env."
    );
  }

  return "";
}

function buildWhatsappClientOptions(cleanUserId, webVersion) {
  const cacheType = String(process.env.WHATSAPP_WEB_VERSION_CACHE || "local").trim().toLowerCase();
  const options = {
    authStrategy: new LocalAuth({
      clientId: sanitizeUserIdForPath(cleanUserId),
      dataPath: path.join(WHATSAPP_CONNECTIONS_DIR, sanitizeUserIdForPath(cleanUserId)),
    }),
    webVersion,
    authTimeoutMs: 180000,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 15000,
    bypassCSP: true,
    puppeteer: buildPuppeteerOptions(),
  };
  if (cacheType === "remote") {
    options.webVersionCache = {
      type: "remote",
      remotePath: WHATSAPP_WEB_VERSION_CACHE_REMOTE_PATH,
      strict: false,
    };
  } else {
    options.webVersionCache = { type: "local" };
  }
  return options;
}

function scheduleWhatsappAuthTimeoutRecovery(userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId || isWhatsappShuttingDown) return;
  const timer = setTimeout(async () => {
    if (isWhatsappShuttingDown) return;
    const state = ensureWhatsappState(cleanUserId);
    if (state.status !== "error" || !state.authTimedOut) return;
    logEvent("whatsapp", "auto-reconnect after QR sign-in timeout", { userId: cleanUserId });
    try {
      await regenerateWhatsappQrCode(cleanUserId);
    } catch (error) {
      console.warn(`WhatsApp auto-reconnect failed for ${cleanUserId}:`, error);
    }
  }, WHATSAPP_AUTH_TIMEOUT_RECOVERY_MS);
  if (typeof timer.unref === "function") timer.unref();
}

function buildPuppeteerOptions() {
  const options = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  };
  const executablePath = resolvePuppeteerExecutablePath();
  if (executablePath) options.executablePath = executablePath;
  return options;
}

function swallowWhatsappPuppeteerError(error, context) {
  if (isWhatsappPuppeteerStaleSessionError(error)) return true;
  if (context) {
    console.warn(`WhatsApp puppeteer ${context}:`, String(error?.message || error));
  }
  return false;
}

async function resolveCachedWhatsappWebHtml(requestedVersion, cacheType, cacheOptions) {
  const WebCacheFactory = require("whatsapp-web.js/src/webCache/WebCacheFactory");
  const primary = WebCacheFactory.createWebCache(cacheType, cacheOptions);
  try {
    const content = await primary.resolve(requestedVersion);
    if (content) return content;
  } catch {
    // Continue to remote fallback.
  }
  if (cacheType === "remote" || !requestedVersion) return null;
  try {
    const remote = WebCacheFactory.createWebCache("remote", {
      remotePath: WHATSAPP_WEB_VERSION_CACHE_REMOTE_PATH,
      strict: false,
    });
    return (await remote.resolve(requestedVersion)) || null;
  } catch {
    return null;
  }
}

function makeExposeFunctionIdempotent(page) {
  if (!page || typeof page.exposeFunction !== "function" || page.__seExposeFunctionIdempotent) {
    return;
  }
  page.__seExposeFunctionIdempotent = true;
  const original = page.exposeFunction.bind(page);
  page.exposeFunction = async function patchedExposeFunction(name, fn) {
    try {
      return await original(name, fn);
    } catch (error) {
      if (isWhatsappPageBindingExistsError(error)) return;
      throw error;
    }
  };
}

function patchPuppeteerExposeFunctionIdempotent() {
  const loaders = [
    () => require("puppeteer-core/lib/cjs/puppeteer/cdp/Page.js").CdpPage,
    () => require("puppeteer-core/lib/esm/puppeteer/cdp/Page.js").CdpPage,
  ];
  for (const load of loaders) {
    try {
      const CdpPage = load();
      if (!CdpPage?.prototype?.exposeFunction || CdpPage.prototype.__seExposeFunctionIdempotent) {
        continue;
      }
      CdpPage.prototype.__seExposeFunctionIdempotent = true;
      const original = CdpPage.prototype.exposeFunction;
      CdpPage.prototype.exposeFunction = async function patchedCdpExposeFunction(name, fn) {
        try {
          return await original.call(this, name, fn);
        } catch (error) {
          if (isWhatsappPageBindingExistsError(error)) return;
          throw error;
        }
      };
    } catch {
      // puppeteer layout differs by version; instance wrapping still covers the page.
    }
  }
}

function isWhatsappTransientInjectError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  return msg.includes("auth timeout") || msg.includes("ready timeout");
}

function isWhatsappTransientSocketState(value) {
  return WHATSAPP_TRANSIENT_SOCKET_STATES.has(String(value || "").toUpperCase());
}

function clearWhatsappTransientDisconnectWatchdog(client) {
  if (!client?.__seTransientWatchdog) return;
  clearTimeout(client.__seTransientWatchdog);
  client.__seTransientWatchdog = null;
}

async function confirmWhatsappTransientDisconnect(client, originalEmit, originalDestroy, reason) {
  if (!client) return;
  if (client.lastLoggedOut) {
    originalEmit.call(client, "disconnected", "LOGOUT");
    return;
  }
  let waState = "";
  let pageOpen = true;
  try {
    const page = client.pupPage;
    pageOpen = Boolean(page) && !(typeof page.isClosed === "function" && page.isClosed());
    if (pageOpen && typeof client.getState === "function") {
      waState = String((await client.getState()) || "").toUpperCase();
    }
  } catch {
    pageOpen = Boolean(client.pupPage);
  }
  if (pageOpen && (!waState || waState === "CONNECTED" || waState === "OPENING" || waState === "PAIRING")) {
    return;
  }
  logEvent("whatsapp", "transient socket disconnect confirmed", {
    userId: findWhatsappUserIdForClient(client),
    reason: waState || reason,
    pageOpen,
  });
  client.__seTransientDisconnectConfirmed = true;
  originalEmit.call(client, "disconnected", waState || reason || "UNLAUNCHED");
  if (!pageOpen) {
    try {
      await originalDestroy.call(client);
    } catch {
      // Browser is already gone.
    }
  }
}

function wrapWhatsappPageEventHandler(handler) {
  if (typeof handler !== "function" || handler.__seWhatsappEventWrapped) return handler;
  const wrapped = async function wrappedWhatsappPageEvent(...args) {
    try {
      return await handler.apply(this, args);
    } catch (error) {
      if (
        isWhatsappPageBindingExistsError(error) ||
        isWhatsappTransientInjectError(error) ||
        swallowWhatsappPuppeteerError(error)
      ) {
        return;
      }
      throw error;
    }
  };
  wrapped.__seWhatsappEventWrapped = true;
  return wrapped;
}

function guardWhatsappPuppeteerPage(page, browser) {
  if (page && !page.__sePuppeteerGuarded) {
    page.__sePuppeteerGuarded = true;
    makeExposeFunctionIdempotent(page);
    if (typeof page.on === "function" && !page.__seFrameNavigateGuarded) {
      page.__seFrameNavigateGuarded = true;
      const originalOn = page.on.bind(page);
      page.on = function patchedPageOn(eventName, handler) {
        if (String(eventName || "") === "framenavigated") {
          return originalOn(eventName, wrapWhatsappPageEventHandler(handler));
        }
        return originalOn(eventName, handler);
      };
    }
    page.on("error", (error) => {
      swallowWhatsappPuppeteerError(error, "page error");
    });
  }
  if (browser && !browser.__sePuppeteerGuarded) {
    browser.__sePuppeteerGuarded = true;
    browser.on("disconnected", () => {});
  }
}

// whatsapp-web.js leaves async puppeteer listeners uncaught. When Chrome
// navigates or the session is destroyed, Network.getResponseBody fails with
// Target closed and becomes an unhandledRejection.
function patchWhatsappWebJsClient() {
  if (Client.prototype.__sePuppeteerGuardsPatched) return;
  Client.prototype.__sePuppeteerGuardsPatched = true;

  patchPuppeteerExposeFunctionIdempotent();

  const originalEmit = Client.prototype.emit;
  const originalDestroy = Client.prototype.destroy;
  Client.prototype.emit = function patchedClientEmit(event, ...args) {
    const name = String(event || "");
    if (name === "change_state") {
      const next = String(args[0] || "").toUpperCase();
      if (next === "CONNECTED" || next === "OPENING" || next === "PAIRING") {
        this.__seIgnoreNextDestroy = false;
        this.__seTransientDisconnectConfirmed = false;
        clearWhatsappTransientDisconnectWatchdog(this);
      }
    } else if (name === "disconnected") {
      const reason = String(args[0] || "").toUpperCase();
      if (!this.lastLoggedOut && reason !== "LOGOUT" && isWhatsappTransientSocketState(reason)) {
        this.__seIgnoreNextDestroy = true;
        if (!this.__seTransientWatchdog) {
          this.__seTransientWatchdog = setTimeout(() => {
            this.__seTransientWatchdog = null;
            void confirmWhatsappTransientDisconnect(this, originalEmit, originalDestroy, reason);
          }, WHATSAPP_TRANSIENT_DISCONNECT_GRACE_MS);
          if (typeof this.__seTransientWatchdog.unref === "function") {
            this.__seTransientWatchdog.unref();
          }
        }
        logEvent("whatsapp", "ignoring transient socket disconnect", {
          userId: findWhatsappUserIdForClient(this),
          reason,
        });
        return true;
      }
    }
    return originalEmit.apply(this, [event, ...args]);
  };
  Client.prototype.destroy = async function patchedClientDestroy(...args) {
    if (this.__seIgnoreNextDestroy) {
      this.__seIgnoreNextDestroy = false;
      return;
    }
    return originalDestroy.apply(this, args);
  };

  const { WhatsWebURL } = require("whatsapp-web.js/src/util/Constants");

  Client.prototype.initWebVersionCache = async function initWebVersionCache() {
    const page = this.pupPage;
    if (!page) return;
    guardWhatsappPuppeteerPage(page, this.pupBrowser);

    try {
      const { type: webCacheType, ...webCacheOptions } = this.options.webVersionCache || { type: "local" };
      const requestedVersion = this.options.webVersion;
      const versionContent = await resolveCachedWhatsappWebHtml(
        requestedVersion,
        webCacheType,
        webCacheOptions
      );

      if (versionContent) {
        await page.setRequestInterception(true);
        page.on("request", async (req) => {
          try {
            if (req.url() === WhatsWebURL) {
              await req.respond({
                status: 200,
                contentType: "text/html",
                body: versionContent,
              });
              return;
            }
            await req.continue();
          } catch (error) {
            swallowWhatsappPuppeteerError(error, "request interception");
          }
        });
        return;
      }

      page.on("response", async (res) => {
        try {
          if (!res.ok() || res.url() !== WhatsWebURL) return;
          this.currentIndexHtml = await res.text();
        } catch (error) {
          swallowWhatsappPuppeteerError(error, "version cache response");
        }
      });
    } catch (error) {
      if (swallowWhatsappPuppeteerError(error, "version cache setup")) return;
      throw error;
    }
  };

  const originalInject = Client.prototype.inject;
  Client.prototype.inject = async function patchedInject(...args) {
    // WhatsApp Web fires inject() on every framenavigated. Concurrent injects
    // race Puppeteer exposeFunction and throw "onQRChangedEvent already exists".
    const run = async () => {
      if (this.pupPage) makeExposeFunctionIdempotent(this.pupPage);
      try {
        return await originalInject.apply(this, args);
      } catch (error) {
        if (
          isWhatsappPageBindingExistsError(error) ||
          isWhatsappTransientInjectError(error) ||
          swallowWhatsappPuppeteerError(error)
        ) {
          try {
            await reinjectWhatsappWebJsHelpers(this);
          } catch {
            // Helpers are restored again before the next send if this page is still alive.
          }
          return;
        }
        throw error;
      }
    };
    this.__seInjectChain = Promise.resolve(this.__seInjectChain).then(run, run);
    return this.__seInjectChain;
  };

  const originalSendMessage = Client.prototype.sendMessage;
  Client.prototype.sendMessage = async function patchedSendMessage(...args) {
    const helpersReady = await ensureWhatsappWebJsReady(this);
    if (!helpersReady) {
      throw new Error("WhatsApp web helpers are not injected.");
    }
    try {
      return await originalSendMessage.apply(this, args);
    } catch (error) {
      if (!isWhatsappWebJsMissingError(error)) throw error;
      const restored = await reinjectWhatsappWebJsHelpers(this);
      if (!restored) throw error;
      return await originalSendMessage.apply(this, args);
    }
  };

  const originalGetChatById = Client.prototype.getChatById;
  Client.prototype.getChatById = async function patchedGetChatById(...args) {
    await ensureWhatsappWebJsReady(this);
    try {
      return await originalGetChatById.apply(this, args);
    } catch (error) {
      if (!isWhatsappWebJsMissingError(error)) throw error;
      const restored = await reinjectWhatsappWebJsHelpers(this);
      if (!restored) throw error;
      return await originalGetChatById.apply(this, args);
    }
  };
}

patchWhatsappWebJsClient();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function enqueueWhatsappInit(task) {
  const run = whatsappInitChain.then(task);
  whatsappInitChain = run.catch(() => {});
  return run;
}

function isWhatsappReconnectQueueIdle() {
  return (
    !whatsappReconnectQueueRunning &&
    whatsappReconnectQueue.length === 0 &&
    !whatsappReconnectActiveUserId
  );
}

function notifyWhatsappReconnectQueueIdle() {
  if (!isWhatsappReconnectQueueIdle()) return;
  const waiters = whatsappReconnectQueueIdleWaiters.splice(0);
  for (const resolve of waiters) resolve();
}

function waitForWhatsappReconnectQueueIdle() {
  if (isWhatsappReconnectQueueIdle()) return Promise.resolve();
  return new Promise((resolve) => {
    whatsappReconnectQueueIdleWaiters.push(resolve);
  });
}

function hydrateWhatsappStateFromRegistrySync(userId) {
  const state = ensureWhatsappState(userId);
  const extra = restorableSessionsCache?.[String(userId || "").trim()];
  if (extra && typeof extra === "object") {
    if (!state.whatsappNumber) state.whatsappNumber = String(extra.whatsappNumber || "");
    if (!state.whatsappName) state.whatsappName = String(extra.whatsappName || "");
    if (!state.connectedAt) state.connectedAt = String(extra.connectedAt || "");
  }
  return state;
}

function markQueuedWhatsappReconnect(userId, silentReconnect = true) {
  const state = hydrateWhatsappStateFromRegistrySync(userId);
  if (state.manualStop) return state;
  const status = String(state.status || "");
  if (status === "disconnected" || status === "error" || status === "auth_failed" || !status) {
    state.status = silentReconnect !== false ? "reconnecting" : "connecting";
    state.silentReconnect = silentReconnect !== false;
    state.error = "";
    state.lastUpdatedAt = new Date().toISOString();
  }
  return state;
}

function isWhatsappReconnectJobPending(userId) {
  const id = String(userId || "").trim();
  if (!id) return false;
  return whatsappReconnectActiveUserId === id || whatsappReconnectQueuedIds.has(id);
}

function enqueueWhatsappReconnect(
  userId,
  { reason = "", silentReconnect = true, force = false } = {}
) {
  const id = String(userId || "").trim();
  if (!id || isWhatsappShuttingDown) return;
  if (whatsappReconnectActiveUserId === id) return;
  if (whatsappReconnectQueuedIds.has(id)) return;
  whatsappReconnectQueuedIds.add(id);
  markQueuedWhatsappReconnect(id, silentReconnect);
  whatsappReconnectQueue.push({
    userId: id,
    reason: String(reason || ""),
    silentReconnect: silentReconnect !== false,
    force: force === true,
  });
  logEvent("whatsapp", "queued reconnect", {
    userId: id,
    reason: String(reason || ""),
    position: whatsappReconnectQueue.length,
  });
  void processWhatsappReconnectQueue();
}

async function processWhatsappReconnectQueue() {
  if (whatsappReconnectQueueRunning) return;
  whatsappReconnectQueueRunning = true;
  try {
    while (whatsappReconnectQueue.length && !isWhatsappShuttingDown) {
      const job = whatsappReconnectQueue.shift();
      whatsappReconnectQueuedIds.delete(job.userId);
      await runQueuedWhatsappReconnect(job);
      if (whatsappReconnectQueue.length) {
        await delay(WHATSAPP_RECONNECT_QUEUE_GAP_MS);
      }
    }
  } finally {
    whatsappReconnectQueueRunning = false;
    if (whatsappReconnectQueue.length && !isWhatsappShuttingDown) {
      void processWhatsappReconnectQueue();
      return;
    }
    notifyWhatsappReconnectQueueIdle();
  }
}

async function runQueuedWhatsappReconnect(job) {
  const userId = String(job?.userId || "").trim();
  if (!userId) return "";
  const state = ensureWhatsappState(userId);
  if (state.manualStop) {
    console.log(`WhatsApp: reconnect queue skip ${userId} (disconnected by user)`);
    return String(state.status || "disconnected");
  }
  if (!job.force && state.status === "connected" && state.client && !state.initializing) {
    console.log(`WhatsApp: reconnect queue skip ${userId} (already connected)`);
    return "connected";
  }
  whatsappReconnectActiveUserId = userId;
  const waiting = whatsappReconnectQueue.length;
  console.log(
    `WhatsApp: reconnect queue trying ${userId}` +
      `${job.reason ? ` (${job.reason})` : ""} — 1 connection, ${waiting} waiting`
  );
  try {
    await startWhatsappSession(userId, {
      awaitInitialize: true,
      silentReconnect: job.silentReconnect !== false,
      force: true,
    });
    const status = String(ensureWhatsappState(userId).status || "reconnecting");
    if (status === "connected") {
      console.log(`WhatsApp: reconnect queue restored ${userId}`);
    } else {
      console.log(
        `WhatsApp: reconnect queue started ${userId} (${status}) — continuing in background`
      );
    }
    return status;
  } catch (error) {
    console.error(`WhatsApp: reconnect queue failed for ${userId}:`, error);
    return "error";
  } finally {
    const live = ensureWhatsappState(userId);
    const retryAfter = live.retryAfterCurrentTry === true;
    live.retryAfterCurrentTry = false;
    whatsappReconnectActiveUserId = "";
    if (
      retryAfter &&
      !whatsappBootRestoreActive &&
      !live.manualStop &&
      live.status !== "connected" &&
      live.status !== "authenticated"
    ) {
      enqueueWhatsappReconnect(userId, {
        reason: "qr-during-restore",
        silentReconnect: true,
        force: true,
      });
    }
  }
}

function withWhatsappSessionLock(userId, task) {
  const key = String(userId || "").trim();
  const previous = whatsappSessionRecoveryChains.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  whatsappSessionRecoveryChains.set(key, next.catch(() => {}));
  return next;
}

function isWhatsappSessionBusy(state) {
  if (!state) return false;
  if (state.initializing) return true;
  if (!state.client) return false;
  return WHATSAPP_BUSY_STATUSES.has(String(state.status || ""));
}

function markWhatsappInitializeFailed(state, userId, error) {
  clearWhatsappAuthenticatedTimeout(state);
  state.initializing = false;
  state.status = "error";
  state.readyAt = 0;
  state.error = String(error?.message || "Failed to initialize WhatsApp client.");
  state.lastUpdatedAt = new Date().toISOString();
  const staleClient = state.client;
  state.client = null;
  if (staleClient && typeof staleClient.destroy === "function") {
    staleClient.destroy().catch(() => {
      // Ignore cleanup failure after a failed initialize.
    });
  }
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId || state.manualStop) {
    if (cleanUserId) notifyWhatsappSessionDisconnected(cleanUserId);
    return;
  }
  scheduleSilentWhatsappReconnect(cleanUserId, { reason: "initialize_failed" });
}

async function resolveCounselor(userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const users = await readUsers();
  const matched = users.find((user) => String(user.id || "") === id);
  if (!matched) return null;
  if (!isWhatsappIntegratedStaffRole(matched.role)) return null;
  return matched;
}

async function isStaffWhatsappMessagingEnabled() {
  const systemData = await readSystemData();
  return systemData.adminChatEnabled === true;
}

async function isAdminWhatsappMessenger(userId) {
  const id = String(userId || "").trim();
  if (id !== ADMIN_WHATSAPP_USER_ID) return false;
  return isStaffWhatsappMessagingEnabled();
}

async function resolveStaffWhatsappMessenger(userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const systemData = await readSystemData();
  const adminChatEnabled = systemData.adminChatEnabled === true;
  const branchWhatsappEnabled = systemData.branchWhatsappEnabled === true;
  if (id === ADMIN_WHATSAPP_USER_ID) {
    if (!adminChatEnabled && !branchWhatsappEnabled) return null;
    return { id: ADMIN_WHATSAPP_USER_ID, role: "Admin" };
  }
  const users = await readUsers();
  const matched = users.find((user) => String(user.id || "") === id);
  if (!matched) return null;
  const role = String(matched.role || "").trim();
  if (!STAFF_WHATSAPP_ROLES.has(role)) return null;
  if (role === "Manager" || role === "Team Lead") {
    if (adminChatEnabled || branchWhatsappEnabled) {
      return { id, role };
    }
    return null;
  }
  if (!adminChatEnabled) return null;
  return { id, role };
}

async function resolveWhatsappMessenger(userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const staffMessenger = await resolveStaffWhatsappMessenger(id);
  if (staffMessenger) return staffMessenger;
  return resolveCounselor(userId);
}

async function enrichBranchWhatsappIntegrationContext(userId, context) {
  return context;
}

async function resolveWhatsappIntegrationContextForUser(userId) {
  return resolveWhatsappIntegrationContext(userId);
}

async function prepareBranchWhatsappConnect(userId) {
  const actor = await resolveUserRecord(userId);
  if (!actor) {
    return { ok: false, error: "WhatsApp account not found." };
  }
  if (!(await isBranchWhatsappEnabled())) {
    return { ok: true };
  }
  if (!isBranchWhatsappManagerRole(actor.role)) {
    return { ok: true };
  }
  const branch = await resolveBranchForUser(actor);
  if (!branch?.id) {
    return { ok: true };
  }
  if (await isBranchWhatsappSharedEnabled()) {
    await ensureSharedBranchMessenger(branch, userId);
    return { ok: true, branch };
  }
  const storedId = String(branch?.whatsappMessengerUserId || "").trim();
  if (!storedId) {
    await setBranchWhatsappMessenger(branch.id, userId);
  }
  return { ok: true, branch };
}

function sanitizeUserIdForPath(userId) {
  return String(userId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

function resolveWhatsappSessionDataDir(userId) {
  const safeUserId = sanitizeUserIdForPath(userId);
  return path.join(
    WHATSAPP_CONNECTIONS_DIR,
    safeUserId,
    `session-${safeUserId}`
  );
}

async function readRestorableWhatsappSessions() {
  if (restorableSessionsCache) return restorableSessionsCache;
  try {
    const raw = await fs.readFile(RESTORABLE_SESSIONS_FILE, "utf8");
    const parsed = safeJsonParse(raw, RESTORABLE_SESSIONS_FILE);
    restorableSessionsCache =
      parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (!(error && error.code === "ENOENT")) {
      console.warn("Failed to read restorable WhatsApp sessions:", error);
    }
    restorableSessionsCache = {};
  }
  return restorableSessionsCache;
}

async function writeRestorableWhatsappSessions(data) {
  restorableSessionsCache = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  await withFileLock(RESTORABLE_SESSIONS_FILE, async () => {
    await atomicWriteFile(RESTORABLE_SESSIONS_FILE, JSON.stringify(restorableSessionsCache, null, 2));
  });
}

async function rememberRestorableWhatsappSession(userId, extra = {}) {
  const id = String(userId || "").trim();
  if (!id) return;
  const current = { ...(await readRestorableWhatsappSessions()) };
  const previous = current[id] && typeof current[id] === "object" ? current[id] : {};
  current[id] = {
    userId: id,
    connectedAt: extra.connectedAt || previous.connectedAt || new Date().toISOString(),
    whatsappNumber: extra.whatsappNumber || previous.whatsappNumber || "",
    whatsappName: extra.whatsappName || previous.whatsappName || "",
  };
  await writeRestorableWhatsappSessions(current);
}

async function forgetRestorableWhatsappSession(userId) {
  const id = String(userId || "").trim();
  if (!id) return;
  const current = { ...(await readRestorableWhatsappSessions()) };
  if (!current[id]) return;
  delete current[id];
  await writeRestorableWhatsappSessions(current);
}

function listBrowserProcessIdsForProfile(profileDir) {
  if (!profileDir) return [];
  try {
    const output = String(
      execFileSync("ps", ["-ax", "-o", "pid=", "-o", "command="], {
        encoding: "utf8",
      }) || ""
    );
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(.*)$/);
        if (!match) return null;
        const pid = Number.parseInt(match[1], 10);
        const command = match[2] || "";
        if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) {
          return null;
        }
        const usesProfileDir = command.includes(profileDir);
        const isBrowserProcess = /(chrom(e|ium)|headless)/i.test(command);
        if (!usesProfileDir || !isBrowserProcess) return null;
        return pid;
      })
      .filter((pid) => Number.isInteger(pid));
  } catch {
    return [];
  }
}

async function terminateBrowserProcessesUsingProfile(profileDir) {
  const initialPids = listBrowserProcessIdsForProfile(profileDir);
  if (!initialPids.length) {
    await removeStaleBrowserLockFiles(profileDir);
    return false;
  }
  for (const pid of initialPids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Process may already be gone.
    }
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const remaining = listBrowserProcessIdsForProfile(profileDir);
    if (!remaining.length) break;
    await delay(200);
  }
  for (const pid of listBrowserProcessIdsForProfile(profileDir)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process may already be gone.
    }
  }
  await removeStaleBrowserLockFiles(profileDir);
  return true;
}

async function removeStaleBrowserLockFiles(profileDir) {
  if (!profileDir) return;
  const lockNames = ["SingletonLock", "SingletonSocket", "SingletonCookie"];
  for (const name of lockNames) {
    try {
      await fs.unlink(path.join(profileDir, name));
    } catch {
      // File may not exist.
    }
  }
}

function ensureWhatsappState(userId) {
  const key = String(userId || "").trim();
  const existing = whatsappSessions.get(key);
  if (existing) return existing;
  const created = {
    status: "disconnected",
    qrCodeDataUrl: "",
    error: "",
    connectedAt: "",
    whatsappName: "",
    whatsappNumber: "",
    whatsappProfilePicUrl: "",
    lastUpdatedAt: new Date().toISOString(),
    client: null,
    authenticatedTimeout: null,
    authTimedOut: false,
    manualStop: false,
    recovering: false,
    silentReconnect: false,
    reconnectAttempts: 0,
    reconnectTimer: null,
    sessionGeneration: 0,
    readyAt: 0,
    initializing: false,
    sawQrDuringSilentRestore: false,
    retryAfterCurrentTry: false,
    lastQr: "",
    silentQrFallbackTimer: null,
    healthFailStreak: 0,
    lastHealth: null,
  };
  whatsappSessions.set(key, created);
  return created;
}

function clearWhatsappAuthenticatedTimeout(state) {
  if (!state || !state.authenticatedTimeout) return;
  clearTimeout(state.authenticatedTimeout);
  state.authenticatedTimeout = null;
}

function clearWhatsappReconnectTimer(state) {
  if (!state || !state.reconnectTimer) return;
  clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
}

function clearSilentQrFallbackTimer(state) {
  if (!state || !state.silentQrFallbackTimer) return;
  clearTimeout(state.silentQrFallbackTimer);
  state.silentQrFallbackTimer = null;
}

async function applyWhatsappQrCode(state, qr) {
  const payload = String(qr || state?.lastQr || "").trim();
  if (!state || !payload) return false;
  clearSilentQrFallbackTimer(state);
  state.silentReconnect = false;
  state.sawQrDuringSilentRestore = false;
  state.lastQr = payload;
  try {
    state.qrCodeDataUrl = await QRCode.toDataURL(payload);
    state.status = "awaiting_qr_scan";
    state.error = "";
    state.authTimedOut = false;
    clearWhatsappAuthenticatedTimeout(state);
    state.lastUpdatedAt = new Date().toISOString();
    return true;
  } catch {
    state.error = "Failed to render WhatsApp QR code.";
    state.lastUpdatedAt = new Date().toISOString();
    return false;
  }
}

function scheduleSilentQrFallback(state, client, userId) {
  if (!state || state.silentQrFallbackTimer) return;
  state.silentQrFallbackTimer = setTimeout(() => {
    state.silentQrFallbackTimer = null;
    void revealSilentRestoreQr(state, client, userId);
  }, WHATSAPP_SILENT_QR_GRACE_MS);
  if (typeof state.silentQrFallbackTimer.unref === "function") {
    state.silentQrFallbackTimer.unref();
  }
}

async function revealSilentRestoreQr(state, client, userId) {
  if (!isCurrentWhatsappClient(state, client)) return;
  if (state.manualStop || isWhatsappShuttingDown) return;
  if (state.status === "connected" || state.status === "authenticated") return;
  logEvent("whatsapp", "saved session needs QR scan", { userId: String(userId || "").trim() });
  const shown = await applyWhatsappQrCode(state, state.lastQr);
  if (shown) return;
  state.silentReconnect = false;
  if (!state.manualStop && !isWhatsappShuttingDown) {
    enqueueWhatsappReconnect(String(userId || "").trim(), {
      reason: "silent-qr-missing",
      silentReconnect: false,
      force: true,
    });
  }
}

function isWhatsappLogoutDisconnectReason(reason) {
  return WHATSAPP_LOGOUT_REASON_RE.test(String(reason || ""));
}

function isCurrentWhatsappClient(state, client) {
  return Boolean(state && client && state.client === client);
}

async function finishSilentRestoreIfQr(state, client, userId, reason) {
  if (!state?.sawQrDuringSilentRestore) return;
  if (state.status === "connected" || state.status === "authenticated") {
    state.sawQrDuringSilentRestore = false;
    return;
  }
  if (client && state.client && state.client !== client) return;
  state.sawQrDuringSilentRestore = false;
  const staleClient = state.client || client;
  state.client = null;
  state.status = "reconnecting";
  state.qrCodeDataUrl = "";
  state.error = "";
  state.lastUpdatedAt = new Date().toISOString();
  try {
    if (staleClient && typeof staleClient.destroy === "function") {
      await staleClient.destroy();
    }
  } catch {
    // Page may already be closed after a QR-during-restore.
  }
  await delay(400);
  if (state.manualStop || isWhatsappShuttingDown) return;
  state.retryAfterCurrentTry = true;
  scheduleSilentWhatsappReconnect(userId, { reason: reason || "qr-during-restore" });
}

function scheduleSilentWhatsappReconnect(userId, { reason = "", force = false } = {}) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId || isWhatsappShuttingDown) return;
  const state = ensureWhatsappState(cleanUserId);
  if (state.manualStop) return;
  if (state.status === "awaiting_qr_scan") return;
  if (!force && state.initializing) return;
  if (!force && (state.status === "connected" || state.status === "authenticated")) {
    return;
  }
  if (
    !force &&
    state.client &&
    (state.status === "reconnecting" || state.status === "connecting")
  ) {
    return;
  }
  if (whatsappReconnectActiveUserId === cleanUserId) return;
  if (whatsappReconnectQueuedIds.has(cleanUserId)) return;
  // During the boot pass, each account gets one queued try. Failed accounts
  // are retried later by the health check so the queue can move to the next.
  if (whatsappBootRestoreActive) {
    logEvent("whatsapp", "deferring silent reconnect during boot queue", {
      userId: cleanUserId,
      reason: String(reason || ""),
    });
    return;
  }
  const exhausted = state.reconnectAttempts >= WHATSAPP_SILENT_RECONNECT_MAX_ATTEMPTS;
  if (exhausted) {
    logEvent("whatsapp", "silent reconnect exhausted; showing QR", {
      userId: cleanUserId,
      reason: String(reason || ""),
    });
    state.silentReconnect = false;
    state.reconnectAttempts = 0;
    state.status = "connecting";
    state.error = "Saved session could not be restored. Scan the QR code to reconnect.";
    state.lastUpdatedAt = new Date().toISOString();
    enqueueWhatsappReconnect(cleanUserId, {
      reason: reason || "silent-exhausted",
      silentReconnect: false,
      force: true,
    });
    return;
  }
  const attempt = state.reconnectAttempts + 1;
  state.reconnectAttempts = attempt;
  state.status = "reconnecting";
  state.error = "";
  state.lastUpdatedAt = new Date().toISOString();
  clearWhatsappReconnectTimer(state);
  const delayMs = Math.min(WHATSAPP_SILENT_RECONNECT_BASE_MS * 2 ** (attempt - 1), 30 * 1000);
  logEvent("whatsapp", "scheduling silent reconnect", {
    userId: cleanUserId,
    attempt,
    delayMs,
    reason: String(reason || ""),
  });
  state.reconnectTimer = setTimeout(() => {
    if (isWhatsappShuttingDown) return;
    const current = ensureWhatsappState(cleanUserId);
    if (current.manualStop || current.status === "connected") return;
    enqueueWhatsappReconnect(cleanUserId, {
      reason: reason || "silent",
      silentReconnect: true,
      force: true,
    });
  }, delayMs);
  if (typeof state.reconnectTimer.unref === "function") state.reconnectTimer.unref();
}

function markWhatsappAuthenticatedTimeout(state, userId = "") {
  if (!state || state.status !== "authenticated") return;
  state.authTimedOut = true;
  state.status = "error";
  state.readyAt = 0;
  state.error = "WhatsApp sign-in timed out after QR scan. Please connect again to generate a fresh QR code.";
  state.qrCodeDataUrl = "";
  state.lastUpdatedAt = new Date().toISOString();
  clearWhatsappAuthenticatedTimeout(state);
  const staleClient = state.client;
  state.client = null;
  if (staleClient && typeof staleClient.destroy === "function") {
    staleClient.destroy().catch(() => {
      // Ignore cleanup failure; the timed-out client has already been detached.
    });
  }
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return;
  userHasSavedWhatsappSession(cleanUserId)
    .then((hasSaved) => {
      if (hasSaved) {
        logEvent("whatsapp", "authenticated session stuck; restarting browser", { userId: cleanUserId });
        scheduleSilentWhatsappReconnect(cleanUserId, { reason: "authenticated-stuck" });
        return;
      }
      scheduleWhatsappAuthTimeoutRecovery(cleanUserId);
    })
    .catch(() => {
      scheduleSilentWhatsappReconnect(cleanUserId, { reason: "authenticated-stuck" });
    });
}

function scheduleWhatsappAuthenticatedTimeout(state, userId = "") {
  clearWhatsappAuthenticatedTimeout(state);
  const timeoutMs = whatsappBootRestoreActive
    ? WHATSAPP_BOOT_AUTH_TIMEOUT_MS
    : AUTHENTICATED_STUCK_TIMEOUT_MS;
  state.authenticatedTimeout = setTimeout(() => {
    markWhatsappAuthenticatedTimeout(state, userId);
  }, timeoutMs);
  if (typeof state.authenticatedTimeout.unref === "function") {
    state.authenticatedTimeout.unref();
  }
}

function snapshotWhatsappState(userId) {
  const state = ensureWhatsappState(userId);
  const health = summarizeWhatsappHealth(state);
  const id = String(userId || "").trim();
  let status = String(state.status || "disconnected");
  if (
    !state.manualStop &&
    (status === "disconnected" || status === "error") &&
    isWhatsappReconnectJobPending(id)
  ) {
    status = "reconnecting";
  }
  return {
    userId: id,
    status,
    qrCodeDataUrl: state.qrCodeDataUrl,
    error: state.error,
    connectedAt: state.connectedAt,
    whatsappName: state.whatsappName,
    whatsappNumber: state.whatsappNumber,
    whatsappProfilePicUrl: state.whatsappProfilePicUrl,
    lastUpdatedAt: state.lastUpdatedAt,
    healthScore: health.score,
    healthLabel: health.label,
    healthVerdict: health.verdict,
    waState: health.waState,
    healthCheckedAt: health.checkedAt,
  };
}

async function startWhatsappSession(
  userId,
  {
    awaitInitialize = false,
    initAttempt = 1,
    silentReconnect = false,
    alreadyLocked = false,
    force = false,
  } = {}
) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) throw new Error("Counselor user id is required.");
  if (!alreadyLocked) {
    return withWhatsappSessionLock(cleanUserId, () =>
      startWhatsappSession(cleanUserId, {
        awaitInitialize,
        initAttempt,
        silentReconnect,
        alreadyLocked: true,
        force,
      })
    );
  }
  const state = ensureWhatsappState(cleanUserId);
  if (!force && initAttempt === 1 && isWhatsappSessionBusy(state)) {
    return snapshotWhatsappState(cleanUserId);
  }
  state.manualStop = false;
  state.recovering = true;
  state.initializing = true;
  clearWhatsappReconnectTimer(state);
  clearSilentQrFallbackTimer(state);
  state.lastQr = "";
  const hadClient = Boolean(state.client);
  if (state.client) {
    try {
      await state.client.destroy();
    } catch {
      // Ignore cleanup failure and allow creating a fresh session.
    }
    state.client = null;
  }
  const sessionDataDir = resolveWhatsappSessionDataDir(cleanUserId);
  const killedOrphaned = await terminateBrowserProcessesUsingProfile(sessionDataDir);
  if (hadClient || initAttempt > 1) {
    await delay(WHATSAPP_BROWSER_RESTART_PAUSE_MS);
  } else if (killedOrphaned) {
    await delay(WHATSAPP_BROWSER_ORPHAN_PAUSE_MS);
  }
  await fs.mkdir(path.join(WHATSAPP_CONNECTIONS_DIR, sanitizeUserIdForPath(cleanUserId)), { recursive: true });
  let client;
  try {
    const webVersion = await resolveWhatsappWebVersion();
    client = new Client(buildWhatsappClientOptions(cleanUserId, webVersion));
  } catch (error) {
    state.initializing = false;
    state.recovering = false;
    throw error;
  }
  state.sessionGeneration = Number(state.sessionGeneration || 0) + 1;
  state.client = client;
  state.recovering = false;
  state.silentReconnect = silentReconnect === true;
  state.sawQrDuringSilentRestore = false;
  state.retryAfterCurrentTry = false;
  state.status = silentReconnect ? "reconnecting" : "connecting";
  state.qrCodeDataUrl = "";
  state.error = "";
  state.readyAt = 0;
  if (!silentReconnect) {
    state.connectedAt = "";
    state.whatsappName = "";
    state.whatsappNumber = "";
    state.whatsappProfilePicUrl = "";
    state.reconnectAttempts = 0;
  }
  state.authTimedOut = false;
  clearWhatsappAuthenticatedTimeout(state);
  state.lastUpdatedAt = new Date().toISOString();

  client.on("qr", async (qr) => {
    if (!isCurrentWhatsappClient(state, client)) return;
    state.lastQr = String(qr || "");
    // A WhatsApp Web reload after send can briefly look unpaired and emit a QR
    // even though the saved session is still valid. Keep the connected UI.
    if (state.silentReconnect || state.status === "connected") {
      logEvent(
        "whatsapp",
        state.status === "connected"
          ? "qr during connected session; waiting for saved session"
          : "qr during silent restore; waiting for saved session",
        { userId: cleanUserId }
      );
      clearWhatsappAuthenticatedTimeout(state);
      if (state.status !== "connected") {
        state.status = "reconnecting";
        state.qrCodeDataUrl = "";
        state.error = "";
        state.lastUpdatedAt = new Date().toISOString();
      }
      state.sawQrDuringSilentRestore = true;
      scheduleSilentQrFallback(state, client, cleanUserId);
      return;
    }
    await applyWhatsappQrCode(state, qr);
  });

  client.on("authenticated", () => {
    if (!isCurrentWhatsappClient(state, client)) return;
    clearSilentQrFallbackTimer(state);
    state.sawQrDuringSilentRestore = false;
    state.lastQr = "";
    state.error = "";
    state.authTimedOut = false;
    // Re-inject after a WhatsApp Web reload emits authenticated again.
    // Stay connected so the Integrations page does not flash "Linking".
    if (state.status !== "connected") {
      state.status = "authenticated";
      scheduleWhatsappAuthenticatedTimeout(state, cleanUserId);
    }
    state.lastUpdatedAt = new Date().toISOString();
  });

  client.on("ready", async () => {
    if (!isCurrentWhatsappClient(state, client)) return;
    clearSilentQrFallbackTimer(state);
    clearWhatsappAuthenticatedTimeout(state);
    const info = client.info || {};
    const widSerialized =
      (info.wid && (info.wid._serialized || info.wid.user)) || "";
    const numberFromWid =
      (info.wid && info.wid.user) || String(widSerialized).split("@")[0] || "";
    let profilePicUrl = "";
    if (widSerialized) {
      try {
        profilePicUrl = String((await client.getProfilePicUrl(widSerialized)) || "");
      } catch {
        profilePicUrl = "";
      }
    }
    state.status = "connected";
    state.initializing = false;
    state.qrCodeDataUrl = "";
    state.error = "";
    state.readyAt = Date.now();
    state.connectedAt = new Date().toISOString();
    state.whatsappName = String(info.pushname || info.platform || "WhatsApp User");
    state.whatsappNumber = String(numberFromWid || "");
    state.whatsappProfilePicUrl = profilePicUrl;
    state.authTimedOut = false;
    state.silentReconnect = false;
    state.reconnectAttempts = 0;
    state.sawQrDuringSilentRestore = false;
    state.lastQr = "";
    state.healthFailStreak = 0;
    state.lastUpdatedAt = new Date().toISOString();
    rememberWhatsappHealth(state, { verdict: "healthy", waState: "CONNECTED" });
    installWhatsappWebCompatPatch(client).catch(() => {
      // Compat patch is best-effort; send path still resolves chat IDs.
    });
    onWhatsappSessionReady(cleanUserId).catch(() => {
      // Branch linkage is best-effort; session remains connected.
    });
    rememberRestorableWhatsappSession(cleanUserId, {
      connectedAt: state.connectedAt,
      whatsappNumber: state.whatsappNumber,
      whatsappName: state.whatsappName,
    }).catch((error) => {
      console.warn(`Failed to persist restorable WhatsApp session for ${cleanUserId}:`, error);
    });
  });

  client.on("auth_failure", (message) => {
    if (!isCurrentWhatsappClient(state, client)) return;
    clearWhatsappAuthenticatedTimeout(state);
    const reason = String(message || "WhatsApp authentication failed.");
    state.status = "auth_failed";
    state.error = reason;
    state.lastUpdatedAt = new Date().toISOString();
    if (state.manualStop || isWhatsappLogoutDisconnectReason(reason)) {
      forgetRestorableWhatsappSession(cleanUserId).catch(() => {});
      notifyWhatsappSessionDisconnected(cleanUserId);
      return;
    }
    scheduleSilentWhatsappReconnect(cleanUserId, { reason: "auth_failure" });
  });

  client.on("change_state", (nextState) => {
    if (!isCurrentWhatsappClient(state, client)) return;
    if (String(nextState || "") !== "DEPRECATED_VERSION") return;
    clearWhatsappAuthenticatedTimeout(state);
    logEvent("whatsapp", "web version outdated; refreshing and reconnecting", {
      userId: cleanUserId,
    });
    invalidateWhatsappWebVersionCache();
    state.status = "reconnecting";
    state.error = "";
    state.qrCodeDataUrl = "";
    state.lastUpdatedAt = new Date().toISOString();
    state.recovering = true;
    const staleClient = state.client;
    state.client = null;
    Promise.resolve()
      .then(() => (staleClient && typeof staleClient.destroy === "function" ? staleClient.destroy() : undefined))
      .catch(() => {
        // Ignore cleanup failure; silent reconnect will start a fresh client.
      })
      .finally(() => {
        if (state.manualStop || isWhatsappShuttingDown) {
          state.recovering = false;
          return;
        }
        state.recovering = false;
        scheduleSilentWhatsappReconnect(cleanUserId, { reason: "deprecated_version" });
      });
  });

  client.on("disconnected", (reason) => {
    if (!isCurrentWhatsappClient(state, client)) return;
    if (isWhatsappShuttingDown || state.manualStop || state.recovering) return;
    clearWhatsappAuthenticatedTimeout(state);
    const reasonText = String(reason || "");
    const reasonKey = reasonText.toUpperCase();
    if (
      isWhatsappTransientSocketState(reasonKey) &&
      isWhatsappPuppeteerPageOpen(state) &&
      !state.manualStop &&
      !client.__seTransientDisconnectConfirmed
    ) {
      logEvent("whatsapp", "keeping session through transient web reload", {
        userId: cleanUserId,
        reason: reasonText,
      });
      return;
    }
    const loggedOut = isWhatsappLogoutDisconnectReason(reasonText);
    state.qrCodeDataUrl = "";
    if (state.authTimedOut) {
      state.status = "error";
      state.lastUpdatedAt = new Date().toISOString();
      return;
    }
    if (loggedOut) {
      state.status = "disconnected";
      state.connectedAt = "";
      state.readyAt = 0;
      state.error = "";
      state.lastUpdatedAt = new Date().toISOString();
      forgetRestorableWhatsappSession(cleanUserId).catch(() => {});
      notifyWhatsappSessionDisconnected(cleanUserId);
      return;
    }
    state.status = "reconnecting";
    state.readyAt = 0;
    state.error = "";
    state.lastUpdatedAt = new Date().toISOString();
    scheduleSilentWhatsappReconnect(cleanUserId, { reason: reasonText || "disconnected" });
  });

  const handleIncomingMessage = async (message) => {
    try {
      await persistIncomingWhatsappMessage({ counselorId: cleanUserId, message });
    } catch (error) {
      console.error("Failed to persist incoming WhatsApp message:", error);
    }
  };

  // "message" is enough for inbound messages; keeping both causes duplicate logs.
  client.on("message", handleIncomingMessage);

  const initPromise = enqueueWhatsappInit(async () => {
    await client.initialize();
  })
    .then(async () => {
      if (!isCurrentWhatsappClient(state, client) && !state.sawQrDuringSilentRestore) return;
      if (state.status === "connected" || state.status === "authenticated") return;
      if (state.sawQrDuringSilentRestore) {
        scheduleSilentQrFallback(state, client, cleanUserId);
      }
    })
    .catch(async (error) => {
      if (!isCurrentWhatsappClient(state, client)) return;
      const canRetry =
        initAttempt < WHATSAPP_INIT_MAX_ATTEMPTS && isWhatsappPuppeteerStaleSessionError(error);
      if (canRetry) {
        console.warn(
          `WhatsApp init retry ${initAttempt}/${WHATSAPP_INIT_MAX_ATTEMPTS - 1} for ${cleanUserId}: ${String(error?.message || error)}`
        );
        try {
          await client.destroy();
        } catch {
          // Client may already be partially torn down.
        }
        state.client = null;
        await delay(1500 * initAttempt);
        return startWhatsappSession(cleanUserId, {
          awaitInitialize,
          initAttempt: initAttempt + 1,
          silentReconnect,
          alreadyLocked: true,
          force: true,
        });
      }
      markWhatsappInitializeFailed(state, cleanUserId, error);
    })
    .finally(() => {
      if (state.client === client || state.client == null) {
        state.initializing = false;
      }
    });

  if (awaitInitialize) {
    await initPromise;
  }

  return snapshotWhatsappState(cleanUserId);
}

async function stopWhatsappSession(userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return snapshotWhatsappState(cleanUserId);
  const state = ensureWhatsappState(cleanUserId);
  state.manualStop = true;
  state.silentReconnect = false;
  state.reconnectAttempts = 0;
  state.initializing = false;
  clearWhatsappReconnectTimer(state);
  clearSilentQrFallbackTimer(state);
  state.lastQr = "";
  if (state.client) {
    try {
      await state.client.destroy();
    } catch {
      // Ignore cleanup failure and clear in-memory state anyway.
    }
  }
  clearWhatsappAuthenticatedTimeout(state);
  state.client = null;
  state.status = "disconnected";
  state.qrCodeDataUrl = "";
  state.error = "";
  state.connectedAt = "";
  state.readyAt = 0;
  state.whatsappName = "";
  state.whatsappNumber = "";
  state.whatsappProfilePicUrl = "";
  state.authTimedOut = false;
  state.lastUpdatedAt = new Date().toISOString();
  const userConnectionDir = path.join(WHATSAPP_CONNECTIONS_DIR, sanitizeUserIdForPath(cleanUserId));
  try {
    const entries = await fs.readdir(userConnectionDir);
    await Promise.all(
      entries.map((entry) =>
        fs.rm(path.join(userConnectionDir, entry), {
          recursive: true,
          force: true,
        })
      )
    );
  } catch (error) {
    if (!(error && error.code === "ENOENT")) {
      throw error;
    }
  }
  onWhatsappSessionDisconnected(cleanUserId).catch(() => {
    // Branch unlink is best-effort.
  });
  forgetRestorableWhatsappSession(cleanUserId).catch(() => {});
  return snapshotWhatsappState(cleanUserId);
}

async function regenerateWhatsappQrCode(userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) throw new Error("Counselor user id is required.");
  const state = ensureWhatsappState(cleanUserId);
  const status = String(state.status || "");
  if (status === "connected" || status === "authenticated") {
    throw new Error("Cannot regenerate QR while WhatsApp is connected.");
  }
  if (state.client) {
    try {
      await state.client.destroy();
    } catch {
      // Ignore cleanup failure and allow creating a fresh session.
    }
  }
  clearWhatsappAuthenticatedTimeout(state);
  clearWhatsappReconnectTimer(state);
  clearSilentQrFallbackTimer(state);
  state.client = null;
  state.status = "disconnected";
  state.qrCodeDataUrl = "";
  state.error = "";
  state.authTimedOut = false;
  state.readyAt = 0;
  state.manualStop = false;
  state.silentReconnect = false;
  state.reconnectAttempts = 0;
  state.initializing = false;
  state.lastQr = "";
  state.lastUpdatedAt = new Date().toISOString();
  const sessionDataDir = resolveWhatsappSessionDataDir(cleanUserId);
  await terminateBrowserProcessesUsingProfile(sessionDataDir);
  return startWhatsappSession(cleanUserId);
}

async function userHasSavedWhatsappSession(userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return false;
  const sessionDir = resolveWhatsappSessionDataDir(cleanUserId);
  try {
    const entries = await fs.readdir(sessionDir);
    return entries.length > 0;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

function resolveUserIdFromSessionFolder(folderId, users = []) {
  const safeFolderId = sanitizeUserIdForPath(folderId);
  if (!safeFolderId) return "";
  const match = (Array.isArray(users) ? users : []).find(
    (user) => sanitizeUserIdForPath(user?.id) === safeFolderId
  );
  if (match) return String(match.id || "").trim();
  if (safeFolderId === sanitizeUserIdForPath(ADMIN_WHATSAPP_USER_ID)) {
    return ADMIN_WHATSAPP_USER_ID;
  }
  return safeFolderId;
}

async function listSavedWhatsappSessionUserIds(users = []) {
  let entries = [];
  try {
    entries = await fs.readdir(WHATSAPP_CONNECTIONS_DIR, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
  const userIds = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const userId = resolveUserIdFromSessionFolder(entry.name, users);
    if (!userId || seen.has(userId)) continue;
    if (!(await userHasSavedWhatsappSession(userId))) continue;
    seen.add(userId);
    userIds.push(userId);
  }
  return userIds;
}

async function listRestorableWhatsappSessionUserIds(users = []) {
  const saved = await listSavedWhatsappSessionUserIds(users);
  const registry = await readRestorableWhatsappSessions();
  const registered = Object.keys(registry || {})
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  const userIds = [];
  const seen = new Set();
  for (const userId of [...registered, ...saved]) {
    if (!userId || seen.has(userId)) continue;
    if (!(await userHasSavedWhatsappSession(userId))) continue;
    seen.add(userId);
    userIds.push(userId);
  }
  return userIds;
}

async function startSavedWhatsappSessionIfExists(userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return;
  const hasSavedSession = await userHasSavedWhatsappSession(cleanUserId);
  if (!hasSavedSession) return;
  try {
    await startWhatsappSession(cleanUserId, { awaitInitialize: true, silentReconnect: true });
  } catch (error) {
    console.error(`Failed to restore WhatsApp session for ${cleanUserId}:`, error);
  }
}

async function waitForStartupWhatsappSession(userId) {
  const cleanUserId = String(userId || "").trim();
  let readyWaitStarted = 0;
  while (true) {
    const state = ensureWhatsappState(cleanUserId);
    if (state.status === "connected") return "connected";
    if (state.status === "awaiting_qr_scan" && !state.silentReconnect) return "awaiting_qr_scan";
    if (state.manualStop) return String(state.status || "disconnected");
    if (state.initializing) {
      await delay(250);
      continue;
    }
    if (!state.client) {
      return String(state.status || "reconnecting");
    }
    if (!readyWaitStarted) readyWaitStarted = Date.now();
    const limit =
      state.status === "authenticated"
        ? WHATSAPP_STARTUP_AUTHENTICATED_WAIT_MS
        : WHATSAPP_STARTUP_READY_TIMEOUT_MS;
    if (Date.now() - readyWaitStarted >= limit) break;
    await delay(250);
  }
  const timedOut = ensureWhatsappState(cleanUserId);
  if (timedOut.status === "connected") return "connected";
  if (timedOut.status === "awaiting_qr_scan" && !timedOut.silentReconnect) return "awaiting_qr_scan";
  if (timedOut.status === "authenticated") {
    // Keep the browser running; the authenticated-stuck timer restarts it.
    return "authenticated";
  }
  if (!timedOut.manualStop && !timedOut.client) {
    scheduleSilentWhatsappReconnect(cleanUserId, { reason: "startup-wait-timeout" });
  }
  return String(timedOut.status || "reconnecting");
}

async function initializeWhatsappSessionsOnStartup() {
  whatsappBootRestoreActive = true;
  let userIds = [];
  try {
    const users = await readUsers();
    await readRestorableWhatsappSessions();
    userIds = await listRestorableWhatsappSessionUserIds(users);
    if (!userIds.length) {
      console.log("WhatsApp: no saved sessions found to restore on boot.");
      await syncBranchWhatsappMessengersFromSessions();
      return;
    }

    console.log(
      `WhatsApp: queuing ${userIds.length} saved session(s) for sequential reconnect (one account at a time)...`
    );
    for (const userId of userIds) {
      enqueueWhatsappReconnect(userId, {
        reason: "server-boot",
        silentReconnect: true,
        force: true,
      });
    }
    await waitForWhatsappReconnectQueueIdle();

    const results = await Promise.all(
      userIds.map(async (userId) => {
        const status = await waitForStartupWhatsappSession(userId);
        if (status === "connected") {
          console.log(`WhatsApp: restored ${userId}`);
        } else if (status === "awaiting_qr_scan") {
          console.warn(`WhatsApp: ${userId} needs a QR scan after restart`);
        } else if (status === "authenticated") {
          console.warn(`WhatsApp: ${userId} is authenticated after restart — waiting for ready`);
        } else {
          console.warn(
            `WhatsApp: ${userId} is ${status} after restart — retrying saved session in the background`
          );
        }
        return { userId, status };
      })
    );

    const connectedCount = results.filter((row) => row.status === "connected").length;
    console.log(
      `WhatsApp: ${connectedCount}/${userIds.length} saved session(s) connected after boot.`
    );
    await syncBranchWhatsappMessengersFromSessions();
  } catch (error) {
    console.error("Failed to initialize WhatsApp sessions on startup:", error);
  } finally {
    whatsappBootRestoreActive = false;
  }

  for (const userId of userIds) {
    const state = ensureWhatsappState(userId);
    if (state.manualStop) continue;
    const status = String(state.status || "");
    if (status === "connected" || status === "authenticated" || status === "awaiting_qr_scan") {
      continue;
    }
    if (state.initializing || isWhatsappReconnectJobPending(userId)) continue;
    enqueueWhatsappReconnect(userId, {
      reason: "boot-followup",
      silentReconnect: true,
      force: true,
    });
  }
}

async function shutdownWhatsappSessions() {
  isWhatsappShuttingDown = true;
  whatsappReconnectQueue.length = 0;
  whatsappReconnectQueuedIds.clear();
  whatsappReconnectActiveUserId = "";
  notifyWhatsappReconnectQueueIdle();
  for (const [, state] of whatsappSessions.entries()) {
    state.manualStop = true;
    clearWhatsappAuthenticatedTimeout(state);
    clearWhatsappReconnectTimer(state);
    if (!state.client) continue;
    try {
      await state.client.destroy();
    } catch {
      // Browser may already be gone during process shutdown.
    }
    state.client = null;
  }
}

async function reconnectActiveWhatsappSessions() {
  for (const [userId, state] of whatsappSessions.entries()) {
    const status = String(state?.status || "");
    if (
      status !== "connected" &&
      status !== "authenticated" &&
      status !== "awaiting_qr_scan" &&
      status !== "connecting" &&
      status !== "reconnecting"
    ) {
      continue;
    }
    try {
      await startWhatsappSession(userId, { silentReconnect: status === "connected" || status === "reconnecting" });
    } catch (error) {
      console.error(`Failed to reconnect WhatsApp session for ${userId}:`, error);
    }
  }
}

function isWhatsappPuppeteerStaleSessionError(error) {
  const msg = String(error?.message || error?.cause?.message || error || "").toLowerCase();
  if (!msg) return false;
  const name = String(error?.name || error?.cause?.name || "").toLowerCase();
  return (
    name.includes("targetclose") ||
    msg.includes("detached frame") ||
    msg.includes("execution context was destroyed") ||
    msg.includes("navigating frame was detached") ||
    msg.includes("target closed") ||
    msg.includes("session closed") ||
    msg.includes("getresponsebody") ||
    msg.includes("no data found for resource") ||
    msg.includes("runtime.addbinding") ||
    isWhatsappPageBindingExistsError(error) ||
    (msg.includes("protocol error") && msg.includes("target"))
  );
}

async function waitForWhatsappSessionConnected(userId, timeoutMs = 120000) {
  const key = String(userId || "").trim();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = ensureWhatsappState(key);
    const ready =
      state.client && state.status === "connected";
    if (ready) return;
    if (state.manualStop) {
      throw new Error("WhatsApp session was disconnected.");
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("WhatsApp did not finish reconnecting in time.");
}

function getWhatsappReadyAtMs(state) {
  const readyAt = Number(state?.readyAt || 0);
  if (readyAt > 0) return readyAt;
  const connectedAt = Date.parse(String(state?.connectedAt || ""));
  return Number.isFinite(connectedAt) ? connectedAt : 0;
}

function isWhatsappSessionWarmedUp(state) {
  if (!state?.client || state.status !== "connected") return false;
  const readyAt = getWhatsappReadyAtMs(state);
  if (!readyAt) return false;
  return Date.now() - readyAt >= WHATSAPP_SEND_WARMUP_MS;
}

async function ensureWhatsappSenderReady(userId, timeoutMs = WHATSAPP_SEND_WAIT_MS) {
  const key = String(userId || "").trim();
  if (!key) return false;
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || WHATSAPP_SEND_WAIT_MS);
  let restartedUnhealthy = false;

  const waitForConnected = async () => {
    const state = ensureWhatsappState(key);
    if (state.manualStop) return false;
    if (state.client && state.status === "connected") return true;
    const waitable = new Set(["authenticated", "reconnecting", "connecting"]);
    const status = String(state.status || "");
    if (!state.initializing && !waitable.has(status)) {
      let hasSaved = false;
      try {
        hasSaved = await userHasSavedWhatsappSession(key);
      } catch {
        hasSaved = false;
      }
      if (!hasSaved) return false;
      scheduleSilentWhatsappReconnect(key, { reason: "send-restore" });
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    try {
      await waitForWhatsappSessionConnected(key, remaining);
      const live = ensureWhatsappState(key);
      return Boolean(live.client && live.status === "connected");
    } catch {
      return false;
    }
  };

  if (!(await waitForConnected())) return false;

  while (Date.now() < deadline) {
    const live = ensureWhatsappState(key);
    if (live.manualStop) return false;
    if (!live.client || live.status !== "connected") {
      if (!(await waitForConnected())) return false;
      continue;
    }
    if (!isWhatsappSessionWarmedUp(live)) {
      await delay(400);
      continue;
    }
    const inspection = await inspectWhatsappClientHealth(live, 8000);
    if (inspection.verdict === "healthy") return true;
    if (inspection.verdict === "warming") {
      await delay(400);
      continue;
    }
    if (!restartedUnhealthy) {
      restartedUnhealthy = true;
      logEvent("whatsapp", "sender connected but not healthy; restarting before send", {
        userId: key,
        waState: inspection.waState || "",
      });
      try {
        await withTimeout(
          restartWhatsappBrowserSession(key),
          Math.max(5000, deadline - Date.now())
        );
      } catch {
        // Keep waiting until the send deadline.
      }
      continue;
    }
    await delay(400);
  }

  const finalState = ensureWhatsappState(key);
  return Boolean(finalState.client && finalState.status === "connected" && isWhatsappSessionWarmedUp(finalState));
}

async function restartWhatsappBrowserSession(userId) {
  const key = String(userId || "").trim();
  if (!key) throw new Error("Counselor user id is required.");
  return withWhatsappSessionLock(key, async () => {
    const state = ensureWhatsappState(key);
    if (state.manualStop) return;
    const status = String(state.status || "");
    const alreadyStarting =
      state.initializing ||
      status === "connecting" ||
      status === "reconnecting" ||
      status === "authenticated" ||
      status === "awaiting_qr_scan";
    if (alreadyStarting) {
      await waitForWhatsappSessionConnected(key, 120000);
      return;
    }
    state.recovering = true;
    if (state.client) {
      try {
        await state.client.destroy();
      } catch {
        // Ignore; session object may already be unusable.
      }
      state.client = null;
    }
    state.status = "reconnecting";
    state.error = "";
    state.initializing = false;
    state.recovering = false;
    await delay(WHATSAPP_BROWSER_RESTART_PAUSE_MS);
    await startWhatsappSession(key, {
      silentReconnect: true,
      alreadyLocked: true,
      force: true,
    });
    await waitForWhatsappSessionConnected(key, 120000);
  });
}

async function reconnectWhatsappSessionForAdmin(userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) throw new Error("Counselor user id is required.");
  const state = ensureWhatsappState(cleanUserId);
  state.manualStop = false;
  clearWhatsappReconnectTimer(state);
  clearSilentQrFallbackTimer(state);
  state.reconnectAttempts = 0;
  state.error = "";
  state.lastUpdatedAt = new Date().toISOString();
  logEvent("whatsapp", "admin reconnect requested", { userId: cleanUserId });
  return startWhatsappSession(cleanUserId, {
    silentReconnect: true,
    force: true,
    awaitInitialize: false,
  });
}

async function withTimeout(promise, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isWhatsappPuppeteerPageOpen(state) {
  const page = state?.client?.pupPage;
  if (!page) return false;
  try {
    if (typeof page.isClosed === "function" && page.isClosed()) return false;
  } catch {
    return false;
  }
  const browser = state?.client?.pupBrowser;
  try {
    if (browser && typeof browser.isConnected === "function" && !browser.isConnected()) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

function isWhatsappRestoreInProgress(state) {
  return (
    state?.silentReconnect === true ||
    Boolean(String(state?.whatsappNumber || "").trim()) ||
    Number(state?.readyAt || 0) > 0
  );
}

function isWhatsappHealthInGrace(state) {
  const now = Date.now();
  const readyAt = getWhatsappReadyAtMs(state);
  if (readyAt && now - readyAt < WHATSAPP_HEALTH_GRACE_MS) return true;
  const sendAt = Number(state?.lastSuccessfulSendAt || 0);
  return sendAt > 0 && now - sendAt < WHATSAPP_HEALTH_GRACE_MS;
}

function summarizeWhatsappHealth(state, inspection = null) {
  const status = String(state?.status || "disconnected");
  const cached = state?.lastHealth && typeof state.lastHealth === "object" ? state.lastHealth : {};
  const verdict = String(inspection?.verdict || cached.verdict || "")
    .trim()
    .toLowerCase();
  const waState = String(inspection?.waState || cached.waState || "").trim();
  const checkedAt = inspection ? new Date().toISOString() : String(cached.checkedAt || "");
  const pageOpen = isWhatsappPuppeteerPageOpen(state);
  const warmed = isWhatsappSessionWarmedUp(state);

  if (status === "connected") {
    if (verdict === "healthy") {
      return {
        score: warmed ? 100 : 90,
        label: warmed ? "Healthy" : "Ready",
        verdict,
        waState,
        checkedAt,
      };
    }
    if (verdict === "warming") {
      return { score: 80, label: "Warming up", verdict, waState, checkedAt };
    }
    if (verdict === "dead") {
      if (pageOpen && (isWhatsappHealthInGrace(state) || cached.verdict === "healthy")) {
        return {
          score: warmed ? 90 : 80,
          label: warmed ? "Ready" : "Warming up",
          verdict: "warming",
          waState,
          checkedAt,
        };
      }
      return {
        score: pageOpen ? 25 : 15,
        label: "Unhealthy",
        verdict,
        waState,
        checkedAt,
      };
    }
    return {
      score: pageOpen ? 85 : 70,
      label: "Checking",
      verdict: verdict || "unknown",
      waState,
      checkedAt,
    };
  }
  if (status === "authenticated") {
    return { score: 85, label: "Linking", verdict: verdict || "n/a", waState, checkedAt };
  }
  if (status === "connecting" || status === "reconnecting") {
    const restoring = isWhatsappRestoreInProgress(state);
    if (pageOpen) {
      return {
        score: restoring ? 85 : 70,
        label: restoring ? "Restoring" : "Connecting",
        verdict: verdict || "n/a",
        waState,
        checkedAt,
      };
    }
    return {
      score: restoring ? 65 : 50,
      label: restoring ? "Restoring" : "Connecting",
      verdict: verdict || "n/a",
      waState,
      checkedAt,
    };
  }
  if (status === "awaiting_qr_scan") {
    return { score: 35, label: "Awaiting QR", verdict: verdict || "n/a", waState, checkedAt };
  }
  if (status === "error" || status === "auth_failed") {
    return { score: 10, label: "Error", verdict: verdict || "n/a", waState, checkedAt };
  }
  return { score: 0, label: "Disconnected", verdict: verdict || "n/a", waState, checkedAt };
}

function rememberWhatsappHealth(state, inspection) {
  const health = summarizeWhatsappHealth(state, inspection);
  if (state) state.lastHealth = health;
  return health;
}

async function inspectWhatsappClientHealth(state, timeoutMs = 15000, { attempts, remember = true } = {}) {
  const finish = (result) => {
    if (remember) rememberWhatsappHealth(state, result);
    return result;
  };
  if (!state?.client || state.status !== "connected") {
    return finish({ verdict: "dead", waState: "" });
  }
  const probeAttempts = Math.max(1, Number(attempts) || WHATSAPP_HEALTH_PROBE_ATTEMPTS);
  const slice = Math.max(1500, Math.floor(Math.max(Number(timeoutMs) || 15000, 1500) / probeAttempts));
  let lastWaState = "";
  let timedOut = false;
  for (let attempt = 1; attempt <= probeAttempts; attempt += 1) {
    if (!isWhatsappPuppeteerPageOpen(state)) {
      return finish({ verdict: "dead", waState: lastWaState });
    }
    try {
      const waState = String(await withTimeout(state.client.getState(), slice) || "").toUpperCase();
      lastWaState = waState;
      if (waState === "CONNECTED") {
        if (await probeWhatsappWebJsReady(state.client)) return finish({ verdict: "healthy", waState });
        if (await ensureWhatsappWebJsReady(state.client)) return finish({ verdict: "healthy", waState });
        const previous = String(state.lastHealth?.verdict || "").toLowerCase();
        if (
          isWhatsappPuppeteerPageOpen(state) &&
          (isWhatsappHealthInGrace(state) || previous === "healthy" || previous === "warming")
        ) {
          return finish({ verdict: "warming", waState });
        }
        return finish({ verdict: "dead", waState });
      }
      if (attempt < probeAttempts) await delay(400);
    } catch {
      timedOut = true;
      if (!isWhatsappPuppeteerPageOpen(state)) {
        return finish({ verdict: "dead", waState: lastWaState });
      }
      if (attempt < probeAttempts) await delay(400);
    }
  }
  if (WHATSAPP_WARMING_STATES.has(lastWaState)) {
    return finish({ verdict: "warming", waState: lastWaState });
  }
  const previous = String(state.lastHealth?.verdict || "").toLowerCase();
  const unpaired = lastWaState === "UNPAIRED" || lastWaState === "UNPAIRED_IDLE";
  // A WhatsApp Web reload briefly reports UNPAIRED while inject() re-runs.
  // Restarting the browser for that looks like an automatic logout.
  if (
    isWhatsappPuppeteerPageOpen(state) &&
    (timedOut || !lastWaState || unpaired) &&
    (isWhatsappHealthInGrace(state) || previous === "healthy" || previous === "warming")
  ) {
    return finish({ verdict: "warming", waState: lastWaState || "CONNECTING" });
  }
  return finish({ verdict: "dead", waState: lastWaState });
}

async function refreshWhatsappSessionHealth(userId, options = {}) {
  const state = ensureWhatsappState(userId);
  const status = String(state.status || "disconnected");
  if (status !== "connected") {
    return rememberWhatsappHealth(state, { verdict: "n/a", waState: "" });
  }
  const maxAgeMs = Number.isFinite(Number(options.maxAgeMs))
    ? Number(options.maxAgeMs)
    : WHATSAPP_HEALTH_CACHE_MS;
  const checkedAt = Date.parse(String(state.lastHealth?.checkedAt || ""));
  const age = Number.isFinite(checkedAt) ? Date.now() - checkedAt : Infinity;
  const cachedVerdict = String(state.lastHealth?.verdict || "").toLowerCase();
  if (age < maxAgeMs && cachedVerdict && cachedVerdict !== "unknown" && cachedVerdict !== "n/a") {
    return summarizeWhatsappHealth(state);
  }
  const inspection = await inspectWhatsappClientHealth(state, options.timeoutMs || 8000, {
    attempts: options.attempts || 2,
    remember: false,
  });
  if (inspection.verdict === "healthy" || inspection.verdict === "warming") {
    state.healthFailStreak = 0;
    return rememberWhatsappHealth(state, inspection);
  }
  const previous = String(state.lastHealth?.verdict || "").toLowerCase();
  if (previous === "healthy" || previous === "warming" || isWhatsappHealthInGrace(state)) {
    return summarizeWhatsappHealth(state);
  }
  return rememberWhatsappHealth(state, inspection);
}

async function isWhatsappClientHealthy(state, timeoutMs = 15000) {
  const { verdict } = await inspectWhatsappClientHealth(state, timeoutMs);
  return verdict === "healthy";
}

async function healthCheckActiveWhatsappSessions() {
  if (isWhatsappShuttingDown || whatsappBootRestoreActive) return;
  const unhealthyUserIds = [];
  const restoreUserIds = [];
  const seenRestore = new Set();
  const considerSavedRestore = async (userId, state) => {
    const id = String(userId || "").trim();
    if (!id || seenRestore.has(id) || state?.manualStop || state?.initializing) return;
    const status = String(state?.status || "disconnected");
    if (
      status === "reconnecting" ||
      status === "connecting" ||
      status === "awaiting_qr_scan" ||
      status === "authenticated" ||
      status === "connected"
    ) {
      return;
    }
    try {
      if (await userHasSavedWhatsappSession(id)) {
        seenRestore.add(id);
        restoreUserIds.push(id);
      }
    } catch {
      // Ignore lookup errors and continue other sessions.
    }
  };

  for (const [userId, state] of whatsappSessions.entries()) {
    const status = String(state?.status || "");
    if (state?.initializing || state?.recovering) continue;
    if (status === "awaiting_qr_scan" || status === "authenticated") {
      continue;
    }
    if (status === "reconnecting" || status === "connecting") {
      const stuck =
        !state.client &&
        !state.reconnectTimer &&
        !isWhatsappReconnectJobPending(userId);
      if (!stuck) continue;
      try {
        if (await userHasSavedWhatsappSession(userId)) {
          seenRestore.add(userId);
          restoreUserIds.push(userId);
        }
      } catch {
        // Ignore lookup errors and continue other sessions.
      }
      continue;
    }
    if (status === "connected") {
      if (isWhatsappHealthInGrace(state) || !isWhatsappSessionWarmedUp(state)) {
        continue;
      }
      const { verdict } = await inspectWhatsappClientHealth(state, 8000, {
        attempts: 2,
        remember: true,
      });
      if (verdict === "healthy" || verdict === "warming") {
        state.healthFailStreak = 0;
        continue;
      }
      state.healthFailStreak = Number(state.healthFailStreak || 0) + 1;
      if (state.healthFailStreak < WHATSAPP_HEALTH_FAIL_STREAK_LIMIT) {
        logEvent("whatsapp", "health check probe failed; waiting for next streak", {
          userId,
          streak: state.healthFailStreak,
        });
        continue;
      }
      unhealthyUserIds.push(userId);
      continue;
    }
    await considerSavedRestore(userId, state);
  }

  try {
    const restorableIds = await listRestorableWhatsappSessionUserIds(await readUsers());
    for (const userId of restorableIds) {
      await considerSavedRestore(userId, whatsappSessions.get(userId) || ensureWhatsappState(userId));
    }
  } catch {
    // Registry lookup is best-effort during health checks.
  }

  if (!unhealthyUserIds.length && !restoreUserIds.length) return;
  console.log(
    `WhatsApp: health check restoring ${unhealthyUserIds.length} live session(s) and ${restoreUserIds.length} saved session(s)`
  );
  for (const userId of unhealthyUserIds) {
    enqueueWhatsappReconnect(userId, {
      reason: "health-check",
      silentReconnect: true,
      force: true,
    });
  }
  for (const userId of restoreUserIds) {
    enqueueWhatsappReconnect(userId, {
      reason: "health-check-saved-session",
      silentReconnect: true,
      force: true,
    });
  }
}

async function restartActiveWhatsappSessions() {
  return healthCheckActiveWhatsappSessions();
}

function toWhatsAppChatId(phone) {
  const normalized = normalizeWhatsappNumber(phone) || String(phone || "");
  const digitsOnly = String(normalized || "").replace(/[^\d]/g, "");
  if (!digitsOnly) return "";
  return `${digitsOnly}@c.us`;
}

function serializeWhatsappWid(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  return String(
    value._serialized ||
      value.$1 ||
      value.id?._serialized ||
      value.id?.$1 ||
      (typeof value.id === "string" ? value.id : "") ||
      ""
  ).trim();
}

function isUsableSentWhatsappMessage(message) {
  return Boolean(normalizeWhatsappMessageId(message).serialized);
}

function isWhatsappLidError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  return msg.includes("no lid") || msg.includes("lid is missing") || msg.includes("accountlid");
}

function isWhatsappWebJsMissingError(error) {
  const msg = String(error?.message || error?.cause?.message || error || "").toLowerCase();
  if (!msg) return false;
  if (msg.includes("web helpers are not injected")) return true;
  if (msg.includes("wwebjs is not defined") || msg.includes("wwebjs is undefined")) return true;
  return msg.includes("getchat") && (msg.includes("undefined") || msg.includes("null"));
}

function findWhatsappUserIdForClient(client) {
  if (!client) return "";
  for (const [userId, state] of whatsappSessions.entries()) {
    if (state?.client === client) return String(userId || "");
  }
  return "";
}

async function probeWhatsappWebJsReady(client) {
  if (!client?.pupPage || typeof client.pupPage.evaluate !== "function") return false;
  try {
    if (typeof client.pupPage.isClosed === "function" && client.pupPage.isClosed()) return false;
    return Boolean(
      await client.pupPage.evaluate(
        () =>
          typeof window.WWebJS === "object" &&
          window.WWebJS !== null &&
          typeof window.WWebJS.getChat === "function" &&
          typeof window.WWebJS.sendMessage === "function"
      )
    );
  } catch {
    return false;
  }
}

async function reinjectWhatsappWebJsHelpers(client) {
  if (!client?.pupPage || typeof client.pupPage.evaluate !== "function") return false;
  try {
    if (typeof client.pupPage.isClosed === "function" && client.pupPage.isClosed()) return false;
    const { LoadUtils } = require("whatsapp-web.js/src/util/Injected/Utils");
    await client.pupPage.evaluate(LoadUtils);
    await installWhatsappWebCompatPatch(client);
    return probeWhatsappWebJsReady(client);
  } catch {
    return false;
  }
}

async function ensureWhatsappWebJsReady(client) {
  if (await probeWhatsappWebJsReady(client)) {
    await installWhatsappWebCompatPatch(client);
    return true;
  }
  const restored = await reinjectWhatsappWebJsHelpers(client);
  if (restored) {
    logEvent("whatsapp", "re-injected missing web helpers", {
      userId: findWhatsappUserIdForClient(client),
    });
  }
  return restored;
}

function isWhatsappLidChatId(chatId) {
  return String(chatId || "").includes("@lid");
}

async function installWhatsappWebCompatPatch(client) {
  if (!client?.pupPage || typeof client.pupPage.evaluate !== "function") return;
  await client.pupPage.evaluate(() => {
    if (!window.WWebJS) return;

    const widKey = (value) => {
      if (!value) return "";
      if (typeof value === "string") return value;
      return String(value._serialized || value.$1 || "").trim();
    };

    const senderLidReady = () => {
      try {
        return Boolean(window.require("WAWebUserPrefsMeUser").getMaybeMeLidUser());
      } catch {
        return false;
      }
    };

    const findOrCreateChat = async (serialized) => {
      const id = String(serialized || "").trim();
      if (!id) return null;
      const factory = window.require("WAWebWidFactory");
      const chatWid = factory.createWid(id);
      const existing = window.require("WAWebCollections").Chat.get(chatWid);
      if (existing) return existing;
      try {
        return (await window.require("WAWebFindChatAction").findOrCreateLatestChat(chatWid))?.chat || null;
      } catch {
        return null;
      }
    };

    const resolvePhoneChat = async (chat) => {
      let phoneId = "";
      try {
        phoneId = widKey(window.require("WAWebApiContact").getPhoneNumber(chat?.id));
      } catch {
        phoneId = "";
      }
      if (!phoneId) return null;
      return findOrCreateChat(phoneId);
    };

    if (!window.WWebJS.__seLidPatchedV2 && typeof window.WWebJS.getChat === "function") {
      const originalGetChat = window.WWebJS.getChat.bind(window.WWebJS);
      window.WWebJS.getChat = async (chatId, options = {}) => {
        try {
          return await originalGetChat(chatId, options);
        } catch (error) {
          const msg = String(error?.message || error || "");
          if (!/no lid|lid is missing|accountlid/i.test(msg)) throw error;
        }
        const created = await findOrCreateChat(chatId);
        if (created) {
          return options.getAsModel === false ? created : window.WWebJS.getChatModel(created);
        }
        return undefined;
      };
      window.WWebJS.__seLidPatchedV2 = true;
    }

    if (!window.WWebJS.__seSendPatchedV2 && typeof window.WWebJS.sendMessage === "function") {
      const originalSendMessage = window.WWebJS.sendMessage.bind(window.WWebJS);
      const recoverLatestOutgoing = async (chat) => {
        const chatId = widKey(chat?.id);
        const collections = window.require("WAWebCollections");
        const models =
          (typeof collections?.Msg?.getModelsArray === "function"
            ? collections.Msg.getModelsArray()
            : []) || [];
        const minTimestamp = Math.floor(Date.now() / 1000) - 20;
        let latest = null;
        for (const msg of models) {
          if (!msg?.id?.fromMe) continue;
          const remote = widKey(msg.id.remote) || String(msg.id.remote || "");
          if (chatId && remote && remote !== chatId) continue;
          const t = Number(msg.t || 0);
          if (t && t < minTimestamp) continue;
          if (!latest || t >= Number(latest.t || 0)) latest = msg;
        }
        if (latest?.id && !latest.id._serialized) {
          latest.id._serialized = latest.id.$1 || latest.id._serialized;
        }
        return latest || undefined;
      };
      window.WWebJS.sendMessage = async (chat, content, options = {}) => {
        let targetChat = chat;
        try {
          const isLidChat =
            (typeof chat?.id?.isLid === "function" && chat.id.isLid()) ||
            String(widKey(chat?.id)).includes("@lid");
          if (isLidChat && !senderLidReady()) {
            const phoneChat = await resolvePhoneChat(chat);
            if (phoneChat) targetChat = phoneChat;
          }
        } catch {
          targetChat = chat;
        }
        const sent = await originalSendMessage(targetChat, content, options);
        if (sent) {
          if (sent.id && !sent.id._serialized) {
            sent.id._serialized = sent.id.$1 || sent.id._serialized;
          }
          return sent;
        }
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const recovered = await recoverLatestOutgoing(targetChat);
          if (recovered) return recovered;
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        return sent;
      };
      window.WWebJS.__seSendPatchedV2 = true;
    }
  });
}

async function ensureWhatsappChatReady(client, chatId) {
  if (!client?.pupPage || typeof client.pupPage.evaluate !== "function") return String(chatId || "").trim();
  const requested = String(chatId || "").trim();
  if (!requested) return "";
  try {
    const resolved = await client.pupPage.evaluate(async (serialized) => {
      const widKey = (value) => {
        if (!value) return "";
        if (typeof value === "string") return value;
        return String(value._serialized || value.$1 || "").trim();
      };
      const factory = window.require("WAWebWidFactory");
      let target = serialized;
      let senderLidReady = false;
      try {
        senderLidReady = Boolean(window.require("WAWebUserPrefsMeUser").getMaybeMeLidUser());
      } catch {
        senderLidReady = false;
      }
      if (!String(serialized).includes("@lid")) {
        try {
          const exists = await window.require("WAWebQueryExistsJob").queryWidExists(factory.createWid(serialized));
          const found = widKey(exists?.wid);
          if (found) {
            if (found.includes("@lid") && !senderLidReady) {
              target = serialized;
            } else {
              target = found;
            }
          }
        } catch {
          target = serialized;
        }
      } else if (!senderLidReady) {
        try {
          const phone = window.require("WAWebApiContact").getPhoneNumber(factory.createWid(serialized));
          const phoneId = widKey(phone);
          if (phoneId) target = phoneId;
        } catch {
          // Keep the requested LID when the phone mapping is not in this session.
        }
      }
      const chatWid = factory.createWid(target);
      let chat = window.require("WAWebCollections").Chat.get(chatWid);
      if (!chat) {
        try {
          chat = (await window.require("WAWebFindChatAction").findOrCreateLatestChat(chatWid))?.chat || null;
        } catch {
          chat = null;
        }
      }
      return widKey(chat?.id) || target || serialized;
    }, requested);
    return String(resolved || requested).trim();
  } catch {
    return requested;
  }
}

async function recoverRecentlySentWhatsappMessage(client, chatId, sentAfterMs) {
  if (!client?.pupPage || typeof client.pupPage.evaluate !== "function") return null;
  const targetChatId = String(chatId || "").trim();
  if (!targetChatId) return null;
  const minTimestamp = Math.floor((Number(sentAfterMs) || Date.now()) / 1000) - 3;
  try {
    const model = await client.pupPage.evaluate(
      async (serializedChatId, cutoff) => {
        const widKey = (value) => {
          if (!value) return "";
          if (typeof value === "string") return value;
          return String(value._serialized || value.$1 || "").trim();
        };
        let chat = null;
        if (window.WWebJS && typeof window.WWebJS.getChat === "function") {
          chat = await window.WWebJS.getChat(serializedChatId, { getAsModel: false });
        } else if (typeof window.require === "function") {
          const chatWid = window.require("WAWebWidFactory").createWid(serializedChatId);
          chat = window.require("WAWebCollections").Chat.get(chatWid) || null;
        }
        if (!chat) return null;
        const fromChat =
          (typeof chat.msgs?.getModelsArray === "function" ? chat.msgs.getModelsArray() : []) || [];
        const fromStore =
          (typeof window.require === "function" &&
            typeof window.require("WAWebCollections")?.Msg?.getModelsArray === "function"
            ? window.require("WAWebCollections").Msg.getModelsArray()
            : []) || [];
        const models = fromChat.length ? fromChat : fromStore;
        const chatKey = widKey(chat.id) || serializedChatId;
        let latest = null;
        for (const msg of models) {
          if (!msg?.id?.fromMe) continue;
          const remote = widKey(msg.id.remote) || String(msg.id.remote || "");
          if (chatKey && remote && remote !== chatKey && remote !== serializedChatId) continue;
          const t = Number(msg.t || 0);
          if (t && t < cutoff) continue;
          if (!latest || t >= Number(latest.t || 0)) latest = msg;
        }
        if (!latest) return null;
        if (latest.id && !latest.id._serialized) {
          latest.id._serialized = latest.id.$1 || latest.id._serialized;
        }
        if (window.WWebJS && typeof window.WWebJS.getMessageModel === "function") {
          return window.WWebJS.getMessageModel(latest);
        }
        return { id: latest.id, ack: latest.ack, fromMe: true, t: latest.t };
      },
      targetChatId,
      minTimestamp
    );
    if (!model?.id) return null;
    return { id: model.id, ack: model.ack, fromMe: true, timestamp: model.t };
  } catch {
    return null;
  }
}

async function resolveLidViaUsync(client, phoneOrChatId) {
  if (!client?.pupPage || typeof client.pupPage.evaluate !== "function") return "";
  const digits = normalizePhoneDigits(String(phoneOrChatId || "").split("@")[0]);
  if (!digits) return "";
  try {
    return String(
      (await client.pupPage.evaluate(async (digitsOnly) => {
        try {
          const query = window.require("WAWebContactSyncUtils").constructUsyncDeltaQuery([
            { type: "add", phoneNumber: digitsOnly },
          ]);
          const result = await query.execute();
          const lid = result?.list?.[0]?.lid;
          if (!lid) return "";
          const wid = window.require("WAWebWidFactory").createWid(lid);
          return wid?._serialized || wid?.$1 || (typeof lid === "string" ? lid : "");
        } catch {
          return "";
        }
      }, digits)) || ""
    ).trim();
  } catch {
    return "";
  }
}

async function findKnownStudentWhatsappChatId(studentId) {
  const id = String(studentId || "").trim();
  if (!id) return "";
  try {
    const chats = await readChats();
    for (let index = chats.length - 1; index >= 0; index -= 1) {
      const chat = chats[index];
      const involves = String(chat?.senderId || "") === id || String(chat?.receiverId || "") === id;
      if (!involves) continue;
      const chatId = String(chat?.whatsappDelivery?.chatId || "").trim();
      if (
        chatId &&
        chatId.includes("@") &&
        !isWhatsappLidChatId(chatId) &&
        !isIgnoredWhatsappIncomingChatId(chatId)
      ) {
        return chatId;
      }
    }
  } catch {
    // Chat history lookup is best-effort.
  }
  try {
    const incoming = await readWhatsappIncoming();
    for (let index = incoming.length - 1; index >= 0; index -= 1) {
      const row = incoming[index];
      if (String(row?.mappedStudentId || "").trim() !== id) continue;
      const from = String(row?.from || "").trim();
      if (from && from.includes("@") && !isWhatsappLidChatId(from) && !isIgnoredWhatsappIncomingChatId(from)) {
        return from;
      }
    }
  } catch {
    // Incoming lookup is best-effort.
  }
  return "";
}

async function collectWhatsappSendChatIds(client, student, phone) {
  const fallback = toWhatsAppChatId(phone);
  const candidates = [];
  const pushCandidate = (value) => {
    const id = serializeWhatsappWid(value);
    if (id && !candidates.includes(id) && !isIgnoredWhatsappIncomingChatId(id)) {
      candidates.push(id);
    }
  };

  let liveWid = "";
  if (client && typeof client.getNumberId === "function") {
    const digitVariants = [
      ...new Set(
        [phone, fallback, student?.whatsappNumber, student?.phone]
          .map((value) => normalizePhoneDigits(value))
          .filter(Boolean)
      ),
    ];
    for (const digits of digitVariants) {
      try {
        const found = serializeWhatsappWid(await client.getNumberId(digits));
        if (found) {
          if (!liveWid) liveWid = found;
          pushCandidate(found);
        }
      } catch {
        // Number lookup can fail when WhatsApp Web has not synced the contact yet.
      }
    }
  }
  pushCandidate(fallback);
  if (client && typeof client.getContactLidAndPhone === "function" && fallback) {
    try {
      const pairs = await client.getContactLidAndPhone([fallback]);
      for (const pair of Array.isArray(pairs) ? pairs : []) {
        pushCandidate(pair?.pn);
        pushCandidate(pair?.lid);
      }
    } catch {
      // LID lookup is best-effort.
    }
  }
  const knownChatId = await findKnownStudentWhatsappChatId(String(student?.id || ""));
  pushCandidate(knownChatId);
  pushCandidate(await resolveLidViaUsync(client, phone || fallback));

  const phoneIds = candidates.filter((id) => id.includes("@c.us"));
  const lidIds = candidates.filter((id) => isWhatsappLidChatId(id));
  const rest = candidates.filter((id) => !id.includes("@c.us") && !isWhatsappLidChatId(id));
  const ordered = [];
  const pushOrdered = (id) => {
    if (id && !ordered.includes(id)) ordered.push(id);
  };
  if (liveWid && liveWid.includes("@c.us")) pushOrdered(liveWid);
  phoneIds.forEach(pushOrdered);
  rest.forEach(pushOrdered);
  if (liveWid && isWhatsappLidChatId(liveWid)) pushOrdered(liveWid);
  lidIds.forEach(pushOrdered);
  return ordered;
}

async function resolveWhatsappSendChatId(client, student, phone) {
  const candidates = await collectWhatsappSendChatIds(client, student, phone);
  return candidates[0] || toWhatsAppChatId(phone);
}

function readWhatsappMessageAck(message) {
  const ack = Number(message?.ack);
  return Number.isFinite(ack) ? ack : 0;
}

async function waitForWhatsappMessageAck(client, sentMsg, timeoutMs = WHATSAPP_ACK_WAIT_MS) {
  if (!isUsableSentWhatsappMessage(sentMsg)) {
    throw new Error("WhatsApp did not return a sent message.");
  }
  const initialAck = readWhatsappMessageAck(sentMsg);
  if (initialAck >= WHATSAPP_ACK_SERVER) return initialAck;

  const serialized = normalizeWhatsappMessageId(sentMsg).serialized;
  let current = sentMsg;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, ack) => {
      if (settled) return;
      settled = true;
      if (client && typeof client.off === "function") client.off("message_ack", onAck);
      else if (client && typeof client.removeListener === "function") client.removeListener("message_ack", onAck);
      clearInterval(poller);
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(ack);
    };

    const onAck = (msg, ack) => {
      const id = normalizeWhatsappMessageId(msg).serialized;
      if (serialized && id && id !== serialized) return;
      const nextAck = Number(ack);
      // WhatsApp Web often reports -1 immediately after restore, then recovers.
      if (nextAck >= WHATSAPP_ACK_SERVER) finish(null, nextAck);
    };

    if (client && typeof client.on === "function") {
      client.on("message_ack", onAck);
    }

    const poller = setInterval(async () => {
      try {
        if (serialized && client && typeof client.getMessageById === "function") {
          const fresh = await client.getMessageById(serialized);
          if (fresh) current = fresh;
        }
      } catch {
        // Keep using the last known message object.
      }
      const ack = readWhatsappMessageAck(current);
      if (ack >= WHATSAPP_ACK_SERVER) finish(null, ack);
    }, 700);

    const timer = setTimeout(() => {
      const ack = readWhatsappMessageAck(current);
      if (ack <= WHATSAPP_ACK_ERROR) {
        finish(new Error("WhatsApp rejected the message."));
        return;
      }
      // WhatsApp Web often never emits server ack. A returned message id is enough.
      finish(null, ack);
    }, timeoutMs);
  });
}

function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

function normalizeSriLankaStudentPhone(phone) {
  const digitsOnly = normalizePhoneDigits(phone);
  if (!digitsOnly) return "";

  let localMobileDigits = "";
  if (/^94[7]\d{8}$/.test(digitsOnly)) {
    localMobileDigits = digitsOnly.slice(2);
  } else if (/^0[7]\d{8}$/.test(digitsOnly)) {
    localMobileDigits = digitsOnly.slice(1);
  } else if (/^[7]\d{8}$/.test(digitsOnly)) {
    localMobileDigits = digitsOnly;
  } else {
    return "";
  }

  return `+94${localMobileDigits}`;
}

function normalizeInternationalPhone(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const sriLanka = normalizeSriLankaStudentPhone(raw);
  if (sriLanka) return sriLanka;
  const digitsOnly = normalizePhoneDigits(raw);
  if (digitsOnly.length < 8 || digitsOnly.length > 15) return "";
  return `+${digitsOnly}`;
}

function normalizeStudentPhone(phone) {
  return normalizeInternationalPhone(phone);
}

function normalizeWhatsappNumber(phone) {
  return normalizeInternationalPhone(phone);
}

async function resolveWhatsappThreadIdFromMessage(message) {
  try {
    if (!message || typeof message.getContact !== "function") return "";
    const contact = await message.getContact();
    const serialized = String(contact?.id?._serialized || "").trim();
    return serialized;
  } catch {
    return "";
  }
}

function resolveStudentWhatsappPhone(student) {
  const raw = String(student?.whatsappNumber || "").trim() || String(student?.phone || "").trim();
  return normalizeWhatsappNumber(raw) || raw;
}

function studentPhoneDigitsMatch(incomingDigits, student) {
  const phoneDigits = normalizePhoneDigits(student?.phone || "");
  const whatsappDigits = normalizePhoneDigits(student?.whatsappNumber || "");
  const targets = [phoneDigits, whatsappDigits].filter(Boolean);
  if (!targets.length || !incomingDigits) return false;
  return targets.some(
    (studentDigits) =>
      incomingDigits.endsWith(studentDigits) || studentDigits.endsWith(incomingDigits)
  );
}

async function findStudentByWhatsappFrom(chatId) {
  const matches = await findStudentsByWhatsappFrom(chatId);
  return matches[0] || null;
}

async function findStudentsByWhatsappFrom(chatId) {
  const rawFrom = String(chatId || "");
  if (!rawFrom || isWhatsappLidChatId(rawFrom)) return [];
  const numberPart = rawFrom.split("@")[0] || "";
  const incomingDigits = normalizePhoneDigits(numberPart);
  if (!incomingDigits || incomingDigits.length < 8) return [];
  const students = await readStudemts();
  return students.filter((student) => studentPhoneDigitsMatch(incomingDigits, student));
}

function collectWhatsappIdentityKeys(...values) {
  const keys = new Set();
  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    keys.add(raw.toLowerCase());
    const lidMatch = raw.match(/(\d{6,})@lid/i);
    if (lidMatch) keys.add(`${lidMatch[1]}@lid`);
    if (raw.includes("@c.us")) {
      const digits = normalizePhoneDigits(raw.split("@")[0]);
      if (digits) keys.add(digits);
    }
  }
  return keys;
}

function whatsappIdentitiesMatch(left, right) {
  const a = collectWhatsappIdentityKeys(left);
  const b = collectWhatsappIdentityKeys(right);
  if (!a.size || !b.size) return false;
  for (const key of a) {
    if (b.has(key)) return true;
  }
  return false;
}

function studentLinkedToStaff(student, staffId) {
  const id = String(staffId || "").trim();
  if (!id || !student) return false;
  if (String(student.counselor || "").trim() === id) return true;
  if (String(student.inquiryCounselorId || "").trim() === id) return true;
  if (String(student.branchWhatsappMessengerUserId || "").trim() === id) return true;
  const history = Array.isArray(student.counselorHistory) ? student.counselorHistory : [];
  return history.some((item) => String(item || "").trim() === id);
}

function findStudentById(students, studentId) {
  const id = String(studentId || "").trim();
  if (!id) return null;
  return (Array.isArray(students) ? students : []).find((item) => String(item.id || "").trim() === id) || null;
}

async function resolveIncomingWhatsappStudent({
  fromChatId,
  originalFrom = "",
  counselorId = "",
  whatsappMessageId = "",
} = {}) {
  const identityHints = [fromChatId, originalFrom, whatsappMessageId].filter(Boolean);
  const phoneMatches = [
    ...(await findStudentsByWhatsappFrom(fromChatId)),
    ...(originalFrom && originalFrom !== fromChatId ? await findStudentsByWhatsappFrom(originalFrom) : []),
  ];
  const seenPhoneIds = new Set();
  const phoneStudents = [];
  for (const student of phoneMatches) {
    const id = String(student?.id || "").trim();
    if (!id || seenPhoneIds.has(id)) continue;
    seenPhoneIds.add(id);
    phoneStudents.push(student);
  }

  const students = await readStudemts();
  const chats = await readChats();
  for (let index = chats.length - 1; index >= 0; index -= 1) {
    const chat = chats[index];
    const deliveryChatId = String(chat?.whatsappDelivery?.chatId || "").trim();
    const chatWaId = String(chat?.whatsappMessageId || "").trim();
    const hintMatch = identityHints.some(
      (hint) => whatsappIdentitiesMatch(hint, deliveryChatId) || whatsappIdentitiesMatch(hint, chatWaId)
    );
    if (!hintMatch) continue;
    const receiverId = String(chat.receiverId || "").trim();
    const senderId = String(chat.senderId || "").trim();
    const receiverStudent = findStudentById(students, receiverId);
    const senderStudent = findStudentById(students, senderId);
    if (receiverStudent && senderId && senderId !== receiverId) {
      return receiverStudent;
    }
    if (senderStudent && receiverId && senderId !== receiverId && String(chat?.whatsappDelivery?.status || "") === "received") {
      continue;
    }
    if (receiverStudent) return receiverStudent;
  }

  if (phoneStudents.length === 1) return phoneStudents[0];
  if (counselorId && phoneStudents.length > 1) {
    const linked = phoneStudents.filter((student) => studentLinkedToStaff(student, counselorId));
    if (linked.length === 1) return linked[0];
    if (linked.length > 1) {
      for (let index = chats.length - 1; index >= 0; index -= 1) {
        const chat = chats[index];
        const sid = String(chat.senderId || "").trim();
        const rid = String(chat.receiverId || "").trim();
        const match = linked.find((student) => String(student.id || "") === sid || String(student.id || "") === rid);
        if (match) return match;
      }
      return linked[0];
    }
  }
  return phoneStudents[0] || null;
}

function isIgnoredWhatsappIncomingChatId(chatId) {
  const from = String(chatId || "").trim();
  if (!from) return true;
  if (from.includes("@g.us")) return true;
  if (from.includes("@newsletter")) return true;
  return from === "status@broadcast";
}

/** True for WhatsApp group/broadcast traffic that must never enter Omni-Channel threads. */
function isWhatsappGroupIncomingMessage(message) {
  if (!message || typeof message !== "object") return false;
  if (message.isGroup === true || message.isGroupMsg === true) return true;
  // Check the raw chat id before getContact() rewrites group senders to personal @c.us IDs.
  if (isIgnoredWhatsappIncomingChatId(message.from)) return true;
  // whatsapp-web.js sets `author` only for messages sent inside a group.
  if (String(message.author || "").trim()) return true;
  const serializedId = String(message?.id?._serialized || "").trim();
  if (serializedId.includes("@g.us")) return true;
  return false;
}

function isWhatsappGroupChatRecord(chat) {
  if (!chat || typeof chat !== "object") return false;
  if (chat.isGroup === true) return true;
  const chatId = String(chat?.whatsappDelivery?.chatId || "").trim();
  if (chatId && (chatId.includes("@g.us") || chatId.includes("@newsletter") || chatId === "status@broadcast")) {
    return true;
  }
  const messageId = String(chat.whatsappMessageId || "").trim();
  if (messageId.includes("@g.us")) return true;
  return false;
}

function resolveStudentPrimaryCounselorId(student, fallbackId = "") {
  if (!student || typeof student !== "object") return String(fallbackId || "").trim();
  const pick = (rawId) => {
    const id = String(rawId || "").trim();
    return id && id.toLowerCase() !== "unassigned" ? id : "";
  };
  return (
    pick(student.inquiryCounselorId) ||
    pick(student.counselor) ||
    String(fallbackId || "").trim()
  );
}

function buildWhatsappIncomingRowKey(rowId) {
  const id = String(rowId || "").trim();
  return id ? `incoming-row:${id}` : "";
}

function normalizeWhatsappMessageId(message) {
  if (!message?.id) return { serialized: "", rawId: "" };
  const id = message.id;
  if (!id._serialized) {
    id._serialized = id._serialized || id.$1 || (typeof id === "string" ? id : null) || "";
  }
  const serialized = String(id._serialized || "").trim();
  const rawId = String(id.$1 || id._serialized || "").trim();
  return { serialized, rawId };
}

async function primeWhatsappMessageStoreForDownload(client, msgId, rawId) {
  const page = client?.pupPage;
  if (!page || typeof page.evaluate !== "function") return;
  if (!msgId && !rawId) return;
  try {
    await page.evaluate(async (serializedId, alternateId) => {
      try {
        const MsgStore = window.Store && window.Store.Msg;
        if (!MsgStore) return;

        let targetMsg = MsgStore.get(serializedId) || MsgStore.get(alternateId);
        if (!targetMsg && MsgStore.getMessagesById) {
          const ids = [serializedId, alternateId].filter(Boolean);
          const fetched = await MsgStore.getMessagesById(ids);
          if (fetched && fetched.length > 0) targetMsg = fetched[0];
        }

        if (targetMsg?.id && !targetMsg.id._serialized && targetMsg.id.$1) {
          targetMsg.id._serialized = targetMsg.id.$1;
        }
      } catch {
        // Browser-side resolution is best-effort.
      }
    }, msgId, rawId);
  } catch {
    // Page may be unavailable during shutdown.
  }
}

async function downloadWhatsappMessageMedia({
  client,
  message,
  retries = 4,
  timeoutMs = 30000,
  retryDelaysMs = [3000, 5000, 8000],
  onRetry,
} = {}) {
  if (!message?.hasMedia || typeof message.downloadMedia !== "function") return null;

  const { serialized: serializedMsgId } = normalizeWhatsappMessageId(message);

  const tryDownload = async (msg) => {
    const { serialized, rawId } = normalizeWhatsappMessageId(msg);
    if (client) {
      await primeWhatsappMessageStoreForDownload(client, serialized, rawId);
    }
    return Promise.race([
      msg.downloadMedia(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Media download timed out")), timeoutMs)
      ),
    ]);
  };

  const formatError = (err) =>
    err instanceof Error
      ? err.message
      : typeof err === "object"
        ? JSON.stringify(err)
        : String(err);

  let media = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    let targetMsg = message;
    if (attempt > 1 && serializedMsgId && client?.getMessageById) {
      try {
        const refetched = await client.getMessageById(serializedMsgId);
        if (refetched && typeof refetched.downloadMedia === "function") {
          targetMsg = refetched;
        }
      } catch {
        // Fall back to original message object.
      }
    }
    try {
      media = await tryDownload(targetMsg);
      if (media?.data) return media;
    } catch (downloadErr) {
      const errDetail = formatError(downloadErr);
      if (attempt < retries) {
        if (typeof onRetry === "function") {
          onRetry({ attempt, retries, error: errDetail, refetched: targetMsg !== message });
        }
        await new Promise((r) => setTimeout(r, retryDelaysMs[attempt - 1] || 5000));
      } else if (typeof onRetry === "function") {
        onRetry({ attempt, retries, error: errDetail, refetched: targetMsg !== message, final: true });
      }
    }
  }
  return media;
}

async function storeWhatsappMediaAsAttachment(media, { from = "", studentId = "" } = {}) {
  if (!media?.data) return null;
  let rawMime = String(media.mimetype || "").toLowerCase();
  const semiIdx = rawMime.indexOf(";");
  if (semiIdx !== -1) rawMime = rawMime.slice(0, semiIdx).trim();
  const mediaFilename = String(media.filename || "whatsapp-media");
  let effectiveMime = rawMime;
  if (!effectiveMime || effectiveMime === "application/octet-stream") {
    const fileExt = extensionFromFileName(mediaFilename);
    if (fileExt) effectiveMime = mimeFromExtension(fileExt);
  }
  if (!isSupportedWhatsappMediaMime(effectiveMime)) {
    logEvent("whatsapp", "media skipped (unsupported type)", {
      from,
      mime: effectiveMime || rawMime || "unknown",
      filename: mediaFilename,
    });
    return null;
  }
  const stored = await storeChatAttachmentDataUrl(
    `data:${effectiveMime};base64,${media.data}`,
    mediaFilename
  );
  if (!stored || stored.error) return null;
  const sizeKB = stored.size ? `${(stored.size / 1024).toFixed(1)} KB` : "unknown size";
  logEvent("whatsapp", "media received", {
    from,
    studentId,
    file: stored.name,
    mime: stored.mime,
    size: sizeKB,
  });
  return {
    name: stored.name,
    mime: stored.mime,
    size: stored.size,
    url: stored.url,
  };
}

function isNativeWhatsappMessageId(value) {
  const id = String(value || "").trim();
  if (!id) return false;
  if (id.startsWith("incoming-row:") || id.startsWith("fallback:") || id.startsWith("WAQ-")) return false;
  return id.includes("@") || id.includes("_");
}

function formatWhatsappReplyContent(content, replyTo) {
  const text = String(content || "").trim();
  const normalized = normalizeReplyTo(replyTo);
  if (!normalized) return text;
  const snippet =
    String(normalized.content || "").trim() ||
    (normalized.attachmentName ? String(normalized.attachmentName).trim() : "");
  if (!snippet) return text;
  const clipped = snippet.length > 220 ? `${snippet.slice(0, 220)}…` : snippet;
  const quoted = clipped
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
  return text ? `*Replying to:*\n${quoted}\n\n${text}` : `*Replying to:*\n${quoted}`;
}

async function resolveQuotedWhatsappMessageId(replyTo) {
  const normalized = normalizeReplyTo(replyTo);
  if (!normalized?.id) return "";
  try {
    const chats = await readChats();
    const original = chats.find((chat) => String(chat.id || "").trim() === normalized.id);
    const waId = String(original?.whatsappMessageId || "").trim();
    return isNativeWhatsappMessageId(waId) ? waId : "";
  } catch {
    return "";
  }
}

async function buildReplyToFromWhatsappQuotedMessage(message, { studentId = "", counselorId = "" } = {}) {
  if (!message || message.hasQuotedMsg !== true || typeof message.getQuotedMessage !== "function") {
    return null;
  }
  let quoted = null;
  try {
    quoted = await message.getQuotedMessage();
  } catch {
    quoted = null;
  }
  if (!quoted) return null;
  const quotedWaId = String(quoted.id?._serialized || "").trim();
  const quotedBody = String(quoted.body || "").trim();
  const quotedAttachmentName =
    quoted.hasMedia === true
      ? String(quoted._data?.filename || quoted.type || "attachment").trim()
      : "";
  let matched = null;
  if (quotedWaId) {
    try {
      const chats = await readChats();
      matched =
        chats.find((chat) => String(chat.whatsappMessageId || "").trim() === quotedWaId) || null;
    } catch {
      matched = null;
    }
  }
  const senderId = matched
    ? String(matched.senderId || "").trim()
    : quoted.fromMe
      ? String(counselorId || "").trim()
      : String(studentId || "").trim();
  return normalizeReplyTo({
    id: matched?.id || (quotedWaId ? `WAQ-${quotedWaId.slice(-16)}` : `WAQ-${crypto.randomUUID().slice(0, 8)}`),
    senderId,
    content: String(matched?.content || quotedBody || "").trim(),
    attachmentName: matched?.attachment?.name || quotedAttachmentName || "",
  });
}

async function syncWhatsappIncomingToChats() {
  const incoming = await readWhatsappIncoming();
  if (!incoming.length) return 0;
  const chats = await readChats();
  const students = await readStudemts();
  const existingKeys = new Set(
    chats
      .flatMap((chat) => [
        String(chat.whatsappMessageId || "").trim(),
        buildWhatsappIncomingRowKey(chat.whatsappIncomingId),
      ])
      .filter(Boolean)
  );
  const toAdd = [];
  let repaired = false;
  for (const row of incoming) {
    if (row.isGroup === true) continue;
    const from = String(row.from || "").trim();
    if (isIgnoredWhatsappIncomingChatId(from)) continue;
    const incomingKey = buildWhatsappIncomingRowKey(row.id);
    if (!incomingKey) continue;
    const nativeWaId = String(row.whatsappMessageId || "").trim();
    const resolvedStudent = await resolveIncomingWhatsappStudent({
      fromChatId: from,
      originalFrom: String(row.fromOriginal || from),
      counselorId: String(row.counselorId || ""),
      whatsappMessageId: nativeWaId,
    });
    let student = resolvedStudent;
    const mappedId = String(row.mappedStudentId || "").trim();
    if (!student && mappedId) {
      student = students.find((item) => String(item.id || "") === mappedId) || null;
    }
    if (!student?.id) continue;
    const matchingChats = chats.filter((chat) => {
      const chatIncomingId = String(chat.whatsappIncomingId || "").trim();
      const chatWaId = String(chat.whatsappMessageId || "").trim();
      return (
        (incomingKey && chatWaId === incomingKey) ||
        (nativeWaId && chatWaId === nativeWaId) ||
        (row.id && chatIncomingId === String(row.id))
      );
    });
    if (matchingChats.length) {
      const nextStudentId = String(student.id);
      const nextReceiver =
        String(row.counselorId || "").trim() ||
        resolveStudentPrimaryCounselorId(student, String(row.counselorId || ""));
      const incomingTs = new Date(row.timestamp || 0).getTime();
      const canReassign = chats.some((chat) => {
        if (String(chat.receiverId || "").trim() !== nextStudentId) return false;
        if (String(chat.senderId || "").trim() === nextStudentId) return false;
        const hintMatch = [from, nativeWaId, String(row.fromOriginal || "")].some(
          (hint) =>
            whatsappIdentitiesMatch(hint, chat?.whatsappDelivery?.chatId) ||
            whatsappIdentitiesMatch(hint, chat?.whatsappMessageId)
        );
        if (!hintMatch) return false;
        const ts = new Date(chat.timestamp || 0).getTime();
        return Number.isFinite(incomingTs) && Number.isFinite(ts) && Math.abs(ts - incomingTs) <= 24 * 60 * 60 * 1000;
      });
      for (const existingChat of matchingChats) {
        const currentSender = String(existingChat.senderId || "").trim();
        const senderNeedsUpdate = currentSender !== nextStudentId && (currentSender === "" || canReassign);
        const receiverNeedsUpdate = Boolean(nextReceiver) && String(existingChat.receiverId || "") !== nextReceiver;
        if (!senderNeedsUpdate && !receiverNeedsUpdate) {
          if (!existingChat.whatsappIncomingId && row.id) {
            existingChat.whatsappIncomingId = String(row.id);
            repaired = true;
          }
          continue;
        }
        if (senderNeedsUpdate) existingChat.senderId = nextStudentId;
        if (receiverNeedsUpdate && (currentSender === nextStudentId || senderNeedsUpdate)) {
          existingChat.receiverId = nextReceiver;
        }
        if (!existingChat.whatsappIncomingId && row.id) existingChat.whatsappIncomingId = String(row.id);
        repaired = true;
      }
      existingKeys.add(incomingKey);
      if (isNativeWhatsappMessageId(nativeWaId)) existingKeys.add(nativeWaId);
      continue;
    }
    if (existingKeys.has(incomingKey) || (nativeWaId && existingKeys.has(nativeWaId))) continue;
    const content = String(row.message || "").trim();
    const rowAttachment =
      row.attachment && typeof row.attachment === "object" && row.attachment.url
        ? row.attachment
        : null;
    if (!content && !rowAttachment) continue;
    const receiverId =
      String(row.counselorId || "").trim() ||
      resolveStudentPrimaryCounselorId(student, String(row.counselorId || ""));
    if (!receiverId) continue;
    const replyTo = normalizeReplyTo(row.replyTo);
    toAdd.push({
      id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
      senderId: String(student.id),
      receiverId,
      content: formatWhatsappReplyContent(content, replyTo),
      timestamp: row.timestamp || new Date().toISOString(),
      read: false,
      platform: "whatsapp",
      attachment: rowAttachment,
      ...(replyTo ? { replyTo } : {}),
      whatsappIncomingId: String(row.id || "").trim(),
      whatsappMessageId: isNativeWhatsappMessageId(nativeWaId) ? nativeWaId : incomingKey,
      whatsappDelivery: {
        attempted: true,
        status: "received",
        channel: "whatsapp",
        chatId: from,
      },
    });
    existingKeys.add(incomingKey);
    if (isNativeWhatsappMessageId(nativeWaId)) existingKeys.add(nativeWaId);
  }
  if (!toAdd.length && !repaired) return 0;
  await writeChats(toAdd.length ? [...chats, ...toAdd] : chats);
  return toAdd.length;
}

async function persistIncomingWhatsappMessage({ counselorId, message }) {
  const incomingId =
    String(message?.id?._serialized || "").trim() ||
    (() => {
      const from = String(message?.from || "").trim();
      const timestamp = String(message?.timestamp || "").trim();
      const body = String(message?.body || "").trim();
      if (!from || !timestamp) return "";
      return `fallback:${from}:${timestamp}:${body.slice(0, 50)}`;
    })();
  if (!incomingId) return;
  if (!message || message.fromMe === true) return;
  // Must run before getContact() — that call maps group senders to personal JIDs.
  if (isWhatsappGroupIncomingMessage(message)) return;
  const from = String(message.from || "");
  const resolvedThreadId = await resolveWhatsappThreadIdFromMessage(message);
  const fromChatId = resolvedThreadId || from;
  if (isIgnoredWhatsappIncomingChatId(fromChatId)) return;
  const numberPart = fromChatId.split("@")[0] || "";
  const incomingContactNumber = normalizePhoneDigits(numberPart);
  const student = await resolveIncomingWhatsappStudent({
    fromChatId,
    originalFrom: from,
    counselorId,
    whatsappMessageId: incomingId,
  });
  const content = String(message.body || "").trim();
  let attachment = null;
  if (message?.hasMedia === true && typeof message.downloadMedia === "function") {
    const senderState = ensureWhatsappState(counselorId);
    let media = null;
    try {
      media = await downloadWhatsappMessageMedia({
        client: senderState.client,
        message,
        onRetry: ({ attempt, retries, error, refetched, final }) => {
          if (final) {
            logEvent("whatsapp", "media download failed after retries", {
              from: fromChatId,
              attempts: retries,
              error,
            });
            return;
          }
          logEvent("whatsapp", `media download attempt ${attempt}/${retries} failed, retrying`, {
            from: fromChatId,
            error,
            refetched,
          });
        },
      });
    } catch (storeErr) {
      logEvent("whatsapp", "media download failed after retries", {
        from: fromChatId,
        error: String(storeErr?.message || storeErr),
      });
    }
    if (media?.data) {
      try {
        attachment = await storeWhatsappMediaAsAttachment(media, {
          from: fromChatId,
          studentId: String(student?.id || ""),
        });
      } catch (storeErr) {
        logEvent("whatsapp", "media store failed", {
          from: fromChatId,
          error: String(storeErr?.message || storeErr),
        });
      }
    }
  }
  const mediaDownloadFailed = message?.hasMedia === true && !attachment;
  const normalizedContent =
    content ||
    (attachment ? `Sent an attachment (${attachment.name || "file"}).` : "") ||
    (mediaDownloadFailed ? "Sent a media file (could not be downloaded)." : "");
  if (!normalizedContent && !attachment) return;
  const receiverId =
    String(counselorId || "").trim() || resolveStudentPrimaryCounselorId(student, counselorId);
  const replyTo = await buildReplyToFromWhatsappQuotedMessage(message, {
    studentId: String(student?.id || ""),
    counselorId: String(receiverId || counselorId || ""),
  });
  // Fallback: extract quoted text from raw message data when getQuotedMessage() fails
  let effectiveReplyTo = replyTo;
  if (!effectiveReplyTo && message.hasQuotedMsg === true) {
    try {
      const rawQuotedBody = String(message?._data?.quotedMsg?.body || "").trim();
      if (rawQuotedBody) {
        effectiveReplyTo = normalizeReplyTo({
          id: `WAQ-raw-${crypto.randomUUID().slice(0, 8)}`,
          senderId: "",
          content: rawQuotedBody,
        });
      }
    } catch {
      // Raw data access may not be available in all whatsapp-web.js versions.
    }
  }
  const incomingRowId = `WAIN-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
  await appendWhatsappIncoming({
    id: incomingRowId,
    counselorId: String(counselorId || ""),
    from: fromChatId,
    ...(from && from !== fromChatId ? { fromOriginal: from } : {}),
    contactNumber: incomingContactNumber || numberPart || "",
    message: normalizedContent,
    timestamp: message.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : new Date().toISOString(),
    isGroup: false,
    mappedStudentId: String(student?.id || ""),
    ...(attachment ? { attachment } : {}),
    ...(effectiveReplyTo ? { replyTo: effectiveReplyTo } : {}),
    ...(incomingId ? { whatsappMessageId: incomingId } : {}),
  });
  if (!student || !student.id) return;
  const chats = await readChats();
  if (
    chats.some(
      (chat) =>
        String(chat.whatsappMessageId || "") === incomingId ||
        String(chat.whatsappIncomingId || "") === incomingRowId
    )
  ) {
    return;
  }
  const chat = {
    id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
    senderId: String(student.id),
    receiverId,
    content: formatWhatsappReplyContent(normalizedContent, effectiveReplyTo),
    timestamp: message.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : new Date().toISOString(),
    read: false,
    platform: "whatsapp",
    attachment,
    ...(effectiveReplyTo ? { replyTo: effectiveReplyTo } : {}),
    whatsappIncomingId: incomingRowId,
    whatsappMessageId: incomingId,
    whatsappDelivery: {
      attempted: true,
      status: "received",
      channel: "whatsapp",
      chatId: fromChatId,
    },
  };
  await writeChats([...chats, chat]);
}

async function persistOutgoingStudentChatMessage({
  senderId,
  receiverId,
  content,
  attachment = null,
  whatsappDelivery = null,
  replyTo = null,
}) {
  try {
    return await appendPortalChatMessage({
      senderId,
      receiverId,
      content,
      platform: "whatsapp",
      attachment,
      whatsappDelivery,
      replyTo,
    });
  } catch (error) {
    logEvent("chat", "failed to persist outgoing student message", {
      senderId,
      receiverId,
      reason: String(error?.message || ""),
    });
    return null;
  }
}

async function deliverCounselorMessageToStudentWhatsapp({
  senderId,
  receiverId,
  content,
  attachment = null,
  persistToChat = true,
  replyTo = null,
}) {
  const studentId = String(receiverId || "").trim();
  if (!studentId) {
    return { attempted: false, status: "skipped", reason: "Student receiver id is missing." };
  }
  const students = await readStudemts();
  const student = students.find((item) => String(item.id || "") === studentId);
  if (!student) {
    return { attempted: false, status: "skipped", reason: "Student record not found." };
  }

  const actor = await resolveWhatsappMessenger(senderId);
  if (!actor) {
    return { attempted: false, status: "skipped", reason: "Sender is not authorized for WhatsApp messaging." };
  }

  const messageText = String(content || "").trim();
  const normalizedReplyTo = normalizeReplyTo(replyTo);
  const outgoingAttachment = attachment && typeof attachment === "object" ? attachment : null;
  const chatAttachment =
    outgoingAttachment && outgoingAttachment.url
      ? {
          name: String(outgoingAttachment.name || "attachment").trim(),
          mime: String(outgoingAttachment.mime || "").trim(),
          size: outgoingAttachment.size,
          url: String(outgoingAttachment.url || "").trim(),
        }
      : null;
  if (!messageText && !chatAttachment) {
    return {
      attempted: false,
      status: "skipped",
      reason: "Message text or attachment is required.",
    };
  }

  const effectiveSenderId = await resolveEffectiveWhatsappSenderId(senderId, student);
  const chatSenderId = String(effectiveSenderId || senderId || "").trim();
  const chatContent =
    messageText || (chatAttachment ? `Sent an attachment (${chatAttachment.name || "file"}).` : "");

  let deliveryResult = { attempted: false, status: "skipped", reason: "Not attempted." };

  if (!effectiveSenderId) {
    const branchWhatsappEnabled = await isBranchWhatsappEnabled();
    let reason;
    if (branchWhatsappEnabled && student) {
      reason = await studentPrimaryWhatsappUnavailableReason(student);
    } else {
      reason = branchWhatsappEnabled
        ? "No WhatsApp account is connected for this student's branch."
        : "No WhatsApp account is available for this branch.";
    }
    deliveryResult = {
      attempted: false,
      status: "skipped",
      reason,
    };
  } else {
    const sender = { id: effectiveSenderId };
    const phone = resolveStudentWhatsappPhone(student);
    let waChatId = toWhatsAppChatId(phone);
    if (!waChatId) {
      deliveryResult = { attempted: false, status: "skipped", reason: "Student WhatsApp number is missing." };
    } else {
      let preparedMedia = null;
      let preparedMediaMime = "";
      if (chatAttachment) {
        preparedMediaMime = String(chatAttachment.mime || "").toLowerCase();
        if (!isSupportedWhatsappMediaMime(preparedMediaMime)) {
          deliveryResult = {
            attempted: false,
            status: "skipped",
            reason: "Only PDF, Word, Excel, TXT, and image attachments can be sent via WhatsApp.",
          };
        } else {
          const mediaPath =
            resolveChatFileDiskPath(String(chatAttachment.url || "")) ||
            resolveStudentDocDiskPath(String(chatAttachment.url || ""));
          if (!mediaPath) {
            deliveryResult = {
              attempted: false,
              status: "skipped",
              reason: "Attachment file path is invalid.",
            };
          } else {
            preparedMedia = MessageMedia.fromFilePath(mediaPath);
            if (chatAttachment.name) {
              preparedMedia.filename = chatAttachment.name;
            }
            if (preparedMediaMime) {
              preparedMedia.mimetype = preparedMediaMime;
            }
          }
        }
      } else if (!messageText) {
        deliveryResult = {
          attempted: false,
          status: "skipped",
          reason: "Message text or attachment is required.",
        };
      }

      if (deliveryResult.status === "skipped" && deliveryResult.reason === "Not attempted.") {
        const senderReady = await ensureWhatsappSenderReady(sender.id);
        const senderState = ensureWhatsappState(sender.id);
        if (!senderReady || !senderState.client || senderState.status !== "connected") {
          deliveryResult = { attempted: true, status: "failed", reason: "WhatsApp is not connected." };
        } else {
          let chatIds = [waChatId].filter(Boolean);
          try {
            const resolvedIds = await collectWhatsappSendChatIds(senderState.client, student, phone);
            if (resolvedIds.length) chatIds = resolvedIds;
          } catch {
            // Keep the normalized @c.us fallback when lookup fails.
          }
          if (waChatId && !chatIds.includes(waChatId)) {
            chatIds = [waChatId, ...chatIds];
          }
          logEvent("whatsapp", "message send candidates", {
            from: sender.id,
            to: receiverId,
            chatIds,
          });
          const quotedMessageId = await resolveQuotedWhatsappMessageId(normalizedReplyTo);
          const whatsappBody = quotedMessageId
            ? messageText
            : formatWhatsappReplyContent(messageText, normalizedReplyTo);
          const sendOptions = {};
          if (quotedMessageId) sendOptions.quotedMessageId = quotedMessageId;
          if (preparedMedia && whatsappBody) sendOptions.caption = whatsappBody;
          if (preparedMedia && preparedMediaMime && !preparedMediaMime.startsWith("image/")) {
            sendOptions.sendMediaAsDocument = true;
          }

          const performSend = async (chatId = waChatId) => {
            const live = ensureWhatsappState(sender.id);
            if (!live.client || live.status !== "connected") {
              throw new Error("WhatsApp is not connected.");
            }
            const targetChatId = String(chatId || waChatId || "").trim();
            if (!targetChatId) throw new Error("Student WhatsApp number is missing.");
            const payload = preparedMedia || whatsappBody || messageText;
            const helpersReady = await ensureWhatsappWebJsReady(live.client);
            if (!helpersReady) {
              throw new Error("WhatsApp web helpers are not injected.");
            }
            const sendChatId = (await ensureWhatsappChatReady(live.client, targetChatId)) || targetChatId;
            const options = {
              ...sendOptions,
              waitUntilMsgSent: true,
              sendSeen: false,
              linkPreview: false,
            };
            const sentAt = Date.now();
            let sentMsg = null;
            try {
              sentMsg = await live.client.sendMessage(sendChatId, payload, options);
            } catch (error) {
              if (isWhatsappLidError(error) && sendChatId !== targetChatId && !isWhatsappLidChatId(targetChatId)) {
                try {
                  sentMsg = await live.client.sendMessage(targetChatId, payload, options);
                } catch (fallbackError) {
                  if (isWhatsappLidError(fallbackError)) throw fallbackError;
                  throw error;
                }
              } else if (isWhatsappLidError(error)) {
                throw error;
              } else if (sendOptions.quotedMessageId) {
                try {
                  sentMsg = await live.client.sendMessage(sendChatId, payload, {
                    waitUntilMsgSent: true,
                    sendSeen: false,
                    linkPreview: false,
                    ...(preparedMedia && whatsappBody ? { caption: whatsappBody } : {}),
                    ...(preparedMedia && preparedMediaMime && !preparedMediaMime.startsWith("image/")
                      ? { sendMediaAsDocument: true }
                      : {}),
                  });
                } catch (retryError) {
                  if (isWhatsappLidError(retryError)) throw retryError;
                  throw error;
                }
              } else {
                throw error;
              }
            }
            if (!isUsableSentWhatsappMessage(sentMsg)) {
              sentMsg = await recoverRecentlySentWhatsappMessage(live.client, sendChatId, sentAt);
              if (!isUsableSentWhatsappMessage(sentMsg) && sendChatId !== targetChatId) {
                sentMsg = await recoverRecentlySentWhatsappMessage(live.client, targetChatId, sentAt);
              }
              if (isUsableSentWhatsappMessage(sentMsg)) {
                logEvent("whatsapp", "recovered sent message after empty library return", {
                  from: sender.id,
                  to: receiverId,
                  chatId: targetChatId,
                });
              }
            }
            if (!isUsableSentWhatsappMessage(sentMsg)) {
              throw new Error("WhatsApp did not return a sent message.");
            }
            return sentMsg;
          };

          const sendAndConfirm = async (chatId) => {
            const sentMsg = await performSend(chatId);
            const live = ensureWhatsappState(sender.id);
            await waitForWhatsappMessageAck(live.client, sentMsg);
            return sentMsg;
          };

          const logSent = () => {
            const live = ensureWhatsappState(sender.id);
            live.lastSuccessfulSendAt = Date.now();
            if (preparedMedia) {
              logEvent("whatsapp", "media message sent", {
                from: sender.id,
                to: receiverId,
                chatId: waChatId,
                mime: preparedMediaMime,
                quoted: Boolean(quotedMessageId || normalizedReplyTo),
              });
            } else {
              logEvent("whatsapp", "message sent", {
                from: sender.id,
                to: receiverId,
                chatId: waChatId,
                quoted: Boolean(quotedMessageId || normalizedReplyTo),
              });
            }
          };

          const buildSentResult = (sentMsg) => {
            const whatsappMessageId = normalizeWhatsappMessageId(sentMsg).serialized;
            return {
              attempted: true,
              status: "sent",
              channel: "whatsapp",
              chatId: waChatId,
              ...(whatsappMessageId ? { whatsappMessageId } : {}),
              ...(quotedMessageId ? { quotedMessageId } : {}),
            };
          };

          let lastSendError = null;
          let restartedForStale = false;
          for (const candidateId of chatIds) {
            waChatId = candidateId;
            try {
              const sentMsg = await sendAndConfirm(candidateId);
              logSent();
              deliveryResult = buildSentResult(sentMsg);
              lastSendError = null;
              break;
            } catch (error) {
              lastSendError = error;
              logEvent("whatsapp", "message send attempt failed", {
                from: sender.id,
                to: receiverId,
                chatId: candidateId,
                reason: String(error?.message || ""),
              });
              if (
                !restartedForStale &&
                (isWhatsappPuppeteerStaleSessionError(error) || isWhatsappWebJsMissingError(error))
              ) {
                restartedForStale = true;
                logEvent(
                  "whatsapp",
                  isWhatsappWebJsMissingError(error)
                    ? "web helpers missing; restarting client"
                    : "stale session detected; restarting client",
                  {
                    from: sender.id,
                    to: receiverId,
                    reason: String(error?.message || ""),
                  }
                );
                try {
                  await restartWhatsappBrowserSession(sender.id);
                  await ensureWhatsappSenderReady(sender.id, 30000);
                  const sentMsg = await sendAndConfirm(candidateId);
                  logSent();
                  deliveryResult = buildSentResult(sentMsg);
                  lastSendError = null;
                  break;
                } catch (errorAfter) {
                  lastSendError = errorAfter;
                }
              }
            }
          }

          if (deliveryResult.status !== "sent" && lastSendError) {
            logEvent("whatsapp", "message send failed", {
              from: sender.id,
              to: receiverId,
              reason: String(lastSendError?.message || ""),
            });
            deliveryResult = {
              attempted: true,
              status: "failed",
              reason: String(lastSendError?.message || "Failed to send message via WhatsApp."),
            };
          }
        }
      }
    }
  }

  if (persistToChat && chatSenderId && chatContent) {
    const persisted = await persistOutgoingStudentChatMessage({
      senderId: chatSenderId,
      receiverId: studentId,
      content: chatContent,
      attachment: chatAttachment,
      whatsappDelivery: deliveryResult,
      replyTo: normalizedReplyTo,
    });
    if (persisted && deliveryResult.whatsappMessageId) {
      try {
        const chats = await readChats();
        const next = chats.map((chat) =>
          String(chat.id || "") === String(persisted.id || "")
            ? { ...chat, whatsappMessageId: deliveryResult.whatsappMessageId }
            : chat
        );
        await writeChats(next);
      } catch {
        // Best-effort link for future WhatsApp quotes.
      }
    }
  }

  return deliveryResult;
}

async function syncWhatsappChatHistoryForStudent(counselorUserId, studentId) {
  const cleanCounselorId = String(counselorUserId || "").trim();
  const cleanStudentId = String(studentId || "").trim();
  if (!cleanCounselorId) return { synced: 0, error: "Counselor user ID is required." };
  if (!cleanStudentId) return { synced: 0, error: "Student ID is required." };

  const state = ensureWhatsappState(cleanCounselorId);
  if (!state.client || state.status !== "connected") {
    return { synced: 0, error: "WhatsApp is not connected." };
  }

  const students = await readStudemts();
  const student = students.find((s) => String(s.id || "") === cleanStudentId);
  if (!student) return { synced: 0, error: "Student not found." };

  const phone = resolveStudentWhatsappPhone(student);
  let waChatId = toWhatsAppChatId(phone);
  if (!waChatId) return { synced: 0, error: "Student WhatsApp number is missing." };
  try {
    waChatId = (await resolveWhatsappSendChatId(state.client, student, phone)) || waChatId;
  } catch {
    // Keep the normalized @c.us fallback when lookup fails.
  }

  let waChat;
  try {
    waChat = await state.client.getChatById(waChatId);
  } catch {
    return { synced: 0, error: "WhatsApp chat not found for this student." };
  }
  if (!waChat) return { synced: 0, error: "WhatsApp chat not found for this student." };

  let waMessages;
  try {
    waMessages = await waChat.fetchMessages({ limit: 50 });
  } catch {
    return { synced: 0, error: "Failed to fetch WhatsApp messages." };
  }
  if (!waMessages || !waMessages.length) return { synced: 0 };

  const chats = await readChats();
  const existingWaIds = new Set(
    chats.map((c) => String(c.whatsappMessageId || "").trim()).filter(Boolean)
  );

  const receiverId = resolveStudentPrimaryCounselorId(student, cleanCounselorId);
  const toAdd = [];

  for (const msg of waMessages) {
    if (isWhatsappGroupIncomingMessage(msg)) continue;

    const waId = String(msg.id?._serialized || "").trim();
    if (!waId || existingWaIds.has(waId)) continue;

    const isFromMe = msg.fromMe === true;
    const senderId = isFromMe ? (receiverId || cleanCounselorId) : String(student.id);
    const msgReceiverId = isFromMe ? String(student.id) : (receiverId || cleanCounselorId);
    const content = String(msg.body || "").trim();

    let attachment = null;
    if (msg.hasMedia === true && typeof msg.downloadMedia === "function") {
      try {
        const media = await downloadWhatsappMessageMedia({
          client: state.client,
          message: msg,
        });
        if (media?.data) {
          attachment = await storeWhatsappMediaAsAttachment(media, { from: waChatId });
        }
      } catch {
        // Skip media if download fails during history sync.
      }
    }

    const normalizedContent =
      content || (attachment ? `Sent an attachment (${attachment.name || "file"}).` : "");
    if (!normalizedContent && !attachment) continue;

    let replyTo = null;
    try {
      replyTo = await buildReplyToFromWhatsappQuotedMessage(msg, {
        studentId: String(student.id),
        counselorId: String(receiverId || cleanCounselorId),
      });
    } catch {
      replyTo = null;
    }

    toAdd.push({
      id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
      senderId,
      receiverId: msgReceiverId,
      content: normalizedContent,
      timestamp: msg.timestamp
        ? new Date(Number(msg.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
      read: true,
      platform: "whatsapp",
      attachment,
      ...(replyTo ? { replyTo } : {}),
      whatsappMessageId: waId,
      whatsappDelivery: {
        attempted: true,
        status: isFromMe ? "sent" : "received",
        channel: "whatsapp",
        chatId: waChatId,
      },
    });
    existingWaIds.add(waId);
  }

  if (!toAdd.length) return { synced: 0 };

  const latestChats = await readChats();
  const latestWaIds = new Set(
    latestChats.map((c) => String(c.whatsappMessageId || "").trim()).filter(Boolean)
  );
  const deduped = toAdd.filter((m) => !latestWaIds.has(m.whatsappMessageId));
  if (!deduped.length) return { synced: 0 };

  await writeChats([...latestChats, ...deduped]);
  logEvent("whatsapp", "history sync completed", {
    counselorId: cleanCounselorId,
    studentId: cleanStudentId,
    synced: deduped.length,
  });
  return { synced: deduped.length };
}

async function syncAllWhatsappChatHistory(counselorUserId) {
  const cleanCounselorId = String(counselorUserId || "").trim();
  if (!cleanCounselorId) return { synced: 0, error: "Counselor user ID is required." };

  const state = ensureWhatsappState(cleanCounselorId);
  if (!state.client || state.status !== "connected") {
    return { synced: 0, error: "WhatsApp is not connected." };
  }

  let waChats;
  try {
    waChats = await state.client.getChats();
  } catch {
    return { synced: 0, error: "Failed to fetch WhatsApp chats." };
  }
  if (!waChats || !waChats.length) return { synced: 0 };

  const students = await readStudemts();
  let totalSynced = 0;

  for (const waChat of waChats) {
    if (waChat.isGroup) continue;
    const chatId = String(waChat.id?._serialized || "").trim();
    if (!chatId || !chatId.includes("@c.us")) continue;

    const numberPart = chatId.split("@")[0] || "";
    const digits = normalizePhoneDigits(numberPart);
    if (!digits) continue;

    const student = students.find((s) => studentPhoneDigitsMatch(digits, s));
    if (!student) continue;

    try {
      const result = await syncWhatsappChatHistoryForStudent(cleanCounselorId, String(student.id));
      totalSynced += (result.synced || 0);
    } catch {
      // Continue syncing remaining students even if one fails.
    }
  }

  logEvent("whatsapp", "full history sync completed", {
    counselorId: cleanCounselorId,
    synced: totalSynced,
  });
  return { synced: totalSynced };
}

module.exports = {
  isSupportedWhatsappMediaMime,
  sanitizeUserIdForPath,
  ensureWhatsappState,
  snapshotWhatsappState,
  summarizeWhatsappHealth,
  refreshWhatsappSessionHealth,
  startWhatsappSession,
  stopWhatsappSession,
  regenerateWhatsappQrCode,
  userHasSavedWhatsappSession,
  initializeWhatsappSessionsOnStartup,
  shutdownWhatsappSessions,
  reconnectActiveWhatsappSessions,
  restartActiveWhatsappSessions,
  healthCheckActiveWhatsappSessions,
  isWhatsappPuppeteerStaleSessionError,
  waitForWhatsappSessionConnected,
  restartWhatsappBrowserSession,
  reconnectWhatsappSessionForAdmin,
  toWhatsAppChatId,
  normalizePhoneDigits,
  normalizeSriLankaStudentPhone,
  normalizeStudentPhone,
  normalizeWhatsappNumber,
  resolveStudentWhatsappPhone,
  resolveWhatsappThreadIdFromMessage,
  findStudentByWhatsappFrom,
  persistIncomingWhatsappMessage,
  resolveIncomingWhatsappStudent,
  syncWhatsappIncomingToChats,
  syncWhatsappChatHistoryForStudent,
  syncAllWhatsappChatHistory,
  isWhatsappGroupChatRecord,
  resolveStudentPrimaryCounselorId,
  deliverCounselorMessageToStudentWhatsapp,
  persistOutgoingStudentChatMessage,
  listSavedWhatsappSessionUserIds,
  resolveCounselor,
  resolveWhatsappMessenger,
  resolveWhatsappIntegrationContext,
  resolveWhatsappIntegrationContextForUser,
  prepareBranchWhatsappConnect,
  isAdminWhatsappMessenger,
  ADMIN_WHATSAPP_USER_ID,
};
