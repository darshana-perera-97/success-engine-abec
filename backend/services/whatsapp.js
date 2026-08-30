const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
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
const WHATSAPP_AUTH_TIMEOUT_RECOVERY_MS = 15 * 1000;
const WHATSAPP_INIT_MAX_ATTEMPTS = 3;
const WHATSAPP_SILENT_RECONNECT_MAX_ATTEMPTS = 8;
const WHATSAPP_SILENT_RECONNECT_BASE_MS = 5 * 1000;
const WHATSAPP_SILENT_RECONNECT_LONG_MS = 2 * 60 * 1000;
const WHATSAPP_SEND_WAIT_MS = 45 * 1000;
const WHATSAPP_ACK_WAIT_MS = 4 * 1000;
const WHATSAPP_ACK_SERVER = 1;
const WHATSAPP_ACK_ERROR = -1;
const WHATSAPP_STARTUP_READY_TIMEOUT_MS = 90 * 1000;
const WHATSAPP_LOGOUT_REASON_RE = /logout|unpaired|logged.?out/i;
const ADMIN_WHATSAPP_USER_ID = "ADM001";
let isWhatsappShuttingDown = false;
let whatsappInitChain = Promise.resolve();

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

function enqueueWhatsappInit(task) {
  const run = whatsappInitChain.then(task);
  whatsappInitChain = run.catch(() => {});
  return run;
}

function markWhatsappInitializeFailed(state, userId, error) {
  clearWhatsappAuthenticatedTimeout(state);
  state.status = "error";
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
    return;
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
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  for (const pid of listBrowserProcessIdsForProfile(profileDir)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process may already be gone.
    }
  }
  await removeStaleBrowserLockFiles(profileDir);
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

function isWhatsappLogoutDisconnectReason(reason) {
  return WHATSAPP_LOGOUT_REASON_RE.test(String(reason || ""));
}

function isCurrentWhatsappClient(state, client) {
  return Boolean(state && client && state.client === client);
}

function scheduleSilentWhatsappReconnect(userId, { reason = "" } = {}) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId || isWhatsappShuttingDown) return;
  const state = ensureWhatsappState(cleanUserId);
  if (state.manualStop) return;
  if (state.status === "connected" || state.status === "authenticated" || state.status === "awaiting_qr_scan") {
    return;
  }
  const exhausted = state.reconnectAttempts >= WHATSAPP_SILENT_RECONNECT_MAX_ATTEMPTS;
  if (exhausted) {
    state.reconnectAttempts = 0;
  }
  const attempt = state.reconnectAttempts + 1;
  state.reconnectAttempts = attempt;
  state.status = "reconnecting";
  state.error = exhausted
    ? "WhatsApp is still trying to restore the session."
    : "";
  state.lastUpdatedAt = new Date().toISOString();
  clearWhatsappReconnectTimer(state);
  const delayMs = exhausted
    ? WHATSAPP_SILENT_RECONNECT_LONG_MS
    : Math.min(WHATSAPP_SILENT_RECONNECT_BASE_MS * 2 ** (attempt - 1), 60 * 1000);
  logEvent("whatsapp", exhausted ? "silent reconnect backing off" : "scheduling silent reconnect", {
    userId: cleanUserId,
    attempt,
    delayMs,
    reason: String(reason || ""),
  });
  state.reconnectTimer = setTimeout(async () => {
    if (isWhatsappShuttingDown) return;
    const current = ensureWhatsappState(cleanUserId);
    if (current.manualStop || current.status === "connected") return;
    try {
      await startWhatsappSession(cleanUserId, { awaitInitialize: true, silentReconnect: true });
    } catch (error) {
      console.warn(`WhatsApp silent reconnect failed for ${cleanUserId}:`, error);
      scheduleSilentWhatsappReconnect(cleanUserId, { reason: "retry" });
    }
  }, delayMs);
  if (typeof state.reconnectTimer.unref === "function") state.reconnectTimer.unref();
}

function markWhatsappAuthenticatedTimeout(state, userId = "") {
  if (!state || state.status !== "authenticated") return;
  state.authTimedOut = true;
  state.status = "error";
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
  if (cleanUserId) {
    scheduleWhatsappAuthTimeoutRecovery(cleanUserId);
  }
}

function scheduleWhatsappAuthenticatedTimeout(state, userId = "") {
  clearWhatsappAuthenticatedTimeout(state);
  state.authenticatedTimeout = setTimeout(() => {
    markWhatsappAuthenticatedTimeout(state, userId);
  }, AUTHENTICATED_STUCK_TIMEOUT_MS);
  if (typeof state.authenticatedTimeout.unref === "function") {
    state.authenticatedTimeout.unref();
  }
}

function snapshotWhatsappState(userId) {
  const state = ensureWhatsappState(userId);
  return {
    userId: String(userId || "").trim(),
    status: state.status,
    qrCodeDataUrl: state.qrCodeDataUrl,
    error: state.error,
    connectedAt: state.connectedAt,
    whatsappName: state.whatsappName,
    whatsappNumber: state.whatsappNumber,
    whatsappProfilePicUrl: state.whatsappProfilePicUrl,
    lastUpdatedAt: state.lastUpdatedAt,
  };
}

async function startWhatsappSession(userId, { awaitInitialize = false, initAttempt = 1, silentReconnect = false } = {}) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) throw new Error("Counselor user id is required.");
  const state = ensureWhatsappState(cleanUserId);
  if (
    state.client &&
    (state.status === "connecting" ||
      state.status === "awaiting_qr_scan" ||
      state.status === "authenticated" ||
      state.status === "connected")
  ) {
    return snapshotWhatsappState(cleanUserId);
  }
  state.manualStop = false;
  state.recovering = true;
  clearWhatsappReconnectTimer(state);
  if (state.client) {
    try {
      await state.client.destroy();
    } catch {
      // Ignore cleanup failure and allow creating a fresh session.
    }
  }
  const sessionDataDir = resolveWhatsappSessionDataDir(cleanUserId);
  await terminateBrowserProcessesUsingProfile(sessionDataDir);
  await fs.mkdir(path.join(WHATSAPP_CONNECTIONS_DIR, sanitizeUserIdForPath(cleanUserId)), { recursive: true });
  const webVersion = await resolveWhatsappWebVersion();
  const client = new Client(buildWhatsappClientOptions(cleanUserId, webVersion));
  state.sessionGeneration = Number(state.sessionGeneration || 0) + 1;
  state.client = client;
  state.recovering = false;
  state.silentReconnect = silentReconnect === true;
  state.status = silentReconnect ? "reconnecting" : "connecting";
  state.qrCodeDataUrl = "";
  state.error = "";
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
    try {
      state.qrCodeDataUrl = await QRCode.toDataURL(qr);
      state.status = "awaiting_qr_scan";
      state.error = "";
      state.authTimedOut = false;
      clearWhatsappAuthenticatedTimeout(state);
      state.lastUpdatedAt = new Date().toISOString();
      if (state.silentReconnect) {
        state.silentReconnect = false;
      }
    } catch {
      state.error = "Failed to render WhatsApp QR code.";
      state.lastUpdatedAt = new Date().toISOString();
    }
  });

  client.on("authenticated", () => {
    if (!isCurrentWhatsappClient(state, client)) return;
    state.status = "authenticated";
    state.error = "";
    state.authTimedOut = false;
    scheduleWhatsappAuthenticatedTimeout(state, cleanUserId);
    state.lastUpdatedAt = new Date().toISOString();
  });

  client.on("ready", async () => {
    if (!isCurrentWhatsappClient(state, client)) return;
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
    state.qrCodeDataUrl = "";
    state.error = "";
    state.connectedAt = new Date().toISOString();
    state.whatsappName = String(info.pushname || info.platform || "WhatsApp User");
    state.whatsappNumber = String(numberFromWid || "");
    state.whatsappProfilePicUrl = profilePicUrl;
    state.authTimedOut = false;
    state.silentReconnect = false;
    state.reconnectAttempts = 0;
    state.lastUpdatedAt = new Date().toISOString();
    installWhatsappLidChatPatch(client).catch(() => {
      // LID patch is best-effort; send path still resolves chat IDs.
    });
    onWhatsappSessionReady(cleanUserId).catch(() => {
      // Branch linkage is best-effort; session remains connected.
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
      state.error = "";
      state.lastUpdatedAt = new Date().toISOString();
      notifyWhatsappSessionDisconnected(cleanUserId);
      return;
    }
    state.status = "reconnecting";
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
  }).catch(async (error) => {
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
      await new Promise((resolve) => setTimeout(resolve, 1500 * initAttempt));
      return startWhatsappSession(cleanUserId, {
        awaitInitialize,
        initAttempt: initAttempt + 1,
        silentReconnect,
      });
    }
    markWhatsappInitializeFailed(state, cleanUserId, error);
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
  clearWhatsappReconnectTimer(state);
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
  state.client = null;
  state.status = "disconnected";
  state.qrCodeDataUrl = "";
  state.error = "";
  state.authTimedOut = false;
  state.manualStop = false;
  state.silentReconnect = false;
  state.reconnectAttempts = 0;
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
  const started = Date.now();
  while (Date.now() - started < WHATSAPP_STARTUP_READY_TIMEOUT_MS) {
    const state = ensureWhatsappState(cleanUserId);
    if (state.status === "connected") return "connected";
    if (state.status === "awaiting_qr_scan") return "awaiting_qr_scan";
    if (state.manualStop) return String(state.status || "disconnected");
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  const timedOut = ensureWhatsappState(cleanUserId);
  if (timedOut.status === "connected") return "connected";
  if (timedOut.status === "awaiting_qr_scan") return "awaiting_qr_scan";
  if (!timedOut.manualStop) {
    scheduleSilentWhatsappReconnect(cleanUserId, { reason: "startup-wait-timeout" });
  }
  return String(timedOut.status || "reconnecting");
}

async function initializeWhatsappSessionsOnStartup() {
  try {
    const users = await readUsers();
    const userIds = await listSavedWhatsappSessionUserIds(users);
    if (!userIds.length) {
      console.log("WhatsApp: no saved sessions found to restore on boot.");
      await syncBranchWhatsappMessengersFromSessions();
      return;
    }

    console.log(`WhatsApp: restoring ${userIds.length} saved session(s) on boot...`);
    for (const userId of userIds) {
      console.log(`WhatsApp: starting saved session for ${userId}`);
      await startSavedWhatsappSessionIfExists(userId);
    }

    const results = await Promise.all(
      userIds.map(async (userId) => {
        const status = await waitForStartupWhatsappSession(userId);
        if (status === "connected") {
          console.log(`WhatsApp: restored ${userId}`);
        } else if (status === "awaiting_qr_scan") {
          console.warn(`WhatsApp: ${userId} needs a QR scan after restart`);
        } else {
          console.warn(`WhatsApp: ${userId} is ${status} after restart — retrying in the background`);
        }
        return { userId, status };
      })
    );

    const connectedCount = results.filter((row) => row.status === "connected").length;
    console.log(`WhatsApp: ${connectedCount}/${userIds.length} saved session(s) connected after boot.`);
    await syncBranchWhatsappMessengersFromSessions();
  } catch (error) {
    console.error("Failed to initialize WhatsApp sessions on startup:", error);
  }
}

async function shutdownWhatsappSessions() {
  isWhatsappShuttingDown = true;
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
  const msg = String(error?.message || error || "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("detached frame") ||
    msg.includes("execution context was destroyed") ||
    msg.includes("navigating frame was detached") ||
    msg.includes("target closed") ||
    msg.includes("session closed") ||
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

async function ensureWhatsappSenderReady(userId, timeoutMs = WHATSAPP_SEND_WAIT_MS) {
  const key = String(userId || "").trim();
  if (!key) return false;
  const state = ensureWhatsappState(key);
  if (state.manualStop) return false;
  if (state.client && state.status === "connected") return true;
  const waitable = new Set(["authenticated", "reconnecting", "connecting"]);
  const status = String(state.status || "");
  if (!waitable.has(status)) {
    let hasSaved = false;
    try {
      hasSaved = await userHasSavedWhatsappSession(key);
    } catch {
      hasSaved = false;
    }
    if (!hasSaved) return false;
    scheduleSilentWhatsappReconnect(key, { reason: "send-restore" });
  }
  try {
    await waitForWhatsappSessionConnected(key, timeoutMs);
    const live = ensureWhatsappState(key);
    return Boolean(live.client && live.status === "connected");
  } catch {
    return false;
  }
}

async function restartWhatsappBrowserSession(userId) {
  const key = String(userId || "").trim();
  if (!key) throw new Error("Counselor user id is required.");
  const previous = whatsappSessionRecoveryChains.get(key) || Promise.resolve();
  const recovery = previous.then(async () => {
    const state = ensureWhatsappState(key);
    if (state.manualStop) return;
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
    state.recovering = false;
    await startWhatsappSession(key, { silentReconnect: true });
    await waitForWhatsappSessionConnected(key, 120000);
  });
  whatsappSessionRecoveryChains.set(key, recovery.catch(() => {}));
  await recovery;
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

async function isWhatsappClientHealthy(state) {
  if (!state?.client || state.status !== "connected") return false;
  try {
    const waState = await withTimeout(state.client.getState(), 15000);
    return String(waState || "").toUpperCase() === "CONNECTED";
  } catch {
    return false;
  }
}

async function healthCheckActiveWhatsappSessions() {
  const unhealthyUserIds = [];
  const restoreUserIds = [];
  for (const [userId, state] of whatsappSessions.entries()) {
    const status = String(state?.status || "");
    if (status === "reconnecting" || status === "connecting" || status === "awaiting_qr_scan" || status === "authenticated") {
      continue;
    }
    if (status === "connected") {
      const healthy = await isWhatsappClientHealthy(state);
      if (healthy) continue;
      unhealthyUserIds.push(userId);
      continue;
    }
    if (state.manualStop) continue;
    if (status === "disconnected" || status === "error" || status === "auth_failed") {
      try {
        if (await userHasSavedWhatsappSession(userId)) {
          restoreUserIds.push(userId);
        }
      } catch {
        // Ignore lookup errors and continue other sessions.
      }
    }
  }
  if (!unhealthyUserIds.length && !restoreUserIds.length) return;
  console.log(
    `WhatsApp: health check restoring ${unhealthyUserIds.length} live session(s) and ${restoreUserIds.length} saved session(s)`
  );
  for (const userId of unhealthyUserIds) {
    try {
      await restartWhatsappBrowserSession(userId);
    } catch (error) {
      console.error(`Failed to restore WhatsApp session for ${userId}:`, error);
      scheduleSilentWhatsappReconnect(userId, { reason: "health-check" });
    }
  }
  for (const userId of restoreUserIds) {
    scheduleSilentWhatsappReconnect(userId, { reason: "health-check-saved-session" });
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
  return String(value._serialized || value.id?._serialized || value.id || "").trim();
}

function isWhatsappLidError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  return msg.includes("no lid") || msg.includes("lid is missing") || msg.includes("accountlid");
}

async function installWhatsappLidChatPatch(client) {
  if (!client?.pupPage || typeof client.pupPage.evaluate !== "function") return;
  await client.pupPage.evaluate(() => {
    if (!window.WWebJS || typeof window.WWebJS.getChat !== "function") return;
    if (window.WWebJS.__seLidPatched) return;
    const originalGetChat = window.WWebJS.getChat.bind(window.WWebJS);
    window.WWebJS.getChat = async (chatId, options = {}) => {
      try {
        return await originalGetChat(chatId, options);
      } catch (error) {
        const msg = String(error?.message || error || "");
        if (!/no lid|lid is missing|accountlid/i.test(msg)) throw error;
      }
      const digits = String(chatId || "")
        .split("@")[0]
        .replace(/[^\d]/g, "");
      if (!digits) return undefined;
      let lidSerialized = "";
      try {
        const query = window.require("WAWebContactSyncUtils").constructUsyncDeltaQuery([
          { type: "add", phoneNumber: digits },
        ]);
        const result = await query.execute();
        const lid = result?.list?.[0]?.lid;
        if (lid) {
          const wid = window.require("WAWebWidFactory").createWid(lid);
          lidSerialized = wid?._serialized || String(lid);
        }
      } catch {
        lidSerialized = "";
      }
      if (!lidSerialized) return undefined;
      return originalGetChat(lidSerialized, options);
    };
    window.WWebJS.__seLidPatched = true;
  });
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
          return wid?._serialized || String(lid);
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
      if (chatId && chatId.includes("@") && !isIgnoredWhatsappIncomingChatId(chatId)) {
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
      if (from && from.includes("@") && !isIgnoredWhatsappIncomingChatId(from)) {
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
        pushCandidate(await client.getNumberId(digits));
      } catch {
        // Number lookup can fail when WhatsApp Web has not synced the contact yet.
      }
    }
  }
  if (client && typeof client.getContactLidAndPhone === "function" && fallback) {
    try {
      const pairs = await client.getContactLidAndPhone([fallback]);
      for (const pair of Array.isArray(pairs) ? pairs : []) {
        pushCandidate(pair?.lid);
        pushCandidate(pair?.pn);
      }
    } catch {
      // LID lookup is best-effort.
    }
  }
  pushCandidate(await resolveLidViaUsync(client, phone || fallback));
  pushCandidate(await findKnownStudentWhatsappChatId(String(student?.id || "")));
  pushCandidate(fallback);

  const lids = candidates.filter((id) => id.includes("@lid"));
  const others = candidates.filter((id) => !id.includes("@lid"));
  return [...lids, ...others];
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
  if (!sentMsg) throw new Error("WhatsApp did not return a sent message.");
  const initialAck = readWhatsappMessageAck(sentMsg);
  if (initialAck <= WHATSAPP_ACK_ERROR) {
    throw new Error("WhatsApp rejected the message.");
  }
  if (initialAck >= WHATSAPP_ACK_SERVER) return initialAck;

  const serialized = String(sentMsg.id?._serialized || "").trim();
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
      const id = String(msg?.id?._serialized || "").trim();
      if (serialized && id && id !== serialized) return;
      const nextAck = Number(ack);
      if (nextAck <= WHATSAPP_ACK_ERROR) {
        finish(new Error("WhatsApp rejected the message."));
        return;
      }
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
      if (ack <= WHATSAPP_ACK_ERROR) {
        finish(new Error("WhatsApp rejected the message."));
        return;
      }
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
  const rawFrom = String(chatId || "");
  const numberPart = rawFrom.split("@")[0] || "";
  const incomingDigits = normalizePhoneDigits(numberPart);
  if (!incomingDigits) return null;
  const students = await readStudemts();
  return students.find((student) => studentPhoneDigitsMatch(incomingDigits, student)) || null;
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
  for (const row of incoming) {
    if (row.isGroup === true) continue;
    const from = String(row.from || "").trim();
    if (isIgnoredWhatsappIncomingChatId(from)) continue;
    const incomingKey = buildWhatsappIncomingRowKey(row.id);
    if (!incomingKey || existingKeys.has(incomingKey)) continue;
    let student = null;
    const mappedId = String(row.mappedStudentId || "").trim();
    if (mappedId) {
      student = students.find((item) => String(item.id || "") === mappedId) || null;
    }
    if (!student) {
      student = await findStudentByWhatsappFrom(from);
    }
    if (!student?.id) continue;
    const content = String(row.message || "").trim();
    const rowAttachment =
      row.attachment && typeof row.attachment === "object" && row.attachment.url
        ? row.attachment
        : null;
    if (!content && !rowAttachment) continue;
    const receiverId = resolveStudentPrimaryCounselorId(student, String(row.counselorId || ""));
    if (!receiverId) continue;
    const replyTo = normalizeReplyTo(row.replyTo);
    const nativeWaId = String(row.whatsappMessageId || "").trim();
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
  if (!toAdd.length) return 0;
  await writeChats([...chats, ...toAdd]);
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
  const student = await findStudentByWhatsappFrom(fromChatId);
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
  const receiverId = resolveStudentPrimaryCounselorId(student, counselorId);
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
  await appendWhatsappIncoming({
    id: `WAIN-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    counselorId: String(counselorId || ""),
    from: fromChatId,
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
  if (chats.some((chat) => String(chat.whatsappMessageId || "") === incomingId)) {
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
            const options = Object.keys(sendOptions).length ? sendOptions : undefined;
            try {
              const chat = await live.client.getChatById(targetChatId);
              if (chat && typeof chat.sendMessage === "function") {
                return chat.sendMessage(payload, options);
              }
            } catch (error) {
              if (isWhatsappLidError(error)) throw error;
            }
            return live.client.sendMessage(targetChatId, payload, options);
          };

          const sendAndConfirm = async (chatId) => {
            const sentMsg = await performSend(chatId);
            const live = ensureWhatsappState(sender.id);
            await waitForWhatsappMessageAck(live.client, sentMsg);
            return sentMsg;
          };

          const logSent = () => {
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
            const whatsappMessageId = String(sentMsg?.id?._serialized || "").trim();
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
              if (isWhatsappPuppeteerStaleSessionError(error)) {
                logEvent("whatsapp", "stale session detected; restarting client", {
                  from: sender.id,
                  to: receiverId,
                  reason: String(error?.message || ""),
                });
                try {
                  await restartWhatsappBrowserSession(sender.id);
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
  toWhatsAppChatId,
  normalizePhoneDigits,
  normalizeSriLankaStudentPhone,
  normalizeStudentPhone,
  normalizeWhatsappNumber,
  resolveStudentWhatsappPhone,
  resolveWhatsappThreadIdFromMessage,
  findStudentByWhatsappFrom,
  persistIncomingWhatsappMessage,
  syncWhatsappIncomingToChats,
  syncWhatsappChatHistoryForStudent,
  syncAllWhatsappChatHistory,
  isWhatsappGroupChatRecord,
  resolveStudentPrimaryCounselorId,
  deliverCounselorMessageToStudentWhatsapp,
  persistOutgoingStudentChatMessage,
  resolveCounselor,
  resolveWhatsappMessenger,
  resolveWhatsappIntegrationContext,
  resolveWhatsappIntegrationContextForUser,
  prepareBranchWhatsappConnect,
  isAdminWhatsappMessenger,
  ADMIN_WHATSAPP_USER_ID,
};
