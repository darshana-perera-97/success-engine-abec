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
  WHATSAPP_RECONNECT_INTERVAL_MS,
  WHATSAPP_WEB_VERSION_CACHE_REMOTE_PATH,
} = require("../config");
const { readUsers } = require("../models/users");
const { readSystemData } = require("../models/systemData");
const { readStudemts } = require("../models/students");
const { readChats, writeChats, appendPortalChatMessage } = require("../models/chats");
const { resolveChatFileDiskPath, resolveStudentDocDiskPath } = require("../models/students");
const { isWhatsappIntegratedStaffRole } = require("./roles");
const {
  isBranchWhatsappManagerRole,
  isWhatsappSessionConnected,
  isBranchWhatsappEnabled,
  resolveUserRecord,
  resolveBranchForUser,
  resolveBranchForStudent,
  findBranchWhatsappMessengerUser,
  setBranchWhatsappMessenger,
  clearBranchWhatsappMessenger,
  resolveEffectiveWhatsappSenderId,
  resolveWhatsappIntegrationContext,
  assertCanManageWhatsappConnection,
  onWhatsappSessionReady,
  onWhatsappSessionDisconnected,
  syncBranchWhatsappMessengersFromSessions,
} = require("./branchWhatsapp");
const { readBranches } = require("../models/branches");

const BRANCH_WHATSAPP_ACTIVE_STATUSES = new Set([
  "connecting",
  "awaiting_qr_scan",
  "authenticated",
  "connected",
]);

const STAFF_WHATSAPP_ROLES = new Set(["Admin", "Manager", "Team Lead"]);
const { isSupportedWhatsappMediaMime, storeChatAttachmentDataUrl } = require("./uploads");
const { appendWhatsappIncoming } = require("../models/whatsappIncoming");
const { logEvent } = require("../lib/logger");
const { resolveWhatsappWebVersion } = require("./whatsappWebVersion");

const AUTHENTICATED_STUCK_TIMEOUT_MS = 90 * 1000;
const WHATSAPP_INIT_MAX_ATTEMPTS = 3;
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

function buildPuppeteerOptions() {
  const options = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
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
  if (cleanUserId) {
    notifyWhatsappSessionDisconnected(cleanUserId);
  }
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

async function findBranchWhatsappSessionConflict(actorUserId, branch) {
  if (!branch?.id) return null;
  const actorId = String(actorUserId || "").trim();
  const users = await readUsers();
  for (const user of users) {
    const userId = String(user.id || "").trim();
    if (!userId || userId === actorId) continue;
    if (!isBranchWhatsappManagerRole(user.role)) continue;
    const userBranch = await resolveBranchForUser(user);
    if (!userBranch || String(userBranch.id || "") !== String(branch.id || "")) continue;
    const sessionState = snapshotWhatsappState(userId);
    if (BRANCH_WHATSAPP_ACTIVE_STATUSES.has(String(sessionState.status || ""))) {
      return user;
    }
  }
  return null;
}

async function enrichBranchWhatsappIntegrationContext(userId, context) {
  if (context.mode !== "branch" || context.canManage !== true) return context;
  const actor = await resolveUserRecord(userId);
  if (!actor) return context;
  const branch = await resolveBranchForUser(actor);
  const conflict = await findBranchWhatsappSessionConflict(userId, branch);
  if (!conflict) return context;
  const conflictId = String(conflict.id || "").trim();
  const conflictName = String(conflict.username || conflict.email || "").trim();
  return {
    ...context,
    canManage: false,
    messengerUserId: conflictId,
    messengerName: conflictName,
    statusUserId: conflictId,
  };
}

async function resolveWhatsappIntegrationContextForUser(userId) {
  const context = await resolveWhatsappIntegrationContext(userId);
  return enrichBranchWhatsappIntegrationContext(userId, context);
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
  const conflict = await findBranchWhatsappSessionConflict(userId, branch);
  if (conflict) {
    const conflictName = String(conflict.username || conflict.email || "").trim();
    return {
      ok: false,
      error: conflictName
        ? `Another Manager or Team Lead (${conflictName}) is already connecting WhatsApp for this branch.`
        : "Another Manager or Team Lead is already connecting WhatsApp for this branch.",
    };
  }
  const messenger = await findBranchWhatsappMessengerUser(branch);
  if (!messenger || !isWhatsappSessionConnected(String(messenger.id || ""))) {
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
  if (!initialPids.length) return;
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
    if (!remaining.length) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  for (const pid of listBrowserProcessIdsForProfile(profileDir)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process may already be gone.
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
  };
  whatsappSessions.set(key, created);
  return created;
}

function clearWhatsappAuthenticatedTimeout(state) {
  if (!state || !state.authenticatedTimeout) return;
  clearTimeout(state.authenticatedTimeout);
  state.authenticatedTimeout = null;
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
    notifyWhatsappSessionDisconnected(cleanUserId);
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
  if (state.status === "authenticated") {
    const lastUpdateMs = new Date(state.lastUpdatedAt || 0).getTime();
    const isStaleAuthenticated =
      Number.isFinite(lastUpdateMs) && Date.now() - lastUpdateMs > AUTHENTICATED_STUCK_TIMEOUT_MS;
    if (isStaleAuthenticated) {
      markWhatsappAuthenticatedTimeout(state, userId);
    }
  }
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

async function startWhatsappSession(userId, { awaitInitialize = false, initAttempt = 1 } = {}) {
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
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: sanitizeUserIdForPath(cleanUserId),
      dataPath: path.join(WHATSAPP_CONNECTIONS_DIR, sanitizeUserIdForPath(cleanUserId)),
    }),
    webVersion,
    webVersionCache: {
      type: "remote",
      remotePath: WHATSAPP_WEB_VERSION_CACHE_REMOTE_PATH,
      strict: false,
    },
    authTimeoutMs: 120000,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 10000,
    bypassCSP: true,
    puppeteer: buildPuppeteerOptions(),
  });
  state.client = client;
  state.status = "connecting";
  state.qrCodeDataUrl = "";
  state.error = "";
  state.connectedAt = "";
  state.whatsappName = "";
  state.whatsappNumber = "";
  state.whatsappProfilePicUrl = "";
  state.authTimedOut = false;
  clearWhatsappAuthenticatedTimeout(state);
  state.lastUpdatedAt = new Date().toISOString();

  client.on("qr", async (qr) => {
    try {
      state.qrCodeDataUrl = await QRCode.toDataURL(qr);
      state.status = "awaiting_qr_scan";
      state.error = "";
      state.authTimedOut = false;
      clearWhatsappAuthenticatedTimeout(state);
      state.lastUpdatedAt = new Date().toISOString();
    } catch {
      state.error = "Failed to render WhatsApp QR code.";
      state.lastUpdatedAt = new Date().toISOString();
    }
  });

  client.on("authenticated", () => {
    state.status = "authenticated";
    state.error = "";
    state.authTimedOut = false;
    scheduleWhatsappAuthenticatedTimeout(state, cleanUserId);
    state.lastUpdatedAt = new Date().toISOString();
  });

  client.on("ready", async () => {
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
    state.lastUpdatedAt = new Date().toISOString();
    onWhatsappSessionReady(cleanUserId).catch(() => {
      // Branch linkage is best-effort; session remains connected.
    });
  });

  client.on("auth_failure", (message) => {
    clearWhatsappAuthenticatedTimeout(state);
    state.status = "auth_failed";
    state.error = String(message || "WhatsApp authentication failed.");
    state.lastUpdatedAt = new Date().toISOString();
    notifyWhatsappSessionDisconnected(cleanUserId);
  });

  client.on("change_state", (nextState) => {
    if (String(nextState || "") !== "DEPRECATED_VERSION") return;
    clearWhatsappAuthenticatedTimeout(state);
    state.status = "error";
    state.error =
      "WhatsApp web version is outdated. Disconnect, then connect again to generate a fresh QR code.";
    state.qrCodeDataUrl = "";
    state.lastUpdatedAt = new Date().toISOString();
    if (state.client && typeof state.client.destroy === "function") {
      state.client.destroy().catch(() => {
        // Ignore cleanup failure; user can reconnect manually.
      });
      state.client = null;
    }
  });

  client.on("disconnected", () => {
    clearWhatsappAuthenticatedTimeout(state);
    state.status = state.authTimedOut ? "error" : "disconnected";
    state.qrCodeDataUrl = "";
    state.connectedAt = "";
    if (!state.authTimedOut) {
      state.error = "";
    }
    state.lastUpdatedAt = new Date().toISOString();
    notifyWhatsappSessionDisconnected(cleanUserId);
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
  state.client = null;
  state.status = "disconnected";
  state.qrCodeDataUrl = "";
  state.error = "";
  state.authTimedOut = false;
  state.lastUpdatedAt = new Date().toISOString();
  const sessionDataDir = resolveWhatsappSessionDataDir(cleanUserId);
  await terminateBrowserProcessesUsingProfile(sessionDataDir);
  return startWhatsappSession(cleanUserId);
}

async function userHasSavedWhatsappSession(userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return false;
  const userConnectionDir = path.join(WHATSAPP_CONNECTIONS_DIR, sanitizeUserIdForPath(cleanUserId));
  try {
    const entries = await fs.readdir(userConnectionDir);
    return entries.length > 0;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function startSavedWhatsappSessionIfExists(userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return;
  const hasSavedSession = await userHasSavedWhatsappSession(cleanUserId);
  if (!hasSavedSession) return;
  try {
    await startWhatsappSession(cleanUserId, { awaitInitialize: true });
  } catch (error) {
    console.error(`Failed to restore WhatsApp session for ${cleanUserId}:`, error);
  }
}

async function collectBranchWhatsappUserIds(users, branches) {
  const ids = new Set();
  if (!(await isBranchWhatsappEnabled())) return ids;
  for (const user of users) {
    if (!isBranchWhatsappManagerRole(user.role)) continue;
    const userId = String(user.id || "").trim();
    if (userId) ids.add(userId);
  }
  for (const branch of branches) {
    const messengerUserId = String(branch?.whatsappMessengerUserId || "").trim();
    if (messengerUserId) ids.add(messengerUserId);
  }
  return ids;
}

async function initializeWhatsappSessionsOnStartup({ branchMessengersOnly = false } = {}) {
  try {
    const users = await readUsers();
    const branches = await readBranches();
    const branchUserIds = await collectBranchWhatsappUserIds(users, branches);

    if (branchMessengersOnly) {
      for (const userId of branchUserIds) {
        await startSavedWhatsappSessionIfExists(userId);
      }
      await syncBranchWhatsappMessengersFromSessions();
      return;
    }

    const integratedStaff = users.filter((user) => isWhatsappIntegratedStaffRole(user.role));
    for (const staffUser of integratedStaff) {
      const staffUserId = String(staffUser.id || "").trim();
      if (!staffUserId) continue;
      await startSavedWhatsappSessionIfExists(staffUserId);
    }
    if (await isStaffWhatsappMessagingEnabled()) {
      await startSavedWhatsappSessionIfExists(ADMIN_WHATSAPP_USER_ID);
      for (const user of users) {
        const role = String(user.role || "").trim();
        if (!STAFF_WHATSAPP_ROLES.has(role)) continue;
        const staffId = String(user.id || "").trim();
        if (!staffId) continue;
        await startSavedWhatsappSessionIfExists(staffId);
      }
    }
    for (const userId of branchUserIds) {
      await startSavedWhatsappSessionIfExists(userId);
    }
    await syncBranchWhatsappMessengersFromSessions();
  } catch (error) {
    console.error("Failed to initialize WhatsApp sessions on startup:", error);
  }
}

async function shutdownWhatsappSessions() {
  isWhatsappShuttingDown = true;
  for (const [, state] of whatsappSessions.entries()) {
    clearWhatsappAuthenticatedTimeout(state);
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
    if (status !== "connected" && status !== "authenticated" && status !== "awaiting_qr_scan" && status !== "connecting") {
      continue;
    }
    try {
      await startWhatsappSession(userId);
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
    const terminal = state.status === "error" || state.status === "auth_failed";
    if (terminal) {
      throw new Error(String(state.error || "WhatsApp session failed after recovery."));
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("WhatsApp did not finish reconnecting in time.");
}

async function restartWhatsappBrowserSession(userId) {
  const key = String(userId || "").trim();
  if (!key) throw new Error("Counselor user id is required.");
  const previous = whatsappSessionRecoveryChains.get(key) || Promise.resolve();
  const recovery = previous.then(async () => {
    const state = ensureWhatsappState(key);
    if (state.client) {
      try {
        await state.client.destroy();
      } catch {
        // Ignore; session object may already be unusable.
      }
      state.client = null;
    }
    state.status = "disconnected";
    state.error = "";
    await startWhatsappSession(key);
    await waitForWhatsappSessionConnected(key, 120000);
  });
  whatsappSessionRecoveryChains.set(key, recovery.catch(() => {}));
  await recovery;
}

async function restartActiveWhatsappSessions() {
  const activeUserIds = [];
  for (const [userId, state] of whatsappSessions.entries()) {
    const status = String(state?.status || "");
    if (
      status === "connected" ||
      status === "authenticated" ||
      status === "awaiting_qr_scan" ||
      status === "connecting"
    ) {
      activeUserIds.push(userId);
    }
  }
  if (!activeUserIds.length) return;
  console.log(`WhatsApp: periodic browser restart for ${activeUserIds.length} session(s)`);
  for (const userId of activeUserIds) {
    try {
      await restartWhatsappBrowserSession(userId);
    } catch (error) {
      console.error(`Failed to restart WhatsApp browser for ${userId}:`, error);
    }
  }
}

function toWhatsAppChatId(phone) {
  const digitsOnly = String(phone || "").replace(/[^\d]/g, "");
  if (!digitsOnly) return "";
  return `${digitsOnly}@c.us`;
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
  const whatsappNumber = String(student?.whatsappNumber || "").trim();
  if (whatsappNumber) return whatsappNumber;
  return String(student?.phone || "").trim();
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
  const from = String(message.from || "");
  const resolvedThreadId = await resolveWhatsappThreadIdFromMessage(message);
  const fromChatId = resolvedThreadId || from;
  if (!from || from.includes("@g.us") || from === "status@broadcast") return;
  const numberPart = fromChatId.split("@")[0] || "";
  const incomingContactNumber = normalizePhoneDigits(numberPart);
  const student = await findStudentByWhatsappFrom(fromChatId);
  const content = String(message.body || "").trim();
  let attachment = null;
  if (message?.hasMedia === true && typeof message.downloadMedia === "function") {
    try {
      const media = await message.downloadMedia();
      const mime = String(media?.mimetype || "").toLowerCase();
      if (media?.data && isSupportedWhatsappMediaMime(mime)) {
        const stored = await storeChatAttachmentDataUrl(
          `data:${mime};base64,${media.data}`,
          String(media?.filename || "whatsapp-media")
        );
        if (stored && !stored.error) {
          attachment = {
            name: stored.name,
            mime: stored.mime,
            size: stored.size,
            url: stored.url,
          };
        }
      }
    } catch {
      attachment = null;
    }
  }
  const normalizedContent =
    content || (attachment ? `Sent an attachment (${attachment.name || "file"}).` : "");
  if (!normalizedContent && !attachment) return;
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
  });
  if (!student || !student.id) return;
  const chats = await readChats();
  if (chats.some((chat) => String(chat.whatsappMessageId || "") === incomingId)) {
    return;
  }
  const chat = {
    id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
    senderId: String(student.id),
    receiverId: String(counselorId),
    content: normalizedContent,
    timestamp: message.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : new Date().toISOString(),
    read: false,
    platform: "whatsapp",
    attachment,
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
}) {
  try {
    return await appendPortalChatMessage({
      senderId,
      receiverId,
      content,
      platform: "whatsapp",
      attachment,
      whatsappDelivery,
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
      const studentBranch = await resolveBranchForStudent(student);
      if (!studentBranch) {
        reason =
          "Student branch is not set or does not match a configured branch office.";
      } else {
        reason = "No WhatsApp account is connected for this student's branch.";
      }
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
    const waChatId = toWhatsAppChatId(phone);
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
            reason: "Only PDF and image attachments can be sent via WhatsApp.",
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
        const senderState = ensureWhatsappState(sender.id);
        if (
          !senderState.client ||
          (senderState.status !== "connected" && senderState.status !== "authenticated")
        ) {
          deliveryResult = { attempted: true, status: "failed", reason: "WhatsApp is not connected." };
        } else {
          const performSend = async () => {
            const live = ensureWhatsappState(sender.id);
            if (!live.client || (live.status !== "connected" && live.status !== "authenticated")) {
              throw new Error("WhatsApp is not connected.");
            }
            if (preparedMedia) {
              await live.client.sendMessage(waChatId, preparedMedia, messageText ? { caption: messageText } : {});
            } else {
              await live.client.sendMessage(waChatId, messageText);
            }
          };

          const logSent = () => {
            if (preparedMedia) {
              logEvent("whatsapp", "media message sent", {
                from: sender.id,
                to: receiverId,
                chatId: waChatId,
                mime: preparedMediaMime,
              });
            } else {
              logEvent("whatsapp", "message sent", { from: sender.id, to: receiverId, chatId: waChatId });
            }
          };

          try {
            await performSend();
            logSent();
            deliveryResult = { attempted: true, status: "sent", channel: "whatsapp", chatId: waChatId };
          } catch (error) {
            if (isWhatsappPuppeteerStaleSessionError(error)) {
              logEvent("whatsapp", "stale session detected; restarting client", {
                from: sender.id,
                to: receiverId,
                reason: String(error?.message || ""),
              });
              try {
                await restartWhatsappBrowserSession(sender.id);
                await performSend();
                logSent();
                deliveryResult = { attempted: true, status: "sent", channel: "whatsapp", chatId: waChatId };
              } catch (errorAfter) {
                logEvent("whatsapp", "message send failed", {
                  from: sender.id,
                  to: receiverId,
                  reason: String(errorAfter?.message || ""),
                });
                deliveryResult = {
                  attempted: true,
                  status: "failed",
                  reason: String(errorAfter?.message || "Failed to send message via WhatsApp."),
                };
              }
            } else {
              logEvent("whatsapp", "message send failed", {
                from: sender.id,
                to: receiverId,
                reason: String(error?.message || ""),
              });
              deliveryResult = {
                attempted: true,
                status: "failed",
                reason: String(error?.message || "Failed to send message via WhatsApp."),
              };
            }
          }
        }
      }
    }
  }

  if (persistToChat && chatSenderId && chatContent) {
    await persistOutgoingStudentChatMessage({
      senderId: chatSenderId,
      receiverId: studentId,
      content: chatContent,
      attachment: chatAttachment,
      whatsappDelivery: deliveryResult,
    });
  }

  return deliveryResult;
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
