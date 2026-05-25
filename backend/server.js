require("dotenv").config();

const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const { buildAdminAiSystemPrompt } = require("./prompts");
const {
  ACTIVE_PROFILE,
  COMPANY_NAME,
  COMPANY_NAME_NBSP,
  DEFAULT_SMTP_FROM_NAME,
} = require("./profileConfig");

const PORT = parseInt(process.env.PORT || "", 10) || 3334;
// Override with DATA_DIR on deploy when JSON stores live on a persistent volume (see backend/.env.example).
// Relative paths resolve against this package (not process.cwd()) so PM2/Docker cwd does not matter.
function resolveDataDir() {
  const fromEnv = String(process.env.DATA_DIR || "").trim();
  if (!fromEnv) return path.join(__dirname, "data");
  return path.isAbsolute(fromEnv) ? path.resolve(fromEnv) : path.resolve(__dirname, fromEnv);
}

// --- Atomic write + per-file mutex to prevent JSON corruption ---
const fileMutexes = new Map();

function withFileLock(filePath, operation) {
  if (!fileMutexes.has(filePath)) {
    fileMutexes.set(filePath, Promise.resolve());
  }
  const prev = fileMutexes.get(filePath);
  const next = prev.then(() => operation(), () => operation());
  fileMutexes.set(filePath, next.catch(() => {}));
  return next;
}

async function atomicWriteFile(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, data, "utf8");
  await fs.rename(tempFile, filePath);
}

function safeJsonParse(raw, filePath) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`[WARN] ${path.basename(filePath)} contains invalid JSON – treating as empty.`, error.message);
    return null;
  }
}
const DATA_DIR = resolveDataDir();
const USERS_FILE = path.join(DATA_DIR, "users.json");
const STUDEMTS_FILE = path.join(DATA_DIR, "studemts.json");
const BRANCHES_FILE = path.join(DATA_DIR, "branches.json");
const COUNTRIES_FILE = path.join(DATA_DIR, "countries.json");
const PAYMENT_ACCOUNTS_FILE = path.join(DATA_DIR, "paymentAccounts.json");
const UNIVERSITY_FILE = path.join(DATA_DIR, "university.json");
const CHATS_FILE = path.join(DATA_DIR, "chats.json");
const ADMIN_CHATS_FILE = path.join(DATA_DIR, "adminChats.json");
const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");
const MEETING_DATA_FILE = path.join(DATA_DIR, "meetingData.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const APPOINTMENTS_FILE = path.join(DATA_DIR, "appointments.json");
const INVOICES_FILE = path.join(DATA_DIR, "invoices.json");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const REQ_STUDENTS_FILE = path.join(DATA_DIR, "req-students.json");
const WHATSAPP_CONNECTIONS_DIR = path.join(DATA_DIR, "whatsapp-connections");
const WHATSAPP_INCOMING_FILE = path.join(DATA_DIR, "whatsapp-incoming.json");
const CHAT_FILES_DIR = path.join(DATA_DIR, "chats");
const ASSETS_DIR = path.join(DATA_DIR, "assets");
const FRONTEND_BUILD_DIR = path.join(__dirname, "..", "frontend", "build");
const FRONTEND_DIST_DIR = path.join(__dirname, "..", "frontend", "dist");
const STUDENT_CV_DIR = path.join(DATA_DIR, "studentDocs", "cv");
const STUDENT_PERMISSIONS_DIR = path.join(DATA_DIR, "studentDocs", "permissions");
const PAYMENTS_DIR = path.join(DATA_DIR, "payments");
// Default avatar served when a user has no custom avatar uploaded.
// Resolved via the SPA fallback to `frontend/public/companyIcon.png` (or the
// equivalent file in the production build output).
const DEFAULT_MALE_AVATAR_PATH = "/companyIcon.png";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_LABEL = "5MB";
/** Base64 data URLs in JSON need headroom above decoded file size. */
const MAX_JSON_BODY_BYTES = 8 * 1024 * 1024;

const DEFAULT_DAY_SCHEDULE = {
  isOpen: true,
  startHour: 8,
  endHour: 17,
};
const DEFAULT_MEETING_SETTINGS = {
  meetingDurationMinutes: 30,
  daySchedules: {
    0: { ...DEFAULT_DAY_SCHEDULE },
    1: { ...DEFAULT_DAY_SCHEDULE },
    2: { ...DEFAULT_DAY_SCHEDULE },
    3: { ...DEFAULT_DAY_SCHEDULE },
    4: { ...DEFAULT_DAY_SCHEDULE },
    5: { ...DEFAULT_DAY_SCHEDULE },
    6: { ...DEFAULT_DAY_SCHEDULE },
  },
};

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_DISPLAY_NAME = (process.env.ADMIN_NAME || "").trim() || "Admin";
const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10) || 587;
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").trim().toLowerCase() === "true";
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "").trim();
const SMTP_FROM =
  SMTP_USER && DEFAULT_SMTP_FROM_NAME ? `"${DEFAULT_SMTP_FROM_NAME}" <${SMTP_USER}>` : SMTP_USER;
/** Base URL of the student/staff portal (no trailing slash). Used in welcome emails — e.g. https://portal.example.com */
const APP_PUBLIC_URL = String(process.env.APP_PUBLIC_URL || "").trim().replace(/\/+$/, "");
const STUDENT_SIGN_IN_PATH = String(process.env.STUDENT_SIGN_IN_PATH || "/dashboard")
  .trim()
  .replace(/\s+/g, "");
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MAX_HISTORY_MESSAGES = 12;
const OPENAI_REQUEST_TIMEOUT_MS = 45 * 1000;
const FORGOT_PASSWORD_OTP_TTL_MS = 10 * 60 * 1000;
const forgotPasswordOtps = new Map();
const VISA_OFFICER_ROLE = "Visa Officer";
const VISA_OFFICER_COUNSELOR_ROLE = "Visa Officer & Counselor";
const ALLOWED_ROLES = new Set([
  "Manager",
  "Team Lead",
  "Accountant",
  "Counselor",
  "Consultor",
  "Admin",
  "Country Coordinator",
  VISA_OFFICER_ROLE,
  VISA_OFFICER_COUNSELOR_ROLE,
]);
const DEFAULT_COUNTRY_NAMES = ["UK", "USA", "Canada", "Australia", "New Zealand"];
const COUNSELOR_ROLES = new Set([
  "Counselor",
  "Consultor",
  VISA_OFFICER_ROLE,
  VISA_OFFICER_COUNSELOR_ROLE,
]);
const whatsappSessions = new Map();
const whatsappSessionRecoveryChains = new Map();
const WHATSAPP_RECONNECT_INTERVAL_MS = 2 * 60 * 60 * 1000;

function logEvent(scope, message, meta = null) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${scope}] ${message}`;
  if (!meta) {
    console.log(base);
    return;
  }
  try {
    console.log(base, JSON.stringify(meta));
  } catch {
    console.log(base, meta);
  }
}

function normalizeRoleKey(role) {
  return String(role || "").trim().toLowerCase();
}

function isCounselorRole(role) {
  const normalized = normalizeRoleKey(role);
  return (
    normalized === "counselor" ||
    normalized === "consultor" ||
    normalized === "counsellor" ||
    normalized === "visa officer" ||
    normalized === "visa officer & counselor" ||
    normalized === "visa officer & counsellor"
  );
}

/** Manager, Admin, Team Lead, and Country Coordinator: same portal welcome as counselors but role-specific copy. */
function isStaffWelcomeEmailRole(role) {
  const r = String(role || "").trim();
  return r === "Manager" || r === "Admin" || r === "Team Lead" || r === "Country Coordinator" || r === "Accountant";
}

function staffWelcomeRolePhrase(role) {
  const r = String(role || "").trim();
  if (r === "Country Coordinator") return "country coordinator";
  if (r === "Team Lead") return "team lead";
  return r.toLowerCase() || "staff";
}

function staffWelcomeEmailCopy(role) {
  const displayRole = String(role || "").trim() || "Staff";
  const phrase = staffWelcomeRolePhrase(role);
  return {
    headline: `Welcome to your ${displayRole} account`,
    pageTitle: `${displayRole} portal access`,
    rolePhrase: phrase,
    tagline: `${COMPANY_NAME} — ${phrase} portal access`,
    subject: `Welcome to ${COMPANY_NAME} — your ${displayRole} account`,
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStoredRole(role) {
  if (role === "Counselor" || role === "Consultor") return "Consultor";
  return role;
}

function normalizeLoginRole(role) {
  if (role === "Consultor") return "Counselor";
  return role;
}

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

/** LKR per one unit of foreign currency (matches frontend `EXCHANGE_RATES` fallbacks). */
const FALLBACK_EXCHANGE_RATES_LKR = {
  USD: 312.5,
  GBP: 395.2,
  CAD: 228.4,
  AUD: 205.15,
  EUR: 338.1,
  NZD: 205.15,
  LKR: 1,
};
const EXCHANGE_RATES_API_TTL_MS = 60 * 60 * 1000;
const EXCHANGE_RATES_FETCH_TIMEOUT_MS = 12 * 1000;
let exchangeRatesApiCache = { payload: null, fetchedAt: 0 };

async function loadExchangeRatesFromApi() {
  const now = Date.now();
  if (exchangeRatesApiCache.payload && now - exchangeRatesApiCache.fetchedAt < EXCHANGE_RATES_API_TTL_MS) {
    return { ...exchangeRatesApiCache.payload, live: true };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXCHANGE_RATES_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`exchange_rates_http_${res.status}`);
    }
    const body = await res.json();
    if (body.result !== "success" || !body.rates || typeof body.rates.LKR !== "number") {
      throw new Error("exchange_rates_bad_payload");
    }
    const usdTable = body.rates;
    const lkrPerUsd = usdTable.LKR;
    const codes = ["USD", "GBP", "CAD", "AUD", "EUR", "NZD"];
    const rates = { LKR: 1 };
    for (const code of codes) {
      const foreignPerUsd = usdTable[code];
      if (typeof foreignPerUsd === "number" && foreignPerUsd > 0) {
        rates[code] = lkrPerUsd / foreignPerUsd;
      }
    }
    const payload = {
      rates,
      updatedAt: body.time_last_update_utc || new Date().toISOString(),
      live: true,
    };
    exchangeRatesApiCache = { payload, fetchedAt: now };
    return payload;
  } catch (err) {
    clearTimeout(timer);
    logEvent("exchange_rates", "fetch failed", { reason: String(err?.message || err) });
    if (exchangeRatesApiCache.payload) {
      return { ...exchangeRatesApiCache.payload, live: true };
    }
    return {
      rates: FALLBACK_EXCHANGE_RATES_LKR,
      updatedAt: "Static rates (API unavailable)",
      live: false,
    };
  }
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
    // Prevent stale index.html from referencing old hashed asset files.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  } else {
    // Allow long caching for hashed static bundles and media assets.
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
      // Try next build output folder.
    }
  }
  return null;
}

async function readUsers() {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = safeJsonParse(raw, USERS_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeUsers(users) {
  return withFileLock(USERS_FILE, () =>
    atomicWriteFile(USERS_FILE, JSON.stringify(users, null, 2))
  );
}

async function readStudemts() {
  try {
    const raw = await fs.readFile(STUDEMTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, STUDEMTS_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeStudemts(studemts) {
  return withFileLock(STUDEMTS_FILE, () =>
    atomicWriteFile(STUDEMTS_FILE, JSON.stringify(studemts, null, 2))
  );
}

async function readBranches() {
  try {
    const raw = await fs.readFile(BRANCHES_FILE, "utf8");
    const parsed = safeJsonParse(raw, BRANCHES_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeBranches(branches) {
  return withFileLock(BRANCHES_FILE, () =>
    atomicWriteFile(BRANCHES_FILE, JSON.stringify(branches, null, 2))
  );
}

async function readCountries() {
  try {
    const raw = await fs.readFile(COUNTRIES_FILE, "utf8");
    const parsed = safeJsonParse(raw, COUNTRIES_FILE);
    if (!Array.isArray(parsed)) {
      await writeCountries([...DEFAULT_COUNTRY_NAMES]);
      return [...DEFAULT_COUNTRY_NAMES];
    }
    const names = parsed
      .map((x) => (typeof x === "string" ? x : String(x?.name || "")).trim())
      .filter(Boolean);
    if (names.length === 0) {
      await writeCountries([...DEFAULT_COUNTRY_NAMES]);
      return [...DEFAULT_COUNTRY_NAMES];
    }
    return Array.from(new Map(names.map((n) => [n.toLowerCase(), n])).values()).sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      await writeCountries([...DEFAULT_COUNTRY_NAMES]);
      return [...DEFAULT_COUNTRY_NAMES];
    }
    throw error;
  }
}

async function writeCountries(list) {
  const unique = Array.from(
    new Map(
      (list || [])
        .map((n) => String(n || "").trim())
        .filter(Boolean)
        .map((n) => [n.toLowerCase(), n])
    ).values()
  ).sort((a, b) => a.localeCompare(b));
  return withFileLock(COUNTRIES_FILE, () =>
    atomicWriteFile(COUNTRIES_FILE, JSON.stringify(unique, null, 2))
  );
}

function normalizePaymentAccount(raw) {
  if (!raw || typeof raw !== "object") return null;
  const label = String(raw.label || "").trim();
  const bankName = String(raw.bankName || "").trim();
  const accountName = String(raw.accountName || "").trim();
  const accountNumber = String(raw.accountNumber || "").trim();
  if (!label || !bankName || !accountName || !accountNumber) return null;
  return {
    id: String(raw.id || `PAY-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`),
    label,
    bankName,
    accountName,
    accountNumber,
    branch: String(raw.branch || "").trim(),
    currency: String(raw.currency || "LKR").trim().toUpperCase() || "LKR",
    notes: String(raw.notes || "").trim(),
  };
}

async function readPaymentAccounts() {
  try {
    const raw = await fs.readFile(PAYMENT_ACCOUNTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, PAYMENT_ACCOUNTS_FILE);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizePaymentAccount).filter(Boolean);
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writePaymentAccounts(accounts) {
  const normalized = (accounts || []).map(normalizePaymentAccount).filter(Boolean);
  return withFileLock(PAYMENT_ACCOUNTS_FILE, () =>
    atomicWriteFile(PAYMENT_ACCOUNTS_FILE, JSON.stringify(normalized, null, 2))
  );
}

async function readReqStudents() {
  try {
    const raw = await fs.readFile(REQ_STUDENTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, REQ_STUDENTS_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function appendReqStudent(entry) {
  return withFileLock(REQ_STUDENTS_FILE, async () => {
    const list = await readReqStudents();
    list.push(entry);
    await atomicWriteFile(REQ_STUDENTS_FILE, JSON.stringify(list, null, 2));
  });
}

async function removeReqStudentById(requestId) {
  const id = String(requestId || "").trim();
  if (!id) return { ok: false, error: "Request id is required." };
  return withFileLock(REQ_STUDENTS_FILE, async () => {
    const list = await readReqStudents();
    const next = list.filter((entry) => String(entry.id || "") !== id);
    if (next.length === list.length) {
      return { ok: false, error: "Request not found." };
    }
    await atomicWriteFile(REQ_STUDENTS_FILE, JSON.stringify(next, null, 2));
    return { ok: true };
  });
}

async function readUniversityPrograms() {
  try {
    const raw = await fs.readFile(UNIVERSITY_FILE, "utf8");
    const parsed = safeJsonParse(raw, UNIVERSITY_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeUniversityPrograms(programs) {
  return withFileLock(UNIVERSITY_FILE, () =>
    atomicWriteFile(UNIVERSITY_FILE, JSON.stringify(programs, null, 2))
  );
}

async function readChats() {
  try {
    const raw = await fs.readFile(CHATS_FILE, "utf8");
    const parsed = safeJsonParse(raw, CHATS_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeChats(chats) {
  return withFileLock(CHATS_FILE, () =>
    atomicWriteFile(CHATS_FILE, JSON.stringify(chats, null, 2))
  );
}

async function readActivities() {
  try {
    const raw = await fs.readFile(ACTIVITIES_FILE, "utf8");
    const parsed = safeJsonParse(raw, ACTIVITIES_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeActivities(activities) {
  return withFileLock(ACTIVITIES_FILE, () =>
    atomicWriteFile(ACTIVITIES_FILE, JSON.stringify(activities, null, 2))
  );
}

async function readBookings() {
  try {
    const raw = await fs.readFile(BOOKINGS_FILE, "utf8");
    const parsed = safeJsonParse(raw, BOOKINGS_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeBookings(bookings) {
  return withFileLock(BOOKINGS_FILE, () =>
    atomicWriteFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2))
  );
}

async function readAppointments() {
  try {
    const raw = await fs.readFile(APPOINTMENTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, APPOINTMENTS_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeAppointments(appointments) {
  return withFileLock(APPOINTMENTS_FILE, () =>
    atomicWriteFile(APPOINTMENTS_FILE, JSON.stringify(appointments, null, 2))
  );
}

function parseJsonArray(parsed, arrayKeys = ["data", "invoices", "items"]) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of arrayKeys) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
  }
  return [];
}

async function readInvoices() {
  try {
    const raw = await fs.readFile(INVOICES_FILE, "utf8");
    const parsed = safeJsonParse(raw, INVOICES_FILE);
    return parseJsonArray(parsed);
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeInvoices(invoices) {
  return withFileLock(INVOICES_FILE, () =>
    atomicWriteFile(INVOICES_FILE, JSON.stringify(invoices, null, 2))
  );
}

const { pathToFileURL } = require("url");

let enrolledTransitionModulesPromise = null;
async function loadEnrolledTransitionModules() {
  if (!enrolledTransitionModulesPromise) {
    enrolledTransitionModulesPromise = Promise.all([
      import(pathToFileURL(path.join(__dirname, "..", "frontend", "src", "pipeline.js")).href),
      import(pathToFileURL(path.join(__dirname, "..", "frontend", "src", "studentEnrolledGate.js")).href),
    ]);
  }
  return enrolledTransitionModulesPromise;
}

/** When moving into Enrolled, returns an error string or null if allowed. */
async function getBlockedEnrolledTransitionError(previousStudent, mergedStudent) {
  const [{ normalizePipelineStatus }, gate] = await loadEnrolledTransitionModules();
  const prevStage = normalizePipelineStatus(previousStudent?.status);
  const nextStage = normalizePipelineStatus(mergedStudent?.status);
  if (nextStage !== "Enrolled" || prevStage === "Enrolled") return null;
  const invoices = await readInvoices();
  const reasons = gate.getEnrolledAdvanceBlockReasons(mergedStudent, invoices);
  if (!reasons.length) return null;
  return reasons.join(" ");
}

async function readTasks() {
  try {
    const raw = await fs.readFile(TASKS_FILE, "utf8");
    const parsed = safeJsonParse(raw, TASKS_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

function withTasksMutationLock(operation) {
  return withFileLock(TASKS_FILE, operation);
}

async function readWhatsappIncoming() {
  try {
    const raw = await fs.readFile(WHATSAPP_INCOMING_FILE, "utf8");
    const parsed = safeJsonParse(raw, WHATSAPP_INCOMING_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function appendWhatsappIncoming(entry) {
  return withFileLock(WHATSAPP_INCOMING_FILE, async () => {
    const list = await readWhatsappIncoming();
    list.push(entry);
    await atomicWriteFile(WHATSAPP_INCOMING_FILE, JSON.stringify(list, null, 2));
  });
}

async function writeTasks(tasks) {
  return atomicWriteFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

async function readSafe(reader, fallback) {
  try {
    const value = await reader();
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function stripUserSecrets(user) {
  if (!user || typeof user !== "object") return user;
  const { password, ...rest } = user;
  return rest;
}

function stripStudentSecrets(student) {
  if (!student || typeof student !== "object") return student;
  const { password, ...rest } = student;
  return rest;
}

function documentTypeMatchesSlaRequirement(docType, requiredDocType) {
  const dt = String(docType || "");
  const req = String(requiredDocType || "");
  if (!req) return false;
  return dt === req || dt.includes(req) || req.includes(dt);
}

function slaRequirementSatisfiedByVerifiedDocument(documents, requiredDocType) {
  const docs = Array.isArray(documents) ? documents : [];
  for (const d of docs) {
    if (!d || typeof d !== "object") continue;
    if (!documentTypeMatchesSlaRequirement(d.type, requiredDocType)) continue;
    const st = String(d.status || "").trim().toLowerCase();
    if (st === "verified") return true;
  }
  return false;
}

function effectiveSlaMissingItemsForViolation(violation, documents) {
  if (!violation || typeof violation !== "object") return [];
  const missingItems = Array.isArray(violation.missingItems) ? violation.missingItems.filter(Boolean) : [];
  return missingItems.filter((req) => !slaRequirementSatisfiedByVerifiedDocument(documents, req));
}

function reconcileSlaViolationsOnStudentRecord(student) {
  const raw = student?.slaViolations;
  if (!Array.isArray(raw) || raw.length === 0) return raw;
  const docs = Array.isArray(student?.documents) ? student.documents : [];
  return raw.map((v) => {
    if (!v || typeof v !== "object") return v;
    const remaining = effectiveSlaMissingItemsForViolation(v, docs);
    return { ...v, resolved: remaining.length === 0 };
  });
}

function countActiveSlaViolationsOnStudent(student) {
  const raw = student?.slaViolations;
  if (!Array.isArray(raw) || raw.length === 0) return 0;
  const docs = Array.isArray(student?.documents) ? student.documents : [];
  let n = 0;
  for (const v of raw) {
    if (!v) continue;
    if (effectiveSlaMissingItemsForViolation(v, docs).length > 0) n += 1;
  }
  return n;
}

function buildAdminDataSummary({ users, students, branches, tasks, activities, appointments, countries, reqStudents, chats }) {
  const studentsByBranch = {};
  const studentsByStage = {};
  const studentsByCountry = {};
  let unresolvedSlaViolations = 0;
  for (const s of students) {
    const b = String(s.branch || "Unassigned");
    const stage = String(s.status || "Unknown");
    const c = String(s.country || "Unassigned");
    studentsByBranch[b] = (studentsByBranch[b] || 0) + 1;
    studentsByStage[stage] = (studentsByStage[stage] || 0) + 1;
    studentsByCountry[c] = (studentsByCountry[c] || 0) + 1;
    if (Array.isArray(s.slaViolations)) {
      unresolvedSlaViolations += countActiveSlaViolationsOnStudent(s);
    }
  }

  const tasksByStatus = {};
  let overdueTasks = 0;
  let pendingReviews = 0;
  const todayIso = new Date().toISOString().slice(0, 10);
  for (const t of tasks) {
    const status = String(t.status || "Unknown");
    tasksByStatus[status] = (tasksByStatus[status] || 0) + 1;
    if (status === "Overdue") overdueTasks += 1;
    else if (t.dueDate && String(t.dueDate) < todayIso && status !== "Completed" && status !== "Done") {
      overdueTasks += 1;
    }
    if (status === "In Review") pendingReviews += 1;
  }

  const usersByRole = {};
  for (const u of users) {
    const r = String(u.role || "Unknown");
    usersByRole[r] = (usersByRole[r] || 0) + 1;
  }

  const appointmentsByStatus = {};
  for (const a of appointments) {
    const s = String(a.status || "Unknown");
    appointmentsByStatus[s] = (appointmentsByStatus[s] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      users: users.length,
      students: students.length,
      branches: branches.length,
      tasks: tasks.length,
      activities: activities.length,
      appointments: appointments.length,
      countries: countries.length,
      reqStudents: reqStudents.length,
      chatMessages: chats.length,
    },
    studentsByBranch,
    studentsByStage,
    studentsByCountry,
    tasksByStatus,
    overdueTasks,
    pendingReviews,
    unresolvedSlaViolations,
    usersByRole,
    appointmentsByStatus,
  };
}

async function buildAdminAiContext() {
  const [usersRaw, studentsRaw, branches, tasks, activities, appointments, countries, reqStudents, chats] =
    await Promise.all([
      readSafe(readUsers, []),
      readSafe(readStudemts, []),
      readSafe(readBranches, []),
      readSafe(readTasks, []),
      readSafe(readActivities, []),
      readSafe(readAppointments, []),
      readSafe(readCountries, []),
      readSafe(readReqStudents, []),
      readSafe(readChats, []),
    ]);

  const users = (usersRaw || []).map(stripUserSecrets);
  const students = (studentsRaw || []).map(stripStudentSecrets);

  const recentActivities = (activities || [])
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 30);

  const recentChats = (chats || [])
    .slice()
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
    .slice(0, 25)
    .map((c) => ({
      id: c.id,
      senderId: c.senderId,
      receiverId: c.receiverId,
      content: typeof c.content === "string" ? c.content.slice(0, 240) : "",
      timestamp: c.timestamp,
      platform: c.platform || "portal",
      read: c.read === true,
    }));

  const summary = buildAdminDataSummary({
    users,
    students,
    branches: branches || [],
    tasks: tasks || [],
    activities: activities || [],
    appointments: appointments || [],
    countries: countries || [],
    reqStudents: reqStudents || [],
    chats: chats || [],
  });

  return {
    summary,
    branches: branches || [],
    countries: countries || [],
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      branch: u.branch,
      country: u.country,
      teamLeadId: u.teamLeadId || "",
      teamLeadName: u.teamLeadName || "",
      createdAt: u.createdAt,
    })),
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      country: s.country,
      branch: s.branch,
      email: s.email,
      phone: s.phone,
      status: s.status,
      priority: s.priority,
      ielts: s.ielts,
      gpa: s.gpa,
      budget: s.budget,
      counselor: s.counselor,
      counselorName: s.counselorName,
      stageEnteredAt: s.stageEnteredAt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      notes: typeof s.notes === "string" ? s.notes.slice(0, 400) : s.notes,
      documentsCount: Array.isArray(s.documents) ? s.documents.length : 0,
      slaViolations: Array.isArray(s.slaViolations)
        ? s.slaViolations.map((v) => ({
            id: v.id,
            stage: v.stage,
            missingItems: v.missingItems,
            timestamp: v.timestamp,
            resolved: v.resolved === true,
          }))
        : [],
    })),
    tasks: (tasks || []).map((t) => ({
      id: t.id,
      task: t.task,
      student_id: t.student_id,
      assigned_to: t.assigned_to,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      tier: t.tier,
      phase: t.phase,
      isBlocking: t.isBlocking,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    appointments: (appointments || []).map((a) => ({
      id: a.id,
      counselorId: a.counselorId,
      studentId: a.studentId,
      title: a.title,
      date: a.date,
      time: a.time,
      duration: a.duration,
      type: a.type,
      status: a.status,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    reqStudents: reqStudents || [],
    recentActivities,
    recentChats,
  };
}

async function callOpenAiChatCompletion({ messages, temperature = 0.2, maxTokens = 280 }) {
  if (!OPENAI_API_KEY) {
    return { ok: false, status: 500, error: "OpenAI API key is not configured. Add OPENAI_API_KEY to backend/.env." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logEvent("openai", `Request failed (${response.status})`, { detail: errText.slice(0, 400) });
      return {
        ok: false,
        status: 502,
        error: response.status === 401
          ? "OpenAI rejected the API key. Check OPENAI_API_KEY in backend/.env."
          : "OpenAI request failed.",
      };
    }
    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!reply) {
      return { ok: false, status: 502, error: "Empty response from OpenAI." };
    }
    return { ok: true, reply, model: data.model || OPENAI_MODEL, usage: data.usage || null };
  } catch (error) {
    if (error && error.name === "AbortError") {
      return { ok: false, status: 504, error: "OpenAI request timed out." };
    }
    logEvent("openai", "Unexpected error calling OpenAI", { message: String(error?.message || error) });
    return { ok: false, status: 502, error: "Could not reach OpenAI." };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeAiHistory(history) {
  if (!Array.isArray(history)) return [];
  const cleaned = [];
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const role = item.role === "user" || item.role === "assistant" ? item.role : null;
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!role || !content) continue;
    cleaned.push({ role, content: content.slice(0, 4000) });
  }
  return cleaned.slice(-OPENAI_MAX_HISTORY_MESSAGES);
}

const ADMIN_AI_CHAT_MAX_MESSAGES = 200;
const ADMIN_AI_CHAT_MAX_CONTENT = 32000;

async function readAdminChatsStore() {
  try {
    const raw = await fs.readFile(ADMIN_CHATS_FILE, "utf8");
    const parsed = safeJsonParse(raw, ADMIN_CHATS_FILE);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error && error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeAdminChatsStore(store) {
  return withFileLock(ADMIN_CHATS_FILE, () =>
    atomicWriteFile(ADMIN_CHATS_FILE, JSON.stringify(store, null, 2))
  );
}

async function isAuthorizedAdminChatEmail(emailRaw) {
  const email = normalizeEmail(emailRaw);
  if (!email) return false;
  if (ADMIN_EMAIL && email === ADMIN_EMAIL) return true;
  const users = await readUsers();
  return users.some((u) => normalizeEmail(u.email) === email && String(u.role || "").trim() === "Admin");
}

function sanitizeAdminAiMessagesForStore(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const role = item.role === "user" || item.role === "assistant" ? item.role : null;
    const id = String(item.id || "").trim().slice(0, 120);
    let content = typeof item.content === "string" ? item.content : "";
    content = content.slice(0, ADMIN_AI_CHAT_MAX_CONTENT);
    if (!role || !id || !content.trim()) continue;
    out.push({ id, role, content });
    if (out.length >= ADMIN_AI_CHAT_MAX_MESSAGES) break;
  }
  return out;
}

function normalizeMeetingSettings(input) {
  const src = input && typeof input === "object" ? input : {};
  const meetingDurationMinutes = Number(src.meetingDurationMinutes);
  const incomingDaySchedules = src.daySchedules && typeof src.daySchedules === "object" ? src.daySchedules : {};
  const daySchedules = {};
  for (let day = 0; day <= 6; day++) {
    const incomingDay = incomingDaySchedules[day] && typeof incomingDaySchedules[day] === "object" ? incomingDaySchedules[day] : {};
    const isOpen = incomingDay.isOpen !== false;
    const startHour = Number(incomingDay.startHour);
    const endHour = Number(incomingDay.endHour);
    daySchedules[day] = {
      isOpen,
      startHour:
        Number.isFinite(startHour) && startHour >= 0 && startHour <= 23
          ? Math.floor(startHour)
          : DEFAULT_DAY_SCHEDULE.startHour,
      endHour:
        Number.isFinite(endHour) && endHour >= 1 && endHour <= 24
          ? Math.floor(endHour)
          : DEFAULT_DAY_SCHEDULE.endHour,
    };
  }
  return {
    meetingDurationMinutes:
      Number.isFinite(meetingDurationMinutes) && meetingDurationMinutes > 0
        ? Math.floor(meetingDurationMinutes)
        : DEFAULT_MEETING_SETTINGS.meetingDurationMinutes,
    daySchedules,
  };
}

async function readMeetingSettings() {
  try {
    const raw = await fs.readFile(MEETING_DATA_FILE, "utf8");
    const parsed = safeJsonParse(raw, MEETING_DATA_FILE);
    if (!parsed) return { ...DEFAULT_MEETING_SETTINGS };
    return normalizeMeetingSettings(parsed);
  } catch (error) {
    if (error && error.code === "ENOENT") return { ...DEFAULT_MEETING_SETTINGS };
    throw error;
  }
}

async function writeMeetingSettings(settings) {
  return withFileLock(MEETING_DATA_FILE, () =>
    atomicWriteFile(MEETING_DATA_FILE, JSON.stringify(normalizeMeetingSettings(settings), null, 2))
  );
}

function sanitizeAccount(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone || "",
    role: user.role,
    branch: user.branch,
    country: user.country || "",
    teamLeadId: user.teamLeadId,
    teamLeadName: user.teamLeadName,
    teamLeadEmail: user.teamLeadEmail,
    avatar: user.avatar,
  };
}

function detectImageExtension(dataUrl) {
  const mimeMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl);
  if (!mimeMatch) return null;
  const mime = mimeMatch[1].toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return null;
}

async function storeImageDataUrl(dataUrl, prefix) {
  const ext = detectImageExtension(dataUrl);
  if (!ext) return null;
  const base64 = dataUrl.split(",")[1] || "";
  if (!base64) return null;
  const buffer = Buffer.from(base64, "base64");
  const fileName = `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  await fs.writeFile(path.join(ASSETS_DIR, fileName), buffer);
  return `/assets/${fileName}`;
}

function publicAssetUrl(req, avatar) {
  if (!avatar) return avatar;
  if (avatar.startsWith("/assets/")) {
    return `http://${req.headers.host}${avatar}`;
  }
  return avatar;
}

function publicChatFileUrl(req, filePath) {
  if (!filePath) return filePath;
  if (filePath.startsWith("/chat-files/")) {
    return `http://${req.headers.host}${filePath}`;
  }
  return filePath;
}

function resolveChatFileDiskPath(filePath) {
  if (!filePath || !String(filePath).startsWith("/chat-files/")) return "";
  const fileName = path.basename(String(filePath || ""));
  if (!fileName) return "";
  return path.join(CHAT_FILES_DIR, fileName);
}

function resolveStudentDocDiskPath(filePath) {
  let s = String(filePath || "").trim();
  const permIdx = s.indexOf("/student-docs/permissions/");
  if (permIdx !== -1) s = s.slice(permIdx);
  if (!s.startsWith("/student-docs/permissions/")) return "";
  const fileName = path.basename(s);
  if (!fileName || fileName.includes("..")) return "";
  return path.join(STUDENT_PERMISSIONS_DIR, fileName);
}

function publicStudentDocUrl(req, filePath) {
  if (!filePath) return filePath;
  if (filePath.startsWith("/student-docs/")) {
    return `http://${req.headers.host}${filePath}`;
  }
  return filePath;
}

function publicInvoiceRecord(req, invoice) {
  if (!invoice || typeof invoice !== "object") return invoice;
  const next = { ...invoice };
  const host = String(req.headers.host || "").trim();
  const absolutize = (urlValue) => {
    const u = String(urlValue || "").trim();
    if (!u || !host) return u;
    if (u.startsWith("/payments/") || u.startsWith("/chat-files/") || u.startsWith("/assets/")) {
      return `http://${host}${u}`;
    }
    if (/^https?:\/\/localhost(:\d+)?/i.test(u)) {
      const pathPart = u.replace(/^https?:\/\/[^/]+/i, "");
      return pathPart ? `http://${host}${pathPart}` : u;
    }
    return u;
  };
  if (next.paymentProofUrl) next.paymentProofUrl = absolutize(next.paymentProofUrl);
  if (next.attachmentFileUrl) next.attachmentFileUrl = absolutize(next.attachmentFileUrl);
  if (next.attachmentLink) next.attachmentLink = String(next.attachmentLink || "").trim();
  if (next.generatedReceiptUrl) {
    const receipt = String(next.generatedReceiptUrl || "");
    if (receipt.startsWith("/chat-files/")) {
      next.generatedReceiptUrl = publicChatFileUrl(req, receipt);
    } else {
      next.generatedReceiptUrl = absolutize(receipt);
    }
  }
  return next;}

function publicStudentRecord(req, student) {
  if (!student || typeof student !== "object") return student;
  const next = { ...student };
  next.avatar = publicAssetUrl(req, next.avatar);
  if (next.cvFile && typeof next.cvFile === "object") {
    next.cvFile = {
      ...next.cvFile,
      url: publicStudentDocUrl(req, String(next.cvFile.url || "")),
    };
  }
  if (Array.isArray(next.documents)) {
    next.documents = next.documents.map((doc) => {
      if (!doc || typeof doc !== "object") return doc;
      return {
        ...doc,
        url: publicStudentDocUrl(req, String(doc.url || "")),
      };
    });
  }
  if (Array.isArray(next.profileOtherDocuments)) {
    const migrated = migrateProfileOtherDocumentsToSlotEntries(next.profileOtherDocuments);
    next.profileOtherDocuments = migrated.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      return {
        ...entry,
        url: publicStudentDocUrl(req, String(entry.url || "")),
      };
    });
  }
  if (Array.isArray(next.universityOfferLetters)) {
    next.universityOfferLetters = next.universityOfferLetters.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      return {
        ...entry,
        url: publicStudentDocUrl(req, String(entry.url || "")),
      };
    });
  }
  return next;
}

const UNIVERSITY_OFFER_STATUSES = new Set(["Unconditional", "Conditional", "Rejected"]);

function normalizeUniversityOfferStatusInput(status) {
  const s = String(status || "").trim();
  if (s === "Approved") return "Unconditional";
  return s;
}

function normalizeUniversityOfferLetters(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry === "object" && String(entry.url || "").trim());
}

const PROFILE_OTHER_DOCUMENTS_MAX_SLOT = 25;

/** Normalize legacy 3-index arrays or slot-tagged entries into a sorted dense list with 1-based .slot. */
function migrateProfileOtherDocumentsToSlotEntries(value) {
  if (!Array.isArray(value)) return [];
  const bySlot = new Map();
  for (let i = 0; i < value.length; i++) {
    const e = value[i];
    if (!e || typeof e !== "object" || !String(e.url || "").trim()) continue;
    const slotRaw = Number(e.slot);
    const slot =
      Number.isFinite(slotRaw) && slotRaw >= 1 && Math.floor(slotRaw) === slotRaw ? Math.floor(slotRaw) : i + 1;
    bySlot.set(slot, { ...e, slot });
  }
  return [...bySlot.keys()].sort((a, b) => a - b).map((k) => bySlot.get(k));
}

async function safeUnlinkStoredPermissionDoc(storedUrl) {
  let s = String(storedUrl || "").trim();
  const permIdx = s.indexOf("/student-docs/permissions/");
  if (permIdx !== -1) s = s.slice(permIdx);
  if (!s.startsWith("/student-docs/permissions/")) return;
  const base = path.basename(s);
  if (!base || base.includes("..")) return;
  try {
    await fs.unlink(path.join(STUDENT_PERMISSIONS_DIR, base));
  } catch {
    // ignore
  }
}

function getDataUrlMime(dataUrl) {
  const mimeMatch = /^data:([^;]+);base64,/.exec(String(dataUrl || ""));
  return mimeMatch ? String(mimeMatch[1] || "").toLowerCase() : "";
}

function extensionFromMime(mime) {
  if (!mime) return "";
  const known = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  return known[mime] || "";
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

async function storeChatAttachmentDataUrl(dataUrl, originalName) {
  const mime = getDataUrlMime(dataUrl);
  const ext = extensionFromMime(mime);
  if (!mime || !ext) return null;
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (!base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  if (buffer.length > MAX_UPLOAD_BYTES) return { error: `File is too large. Max ${MAX_UPLOAD_LABEL} allowed.` };

  const originalBase = sanitizeFileName(path.parse(String(originalName || "attachment")).name) || "attachment";
  const fileName = `chat-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${originalBase}.${ext}`;
  await fs.mkdir(CHAT_FILES_DIR, { recursive: true });
  await fs.writeFile(path.join(CHAT_FILES_DIR, fileName), buffer);
  return {
    url: `/chat-files/${fileName}`,
    mime,
    size: buffer.length,
    name: `${originalBase}.${ext}`,
  };
}

function isSupportedWhatsappMediaMime(mime) {
  const allowed = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
  ]);
  return allowed.has(String(mime || "").toLowerCase());
}

async function storeStudentCvDataUrl(dataUrl, originalName) {
  const mime = getDataUrlMime(dataUrl);
  const allowed = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  if (!allowed.has(mime)) return null;
  const ext = extensionFromMime(mime);
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (!ext || !base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { error: `CV file is too large. Max ${MAX_UPLOAD_LABEL} allowed.` };
  }
  const originalBase = sanitizeFileName(path.parse(String(originalName || "cv")).name) || "cv";
  const fileName = `cv-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${originalBase}.${ext}`;
  await fs.mkdir(STUDENT_CV_DIR, { recursive: true });
  await fs.writeFile(path.join(STUDENT_CV_DIR, fileName), buffer);
  return {
    url: `/student-docs/cv/${fileName}`,
    mime,
    size: buffer.length,
    name: `${originalBase}.${ext}`,
  };
}

async function storeStudentPermissionDataUrl(dataUrl, originalName) {
  const mime = getDataUrlMime(dataUrl);
  const allowed = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  if (!allowed.has(mime)) return null;
  const ext = extensionFromMime(mime);
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (!ext || !base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { error: `Document file is too large. Max ${MAX_UPLOAD_LABEL} allowed.` };
  }
  const originalBase = sanitizeFileName(path.parse(String(originalName || "document")).name) || "document";
  const fileName = `perm-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${originalBase}.${ext}`;
  await fs.mkdir(STUDENT_PERMISSIONS_DIR, { recursive: true });
  await fs.writeFile(path.join(STUDENT_PERMISSIONS_DIR, fileName), buffer);
  return {
    url: `/student-docs/permissions/${fileName}`,
    mime,
    size: buffer.length,
    name: `${originalBase}.${ext}`,
  };
}

async function storePaymentProofDataUrl(dataUrl, originalName) {
  const mime = getDataUrlMime(dataUrl);
  const allowed = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  if (!allowed.has(mime)) return null;
  const ext = extensionFromMime(mime);
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (!ext || !base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { error: `Payment proof file is too large. Max ${MAX_UPLOAD_LABEL} allowed.` };
  }
  const originalBase = sanitizeFileName(path.parse(String(originalName || "payment-proof")).name) || "payment-proof";
  const fileName = `pay-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${originalBase}.${ext}`;
  await fs.mkdir(PAYMENTS_DIR, { recursive: true });
  await fs.writeFile(path.join(PAYMENTS_DIR, fileName), buffer);
  return {
    url: `/payments/${fileName}`,
    mime,
    size: buffer.length,
    name: `${originalBase}.${ext}`,
  };
}

function splitAdminRecord(users) {
  const adminIndex = users.findIndex(
    (u) => (u.id === "ADM001" || String(u.email || "").toLowerCase() === ADMIN_EMAIL) && u.role === "Admin"
  );
  if (adminIndex === -1) {
    return { adminRecord: null, others: users };
  }
  return {
    adminRecord: users[adminIndex],
    others: users.filter((_, idx) => idx !== adminIndex),
  };
}

function getSmtpConfigError() {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    return "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS in backend .env.";
  }
  return "";
}

function createOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function escapeHtmlEmail(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildForgotPasswordEmailHtml({ otpCode }) {
  const safe = escapeHtmlEmail(otpCode);
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Password reset</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Your ${COMPANY_NAME} verification code is ${safe}. Valid for 10 minutes.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;">
          <tr>
            <td bgcolor="#4f46e5" style="background-color:#4f46e5;background:linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#7c3aed 100%);border-radius:12px 12px 0 0;height:4px;line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;overflow:hidden;box-shadow:0 22px 50px rgba(15,23,42,0.06);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:40px 40px 28px;text-align:center;">
                    <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#6366f1;">
                      ${COMPANY_NAME}
                    </p>
                    <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:600;color:#0f172a;letter-spacing:-0.02em;">
                      Secure password reset
                    </h1>
                    <p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#64748b;">
                      Use this one-time code to verify it’s you and create a new password. This code expires in&nbsp;<strong style="color:#334155;font-weight:600;">10 minutes</strong>.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 32px;text-align:center;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" bgcolor="#f8fafc" style="margin:0 auto;background-color:#f8fafc;background:linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%);border:1px solid #e2e8f0;border-radius:12px;">
                      <tr>
                        <td style="padding:22px 36px;font-family:'SF Mono',ui-monospace,Menlo,Monaco,'Cascadia Mono',Consolas,monospace;font-size:34px;line-height:1;font-weight:700;letter-spacing:0.42em;color:#312e81;text-align:center;">
                          ${safe}
                        </td>
                      </tr>
                    </table>
                    <p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;">
                      For your security, never share this code. ${COMPANY_NAME_NBSP} will never ask you for it by phone or chat.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 36px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #f1f5f9;">
                      <tr>
                        <td style="padding-top:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.6;color:#64748b;">
                          <strong style="color:#475569;display:block;margin-bottom:6px;font-size:13px;font-weight:600;">Didn’t request this?</strong>
                          You can safely ignore this message. Your password won’t change until you enter this code on the reset page.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 8px 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;color:#94a3b8;">
              This email was sent automatically for account security.&nbsp;<br/>
              © ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendForgotPasswordOtpEmail({ email, otpCode }) {
  const textBody =
    [
      `${COMPANY_NAME} — password reset`,
      "",
      `Your verification code is: ${otpCode}`,
      "",
      "This code expires in 10 minutes. Do not share it with anyone.",
      "",
      "If you didn't request this, you can ignore this email.",
      "",
      `© ${new Date().getFullYear()} ${COMPANY_NAME}`,
    ].join("\n");

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  const message = {
    from: SMTP_FROM,
    to: email,
    subject: `Your ${COMPANY_NAME} verification code`,
    text: textBody,
    html: buildForgotPasswordEmailHtml({ otpCode }),
  };
  try {
    await transporter.sendMail(message);
    logEvent("email", "forgot-password otp sent", { to: email });
  } catch (error) {
    // Some SMTP providers reject custom FROM if it doesn't match authenticated mailbox.
    // Retry once with SMTP_USER as sender to satisfy sender verification checks.
    const shouldRetryWithAuthSender =
      error &&
      (error.code === "EENVELOPE" || error.responseCode === 550) &&
      String(SMTP_USER || "").trim();
    if (!shouldRetryWithAuthSender) throw error;
    await transporter.sendMail({
      ...message,
      from: SMTP_USER,
      replyTo: SMTP_FROM || SMTP_USER,
    });
    logEvent("email", "forgot-password otp sent (fallback sender)", { to: email, from: SMTP_USER });
  }
}

function normalizePublicBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (!parsed.hostname) return "";
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function resolveRequestPublicBaseUrl(req) {
  if (!req || !req.headers) return "";
  const headers = req.headers || {};

  const origin = normalizePublicBaseUrl(Array.isArray(headers.origin) ? headers.origin[0] : headers.origin);
  if (origin) return origin;

  const referer = String(Array.isArray(headers.referer) ? headers.referer[0] : headers.referer || "").trim();
  const fromReferer = normalizePublicBaseUrl(referer);
  if (fromReferer) return fromReferer;

  const forwardedProtoRaw = headers["x-forwarded-proto"];
  const forwardedHostRaw = headers["x-forwarded-host"];
  const hostRaw = headers.host;
  const proto = String(Array.isArray(forwardedProtoRaw) ? forwardedProtoRaw[0] : forwardedProtoRaw || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const host = String(Array.isArray(forwardedHostRaw) ? forwardedHostRaw[0] : forwardedHostRaw || hostRaw || "")
    .split(",")[0]
    .trim();
  if (!host) return "";
  const protocol = proto === "https" || proto === "http" ? proto : "http";
  return `${protocol}://${host}`;
}

function buildStudentPortalLoginUrl(req, portalOriginOverride = "") {
  const base = (
    APP_PUBLIC_URL ||
    normalizePublicBaseUrl(portalOriginOverride) ||
    resolveRequestPublicBaseUrl(req) ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
  if (!base) return "";
  const path = STUDENT_SIGN_IN_PATH.startsWith("/") ? STUDENT_SIGN_IN_PATH : `/${STUDENT_SIGN_IN_PATH}`;
  return `${base}${path}`;
}

function isApplicationStage(value) {
  return String(value || "").trim().toLowerCase() === "application";
}

function isRegistrationStage(value) {
  return String(value || "").trim().toLowerCase() === "registration";
}

function isInquiryStage(value) {
  return String(value || "").trim().toLowerCase() === "inquiry";
}

function isDocumentationStage(value) {
  return String(value || "").trim().toLowerCase() === "documentation";
}

function normalizeStage(value) {
  return String(value || "").trim().toLowerCase();
}

function buildStudentAccountDetailsWhatsappMessage({ studentName, emailAddress, password, loginUrl }) {
  const lines = [
    `${COMPANY_NAME} — your student portal login`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "Your account is ready. Sign in using:",
    `Email: ${emailAddress || ""}`,
    `Password: ${password || ""}`,
    loginUrl ? `Portal: ${loginUrl}` : "",
    "",
    "Please change your password after first sign-in.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildAppointmentLinkWhatsappMessage({ studentName, title, date, time, meetingLink, meetingPlatform }) {
  const platform = String(meetingPlatform || "").trim();
  const link = String(meetingLink || "").trim();
  const lines = [
    `${COMPANY_NAME} — Meeting Details`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "Your meeting has been scheduled/updated:",
    `Title: ${title || "Session"}`,
    `Date: ${date || ""}`,
    `Time: ${time || ""}`,
    platform ? `Platform: ${platform}` : "",
    link ? `Meeting Link: ${link}` : "",
    "",
    "Please join on time.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildCounselorAssignmentWhatsappMessage({ studentName, counselorName, counselorEmail, counselorPhone, counselorBranch }) {
  const lines = [
    `${COMPANY_NAME} — New Counselor Assigned`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "A new counselor has been assigned to assist you with your application process.",
    "",
    "Counselor details:",
    `Name: ${counselorName || ""}`,
    counselorEmail ? `Email: ${counselorEmail}` : "",
    counselorPhone ? `Phone: ${counselorPhone}` : "",
    counselorBranch ? `Branch: ${counselorBranch}` : "",
    "",
    "Feel free to reach out to your counselor for any questions or support.",
  ].filter(Boolean);
  return lines.join("\n");
}

const MEETING_REMINDER_MIN_MS = 14 * 60 * 1000;
const MEETING_REMINDER_MAX_MS = 16 * 60 * 1000;
const MEETING_REMINDER_POLL_MS = 60 * 1000;

function appointmentStartMs(appointment) {
  const date = String(appointment?.date || "").trim();
  const time = String(appointment?.time || "").trim();
  if (!date || !time) return NaN;
  return new Date(`${date}T${time}:00+05:30`).getTime();
}

function isWithinMeetingReminderWindow(appointment, nowMs = Date.now()) {
  if (String(appointment?.status || "") !== "Scheduled") return false;
  const startMs = appointmentStartMs(appointment);
  if (!Number.isFinite(startMs)) return false;
  const msUntil = startMs - nowMs;
  if (msUntil < 0) return false;
  return msUntil >= MEETING_REMINDER_MIN_MS && msUntil <= MEETING_REMINDER_MAX_MS;
}

function buildMeetingReminderWhatsappMessage({ studentName, title, date, time, meetingLink, meetingPlatform }) {
  const platform = String(meetingPlatform || "").trim();
  const link = String(meetingLink || "").trim();
  const lines = [
    `${COMPANY_NAME} — Meeting Reminder`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "Your meeting starts in about 15 minutes:",
    `Title: ${title || "Session"}`,
    `Date: ${date || ""}`,
    `Time: ${time || ""}`,
    platform ? `Platform: ${platform}` : "",
    link ? `Meeting Link: ${link}` : "",
    "",
    "Please be ready to join on time.",
  ].filter(Boolean);
  return lines.join("\n");
}

async function processMeetingReminders() {
  const appointments = await readAppointments();
  const now = Date.now();
  let changed = false;
  const nextAppointments = [];
  for (const apt of appointments) {
    let next = apt;
    if (isWithinMeetingReminderWindow(apt, now) && !apt.studentMeetingReminderWhatsappDelivery?.sentAt) {
      try {
        const students = await readStudemts();
        const student = students.find((item) => String(item.id || "") === String(apt.studentId || ""));
        const result = await deliverCounselorMessageToStudentWhatsapp({
          senderId: String(apt.counselorId || "").trim(),
          receiverId: String(apt.studentId || "").trim(),
          content: buildMeetingReminderWhatsappMessage({
            studentName: student?.name || "",
            title: apt.title || "Session",
            date: apt.date || "",
            time: apt.time || "",
            meetingPlatform: apt.meetingPlatform || "",
            meetingLink: apt.meetingLink || "",
          }),
        });
        next = {
          ...next,
          studentMeetingReminderWhatsappDelivery: {
            attempted: Boolean(result?.attempted),
            status: result?.status || "skipped",
            reason: result?.reason || "",
            sentAt: new Date().toISOString(),
          },
        };
        changed = true;
        logEvent("appointment", "meeting reminder sent to student via whatsapp", {
          appointmentId: apt.id,
          counselorId: apt.counselorId,
          studentId: apt.studentId,
          status: next.studentMeetingReminderWhatsappDelivery.status,
        });
      } catch (error) {
        next = {
          ...next,
          studentMeetingReminderWhatsappDelivery: {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send WhatsApp meeting reminder."),
            sentAt: new Date().toISOString(),
          },
        };
        changed = true;
        console.error("Meeting reminder WhatsApp send failed:", error);
      }
    }
    nextAppointments.push(next);
  }
  if (changed) {
    await writeAppointments(nextAppointments);
  }
}

function formatPaymentAccountForMessage(paymentAccount) {
  if (!paymentAccount || typeof paymentAccount !== "object") return [];
  const lines = ["Payment details:"];
  if (paymentAccount.label) lines.push(`Account: ${paymentAccount.label}`);
  if (paymentAccount.bankName) lines.push(`Bank: ${paymentAccount.bankName}`);
  if (paymentAccount.accountName) lines.push(`Account name: ${paymentAccount.accountName}`);
  if (paymentAccount.accountNumber) lines.push(`Account number: ${paymentAccount.accountNumber}`);
  if (paymentAccount.branch) lines.push(`Branch: ${paymentAccount.branch}`);
  if (paymentAccount.currency) lines.push(`Currency: ${paymentAccount.currency}`);
  if (paymentAccount.notes) lines.push(`Notes: ${paymentAccount.notes}`);
  return lines;
}

function buildInvoiceWhatsappMessage({
  studentName,
  invoiceId,
  currency,
  amount,
  description,
  issueDate,
  dueDate,
  paymentAccount,
  attachmentLink,
  attachmentFileUrl,
  attachmentFileName,
  generatedReceiptUrl,
}) {
  const lines = [
    `${COMPANY_NAME} - Invoice Generated`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "A new invoice has been generated for your application.",
    `Invoice ID: ${invoiceId || ""}`,
    `Amount: ${currency || "LKR"} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    issueDate ? `Issue Date: ${issueDate}` : "",
    `Due Date: ${dueDate || ""}`,
    description ? `Description: ${description}` : "",
    "",
    ...formatPaymentAccountForMessage(paymentAccount),
    paymentAccount ? "" : null,
    attachmentLink ? `Reference link: ${attachmentLink}` : "",
    attachmentFileUrl
      ? `Attached document${attachmentFileName ? ` (${attachmentFileName})` : ""}: ${attachmentFileUrl}`
      : "",
    generatedReceiptUrl ? `Invoice image: ${generatedReceiptUrl}` : "",
    "",
    "Please complete the payment before the due date. You can also view full details in your student portal under Finance.",
  ].filter((line) => line !== null && line !== undefined && String(line).trim() !== "");
  return lines.join("\n");
}

function aggregateWhatsappDeliveryResults(results) {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) {
    return { attempted: false, status: "skipped", reason: "Not attempted.", sentAt: new Date().toISOString() };
  }
  const attempted = list.some((r) => r.attempted);
  const sent = list.some((r) => r.status === "sent");
  const failed = list.filter((r) => r.status === "failed");
  const skipped = list.every((r) => r.status === "skipped");
  return {
    attempted,
    status: sent ? "sent" : failed.length ? "failed" : skipped ? "skipped" : "skipped",
    reason: failed.map((r) => r.reason).filter(Boolean).join(" ") || list[list.length - 1]?.reason || "",
    sentAt: new Date().toISOString(),
    parts: list,
  };
}

async function deliverInvoicePackageToStudentWhatsapp({
  senderId,
  receiverId,
  messageText,
  receiptAttachment,
  invoiceFileAttachment,
}) {
  const results = [];
  const text = String(messageText || "").trim();
  if (text) {
    results.push(
      await deliverCounselorMessageToStudentWhatsapp({
        senderId,
        receiverId,
        content: text,
        attachment: null,
      })
    );
  }
  if (receiptAttachment?.url) {
    results.push(
      await deliverCounselorMessageToStudentWhatsapp({
        senderId,
        receiverId,
        content: "",
        attachment: receiptAttachment,
      })
    );
  }
  const fileUrl = String(invoiceFileAttachment?.url || "");
  const receiptUrl = String(receiptAttachment?.url || "");
  if (
    fileUrl &&
    isSupportedWhatsappMediaMime(invoiceFileAttachment.mime) &&
    fileUrl !== receiptUrl
  ) {
    results.push(
      await deliverCounselorMessageToStudentWhatsapp({
        senderId,
        receiverId,
        content: "",
        attachment: invoiceFileAttachment,
      })
    );
  }
  return aggregateWhatsappDeliveryResults(results);
}

function buildInvoicePaymentDecisionWhatsappMessage({
  studentName,
  invoiceId,
  currency,
  amount,
  description,
  decision,
  rejectionReason,
}) {
  const amountLabel = `${currency || "LKR"} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const invoiceLabel = invoiceId ? `Invoice ${invoiceId}` : "your invoice";
  if (decision === "approved") {
    const lines = [
      `${COMPANY_NAME} — Invoice payment update`,
      "",
      `Hi ${studentName || "Student"},`,
      "",
      "Good news: your payment evidence has been approved.",
      invoiceLabel,
      `Amount: ${amountLabel}`,
      description ? `Description: ${description}` : "",
      "",
      "Your invoice is now marked as paid. Log in to your student portal to review your finance records.",
    ].filter(Boolean);
    return lines.join("\n");
  }
  const lines = [
    `${COMPANY_NAME} — Invoice payment update`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "Your payment evidence could not be approved and needs to be re-uploaded.",
    invoiceLabel,
    `Amount: ${amountLabel}`,
    description ? `Description: ${description}` : "",
    rejectionReason ? `Reason: ${rejectionReason}` : "",
    "",
    "Please sign in to the student portal, review the feedback, and upload corrected payment evidence.",
  ].filter(Boolean);
  return lines.join("\n");
}

/** Counselor, inquiry counselor, and anyone in counselorHistory for this student. */
function collectManagingCounselorIdsForStudent(student) {
  const ids = new Set();
  const add = (raw) => {
    const v = String(raw || "").trim();
    if (v && v.toLowerCase() !== "unassigned") ids.add(v);
  };
  if (!student || typeof student !== "object") return [];
  add(student.counselor);
  add(student.inquiryCounselorId);
  const history = Array.isArray(student.counselorHistory) ? student.counselorHistory : [];
  history.forEach(add);
  return Array.from(ids);
}

function pickInvoiceWhatsappSenderId(student, counselorIds) {
  const inquiry = String(student?.inquiryCounselorId || "").trim();
  const primary = String(student?.counselor || "").trim();
  if (inquiry && inquiry.toLowerCase() !== "unassigned") return inquiry;
  if (primary && primary.toLowerCase() !== "unassigned") return primary;
  return counselorIds[0] || "";
}

function buildCounselorInvoiceDecisionPortalMessage({
  studentName,
  invoiceId,
  currency,
  amount,
  description,
  decision,
  actorRole,
  rejectionReason,
}) {
  const amountLabel = `${currency || "LKR"} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const invoiceLabel = invoiceId ? `Invoice ${invoiceId}` : "An invoice";
  const who = actorRole ? String(actorRole).trim() : "Finance";
  if (decision === "approved") {
    return [
      `${COMPANY_NAME} — Payment approved`,
      `${invoiceLabel} for ${studentName || "a student"} was approved by ${who}.`,
      `Amount: ${amountLabel}`,
      description ? `Description: ${description}` : "",
      "The student has been notified.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `${COMPANY_NAME} — Payment evidence rejected`,
    `${invoiceLabel} for ${studentName || "a student"} was rejected by ${who}.`,
    `Amount: ${amountLabel}`,
    description ? `Description: ${description}` : "",
    rejectionReason ? `Reason for student: ${rejectionReason}` : "",
    "The student has been notified to re-upload evidence.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function appendPortalChatMessage({ senderId, receiverId, content, platform = "portal" }) {
  const from = String(senderId || "").trim();
  const to = String(receiverId || "").trim();
  const text = String(content || "").trim();
  if (!from || !to || !text) return null;
  const chats = await readChats();
  const chat = {
    id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
    senderId: from,
    receiverId: to,
    content: text,
    timestamp: new Date().toISOString(),
    read: false,
    platform: platform || "portal",
    attachment: null,
  };
  await writeChats([...chats, chat]);
  return chat;
}

async function resolvePortalMessageSenderId(actorId, fallbackCounselorId) {
  const actor = String(actorId || "").trim();
  if (actor) {
    const users = await readUsers();
    if (users.some((u) => String(u.id || "").trim() === actor)) return actor;
  }
  return String(fallbackCounselorId || "").trim();
}

async function deliverInvoiceDecisionWhatsappToStudent({ student, counselorIds, message }) {
  const studentId = String(student?.id || "").trim();
  if (!studentId || !String(message || "").trim()) {
    return { attempted: false, status: "skipped", reason: "Missing student or message." };
  }
  const ordered = [...counselorIds];
  const primary = pickInvoiceWhatsappSenderId(student, counselorIds);
  if (primary) {
    const idx = ordered.indexOf(primary);
    if (idx > 0) {
      ordered.splice(idx, 1);
      ordered.unshift(primary);
    } else if (idx < 0) {
      ordered.unshift(primary);
    }
  }
  const parts = [];
  for (const senderId of ordered) {
    const sender = await resolveCounselor(senderId);
    if (!sender) continue;
    const result = await deliverCounselorMessageToStudentWhatsapp({
      senderId,
      receiverId: studentId,
      content: message,
    });
    parts.push({ senderId, ...result });
    if (result.status === "sent") {
      return { ...aggregateWhatsappDeliveryResults(parts), senderId };
    }
  }
  if (!parts.length) {
    return {
      attempted: false,
      status: "skipped",
      reason: "No counselor WhatsApp account available for this student.",
    };
  }
  return { ...aggregateWhatsappDeliveryResults(parts), senderId: parts[0]?.senderId || "" };
}

async function appendFinanceActivityForInvoiceDecision({
  actorRole,
  actorId,
  student,
  invoice,
  decision,
}) {
  const studentName = String(student?.name || "").trim();
  const invoiceId = String(invoice?.id || "").trim();
  const amountLabel = `${invoice?.currency || "LKR"} ${Number(invoice?.amount || 0)}`;
  const action =
    decision === "approved" ? "approved invoice payment" : "rejected invoice payment evidence";
  const activities = await readActivities();
  const activity = {
    id: `act-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    user: String(actorRole || "System").trim() || "System",
    role: String(actorRole || "System").trim() || "System",
    action,
    target: `${invoiceId} (${amountLabel}) — ${studentName || invoice.studentId || "student"}`,
    type: decision === "approved" ? "approval" : "rejection",
    timestamp: "Just now",
    createdAt: new Date().toISOString(),
    actorName: String(actorRole || "System").trim() || "System",
    counselorName: "",
    studentName,
    studentId: String(student?.id || invoice?.studentId || "").trim(),
    invoiceId,
    actorId: String(actorId || "").trim(),
  };
  await writeActivities([activity, ...activities]);
  return activity;
}

async function notifyInvoicePaymentDecision({
  req,
  invoice,
  student,
  decision,
  actorRole,
  actorId,
}) {
  const studentName = String(student?.name || "").trim();
  const managingCounselorIds = student ? collectManagingCounselorIdsForStudent(student) : [];
  const whatsappSenderId = student ? pickInvoiceWhatsappSenderId(student, managingCounselorIds) : "";
  const portalSenderId = await resolvePortalMessageSenderId(actorId, whatsappSenderId);

  const studentMessage = student
    ? buildInvoicePaymentDecisionWhatsappMessage({
        studentName,
        invoiceId: invoice.id,
        currency: invoice.currency,
        amount: invoice.amount,
        description: invoice.description,
        decision,
        rejectionReason: String(invoice.paymentRejectionReason || "").trim(),
      })
    : "";

  const counselorMessage = student
    ? buildCounselorInvoiceDecisionPortalMessage({
        studentName,
        invoiceId: invoice.id,
        currency: invoice.currency,
        amount: invoice.amount,
        description: invoice.description,
        decision,
        actorRole,
        rejectionReason: String(invoice.paymentRejectionReason || "").trim(),
      })
    : "";

  let invoiceWhatsappNotification = null;
  let studentPortalChat = null;
  const counselorPortalChats = [];
  let activity = null;

  if (!student) {
    invoiceWhatsappNotification = {
      invoiceId: invoice.id,
      decision,
      whatsapp: { attempted: false, status: "skipped", reason: "Student record not found." },
    };
    return {
      invoiceWhatsappNotification,
      studentPortalChat,
      counselorPortalChats,
      activity,
      managingCounselorIds,
    };
  }

  if (studentMessage && managingCounselorIds.length) {
    const whatsapp = await deliverInvoiceDecisionWhatsappToStudent({
      student,
      counselorIds: managingCounselorIds,
      message: studentMessage,
    });
    invoiceWhatsappNotification = {
      invoiceId: invoice.id,
      decision,
      whatsapp,
    };
  } else if (studentMessage) {
    invoiceWhatsappNotification = {
      invoiceId: invoice.id,
      decision,
      whatsapp: {
        attempted: false,
        status: "skipped",
        reason: "Student has no assigned counselor for WhatsApp.",
      },
    };
  }

  if (studentMessage && portalSenderId) {
    studentPortalChat = await appendPortalChatMessage({
      senderId: portalSenderId,
      receiverId: String(student.id || ""),
      content: studentMessage,
    });
  }

  if (counselorMessage && portalSenderId) {
    for (const counselorId of managingCounselorIds) {
      try {
        const chat = await appendPortalChatMessage({
          senderId: portalSenderId,
          receiverId: counselorId,
          content: counselorMessage,
        });
        counselorPortalChats.push({
          counselorId,
          ok: Boolean(chat),
          chatId: chat?.id || null,
        });
      } catch (error) {
        counselorPortalChats.push({
          counselorId,
          ok: false,
          error: String(error?.message || "Failed to notify counselor."),
        });
      }
    }
  }

  activity = await appendFinanceActivityForInvoiceDecision({
    actorRole,
    actorId,
    student,
    invoice,
    decision,
  });

  return {
    invoiceWhatsappNotification,
    studentPortalChat: studentPortalChat ? { chatId: studentPortalChat.id } : null,
    counselorPortalChats,
    activity: activity ? { id: activity.id } : null,
    managingCounselorIds,
  };
}

function collectDocumentVerificationTransitions(previousDocs, nextDocs) {
  const prevById = new Map(
    (Array.isArray(previousDocs) ? previousDocs : []).map((d) => [String(d.id || "").trim(), d])
  );
  const out = [];
  for (const doc of Array.isArray(nextDocs) ? nextDocs : []) {
    const id = String(doc.id || "").trim();
    if (!id) continue;
    const prev = prevById.get(id);
    const nextStatus = String(doc.status || "").trim().toLowerCase();
    const prevStatus = prev ? String(prev.status || "").trim().toLowerCase() : "";
    if (nextStatus === "verified" && prevStatus !== "verified") {
      out.push({
        docId: id,
        docName: String(doc.name || doc.type || "Document"),
        docType: String(doc.type || ""),
        decision: "verified",
        rejectionReason: "",
      });
    }
    if (nextStatus === "rejected" && prevStatus !== "rejected") {
      out.push({
        docId: id,
        docName: String(doc.name || doc.type || "Document"),
        docType: String(doc.type || ""),
        decision: "rejected",
        rejectionReason: String(doc.rejectionReason || "").trim(),
      });
    }
  }
  return out;
}

function buildDocumentDecisionWhatsappMessage({ studentName, docName, docType, decision, rejectionReason }) {
  const friendlyDoc = docType ? `${docName} (${docType})` : docName;
  if (decision === "verified") {
    const lines = [
      `${COMPANY_NAME} — Document update`,
      "",
      `Hi ${studentName || "Student"},`,
      "",
      "Good news: your document has been approved (verified).",
      `Document: ${friendlyDoc}`,
      "",
      "Log in to your student portal to review your checklist.",
    ];
    return lines.join("\n");
  }
  const lines = [
    `${COMPANY_NAME} — Document update`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "Your document could not be approved and needs to be re-uploaded.",
    `Document: ${friendlyDoc}`,
    rejectionReason ? `Reason: ${rejectionReason}` : "",
    "",
    "Please sign in to the student portal, review the feedback, and upload a corrected file.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildUniversityOfferWhatsappMessage({ studentName, fileName, offerStatus, letterCount = 1 }) {
  const friendlyFile = String(fileName || "University offer letter").trim();
  const countNote =
    letterCount > 1 ? ` (${letterCount} offer letters uploaded — this message refers to "${friendlyFile}".)` : "";
  if (offerStatus === "Unconditional" || offerStatus === "Approved") {
    const lines = [
      `${COMPANY_NAME} — University offer update`,
      "",
      `Hi ${studentName || "Student"},`,
      "",
      "Congratulations! Your university application has received an unconditional offer.",
      `Offer letter: ${friendlyFile}${countNote}`,
      "",
      "Your counselor has shared the offer letter with you. Log in to your student portal to review all details.",
    ];
    return lines.join("\n");
  }
  if (offerStatus === "Conditional") {
    const lines = [
      `${COMPANY_NAME} — University offer update`,
      "",
      `Hi ${studentName || "Student"},`,
      "",
      "Your university application has received a conditional offer.",
      `Offer letter: ${friendlyFile}${countNote}`,
      "",
      "Please review the conditions in the attached letter and contact your counselor if you have questions.",
    ];
    return lines.join("\n");
  }
  const lines = [
    `${COMPANY_NAME} — University offer update`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "We need to inform you that your university application was not successful at this time.",
    `Reference: ${friendlyFile}${countNote}`,
    "",
    "Your counselor will discuss next steps with you. Please sign in to the student portal or reply on WhatsApp.",
  ];
  return lines.join("\n");
}

function buildStudentWelcomeEmailHtml({ studentName, loginUrl, emailAddress, password, counselorName }) {
  const safeName = escapeHtmlEmail(studentName);
  const safeEmail = escapeHtmlEmail(emailAddress);
  const safePass = escapeHtmlEmail(password);
  const safeCounselor = escapeHtmlEmail(counselorName);
  const safeLogin = escapeHtmlEmail(loginUrl);
  const counselorBlock =
    counselorName && counselorName.trim() !== "Not assigned yet"
      ? `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.55;color:#334155;"><strong style="color:#0f172a;">Assigned counselor</strong><br/><span style="font-size:15px;color:#4338ca;font-weight:600;">${safeCounselor}</span></p>`
      : `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.55;color:#64748b;">Your counselor will be confirmed shortly—you can still sign in below.</p>`;
  const ctaBlock = loginUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;"><tr><td bgcolor="#4f46e5" style="border-radius:10px;background-color:#4f46e5;background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);"><a href="${safeLogin}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Open student portal</a></td></tr></table><p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;"><a href="${safeLogin}" style="color:#6366f1;text-decoration:none;">${safeLogin}</a></p>`
    : `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.6;color:#64748b;">Use the student portal URL provided by your branch. (Set <strong style="font-weight:600;color:#475569;">APP_PUBLIC_URL</strong> on the server to include a clickable link automatically.)</p>`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>Student portal access</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Your ${COMPANY_NAME} student portal login is ready. Sign in with ${safeEmail}.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;">
          <tr>
            <td bgcolor="#4f46e5" style="background-color:#4f46e5;background:linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#7c3aed 100%);border-radius:12px 12px 0 0;height:4px;line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;overflow:hidden;box-shadow:0 22px 50px rgba(15,23,42,0.06);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:40px 40px 24px;text-align:center;">
                    <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#6366f1;">${COMPANY_NAME}</p>
                    <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:600;color:#0f172a;letter-spacing:-0.02em;">Welcome to your student portal</h1>
                    <p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#64748b;">
                      Hi <strong style="color:#334155;">${safeName}</strong>, your account is ready. Use the credentials below to sign in and track your journey with us.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                      <tr>
                        <td style="padding:24px 28px;">
                          <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#64748b;">Sign-in details</p>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#64748b;width:120px;">Email</td>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:13px;font-weight:600;color:#312e81;word-break:break-all;">${safeEmail}</td>
                            </tr>
                            <tr>
                              <td style="padding:10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#64748b;">Password</td>
                              <td style="padding:10px 0;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:13px;font-weight:600;color:#312e81;word-break:break-all;">${safePass}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 28px;text-align:center;">
                    ${ctaBlock}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 28px;text-align:center;border-top:1px solid #f1f5f9;">
                    ${counselorBlock}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 36px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #f1f5f9;">
                      <tr>
                        <td style="padding-top:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.65;color:#64748b;">
                          <strong style="color:#475569;display:block;margin-bottom:6px;font-size:13px;font-weight:600;">Security</strong>
                          For your protection, please change your password after your first sign-in (<strong>Forgot password</strong> is available if needed). Do not forward this message or share your password.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 8px 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;color:#94a3b8;">
              This email was generated when your profile was added to ${COMPANY_NAME_NBSP}.<br/>
              © ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildCounselorWelcomeEmailHtml({ counselorName, username, loginUrl, emailAddress, password, branch, emailCopy = null }) {
  const safeName = escapeHtmlEmail(counselorName);
  const safeUsername = escapeHtmlEmail(username);
  const safeEmail = escapeHtmlEmail(emailAddress);
  const safePass = escapeHtmlEmail(password);
  const safeBranch = escapeHtmlEmail(branch);
  const safeLogin = escapeHtmlEmail(loginUrl);
  const safeRolePhrase = escapeHtmlEmail(emailCopy?.rolePhrase || "counselor");
  const safePageTitle = escapeHtmlEmail(emailCopy?.pageTitle || "Counselor portal access");
  const safeHeadline = escapeHtmlEmail(emailCopy?.headline || "Welcome to your counselor account");
  const branchBlock = branch
    ? `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#64748b;width:120px;">Branch</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:600;color:#312e81;">${safeBranch}</td></tr>`
    : "";
  const ctaBlock = loginUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;"><tr><td bgcolor="#4f46e5" style="border-radius:10px;background-color:#4f46e5;background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);"><a href="${safeLogin}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Open portal</a></td></tr></table><p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;"><a href="${safeLogin}" style="color:#6366f1;text-decoration:none;">${safeLogin}</a></p>`
    : `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.6;color:#64748b;">Use the portal URL provided by your branch. (Set <strong style="font-weight:600;color:#475569;">APP_PUBLIC_URL</strong> on the server to include a clickable link automatically.)</p>`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>${safePageTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Your ${COMPANY_NAME} ${safeRolePhrase} account is ready. Sign in with ${safeEmail}.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;">
          <tr>
            <td bgcolor="#4f46e5" style="background-color:#4f46e5;background:linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#7c3aed 100%);border-radius:12px 12px 0 0;height:4px;line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;overflow:hidden;box-shadow:0 22px 50px rgba(15,23,42,0.06);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:40px 40px 24px;text-align:center;">
                    <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#6366f1;">${COMPANY_NAME}</p>
                    <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:600;color:#0f172a;letter-spacing:-0.02em;">${safeHeadline}</h1>
                    <p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#64748b;">
                      Hi <strong style="color:#334155;">${safeName}</strong>, your account has been created. Use the credentials below to sign in to the portal.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                      <tr>
                        <td style="padding:24px 28px;">
                          <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#64748b;">Sign-in details</p>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#64748b;width:120px;">Username</td>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:13px;font-weight:600;color:#312e81;word-break:break-all;">${safeUsername}</td>
                            </tr>
                            <tr>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#64748b;">Email</td>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:13px;font-weight:600;color:#312e81;word-break:break-all;">${safeEmail}</td>
                            </tr>
                            <tr>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#64748b;">Password</td>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:13px;font-weight:600;color:#312e81;word-break:break-all;">${safePass}</td>
                            </tr>
                            ${branchBlock}
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 28px;text-align:center;">
                    ${ctaBlock}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 36px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #f1f5f9;">
                      <tr>
                        <td style="padding-top:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.65;color:#64748b;">
                          <strong style="color:#475569;display:block;margin-bottom:6px;font-size:13px;font-weight:600;">Security</strong>
                          For your protection, please change your password after your first sign-in (<strong>Forgot password</strong> is available if needed). Do not forward this message or share your password.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 8px 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;color:#94a3b8;">
              This email was generated when your ${safeRolePhrase} account was created on ${COMPANY_NAME_NBSP}.<br/>
              © ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendCounselorWelcomeEmail({ to, counselorName, username, loginUrl, emailAddress, password, branch, emailCopy = null }) {
  const textLines = [
    emailCopy?.tagline || `${COMPANY_NAME} — counselor portal access`,
    "",
    `Hi ${counselorName || username || (emailCopy ? "there" : "Counselor")},`,
    "",
    "Your account is ready. Sign in using:",
    `- Username: ${username}`,
    `- Email: ${emailAddress}`,
    `- Password: ${password}`,
    loginUrl ? `- Portal: ${loginUrl}` : `- Portal: (use the URL provided by your branch)`,
    branch ? `- Branch: ${branch}` : "",
    "",
    "Change your password after first sign-in. Do not share this email.",
    "",
    `© ${new Date().getFullYear()} ${COMPANY_NAME}`,
  ].filter(Boolean);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  const message = {
    from: SMTP_FROM,
    to,
    subject: emailCopy?.subject || `Welcome to ${COMPANY_NAME} — your counselor account`,
    text: textLines.join("\n"),
    html: buildCounselorWelcomeEmailHtml({
      counselorName: counselorName || username,
      username,
      loginUrl,
      emailAddress,
      password,
      branch,
      emailCopy,
    }),
  };
  const welcomeLogLabel = emailCopy ? "staff welcome email sent" : "counselor welcome email sent";
  try {
    await transporter.sendMail(message);
    logEvent("email", welcomeLogLabel, { to });
  } catch (error) {
    const shouldRetryWithAuthSender =
      error &&
      (error.code === "EENVELOPE" || error.responseCode === 550) &&
      String(SMTP_USER || "").trim();
    if (!shouldRetryWithAuthSender) throw error;
    await transporter.sendMail({
      ...message,
      from: SMTP_USER,
      replyTo: SMTP_FROM || SMTP_USER,
    });
    logEvent("email", `${welcomeLogLabel} (fallback sender)`, { to, from: SMTP_USER });
  }
}

async function sendStudentWelcomeEmail({ to, studentName, loginUrl, emailAddress, password, counselorName }) {
  const textLines = [
    `${COMPANY_NAME} — student portal access`,
    "",
    `Hi ${studentName},`,
    "",
    "Your account is ready. Sign in using:",
    `- Email: ${emailAddress}`,
    `- Password: ${password}`,
    loginUrl ? `- Portal: ${loginUrl}` : `- Portal: (use the URL provided by your branch)`,
    "",
    counselorName && counselorName.trim() !== "Not assigned yet" ? `Assigned counselor: ${counselorName}` : "Counselor: to be confirmed shortly.",
    "",
    "Change your password after first sign-in. Do not share this email.",
    "",
    `© ${new Date().getFullYear()} ${COMPANY_NAME}`,
  ];
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  const message = {
    from: SMTP_FROM,
    to,
    subject: `Welcome to ${COMPANY_NAME} — your student portal login`,
    text: textLines.join("\n"),
    html: buildStudentWelcomeEmailHtml({
      studentName,
      loginUrl,
      emailAddress,
      password,
      counselorName,
    }),
  };
  try {
    await transporter.sendMail(message);
    logEvent("email", "student welcome email sent", { to });
  } catch (error) {
    const shouldRetryWithAuthSender =
      error &&
      (error.code === "EENVELOPE" || error.responseCode === 550) &&
      String(SMTP_USER || "").trim();
    if (!shouldRetryWithAuthSender) throw error;
    await transporter.sendMail({
      ...message,
      from: SMTP_USER,
      replyTo: SMTP_FROM || SMTP_USER,
    });
    logEvent("email", "student welcome email sent (fallback sender)", { to, from: SMTP_USER });
  }
}

async function findResettableUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized === ADMIN_EMAIL) return null;
  const users = await readUsers();
  const userIndex = users.findIndex((u) => normalizeEmail(u.email) === normalized);
  if (userIndex !== -1) return { kind: "user", list: users, index: userIndex };
  const students = await readStudemts();
  const studentIndex = students.findIndex((s) => normalizeEmail(s.email) === normalized);
  if (studentIndex !== -1) return { kind: "student", list: students, index: studentIndex };
  return null;
}

function sanitizeUserIdForPath(userId) {
  return String(userId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

async function resolveCounselor(userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const users = await readUsers();
  const matched = users.find((user) => String(user.id || "") === id);
  if (!matched) return null;
  if (!isCounselorRole(matched.role)) return null;
  return matched;
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
  };
  whatsappSessions.set(key, created);
  return created;
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

async function startWhatsappSession(userId) {
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
  await fs.mkdir(path.join(WHATSAPP_CONNECTIONS_DIR, sanitizeUserIdForPath(cleanUserId)), { recursive: true });
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: sanitizeUserIdForPath(cleanUserId),
      dataPath: path.join(WHATSAPP_CONNECTIONS_DIR, sanitizeUserIdForPath(cleanUserId)),
    }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });
  state.client = client;
  state.status = "connecting";
  state.qrCodeDataUrl = "";
  state.error = "";
  state.connectedAt = "";
  state.whatsappName = "";
  state.whatsappNumber = "";
  state.whatsappProfilePicUrl = "";
  state.lastUpdatedAt = new Date().toISOString();

  client.on("qr", async (qr) => {
    try {
      state.qrCodeDataUrl = await QRCode.toDataURL(qr);
      state.status = "awaiting_qr_scan";
      state.error = "";
      state.lastUpdatedAt = new Date().toISOString();
    } catch {
      state.error = "Failed to render WhatsApp QR code.";
      state.lastUpdatedAt = new Date().toISOString();
    }
  });

  client.on("authenticated", () => {
    state.status = "authenticated";
    state.error = "";
    state.lastUpdatedAt = new Date().toISOString();
  });

  client.on("ready", async () => {
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
    state.lastUpdatedAt = new Date().toISOString();
  });

  client.on("auth_failure", (message) => {
    state.status = "auth_failed";
    state.error = String(message || "WhatsApp authentication failed.");
    state.lastUpdatedAt = new Date().toISOString();
  });

  client.on("disconnected", () => {
    state.status = "disconnected";
    state.qrCodeDataUrl = "";
    state.connectedAt = "";
    state.lastUpdatedAt = new Date().toISOString();
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

  client
    .initialize()
    .catch((error) => {
      state.status = "error";
      state.error = String(error?.message || "Failed to initialize WhatsApp client.");
      state.lastUpdatedAt = new Date().toISOString();
    });

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
  state.client = null;
  state.status = "disconnected";
  state.qrCodeDataUrl = "";
  state.error = "";
  state.connectedAt = "";
  state.whatsappName = "";
  state.whatsappNumber = "";
  state.whatsappProfilePicUrl = "";
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
  return snapshotWhatsappState(cleanUserId);
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

async function initializeWhatsappSessionsOnStartup() {
  try {
    const users = await readUsers();
    const counselors = users.filter((user) => isCounselorRole(user.role));
    for (const counselor of counselors) {
      const counselorId = String(counselor.id || "").trim();
      if (!counselorId) continue;
      const hasSavedSession = await userHasSavedWhatsappSession(counselorId);
      if (!hasSavedSession) continue;
      await startWhatsappSession(counselorId);
    }
  } catch (error) {
    console.error("Failed to initialize WhatsApp sessions on startup:", error);
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
      state.client && (state.status === "connected" || state.status === "authenticated");
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

async function findStudentByWhatsappFrom(chatId) {
  const rawFrom = String(chatId || "");
  const numberPart = rawFrom.split("@")[0] || "";
  const incomingDigits = normalizePhoneDigits(numberPart);
  if (!incomingDigits) return null;
  const students = await readStudemts();
  return (
    students.find((student) => {
      const studentDigits = normalizePhoneDigits(student.phone || "");
      if (!studentDigits) return false;
      return incomingDigits.endsWith(studentDigits) || studentDigits.endsWith(incomingDigits);
    }) || null
  );
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

async function deliverCounselorMessageToStudentWhatsapp({ senderId, receiverId, content, attachment = null }) {
  const sender = await resolveCounselor(senderId);
  if (!sender) {
    return { attempted: false, status: "skipped", reason: "Sender is not a counselor account." };
  }
  const studentId = String(receiverId || "").trim();
  if (!studentId) {
    return { attempted: false, status: "skipped", reason: "Student receiver id is missing." };
  }
  const students = await readStudemts();
  const student = students.find((item) => String(item.id || "") === studentId);
  if (!student) {
    return { attempted: false, status: "skipped", reason: "Student record not found." };
  }
  const phone = String(student.phone || "").trim();
  const chatId = toWhatsAppChatId(phone);
  const toChatId = chatId;
  if (!chatId) {
    return { attempted: false, status: "skipped", reason: "Student phone number is missing." };
  }
  const messageText = String(content || "").trim();
  const outgoingAttachment = attachment && typeof attachment === "object" ? attachment : null;
  let preparedMedia = null;
  let preparedMediaMime = "";
  if (outgoingAttachment && outgoingAttachment.url) {
    preparedMediaMime = String(outgoingAttachment.mime || "").toLowerCase();
    if (!isSupportedWhatsappMediaMime(preparedMediaMime)) {
      return {
        attempted: false,
        status: "skipped",
        reason: "Only PDF and image attachments can be sent via WhatsApp.",
      };
    }
    const mediaPath =
      resolveChatFileDiskPath(String(outgoingAttachment.url || "")) ||
      resolveStudentDocDiskPath(String(outgoingAttachment.url || ""));
    if (!mediaPath) {
      return {
        attempted: false,
        status: "skipped",
        reason: "Attachment file path is invalid.",
      };
    }
    preparedMedia = MessageMedia.fromFilePath(mediaPath);
  } else if (!messageText) {
    return {
      attempted: false,
      status: "skipped",
      reason: "Message text or attachment is required.",
    };
  }

  const senderState = ensureWhatsappState(sender.id);
  if (!senderState.client || (senderState.status !== "connected" && senderState.status !== "authenticated")) {
    return { attempted: true, status: "failed", reason: "Counselor WhatsApp is not connected." };
  }

  const performSend = async () => {
    const live = ensureWhatsappState(sender.id);
    if (!live.client || (live.status !== "connected" && live.status !== "authenticated")) {
      throw new Error("Counselor WhatsApp is not connected.");
    }
    if (preparedMedia) {
      await live.client.sendMessage(chatId, preparedMedia, messageText ? { caption: messageText } : {});
    } else {
      await live.client.sendMessage(chatId, messageText);
    }
  };

  const logSent = () => {
    if (preparedMedia) {
      logEvent("whatsapp", "media message sent", { from: sender.id, to: receiverId, chatId, mime: preparedMediaMime });
    } else {
      logEvent("whatsapp", "message sent", { from: sender.id, to: receiverId, chatId });
    }
  };

  try {
    await performSend();
    logSent();
    return { attempted: true, status: "sent", channel: "whatsapp", chatId };
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
        return { attempted: true, status: "sent", channel: "whatsapp", chatId };
      } catch (errorAfter) {
        logEvent("whatsapp", "message send failed", {
          from: sender.id,
          to: receiverId,
          reason: String(errorAfter?.message || ""),
        });
        return {
          attempted: true,
          status: "failed",
          reason: String(errorAfter?.message || "Failed to send message via WhatsApp."),
        };
      }
    }
    logEvent("whatsapp", "message send failed", { from: sender.id, to: receiverId, reason: String(error?.message || "") });
    return {
      attempted: true,
      status: "failed",
      reason: String(error?.message || "Failed to send message via WhatsApp."),
    };
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    // Keep backend console clean: only log task-related traffic.
    if (url.pathname.startsWith("/api/tasks") && req.method !== "GET") {
      logEvent("task", `${req.method} ${url.pathname}`, {
        id: requestId,
        status: res.statusCode,
        durationMs,
      });
    }
  });

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/company-profile") {
    sendJson(res, 200, {
      ok: true,
      data: {
        activeProfile: ACTIVE_PROFILE,
        companyName: COMPANY_NAME,
      },
    });
    return;
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
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");

      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        sendJson(res, 500, {
          ok: false,
          error: "Server is not configured with admin credentials.",
        });
        return;
      }

      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        sendJson(res, 200, {
          ok: true,
          user: {
            id: "ADM001",
            username: ADMIN_DISPLAY_NAME,
            name: ADMIN_DISPLAY_NAME,
            email: ADMIN_EMAIL,
            role: "Admin",
          },
        });
        return;
      }

      const users = await readUsers();
      const matchedUser = users.find((u) => normalizeEmail(u.email) === email && String(u.password || "") === password);
      if (matchedUser) {
        sendJson(res, 200, {
          ok: true,
          user: {
            id: matchedUser.id,
            username: matchedUser.username || "",
            email: matchedUser.email,
            role: normalizeLoginRole(matchedUser.role),
            branch: matchedUser.branch || null,
            country: matchedUser.country || null,
          },
        });
        return;
      }

      const studemts = await readStudemts();
      const matchedStudent = studemts.find(
        (s) => normalizeEmail(s.email) === email && String(s.password || "") === password
      );
      if (matchedStudent) {
        sendJson(res, 200, {
          ok: true,
          user: {
            id: matchedStudent.id,
            username: matchedStudent.name || "",
            email: matchedStudent.email,
            role: "Student",
            branch: matchedStudent.branch || null,
            mustChangePassword: matchedStudent.forcePasswordChange === true,
          },
        });
        return;
      }

      sendJson(res, 401, { ok: false, error: "Invalid email or password." });
    } catch (e) {
      const message = String(e?.message || "");
      if (message === "Invalid JSON") {
        sendJson(res, 400, { ok: false, error: "Invalid request body. Send JSON with email and password." });
        return;
      }
      logEvent("auth", "Login handler error", { message: message || String(e) });
      sendJson(res, 500, { ok: false, error: "Login failed due to a server error. Check backend data files." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/forgot-password/request") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      if (!email) {
        sendJson(res, 400, { ok: false, error: "Email is required." });
        return;
      }
      if (email === ADMIN_EMAIL) {
        sendJson(res, 400, {
          ok: false,
          error: "Admin password reset is not supported here because admin credentials are managed in backend .env.",
        });
        return;
      }

      const smtpError = getSmtpConfigError();
      if (smtpError) {
        sendJson(res, 500, { ok: false, error: smtpError });
        return;
      }

      const matched = await findResettableUserByEmail(email);
      if (!matched) {
        sendJson(res, 200, { ok: true, message: "If the account exists, an OTP has been sent." });
        return;
      }

      const otpCode = createOtpCode();
      forgotPasswordOtps.set(email, {
        otpCode,
        expiresAt: Date.now() + FORGOT_PASSWORD_OTP_TTL_MS,
      });
      await sendForgotPasswordOtpEmail({ email, otpCode });

      sendJson(res, 200, { ok: true, message: "OTP has been sent to your registered email." });
    } catch (error) {
      console.error("Forgot-password OTP send failed:", error);
      sendJson(res, 500, { ok: false, error: "Failed to send OTP email." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/forgot-password/verify") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const otp = String(body.otp || "").trim();
      const newPassword = String(body.newPassword || "").trim();
      if (!email || !otp || !newPassword) {
        sendJson(res, 400, { ok: false, error: "Email, OTP, and new password are required." });
        return;
      }
      if (newPassword.length < 6) {
        sendJson(res, 400, { ok: false, error: "New password must be at least 6 characters." });
        return;
      }
      if (email === ADMIN_EMAIL) {
        sendJson(res, 400, {
          ok: false,
          error: "Admin password reset is not supported here because admin credentials are managed in backend .env.",
        });
        return;
      }

      const storedOtp = forgotPasswordOtps.get(email);
      if (!storedOtp || storedOtp.expiresAt < Date.now() || storedOtp.otpCode !== otp) {
        sendJson(res, 400, { ok: false, error: "Invalid or expired OTP." });
        return;
      }

      const matched = await findResettableUserByEmail(email);
      if (!matched) {
        forgotPasswordOtps.delete(email);
        sendJson(res, 404, { ok: false, error: "Account not found." });
        return;
      }

      const updatedList = [...matched.list];
      updatedList[matched.index] = {
        ...updatedList[matched.index],
        password: newPassword,
        updatedAt: new Date().toISOString(),
        forcePasswordChange: false,
        passwordChangedAt: new Date().toISOString(),
      };
      if (matched.kind === "user") {
        await writeUsers(updatedList);
      } else {
        await writeStudemts(updatedList);
      }
      forgotPasswordOtps.delete(email);
      sendJson(res, 200, { ok: true, message: "Password reset successful." });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to reset password." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/student/change-default-password") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "").trim();
      if (!email || !currentPassword || !newPassword) {
        sendJson(res, 400, { ok: false, error: "Email, current password, and new password are required." });
        return;
      }
      if (newPassword.length < 6) {
        sendJson(res, 400, { ok: false, error: "New password must be at least 6 characters." });
        return;
      }
      if (newPassword === currentPassword) {
        sendJson(res, 400, { ok: false, error: "New password must be different from current password." });
        return;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => normalizeEmail(s.email) === email);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student account not found." });
        return;
      }
      if (String(studemts[idx].password || "") !== currentPassword) {
        sendJson(res, 401, { ok: false, error: "Current password is incorrect." });
        return;
      }
      const updated = [...studemts];
      updated[idx] = {
        ...updated[idx],
        password: newPassword,
        forcePasswordChange: false,
        passwordChangedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await writeStudemts(updated);
      sendJson(res, 200, { ok: true, message: "Password updated successfully." });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/whatsapp/status") {
    try {
      const userId = String(url.searchParams.get("userId") || "").trim();
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "userId is required." });
        return;
      }
      const counselor = await resolveCounselor(userId);
      if (!counselor) {
        sendJson(res, 404, { ok: false, error: "Counselor account not found." });
        return;
      }
      sendJson(res, 200, { ok: true, data: snapshotWhatsappState(counselor.id) });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load WhatsApp status." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/whatsapp/incoming") {
    try {
      const userId = String(url.searchParams.get("userId") || "").trim();
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "userId is required." });
        return;
      }
      const counselor = await resolveCounselor(userId);
      if (!counselor) {
        sendJson(res, 404, { ok: false, error: "Counselor account not found." });
        return;
      }
      const all = await readWhatsappIncoming();
      const data = all
        .filter((row) => String(row.counselorId || "") === counselor.id && row.isGroup !== true)
        .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
        .slice(0, 100);
      sendJson(res, 200, { ok: true, data });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load incoming WhatsApp messages." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/whatsapp/connect") {
    try {
      const body = await parseBody(req);
      const userId = String(body.userId || "").trim();
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "userId is required." });
        return;
      }
      const counselor = await resolveCounselor(userId);
      if (!counselor) {
        sendJson(res, 404, { ok: false, error: "Counselor account not found." });
        return;
      }
      const data = await startWhatsappSession(counselor.id);
      sendJson(res, 200, { ok: true, data });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to start WhatsApp connection." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/whatsapp/disconnect") {
    try {
      const body = await parseBody(req);
      const userId = String(body.userId || "").trim();
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "userId is required." });
        return;
      }
      const counselor = await resolveCounselor(userId);
      if (!counselor) {
        sendJson(res, 404, { ok: false, error: "Counselor account not found." });
        return;
      }
      const data = await stopWhatsappSession(counselor.id);
      sendJson(res, 200, { ok: true, data });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to disconnect WhatsApp." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/accounts") {
    try {
      const users = await readUsers();
      const { adminRecord, others } = splitAdminRecord(users);
      const adminAccount = {
        id: "ADM001",
        username: ADMIN_DISPLAY_NAME,
        name: ADMIN_DISPLAY_NAME,
        email: ADMIN_EMAIL || "admin@gmail.com",
        role: "Admin",
        avatar: (adminRecord && adminRecord.avatar) || DEFAULT_MALE_AVATAR_PATH,
      };
      const safeUsers = others.map(sanitizeAccount).map((u) => ({ ...u, avatar: publicAssetUrl(req, u.avatar) }));
      sendJson(res, 200, {
        ok: true,
        data: [{ ...adminAccount, avatar: publicAssetUrl(req, adminAccount.avatar) }, ...safeUsers],
      });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load accounts." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts") {
    try {
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const role = normalizeStoredRole(String(body.role || "").trim());
      const branch = String(body.branch || "").trim();
      const teamLeadId = String(body.teamLeadId || "").trim();
      const teamLeadName = String(body.teamLeadName || "").trim();
      const teamLeadEmail = normalizeEmail(body.teamLeadEmail);
      const avatarDataUrl = String(body.avatar || "");
      const country = String(body.country || "").trim();
      const phone = String(body.phone || "").trim();

      if (!username || !email || !password || !role) {
        sendJson(res, 400, { ok: false, error: "Username, email, password, and role are required." });
        return;
      }

      if (role !== "Admin" && !branch) {
        sendJson(res, 400, { ok: false, error: "Branch is required for this role." });
        return;
      }

      if (!ALLOWED_ROLES.has(role)) {
        sendJson(res, 400, { ok: false, error: "Invalid role." });
        return;
      }

      if (role === "Country Coordinator") {
        if (!country) {
          sendJson(res, 400, { ok: false, error: "Country is required for Country Coordinator accounts." });
          return;
        }
        const countriesList = await readCountries();
        const allowedCountry = countriesList.some((c) => String(c).trim().toLowerCase() === country.toLowerCase());
        if (!allowedCountry) {
          sendJson(res, 400, { ok: false, error: "Please select a country from the saved list (Settings)." });
          return;
        }
      }

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        sendJson(res, 400, { ok: false, error: "Enter a valid email." });
        return;
      }

      const users = await readUsers();
      const studemts = await readStudemts();
      if (email === ADMIN_EMAIL || users.some((u) => normalizeEmail(u.email) === email)) {
        sendJson(res, 409, { ok: false, error: "Account email already exists." });
        return;
      }
      if (studemts.some((s) => normalizeEmail(s.email) === email)) {
        sendJson(res, 409, { ok: false, error: "Email is already used by a student profile." });
        return;
      }
      let linkedTeamLead = null;
      if (isCounselorRole(role) && teamLeadId) {
        linkedTeamLead = users.find((u) => String(u.id || "") === teamLeadId && String(u.role || "") === "Team Lead");
        if (!linkedTeamLead) {
          sendJson(res, 400, { ok: false, error: "Selected Team Lead is invalid." });
          return;
        }
      }

      if (role !== "Admin") {
        const savedBranches = await readBranches();
        const branchExists = savedBranches.some(
          (b) => String(b.location || "").toLowerCase() === branch.toLowerCase()
        );
        if (!branchExists) {
          sendJson(res, 400, { ok: false, error: "Please select a valid saved branch." });
          return;
        }
      }

      let avatarPath = DEFAULT_MALE_AVATAR_PATH;
      if (avatarDataUrl) {
        const storedAvatarPath = await storeImageDataUrl(avatarDataUrl, "user-avatar");
        if (!storedAvatarPath) {
          sendJson(res, 400, { ok: false, error: "Unsupported avatar image format." });
          return;
        }
        avatarPath = storedAvatarPath;
      }

      const account = {
        id: `USR-${crypto.randomUUID().slice(0, 8)}`,
        username,
        email,
        password,
        role,
        branch: role === "Admin" ? "" : branch,
        country: role === "Country Coordinator" ? country : "",
        phone,
        teamLeadId: isCounselorRole(role) && linkedTeamLead ? teamLeadId : "",
        teamLeadName: isCounselorRole(role) && linkedTeamLead ? teamLeadName || String(linkedTeamLead?.username || "").trim() : "",
        teamLeadEmail: isCounselorRole(role) && linkedTeamLead ? teamLeadEmail || normalizeEmail(linkedTeamLead?.email) : "",
        avatar: avatarPath,
        createdAt: new Date().toISOString(),
      };

      const updated = [...users, account];
      await writeUsers(updated);

      let emailDelivery = null;
      if (isCounselorRole(role) || isStaffWelcomeEmailRole(role)) {
        emailDelivery = { attempted: false, status: "skipped", reason: "" };
        try {
          const smtpError = getSmtpConfigError();
          if (smtpError) {
            emailDelivery = { attempted: false, status: "skipped", reason: smtpError };
          } else {
            const loginUrl = buildStudentPortalLoginUrl(req, body.portalOrigin);
            const emailCopy = isStaffWelcomeEmailRole(role) ? staffWelcomeEmailCopy(role) : null;
            await sendCounselorWelcomeEmail({
              to: email,
              counselorName: username,
              username,
              loginUrl,
              emailAddress: email,
              password,
              branch: account.branch,
              emailCopy,
            });
            emailDelivery = { attempted: true, status: "sent", reason: "" };
          }
        } catch (error) {
          console.error("Portal welcome email failed:", error);
          emailDelivery = {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send email."),
          };
        }
      }

      sendJson(res, 201, {
        ok: true,
        data: { ...sanitizeAccount(account), avatar: publicAssetUrl(req, account.avatar) },
        ...(emailDelivery ? { emailDelivery } : {}),
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/accounts/") && url.pathname.endsWith("/team-lead")) {
    try {
      const accountId = decodeURIComponent(url.pathname.replace("/api/accounts/", "").replace("/team-lead", "").trim()).replace(/\/+$/, "");
      if (!accountId) {
        sendJson(res, 400, { ok: false, error: "Account ID is required." });
        return;
      }
      const body = await parseBody(req);
      const teamLeadId = String(body.teamLeadId || "").trim();
      if (!teamLeadId) {
        sendJson(res, 400, { ok: false, error: "Team Lead is required." });
        return;
      }

      const users = await readUsers();
      const counselorIndex = users.findIndex((u) => String(u.id || "") === accountId);
      if (counselorIndex === -1) {
        sendJson(res, 404, { ok: false, error: "Counselor account not found." });
        return;
      }
      const counselor = users[counselorIndex];
      if (!isCounselorRole(counselor.role)) {
        sendJson(res, 400, { ok: false, error: "Team Lead can only be assigned to counselor accounts." });
        return;
      }

      const teamLead = users.find((u) => String(u.id || "") === teamLeadId && String(u.role || "") === "Team Lead");
      if (!teamLead) {
        sendJson(res, 400, { ok: false, error: "Selected Team Lead is invalid." });
        return;
      }

      const updatedCounselor = {
        ...counselor,
        teamLeadId: teamLead.id,
        teamLeadName: String(teamLead.username || "").trim(),
        teamLeadEmail: normalizeEmail(teamLead.email),
        updatedAt: new Date().toISOString(),
      };
      const updatedUsers = [...users];
      updatedUsers[counselorIndex] = updatedCounselor;
      await writeUsers(updatedUsers);
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(updatedCounselor), avatar: publicAssetUrl(req, updatedCounselor.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/accounts/") && url.pathname.endsWith("/reset-password")) {
    try {
      const accountId = decodeURIComponent(
        url.pathname.replace("/api/accounts/", "").replace("/reset-password", "").trim()
      ).replace(/\/+$/, "");
      if (!accountId) {
        sendJson(res, 400, { ok: false, error: "Account ID is required." });
        return;
      }
      if (accountId === "ADM001") {
        sendJson(res, 400, {
          ok: false,
          error: "The primary admin password is managed in backend .env and cannot be reset here.",
        });
        return;
      }
      const body = await parseBody(req);
      const newPassword = String(body.newPassword || "").trim();
      if (newPassword.length < 6) {
        sendJson(res, 400, { ok: false, error: "New password must be at least 6 characters." });
        return;
      }
      const users = await readUsers();
      const targetIndex = users.findIndex((u) => String(u.id || "") === accountId);
      if (targetIndex === -1) {
        sendJson(res, 404, { ok: false, error: "Account not found." });
        return;
      }
      const target = users[targetIndex];
      if (String(target.role || "") === "Admin" || normalizeEmail(target.email) === ADMIN_EMAIL) {
        sendJson(res, 400, {
          ok: false,
          error: "Admin accounts cannot have their password reset from this screen.",
        });
        return;
      }
      const updatedAccount = {
        ...target,
        password: newPassword,
        forcePasswordChange: true,
        passwordChangedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updatedUsers = [...users];
      updatedUsers[targetIndex] = updatedAccount;
      await writeUsers(updatedUsers);
      logEvent("auth", "admin reset account password", {
        accountId: updatedAccount.id,
        email: updatedAccount.email,
        role: updatedAccount.role,
      });
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(updatedAccount), avatar: publicAssetUrl(req, updatedAccount.avatar) },
      });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to reset password." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts/admin/avatar") {
    try {
      const body = await parseBody(req);
      const avatar = String(body.avatar || "");
      if (!avatar.startsWith("data:image/")) {
        sendJson(res, 400, { ok: false, error: "Invalid image payload." });
        return;
      }
      if (avatar.length > 4_000_000) {
        sendJson(res, 400, { ok: false, error: "Image is too large." });
        return;
      }

      const users = await readUsers();
      const storedAvatarPath = await storeImageDataUrl(avatar, "admin-avatar");
      if (!storedAvatarPath) {
        sendJson(res, 400, { ok: false, error: "Unsupported image format." });
        return;
      }
      const { adminRecord, others } = splitAdminRecord(users);
      const adminAccount = {
        id: "ADM001",
        username: "admin",
        email: ADMIN_EMAIL || "admin@gmail.com",
        role: "Admin",
        avatar: storedAvatarPath,
        updatedAt: new Date().toISOString(),
      };
      const nextUsers = [...others, { ...(adminRecord || {}), ...adminAccount }];
      await writeUsers(nextUsers);
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(adminAccount), avatar: publicAssetUrl(req, adminAccount.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts/avatar") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const avatar = String(body.avatar || "");
      if (!email) {
        sendJson(res, 400, { ok: false, error: "Email is required." });
        return;
      }
      if (!avatar.startsWith("data:image/")) {
        sendJson(res, 400, { ok: false, error: "Invalid image payload." });
        return;
      }
      if (avatar.length > 4_000_000) {
        sendJson(res, 400, { ok: false, error: "Image is too large." });
        return;
      }
      const storedAvatarPath = await storeImageDataUrl(avatar, "user-avatar");
      if (!storedAvatarPath) {
        sendJson(res, 400, { ok: false, error: "Unsupported image format." });
        return;
      }
      const users = await readUsers();
      const isAdminEmail = email === ADMIN_EMAIL;
      if (isAdminEmail) {
        const { adminRecord, others } = splitAdminRecord(users);
        const adminAccount = {
          id: "ADM001",
          username: "admin",
          email: ADMIN_EMAIL || "admin@gmail.com",
          role: "Admin",
          avatar: storedAvatarPath,
          updatedAt: new Date().toISOString(),
        };
        const nextUsers = [...others, { ...(adminRecord || {}), ...adminAccount }];
        await writeUsers(nextUsers);
        sendJson(res, 200, {
          ok: true,
          data: { ...sanitizeAccount(adminAccount), avatar: publicAssetUrl(req, adminAccount.avatar) },
        });
        return;
      }
      const accountIndex = users.findIndex((u) => normalizeEmail(u.email) === email);
      if (accountIndex === -1) {
        sendJson(res, 404, { ok: false, error: "Account not found." });
        return;
      }
      const updatedAccount = {
        ...users[accountIndex],
        avatar: storedAvatarPath,
        updatedAt: new Date().toISOString(),
      };
      const updatedUsers = [...users];
      updatedUsers[accountIndex] = updatedAccount;
      await writeUsers(updatedUsers);
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(updatedAccount), avatar: publicAssetUrl(req, updatedAccount.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts/profile-contact") {
    try {
      const body = await parseBody(req);
      const currentEmail = normalizeEmail(body.currentEmail);
      const nextEmail = normalizeEmail(body.email);
      const nextPhone = String(body.phone || "").trim();
      if (!currentEmail) {
        sendJson(res, 400, { ok: false, error: "Current email is required." });
        return;
      }
      if (!nextEmail) {
        sendJson(res, 400, { ok: false, error: "Email is required." });
        return;
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(nextEmail)) {
        sendJson(res, 400, { ok: false, error: "Enter a valid email." });
        return;
      }
      const users = await readUsers();
      const accountIndex = users.findIndex((u) => normalizeEmail(u.email) === currentEmail);
      if (accountIndex === -1) {
        sendJson(res, 404, { ok: false, error: "Account not found." });
        return;
      }
      const duplicate = users.find(
        (u, idx) => idx !== accountIndex && normalizeEmail(u.email) === nextEmail
      );
      if (duplicate) {
        sendJson(res, 409, { ok: false, error: "Account email already exists." });
        return;
      }
      const merged = {
        ...users[accountIndex],
        email: nextEmail,
        phone: nextPhone,
        updatedAt: new Date().toISOString(),
      };
      const updatedUsers = [...users];
      updatedUsers[accountIndex] = merged;
      await writeUsers(updatedUsers);
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(merged), avatar: publicAssetUrl(req, merged.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/branches") {
    try {
      const branches = await readBranches();
      sendJson(res, 200, { ok: true, data: branches });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load branches." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/countries") {
    try {
      const countries = await readCountries();
      sendJson(res, 200, { ok: true, data: countries });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load countries." });
    }
    return;
  }

  if (
    req.method === "POST" &&
    (url.pathname === "/api/student-registration" || url.pathname === "/api/student-reg-form")
  ) {
    try {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const phone = String(body.phone || body.contactNumber || "").trim();
      const countryToVisitRaw = String(body.countryToVisit || "").trim();
      const city = String(body.city || "").trim();
      const nearestOfficeRaw = String(body.nearestOffice || "").trim();
      const currentEducationLevel = String(body.currentEducationLevel || "").trim();
      const intendedProgram = String(body.intendedProgram || "").trim();
      const message = String(body.message || "").trim();
      const livingStatus = String(body.livingStatus || "").trim();
      const visaRejectionAnyCountry = String(body.visaRejectionAnyCountry || "").trim();

      if (!name || !email || !phone || !countryToVisitRaw) {
        sendJson(res, 400, {
          ok: false,
          error: "Name, email, contact number, and country to visit are required.",
        });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(res, 400, { ok: false, error: "Please enter a valid email address." });
        return;
      }
      const countriesList = await readCountries();
      const matchedCountry = countriesList.find(
        (c) => String(c).trim().toLowerCase() === countryToVisitRaw.toLowerCase()
      );
      if (!matchedCountry) {
        sendJson(res, 400, {
          ok: false,
          error: "Please choose a valid country to visit from the list.",
        });
        return;
      }

      const branchesList = await readBranches();
      const branchLocations = branchesList
        .map((b) => String(b?.location || "").trim())
        .filter(Boolean);
      let nearestOffice = null;
      if (branchLocations.length > 0) {
        if (!nearestOfficeRaw) {
          sendJson(res, 400, {
            ok: false,
            error: "Please choose your nearest office from the list.",
          });
          return;
        }
        const matchedOffice = branchLocations.find(
          (loc) => loc.toLowerCase() === nearestOfficeRaw.toLowerCase()
        );
        if (!matchedOffice) {
          sendJson(res, 400, {
            ok: false,
            error: "Please choose a valid nearest office from the list.",
          });
          return;
        }
        nearestOffice = matchedOffice;
      }

      const allowedLivingStatuses = new Set(["Married", "Single"]);
      if (!livingStatus || !allowedLivingStatuses.has(livingStatus)) {
        sendJson(res, 400, {
          ok: false,
          error: "Please choose a valid living status (Married or Single).",
        });
        return;
      }
      const allowedYesNo = new Set(["Yes", "No"]);
      const visaRejection = visaRejectionAnyCountry || "No";
      if (!allowedYesNo.has(visaRejection)) {
        sendJson(res, 400, {
          ok: false,
          error: "Please choose Yes or No for visa rejection history.",
        });
        return;
      }

      const entry = {
        id: `REQ-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        submittedAt: new Date().toISOString(),
        name,
        email,
        phone,
        countryToVisit: String(matchedCountry).trim(),
        city: city || null,
        nearestOffice,
        livingStatus,
        visaRejectionAnyCountry: visaRejection,
        currentEducationLevel: currentEducationLevel || null,
        intendedProgram: intendedProgram || null,
        message: message || null,
        source: "student-reg-form",
      };

      await appendReqStudent(entry);
      sendJson(res, 201, {
        ok: true,
        data: { id: entry.id, submittedAt: entry.submittedAt },
      });
    } catch (e) {
      if (e && e.message === "Invalid JSON") {
        sendJson(res, 400, { ok: false, error: "Invalid request body." });
        return;
      }
      sendJson(res, 500, { ok: false, error: "Could not save your registration. Please try again later." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/req-students") {
    try {
      const branchParam = String(url.searchParams.get("branch") || "").trim();
      const all = await readReqStudents();
      if (!branchParam) {
        sendJson(res, 200, { ok: true, data: all });
        return;
      }
      const key = branchParam.toLowerCase();
      const filtered = all.filter((entry) => {
        const office = String(entry.nearestOffice || "").trim().toLowerCase();
        // Older submissions have no nearest office — still surface them so managers can add to pipeline.
        if (!office) return true;
        if (office === key) return true;
        if (key.includes(office) || office.includes(key)) return true;
        return false;
      });
      sendJson(res, 200, { ok: true, data: filtered });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load requested students." });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/req-students/")) {
    try {
      const requestId = decodeURIComponent(url.pathname.replace("/api/req-students/", "").trim()).replace(/\/+$/, "");
      if (!requestId) {
        sendJson(res, 400, { ok: false, error: "Request id is required." });
        return;
      }
      const removed = await removeReqStudentById(requestId);
      if (!removed.ok) {
        sendJson(res, 404, { ok: false, error: removed.error || "Request not found." });
        return;
      }
      sendJson(res, 200, { ok: true, data: { id: requestId } });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to remove request." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/countries") {
    try {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      if (!name) {
        sendJson(res, 400, { ok: false, error: "Country name is required." });
        return;
      }
      const existing = await readCountries();
      if (existing.some((c) => String(c).toLowerCase() === name.toLowerCase())) {
        sendJson(res, 409, { ok: false, error: "This country is already in the list." });
        return;
      }
      const next = [...existing, name].sort((a, b) => a.localeCompare(b));
      await writeCountries(next);
      sendJson(res, 201, { ok: true, data: next });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/payment-accounts") {
    try {
      const accounts = await readPaymentAccounts();
      sendJson(res, 200, { ok: true, data: accounts });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load payment accounts." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/payment-accounts") {
    try {
      const body = await parseBody(req);
      const normalized = normalizePaymentAccount({
        id: `PAY-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        label: body.label,
        bankName: body.bankName,
        accountName: body.accountName,
        accountNumber: body.accountNumber,
        branch: body.branch,
        currency: body.currency,
        notes: body.notes,
      });
      if (!normalized) {
        sendJson(res, 400, {
          ok: false,
          error: "Label, bank name, account name, and account number are required.",
        });
        return;
      }
      const existing = await readPaymentAccounts();
      if (existing.some((a) => a.label.toLowerCase() === normalized.label.toLowerCase())) {
        sendJson(res, 409, { ok: false, error: "An account with this label already exists." });
        return;
      }
      const next = [...existing, normalized];
      await writePaymentAccounts(next);
      sendJson(res, 201, { ok: true, data: next });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/payment-accounts/")) {
    try {
      const accountId = decodeURIComponent(url.pathname.replace("/api/payment-accounts/", "").trim()).replace(/\/+$/, "");
      if (!accountId) {
        sendJson(res, 400, { ok: false, error: "Account ID is required." });
        return;
      }
      const existing = await readPaymentAccounts();
      const next = existing.filter((a) => String(a.id || "") !== accountId);
      if (next.length === existing.length) {
        sendJson(res, 404, { ok: false, error: "Payment account not found." });
        return;
      }
      await writePaymentAccounts(next);
      sendJson(res, 200, { ok: true, data: next });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to remove payment account." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/meeting-settings") {
    try {
      const settings = await readMeetingSettings();
      sendJson(res, 200, { ok: true, data: settings });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load meeting settings." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/meeting-settings") {
    try {
      const body = await parseBody(req);
      const normalized = normalizeMeetingSettings(body);
      if (normalized.meetingDurationMinutes !== 30) {
        sendJson(res, 400, { ok: false, error: "Meeting duration must be 30 minutes." });
        return;
      }
      for (let day = 0; day <= 6; day++) {
        const schedule = normalized.daySchedules[day];
        if (!schedule) {
          sendJson(res, 400, { ok: false, error: "All 7 days must have a schedule." });
          return;
        }
        if (schedule.endHour <= schedule.startHour) {
          sendJson(res, 400, { ok: false, error: `End time must be after start time for day ${day}.` });
          return;
        }
      }
      await writeMeetingSettings(normalized);
      sendJson(res, 200, { ok: true, data: normalized });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/bookings") {
    try {
      const counselorId = String(url.searchParams.get("counselorId") || "").trim();
      const date = String(url.searchParams.get("date") || "").trim();
      const bookings = await readBookings();
      const filtered = bookings.filter((booking) => {
        if (counselorId && String(booking.counselorId || "") !== counselorId) return false;
        if (date && String(booking.date || "") !== date) return false;
        return true;
      });
      sendJson(res, 200, { ok: true, data: filtered });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load bookings." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    try {
      const body = await parseBody(req);
      const counselorId = String(body.counselorId || "").trim();
      const date = String(body.date || "").trim();
      const startTime = String(body.startTime || "").trim();
      const endTime = String(body.endTime || "").trim();
      const reason = String(body.reason || "").trim() || "Busy";
      if (!counselorId || !date || !startTime || !endTime) {
        sendJson(res, 400, { ok: false, error: "counselorId, date, startTime, and endTime are required." });
        return;
      }
      const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
        sendJson(res, 400, { ok: false, error: "Time format must be HH:MM." });
        return;
      }
      if (endTime <= startTime) {
        sendJson(res, 400, { ok: false, error: "End time must be after start time." });
        return;
      }
      const bookings = await readBookings();
      const booking = {
        id: `BLK-${crypto.randomUUID().slice(0, 8)}`,
        type: "busy",
        counselorId,
        date,
        startTime,
        endTime,
        reason,
        createdAt: new Date().toISOString(),
      };
      await writeBookings([...bookings, booking]);
      sendJson(res, 201, { ok: true, data: booking });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/bookings/")) {
    try {
      const bookingId = decodeURIComponent(url.pathname.replace("/api/bookings/", "").trim()).replace(/\/+$/, "");
      if (!bookingId) {
        sendJson(res, 400, { ok: false, error: "Booking ID is required." });
        return;
      }
      const bookings = await readBookings();
      const existing = bookings.find((item) => String(item.id || "") === bookingId);
      if (!existing) {
        sendJson(res, 404, { ok: false, error: "Booking not found." });
        return;
      }
      const updatedBookings = bookings.filter((item) => String(item.id || "") !== bookingId);
      await writeBookings(updatedBookings);
      sendJson(res, 200, { ok: true, data: existing });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/appointments") {
    try {
      const appointments = await readAppointments();
      sendJson(res, 200, { ok: true, data: appointments });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load appointments." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/invoices") {
    try {
      const invoices = await readInvoices();
      const payload = { ok: true, data: invoices.map((inv) => publicInvoiceRecord(req, inv)) };
      sendJson(res, 200, payload);
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load invoices." });
    }
    return;
  }

  if (
    req.method === "GET" &&
    (url.pathname === "/api/st-invoices" || url.pathname === "/api/st-invoices/")
  ) {
    try {
      const invoices = await readInvoices();
      const payload = { ok: true, data: invoices.map((inv) => publicInvoiceRecord(req, inv)) };
      sendJson(res, 200, payload);
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load invoices." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tasks") {
    try {
      const tasks = await readTasks();
      sendJson(res, 200, { ok: true, data: tasks });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load tasks." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    try {
      const body = await parseBody(req);
      const taskName = String(body.task || "").trim();
      const studentId = String(body.student_id || "").trim();
      const assignedTo = Array.isArray(body.assigned_to) ? body.assigned_to.map((id) => String(id || "").trim()).filter(Boolean) : [];
      const counselorIds = Array.isArray(body.counselor_ids)
        ? body.counselor_ids.map((id) => String(id || "").trim()).filter(Boolean)
        : [];
      const priority = String(body.priority || "Medium").trim() || "Medium";
      const status = String(body.status || "Pending").trim() || "Pending";
      const dueDate = String(body.dueDate || "").trim();
      let isPrivate = body.isPrivate === true;
      const requiresStudentDocuments = body.requiresStudentDocuments === true;
      const rawDocRequests = Array.isArray(body.taskDocumentRequests) ? body.taskDocumentRequests : [];
      const taskDocumentRequests = [];
      const seenSlotIds = new Set();
      for (const item of rawDocRequests) {
        if (!item || typeof item !== "object") continue;
        const label = String(item.label || "")
          .trim()
          .replace(/\s+/g, " ");
        if (!label) continue;
        let sid = String(item.id || "").trim();
        if (!sid || seenSlotIds.has(sid)) {
          sid = `slot-${crypto.randomUUID().slice(0, 10)}`;
        }
        seenSlotIds.add(sid);
        taskDocumentRequests.push({
          id: sid.slice(0, 80),
          label: label.slice(0, 220),
        });
        if (taskDocumentRequests.length >= 30) break;
      }
      if (requiresStudentDocuments) {
        if (taskDocumentRequests.length === 0) {
          sendJson(res, 400, { ok: false, error: "Add at least one required document when student uploads are enabled." });
          return;
        }
        isPrivate = false;
      }
      if (!taskName || !studentId || !dueDate) {
        sendJson(res, 400, { ok: false, error: "task, student_id and dueDate are required." });
        return;
      }
      if (!isPrivate && assignedTo.length === 0) {
        sendJson(res, 400, { ok: false, error: "assigned_to is required for non-private tasks." });
        return;
      }
      const nowIso = new Date().toISOString();
      const task = {
        id: String(body.id || `T-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`),
        task: taskName,
        student_id: studentId,
        assigned_to: assignedTo,
        counselor_ids: Array.from(new Set(counselorIds)),
        priority,
        status,
        dueDate,
        isPrivate,
        tier: String(body.tier || "Global"),
        phase: Number.isFinite(Number(body.phase)) ? Number(body.phase) : 1,
        isBlocking: body.isBlocking === true,
        documentType: body.documentType ? String(body.documentType) : undefined,
        requiresStudentDocuments,
        taskDocumentRequests: requiresStudentDocuments ? taskDocumentRequests : [],
        createdBy: body.createdBy ? String(body.createdBy) : "",
        createdAt: String(body.createdAt || nowIso),
        updatedAt: nowIso
      };
      await withTasksMutationLock(async () => {
        const tasks = await readTasks();
        await writeTasks([task, ...tasks]);
      });
      logEvent("task", "created", { taskId: task.id, studentId: task.student_id, assignedToCount: task.assigned_to.length });
      let taskAssignmentWhatsapp = { attempted: false, status: "skipped", reason: "Not attempted." };
      const sidLower = studentId.toLowerCase();
      const studentIsAssignee = assignedTo.some((a) => String(a || "").trim().toLowerCase() === sidLower);
      if (studentIsAssignee && !isPrivate) {
        const studemts = await readStudemts();
        const stu = studemts.find((s) => String(s.id || "") === studentId);
        const studentName = String(stu?.name || "there").trim() || "there";
        const createdById = String(body.createdBy || "").trim();
        let senderId = "";
        const creatorCounselor = await resolveCounselor(createdById);
        if (creatorCounselor) {
          senderId = String(creatorCounselor.id || "").trim();
        }
        if (!senderId && stu) {
          senderId = String(stu.counselor || "").trim();
        }
        const docLines =
          requiresStudentDocuments && taskDocumentRequests.length > 0
            ? [
                "",
                "Please upload these items in your portal (Pipeline or My Action Plan):",
                ...taskDocumentRequests.map((r, i) => `${i + 1}. ${r.label}`),
              ]
            : [];
        const message = [
          `Hi ${studentName},`,
          "",
          `You have a new task on your student portal: "${taskName}".`,
          dueDate ? `Due: ${dueDate}.` : null,
          ...docLines,
          "",
          "Sign in to the portal to view details and upload any requested files.",
        ]
          .filter((line) => line != null)
          .join("\n");
        if (senderId) {
          try {
            const result = await deliverCounselorMessageToStudentWhatsapp({
              senderId,
              receiverId: studentId,
              content: message,
            });
            taskAssignmentWhatsapp = {
              attempted: Boolean(result?.attempted),
              status: String(result?.status || "skipped"),
              reason: String(result?.reason || ""),
            };
          } catch (error) {
            taskAssignmentWhatsapp = {
              attempted: true,
              status: "failed",
              reason: String(error?.message || "WhatsApp send failed."),
            };
          }
        } else {
          taskAssignmentWhatsapp = {
            attempted: false,
            status: "skipped",
            reason: "No counselor sender available for WhatsApp.",
          };
        }
      }
      sendJson(res, 201, { ok: true, data: task, taskAssignmentWhatsapp });
    } catch (error) {
      console.error("Task create failed:", error);
      sendJson(res, 400, { ok: false, error: String(error?.message || "Failed to create task.") });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/tasks/")) {
    try {
      const taskId = decodeURIComponent(url.pathname.replace("/api/tasks/", "").trim()).replace(/\/+$/, "");
      if (!taskId) {
        sendJson(res, 400, { ok: false, error: "Task ID is required." });
        return;
      }
      const body = await parseBody(req);
      const merged = await withTasksMutationLock(async () => {
        const tasks = await readTasks();
        const idx = tasks.findIndex((item) => String(item.id || "") === taskId);
        if (idx === -1) {
          return null;
        }
        const next = {
          ...tasks[idx],
          ...body,
          id: tasks[idx].id,
          updatedAt: new Date().toISOString()
        };
        const updatedTasks = [...tasks];
        updatedTasks[idx] = next;
        await writeTasks(updatedTasks);
        return next;
      });
      if (!merged) {
        sendJson(res, 404, { ok: false, error: "Task not found." });
        return;
      }
      logEvent("task", "updated", { taskId: merged.id, studentId: merged.student_id, status: merged.status });
      sendJson(res, 200, { ok: true, data: merged });
    } catch (error) {
      console.error("Task update failed:", error);
      sendJson(res, 400, { ok: false, error: String(error?.message || "Failed to update task.") });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/invoices") {
    try {
      const body = await parseBody(req);
      const studentId = String(body.studentId || "").trim();
      const description = String(body.description || "").trim();
      const currency = String(body.currency || "LKR").trim().toUpperCase();
      const amountNum = Number(body.amount);
      const dueDate = String(body.dueDate || "").trim();
      if (!studentId || !description || !dueDate || !Number.isFinite(amountNum) || amountNum <= 0) {
        sendJson(res, 400, { ok: false, error: "Invalid invoice payload." });
        return;
      }
      const attachmentLinkRaw = String(body.attachmentLink || "").trim();
      const attachmentLink =
        attachmentLinkRaw && /^https?:\/\//i.test(attachmentLinkRaw) ? attachmentLinkRaw : "";

      let paymentAccount = null;
      const paymentAccountId = String(body.paymentAccountId || "").trim();
      if (paymentAccountId) {
        const accounts = await readPaymentAccounts();
        const matched = accounts.find((a) => String(a.id || "") === paymentAccountId);
        if (matched) paymentAccount = { ...matched };
      }

      const invoice = {
        id: String(body.id || `INV-${Date.now()}`),
        studentId,
        amount: Number(amountNum),
        currency,
        description,
        createdByName: String(body.createdByName || "").trim(),
        createdById: String(body.createdById || "").trim(),
        issueDate: String(body.issueDate || new Date().toISOString().split("T")[0]),
        dueDate,
        status: String(body.status || "Pending"),
        paymentMethod: body.paymentMethod ? String(body.paymentMethod) : undefined,
        generatedReceiptUrl: body.generatedReceiptUrl ? String(body.generatedReceiptUrl) : undefined,
        paymentProofUrl: body.paymentProofUrl ? String(body.paymentProofUrl) : undefined,
        paymentProofName: body.paymentProofName ? String(body.paymentProofName) : undefined,
        attachmentLink: attachmentLink || undefined,
        paymentAccountId: paymentAccount?.id,
        paymentAccount: paymentAccount || undefined,
        updatedAt: new Date().toISOString(),
      };

      let invoiceFileAttachment = null;
      if (body.invoiceAttachmentDataUrl) {
        const storedInvoiceFile = await storeChatAttachmentDataUrl(
          String(body.invoiceAttachmentDataUrl || ""),
          String(body.invoiceAttachmentName || `${invoice.id}-attachment`)
        );
        if (storedInvoiceFile && !storedInvoiceFile.error) {
          invoiceFileAttachment = {
            name: storedInvoiceFile.name,
            mime: storedInvoiceFile.mime,
            size: storedInvoiceFile.size,
            url: storedInvoiceFile.url,
          };
          invoice.attachmentFileUrl = publicChatFileUrl(req, storedInvoiceFile.url);
          invoice.attachmentFileName = storedInvoiceFile.name;
          invoice.attachmentFileMime = storedInvoiceFile.mime;
        }
      }

      let receiptAttachment = null;
      if (body.receiptImageDataUrl) {
        const storedReceipt = await storeChatAttachmentDataUrl(
          String(body.receiptImageDataUrl || ""),
          String(body.receiptImageName || `${invoice.id}-invoice.png`)
        );
        if (storedReceipt && !storedReceipt.error) {
          receiptAttachment = {
            name: storedReceipt.name,
            mime: storedReceipt.mime,
            size: storedReceipt.size,
            url: storedReceipt.url,
          };
          invoice.generatedReceiptUrl = publicChatFileUrl(req, storedReceipt.url);
        }
      }

      let whatsappDelivery = { attempted: false, status: "skipped", reason: "Not attempted." };
      try {
        const students = await readStudemts();
        const student = students.find((item) => String(item.id || "") === studentId);
        const counselorId = String(student?.inquiryCounselorId || student?.counselor || "").trim();
        if (!student) {
          whatsappDelivery = { attempted: false, status: "skipped", reason: "Student record not found." };
        } else if (!counselorId || counselorId === "Unassigned") {
          whatsappDelivery = { attempted: false, status: "skipped", reason: "Student has no assigned counselor." };
        } else {
          const messageText = buildInvoiceWhatsappMessage({
            studentName: String(student.name || "").trim(),
            invoiceId: invoice.id,
            currency: invoice.currency,
            amount: invoice.amount,
            description: invoice.description,
            issueDate: invoice.issueDate,
            dueDate: invoice.dueDate,
            paymentAccount,
            attachmentLink: invoice.attachmentLink,
            attachmentFileUrl: invoice.attachmentFileUrl,
            attachmentFileName: invoice.attachmentFileName,
            generatedReceiptUrl: invoice.generatedReceiptUrl,
          });
          whatsappDelivery = await deliverInvoicePackageToStudentWhatsapp({
            senderId: counselorId,
            receiverId: studentId,
            messageText,
            receiptAttachment,
            invoiceFileAttachment,
          });
        }
      } catch (error) {
        whatsappDelivery = {
          attempted: true,
          status: "failed",
          reason: String(error?.message || "Failed to send invoice via WhatsApp."),
          sentAt: new Date().toISOString(),
        };
        console.error("Invoice WhatsApp send failed:", error);
      }
      invoice.whatsappDelivery = whatsappDelivery;
      const invoices = await readInvoices();
      const nextInvoices = [invoice, ...invoices];
      await writeInvoices(nextInvoices);
      sendJson(res, 201, { ok: true, data: publicInvoiceRecord(req, invoice) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/invoices/") && !url.pathname.endsWith("/payment-proof")) {
    try {
      const invoiceId = decodeURIComponent(url.pathname.replace("/api/invoices/", "").trim()).replace(/\/+$/, "");
      if (!invoiceId) {
        sendJson(res, 400, { ok: false, error: "Invoice ID is required." });
        return;
      }
      const body = await parseBody(req);
      const invoices = await readInvoices();
      const idx = invoices.findIndex((inv) => String(inv.id || "") === invoiceId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Invoice not found." });
        return;
      }
      const currentInvoice = invoices[idx];
      const actorRole = String(body.actorRole || "").trim();
      const prevStatus = String(currentInvoice.status || "");
      const nextStatus = String(body.status || currentInvoice.status || "");
      const isAcceptingPayment = nextStatus === "Paid" && prevStatus === "Verifying";
      const isRejectingPayment = nextStatus === "Pending" && prevStatus === "Verifying";
      const canReviewInvoicePayment =
        actorRole === "Admin" || actorRole === "Manager" || actorRole === "Accountant";
      if (isAcceptingPayment && !canReviewInvoicePayment) {
        sendJson(res, 403, {
          ok: false,
          error: "Only Admin, Manager, or Accountant can accept invoice payments.",
        });
        return;
      }
      if (isRejectingPayment && !canReviewInvoicePayment) {
        sendJson(res, 403, {
          ok: false,
          error: "Only Admin, Manager, or Accountant can reject invoice payment evidence.",
        });
        return;
      }
      const { actorRole: _actorRole, actorId: _actorId, ...safeBody } = body;
      const merged = {
        ...currentInvoice,
        ...safeBody,
        id: currentInvoice.id,
        updatedAt: new Date().toISOString(),
      };
      if (isRejectingPayment) {
        merged.paymentRejectionReason = String(body.paymentRejectionReason || merged.paymentRejectionReason || "").trim();
        merged.paymentRejectedAt = new Date().toISOString();
      }
      if (isAcceptingPayment) {
        merged.paymentRejectionReason = "";
        merged.paymentRejectedAt = "";
      }
      const updated = [...invoices];
      updated[idx] = merged;
      await writeInvoices(updated);

      let invoicePaymentNotifications = null;
      if (isAcceptingPayment || isRejectingPayment) {
        const students = await readStudemts();
        const student = students.find((item) => String(item.id || "") === String(merged.studentId || ""));
        const decision = isAcceptingPayment ? "approved" : "rejected";
        invoicePaymentNotifications = await notifyInvoicePaymentDecision({
          req,
          invoice: merged,
          student: student || null,
          decision,
          actorRole,
          actorId: String(body.actorId || "").trim(),
        });
      }

      sendJson(res, 200, {
        ok: true,
        data: publicInvoiceRecord(req, merged),
        invoiceWhatsappNotification: invoicePaymentNotifications?.invoiceWhatsappNotification || null,
        invoicePaymentNotifications,
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/invoices/") && url.pathname.endsWith("/payment-proof")) {
    try {
      const invoiceId = decodeURIComponent(url.pathname.replace("/api/invoices/", "").replace("/payment-proof", "").trim()).replace(/\/+$/, "");
      if (!invoiceId) {
        sendJson(res, 400, { ok: false, error: "Invoice ID is required." });
        return;
      }
      const body = await parseBody(req);
      const dataUrl = String(body.dataUrl || "");
      const fileName = String(body.fileName || "payment-proof");
      if (!dataUrl.startsWith("data:")) {
        sendJson(res, 400, { ok: false, error: "Invalid payment proof payload." });
        return;
      }
      const stored = await storePaymentProofDataUrl(dataUrl, fileName);
      if (!stored) {
        sendJson(res, 400, { ok: false, error: "Unsupported payment proof format. Use PDF, JPG, PNG, DOC, or DOCX." });
        return;
      }
      if (stored.error) {
        sendJson(res, 400, { ok: false, error: stored.error });
        return;
      }
      const invoices = await readInvoices();
      const idx = invoices.findIndex((inv) => String(inv.id || "") === invoiceId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Invoice not found." });
        return;
      }
      const merged = {
        ...invoices[idx],
        status: "Verifying",
        paymentMethod: "Bank Transfer",
        paymentProofUrl: `http://${req.headers.host}${stored.url}`,
        paymentProofName: stored.name,
        updatedAt: new Date().toISOString(),
      };
      const updated = [...invoices];
      updated[idx] = merged;
      await writeInvoices(updated);
      sendJson(res, 200, { ok: true, data: publicInvoiceRecord(req, merged) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/appointments") {
    try {
      const body = await parseBody(req);
      const counselorId = String(body.counselorId || "").trim();
      const studentId = String(body.studentId || "").trim();
      const title = String(body.title || "").trim();
      const date = String(body.date || "").trim();
      const time = String(body.time || "").trim();
      const type = String(body.type || "").trim() || "Counseling";
      const status = String(body.status || "").trim() || "Scheduled";
      const duration = Number(body.duration) || 30;
      if (!counselorId || !studentId || !title || !date || !time) {
        sendJson(res, 400, { ok: false, error: "counselorId, studentId, title, date, and time are required." });
        return;
      }
      const appointment = {
        id: `APT-${crypto.randomUUID().slice(0, 8)}`,
        counselorId,
        studentId,
        title,
        date,
        time,
        duration,
        type,
        status,
        meetingPlatform: String(body.meetingPlatform || "").trim(),
        meetingLink: String(body.meetingLink || ""),
        createdAt: new Date().toISOString(),
      };
      const appointments = await readAppointments();
      const upcomingScheduledForStudent = appointments.filter((item) => {
        if (String(item.studentId || "") !== studentId) return false;
        if (String(item.status || "") !== "Scheduled") return false;
        const itemDateTime = new Date(`${item.date}T${item.time}`).getTime();
        return Number.isFinite(itemDateTime) && itemDateTime > Date.now();
      }).length;
      if (upcomingScheduledForStudent >= 3) {
        sendJson(res, 400, { ok: false, error: "Students can only have up to 3 upcoming meetings." });
        return;
      }
      const meetingLinkOnCreate = String(appointment.meetingLink || "").trim();
      const meetingPlatformOnCreate = String(appointment.meetingPlatform || "").trim();
      if (meetingLinkOnCreate || meetingPlatformOnCreate) {
        try {
          const students = await readStudemts();
          const student = students.find((item) => String(item.id || "") === String(appointment.studentId || ""));
          const result = await deliverCounselorMessageToStudentWhatsapp({
            senderId: String(appointment.counselorId || "").trim(),
            receiverId: String(appointment.studentId || "").trim(),
            content: buildAppointmentLinkWhatsappMessage({
              studentName: student?.name || "",
              title: appointment.title || "Session",
              date: appointment.date || "",
              time: appointment.time || "",
              meetingPlatform: meetingPlatformOnCreate,
              meetingLink: meetingLinkOnCreate,
            }),
          });
          appointment.meetingLinkWhatsappDelivery = {
            attempted: Boolean(result?.attempted),
            status: result?.status || "skipped",
            reason: result?.reason || "",
            sentAt: new Date().toISOString(),
          };
          logEvent("appointment", "meeting details sent to student via whatsapp", {
            appointmentId: appointment.id,
            counselorId: appointment.counselorId,
            studentId: appointment.studentId,
            status: appointment.meetingLinkWhatsappDelivery.status,
          });
        } catch (error) {
          appointment.meetingLinkWhatsappDelivery = {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send WhatsApp meeting details."),
            sentAt: new Date().toISOString(),
          };
          console.error("Meeting details WhatsApp send failed (create):", error);
        }
      }
      await writeAppointments([...appointments, appointment]);
      sendJson(res, 201, { ok: true, data: appointment });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/appointments/")) {
    try {
      const appointmentId = decodeURIComponent(url.pathname.replace("/api/appointments/", "").trim()).replace(/\/+$/, "");
      if (!appointmentId) {
        sendJson(res, 400, { ok: false, error: "Appointment ID is required." });
        return;
      }
      const body = await parseBody(req);
      const appointments = await readAppointments();
      const idx = appointments.findIndex((item) => String(item.id || "") === appointmentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Appointment not found." });
        return;
      }
      const updatedAppointment = {
        ...appointments[idx],
        ...body,
        id: appointments[idx].id,
        updatedAt: new Date().toISOString(),
      };
      const previousAppointment = appointments[idx];
      const prevLink = String(previousAppointment?.meetingLink || "").trim();
      const nextLink = String(updatedAppointment?.meetingLink || "").trim();
      if (nextLink && nextLink !== prevLink) {
        try {
          const students = await readStudemts();
          const student = students.find((item) => String(item.id || "") === String(updatedAppointment.studentId || ""));
          const result = await deliverCounselorMessageToStudentWhatsapp({
            senderId: String(updatedAppointment.counselorId || "").trim(),
            receiverId: String(updatedAppointment.studentId || "").trim(),
            content: buildAppointmentLinkWhatsappMessage({
              studentName: student?.name || "",
              title: updatedAppointment.title || "Session",
              date: updatedAppointment.date || "",
              time: updatedAppointment.time || "",
              meetingPlatform: updatedAppointment.meetingPlatform || "",
              meetingLink: nextLink,
            }),
          });
          updatedAppointment.meetingLinkWhatsappDelivery = {
            attempted: Boolean(result?.attempted),
            status: result?.status || "skipped",
            reason: result?.reason || "",
            sentAt: new Date().toISOString(),
          };
          logEvent("appointment", "meeting link sent to student via whatsapp", {
            appointmentId,
            counselorId: updatedAppointment.counselorId,
            studentId: updatedAppointment.studentId,
            status: updatedAppointment.meetingLinkWhatsappDelivery.status,
          });
        } catch (error) {
          updatedAppointment.meetingLinkWhatsappDelivery = {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send WhatsApp meeting link."),
            sentAt: new Date().toISOString(),
          };
          console.error("Meeting link WhatsApp send failed:", error);
        }
      }
      const updatedAppointments = [...appointments];
      updatedAppointments[idx] = updatedAppointment;
      await writeAppointments(updatedAppointments);
      sendJson(res, 200, { ok: true, data: updatedAppointment });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/students") {
    try {
      const studemts = await readStudemts();
      sendJson(res, 200, { ok: true, data: studemts.map((student) => publicStudentRecord(req, student)) });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load students." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/university-programs") {
    try {
      const programs = await readUniversityPrograms();
      const includeHidden = url.searchParams.get("includeHidden") === "1";
      const visiblePrograms = includeHidden ? programs : programs.filter((program) => !program.isHidden);
      sendJson(res, 200, { ok: true, data: visiblePrograms });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load university programs." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/chats") {
    try {
      const userId = String(url.searchParams.get("userId") || "").trim();
      const shouldMarkRead = url.searchParams.get("markRead") !== "0";
      const chatsAll = await readChats();
      let chatsAllNext = chatsAll;
      if (userId && shouldMarkRead) {
        // Mark messages as read when the receiver opens their chat inbox.
        let hasReadUpdates = false;
        chatsAllNext = chatsAll.map((chat) => {
          if (String(chat.receiverId || "") === userId && chat.read !== true) {
            hasReadUpdates = true;
            return { ...chat, read: true, readAt: new Date().toISOString() };
          }
          return chat;
        });
        if (hasReadUpdates) {
          await writeChats(chatsAllNext);
        }
      }
      let chatsForResponse = chatsAllNext;
      const counselor = userId ? await resolveCounselor(userId) : null;
      if (userId && counselor) {
        // Counselors can see the full conversation thread for any student they have handled
        // (current counselor, inquiry counselor, or counselor history), even if they were not
        // the sender/receiver for older messages.
        const students = await readStudemts();
        const visibleStudentIds = new Set(
          (students || [])
            .filter((s) => {
              const c = String(s.counselor || "").trim();
              const inquiry = String(s.inquiryCounselorId || "").trim();
              const history = Array.isArray(s.counselorHistory) ? s.counselorHistory : [];
              return (
                c === userId ||
                inquiry === userId ||
                history.some((id) => String(id || "").trim() === userId)
              );
            })
            .map((s) => String(s.id || "").trim())
            .filter(Boolean)
        );
        chatsForResponse = chatsForResponse.filter((chat) => {
          const sid = String(chat.senderId || "").trim();
          const rid = String(chat.receiverId || "").trim();
          return sid === userId || rid === userId || visibleStudentIds.has(sid) || visibleStudentIds.has(rid);
        });
      }
      const withPublicUrls = chatsForResponse.map((chat) => {
        if (!chat || !chat.attachment || !chat.attachment.url) return chat;
        return {
          ...chat,
          attachment: {
            ...chat.attachment,
            url: publicChatFileUrl(req, chat.attachment.url),
          },
        };
      });
      if (!userId) {
        sendJson(res, 200, { ok: true, data: withPublicUrls });
        return;
      }
      const scopedChats = withPublicUrls.filter(
        (chat) => String(chat.senderId || "") === userId || String(chat.receiverId || "") === userId
      );
      // Counselors get chatsForResponse already scoped by handled students (includes prior counselor thread).
      sendJson(res, 200, { ok: true, data: counselor ? withPublicUrls : scopedChats });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load chats." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/activities") {
    try {
      const activities = await readActivities();
      sendJson(res, 200, { ok: true, data: activities });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load activities." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/activities") {
    try {
      const body = await parseBody(req);
      const action = String(body.action || "").trim();
      if (!action) {
        sendJson(res, 400, { ok: false, error: "Activity action is required." });
        return;
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
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chats") {
    try {
      const body = await parseBody(req);
      const senderId = String(body.senderId || "").trim();
      const receiverId = String(body.receiverId || "").trim();
      const content = String(body.content || "").trim();
      const platform = String(body.platform || "portal").trim();
      const incomingAttachment =
        body.attachment && typeof body.attachment === "object" ? body.attachment : null;
      let attachment = null;
      if (incomingAttachment && incomingAttachment.dataUrl) {
        const stored = await storeChatAttachmentDataUrl(
          String(incomingAttachment.dataUrl || ""),
          String(incomingAttachment.name || "attachment")
        );
        if (!stored) {
          sendJson(res, 400, { ok: false, error: "Unsupported file type for chat attachment." });
          return;
        }
        if (stored.error) {
          sendJson(res, 400, { ok: false, error: stored.error });
          return;
        }
        attachment = {
          name: stored.name,
          mime: stored.mime,
          size: stored.size,
          url: stored.url,
        };
      }
      if (!senderId || !receiverId || (!content && !attachment)) {
        sendJson(res, 400, { ok: false, error: "senderId, receiverId and message content or attachment are required." });
        return;
      }
      let whatsappDelivery = null;
      if (content || attachment) {
        whatsappDelivery = await deliverCounselorMessageToStudentWhatsapp({
          senderId,
          receiverId,
          content,
          attachment,
        });
      }
      const chats = await readChats();
      const chat = {
        id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
        senderId,
        receiverId,
        content,
        timestamp: new Date().toISOString(),
        read: false,
        platform: platform || "portal",
        attachment,
        whatsappDelivery,
      };
      await writeChats([...chats, chat]);
      sendJson(res, 201, {
        ok: true,
        data: {
          ...chat,
          attachment: chat.attachment
            ? { ...chat.attachment, url: publicChatFileUrl(req, chat.attachment.url) }
            : null,
        },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/university-programs") {
    try {
      const body = await parseBody(req);
      const university = String(body.university || "").trim();
      const programName = String(body.programName || "").trim();
      const country = String(body.country || "").trim();
      const tuition = Number(body.tuition);
      const currency = String(body.currency || "").trim().toUpperCase();
      const duration = String(body.duration || "").trim();
      const intake = String(body.intake || "").trim();
      const minGPA = Number(body.minGPA);
      const minIELTS = Number(body.minIELTS);
      const qualificationName = String(body.qualificationName || "").trim();
      const qualificationMinValue = Number(body.qualificationMinValue);
      const ranking = Number(body.ranking);
      const tags = Array.isArray(body.tags) ? body.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
      const logoColor = String(body.logoColor || "").trim() || "bg-slate-700";

      if (!university || !programName || !country || !currency || !duration || !intake) {
        sendJson(res, 400, { ok: false, error: "University, program, country, currency, duration, and intake are required." });
        return;
      }
      if (!Number.isFinite(tuition) || tuition <= 0) {
        sendJson(res, 400, { ok: false, error: "Tuition must be a positive number." });
        return;
      }
      const hasQualification = !!qualificationName;
      if (hasQualification && (!Number.isFinite(qualificationMinValue) || qualificationMinValue < 0)) {
        sendJson(res, 400, { ok: false, error: "Qualification minimum value must be 0 or higher." });
        return;
      }
      if (!hasQualification) {
        if (!Number.isFinite(minGPA) || minGPA < 0) {
          sendJson(res, 400, { ok: false, error: "Minimum GPA must be 0 or higher." });
          return;
        }
        if (!Number.isFinite(minIELTS) || minIELTS < 0) {
          sendJson(res, 400, { ok: false, error: "Minimum IELTS must be 0 or higher." });
          return;
        }
      }
      if (!Number.isFinite(ranking) || ranking <= 0) {
        sendJson(res, 400, { ok: false, error: "Ranking must be a positive number." });
        return;
      }

      const programs = await readUniversityPrograms();
      const program = {
        id: `UP-${crypto.randomUUID().slice(0, 8)}`,
        university,
        programName,
        country,
        tuition,
        currency,
        duration,
        intake,
        minGPA: hasQualification ? 0 : minGPA,
        minIELTS: hasQualification ? 0 : minIELTS,
        qualificationName: hasQualification ? qualificationName : "",
        qualificationMinValue: hasQualification ? qualificationMinValue : 0,
        ranking: Math.floor(ranking),
        tags,
        logoColor,
        isHidden: false,
        createdAt: new Date().toISOString(),
      };
      await writeUniversityPrograms([program, ...programs]);
      sendJson(res, 201, { ok: true, data: program });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/university-programs/") && url.pathname.endsWith("/visibility")) {
    try {
      const programId = decodeURIComponent(url.pathname.replace("/api/university-programs/", "").replace("/visibility", "").trim()).replace(/\/+$/, "");
      if (!programId) {
        sendJson(res, 400, { ok: false, error: "Program ID is required." });
        return;
      }
      const body = await parseBody(req);
      const isHidden = Boolean(body.isHidden);
      const programs = await readUniversityPrograms();
      const index = programs.findIndex((program) => String(program.id || "") === programId);
      if (index === -1) {
        sendJson(res, 404, { ok: false, error: "University program not found." });
        return;
      }
      const updatedProgram = {
        ...programs[index],
        isHidden,
        updatedAt: new Date().toISOString(),
      };
      const updatedPrograms = [...programs];
      updatedPrograms[index] = updatedProgram;
      await writeUniversityPrograms(updatedPrograms);
      sendJson(res, 200, { ok: true, data: updatedProgram });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/university-programs/")) {
    try {
      const programId = decodeURIComponent(url.pathname.replace("/api/university-programs/", "").trim()).replace(/\/+$/, "");
      if (!programId) {
        sendJson(res, 400, { ok: false, error: "Program ID is required." });
        return;
      }
      const programs = await readUniversityPrograms();
      const index = programs.findIndex((program) => String(program.id || "") === programId);
      if (index === -1) {
        sendJson(res, 404, { ok: false, error: "University program not found." });
        return;
      }
      const removedProgram = programs[index];
      const updatedPrograms = programs.filter((program) => String(program.id || "") !== programId);
      await writeUniversityPrograms(updatedPrograms);
      sendJson(res, 200, { ok: true, data: removedProgram });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/students") {
    try {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const country = String(body.country || "").trim();
      const branch = String(body.branch || "").trim();
      const email = normalizeEmail(body.email);
      const phoneInput = String(body.phone || "").trim();
      const phone = normalizeSriLankaStudentPhone(phoneInput);
      const password = String(body.password || "").trim();
      const ielts = String(body.ielts || "").trim() || "Pending";
      const gpa = String(body.gpa || "").trim();
      const status = String(body.status || "").trim() || "Inquiry";
      const budget = String(body.budget || "").trim();
      const priority = String(body.priority || "").trim() || "Medium";
      const counselor = String(body.counselor || "").trim() || "Unassigned";
      const counselorNameFromBody = String(body.counselorName || "").trim();
      const notes = String(body.notes || "").trim() || "Newly added via CRM.";
      const lastEducationDate =
        String(body.lastEducationDate || "").trim() || new Date().toISOString().split("T")[0];
      const documents = Array.isArray(body.documents) ? body.documents : [];
      const city = String(body.city || "").trim();
      const livingStatus = String(body.livingStatus || "").trim();
      const visaRejectionAnyCountry = String(body.visaRejectionAnyCountry || "").trim();
      const currentEducationLevel = String(body.currentEducationLevel || "").trim();
      const intendedProgram = String(body.intendedProgram || "").trim();
      const message = String(body.message || "").trim();

      if (!name || !country || !branch || !email || !phoneInput || !gpa || !password) {
        sendJson(res, 400, { ok: false, error: "Name, country, branch, email, phone, GPA and password are required." });
        return;
      }
      if (!phone) {
        sendJson(res, 400, { ok: false, error: "Enter a valid Sri Lankan mobile number in +947XXXXXXXX format." });
        return;
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        sendJson(res, 400, { ok: false, error: "Enter a valid email." });
        return;
      }

      const studemts = await readStudemts();
      if (studemts.some((s) => normalizeEmail(s.email) === email)) {
        sendJson(res, 409, { ok: false, error: "Student email already exists." });
        return;
      }
      const users = await readUsers();
      if (email === ADMIN_EMAIL || users.some((u) => normalizeEmail(u.email) === email)) {
        sendJson(res, 409, { ok: false, error: "Email is already used by an account." });
        return;
      }

      let counselorName = "";
      if (counselor && counselor !== "Unassigned") {
        if (counselorNameFromBody) {
          counselorName = counselorNameFromBody;
        } else {
          const counselorUser = users.find((u) => String(u.id || "") === counselor);
          if (counselorUser) {
            counselorName = String(counselorUser.username || "").trim() || normalizeEmail(counselorUser.email);
          }
        }
      }

      const maxStudentNumber = studemts.reduce((max, student) => {
        const match = String(student.id || "").match(/^STU(\d+)$/);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 999);
      const nowIso = new Date().toISOString();
      const student = {
        id: `STU${maxStudentNumber + 1}`,
        name,
        country,
        branch,
        email,
        phone,
        password,
        forcePasswordChange: true,
        ielts,
        gpa,
        status,
        budget,
        priority,
        counselor,
        inquiryCounselorId: isApplicationStage(status) ? "" : counselor,
        counselorName,
        notes,
        lastEducationDate,
        documents,
        city: city || null,
        livingStatus: livingStatus || null,
        visaRejectionAnyCountry: visaRejectionAnyCountry || null,
        currentEducationLevel: currentEducationLevel || null,
        intendedProgram: intendedProgram || null,
        message: message || null,
        createdAt: nowIso,
        stageEnteredAt: nowIso
      };
      const updated = [...studemts, student];
      await writeStudemts(updated);
      // Account details (email + WhatsApp) are intentionally NOT sent at
      // registration. They are delivered when the counsellor advances the
      // student to the "Documentation" stage. See PUT /api/students/:id.
      sendJson(res, 201, { ok: true, data: publicStudentRecord(req, student) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/students/")) {
    try {
      const studentId = decodeURIComponent(url.pathname.replace("/api/students/", "").trim());
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return;
      }
      const body = await parseBody(req);
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return;
      }
      const previous = studemts[idx];
      const nowIso = new Date().toISOString();
      const previousCounselor = String(previous?.counselor || "").trim();
      const merged = {
        ...studemts[idx],
        ...body,
        id: studemts[idx].id,
        updatedAt: nowIso,
      };
      if (Object.prototype.hasOwnProperty.call(body, "phone")) {
        const normalizedPhone = normalizeSriLankaStudentPhone(body.phone);
        if (!normalizedPhone) {
          sendJson(res, 400, { ok: false, error: "Enter a valid Sri Lankan mobile number in +947XXXXXXXX format." });
          return;
        }
        merged.phone = normalizedPhone;
      }
      const nextCounselor = String(merged?.counselor || "").trim();
      if (previousCounselor && nextCounselor && previousCounselor !== nextCounselor) {
        const history = Array.isArray(previous?.counselorHistory) ? previous.counselorHistory : [];
        const normalized = history.map((id) => String(id || "").trim()).filter(Boolean);
        normalized.push(previousCounselor);
        merged.counselorHistory = Array.from(new Set(normalized));
        logEvent("student", "counselor transferred", {
          studentId,
          from: previousCounselor,
          to: nextCounselor,
        });
      }

      let counselorAssignmentWhatsapp = null;
      const prevCounselorNorm = previousCounselor.toLowerCase();
      const isNewCounselorAssignment =
        nextCounselor &&
        nextCounselor.toLowerCase() !== "unassigned" &&
        (prevCounselorNorm !== nextCounselor.toLowerCase()) &&
        (!previousCounselor || prevCounselorNorm === "unassigned" || previousCounselor !== nextCounselor);
      if (isNewCounselorAssignment) {
        try {
          const users = await readUsers();
          const newCounselorUser = users.find((u) => String(u.id || "") === nextCounselor);
          if (newCounselorUser) {
            const studentName = String(merged.name || "").trim();
            const message = buildCounselorAssignmentWhatsappMessage({
              studentName: studentName || "Student",
              counselorName: String(newCounselorUser.username || "").trim(),
              counselorEmail: normalizeEmail(newCounselorUser.email),
              counselorPhone: String(newCounselorUser.phone || "").trim(),
              counselorBranch: String(newCounselorUser.branch || "").trim(),
            });
            const result = await deliverCounselorMessageToStudentWhatsapp({
              senderId: nextCounselor,
              receiverId: studentId,
              content: message,
            });
            counselorAssignmentWhatsapp = {
              attempted: Boolean(result?.attempted),
              status: String(result?.status || "skipped"),
              reason: String(result?.reason || ""),
            };
            logEvent("student", "counselor assignment WhatsApp sent", {
              studentId,
              counselorId: nextCounselor,
              status: result?.status || "unknown",
            });
          } else {
            counselorAssignmentWhatsapp = {
              attempted: false,
              status: "skipped",
              reason: "New counselor user account not found.",
            };
          }
        } catch (error) {
          counselorAssignmentWhatsapp = {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send counselor assignment WhatsApp."),
          };
        }
      }

      const transitionedToInquiry =
        !isApplicationStage(previous?.status) &&
        String(previous?.status || "").trim().toLowerCase() !== "inquiry" &&
        String(merged?.status || "").trim().toLowerCase() === "inquiry";
      if (transitionedToInquiry && !merged.inquiryCounselorId) {
        const c = String(merged.counselor || "").trim();
        if (c && c !== "Unassigned") {
          merged.inquiryCounselorId = c;
        }
      }

      const transitionedToDocumentation =
        !isDocumentationStage(previous?.status) && isDocumentationStage(merged?.status);
      const alreadySent = Boolean(
        previous?.accountDetailsSentAt ||
          merged?.accountDetailsSentAt ||
          previous?.applicationAccountDetailsSentAt ||
          merged?.applicationAccountDetailsSentAt
      );

      const transitionedToApplication =
        isApplicationStage(merged?.status) &&
        !isApplicationStage(previous?.status) &&
        (isInquiryStage(previous?.status) || isRegistrationStage(previous?.status));

      if (transitionedToApplication && !alreadySent) {
        const emailAddress = normalizeEmail(merged.email);
        const password = String(merged.password || "");
        const studentName = String(merged.name || "").trim();
        const loginUrl = buildStudentPortalLoginUrl(req);

        const delivery = {
          email: { attempted: false, status: "skipped", reason: "" },
          whatsapp: { attempted: false, status: "skipped", reason: "" },
        };

        // Email (SMTP)
        try {
          const smtpError = getSmtpConfigError();
          if (smtpError) {
            delivery.email = { attempted: false, status: "skipped", reason: smtpError };
          } else if (!emailAddress || !password) {
            delivery.email = { attempted: false, status: "skipped", reason: "Missing student email or password." };
          } else {
            const users = await readUsers();
            const counselorId = String(merged.inquiryCounselorId || merged.counselor || "").trim();
            const counselorUser = users.find((u) => String(u.id || "") === counselorId);
            const counselorNameForEmail =
              String(merged.counselorName || "").trim() ||
              (counselorUser ? String(counselorUser.username || "").trim() || normalizeEmail(counselorUser.email) : "") ||
              "Not assigned yet";
            await sendStudentWelcomeEmail({
              to: emailAddress,
              studentName: studentName || emailAddress,
              loginUrl,
              emailAddress,
              password,
              counselorName: counselorNameForEmail,
            });
            delivery.email = { attempted: true, status: "sent", reason: "" };
          }
        } catch (error) {
          console.error("Student inquiry->application email failed:", error);
          delivery.email = {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send email."),
          };
        }

        // WhatsApp (sent from inquiry counselor's connected WhatsApp)
        try {
          const inquiryCounselorId = String(merged.inquiryCounselorId || "").trim();
          const counselorId = inquiryCounselorId || String(merged.counselor || "").trim();
          if (!counselorId || counselorId === "Unassigned") {
            delivery.whatsapp = { attempted: false, status: "skipped", reason: "Student has no assigned counselor." };
          } else {
            const message = buildStudentAccountDetailsWhatsappMessage({
              studentName: studentName || emailAddress,
              emailAddress,
              password,
              loginUrl,
            });
            const result = await deliverCounselorMessageToStudentWhatsapp({
              senderId: counselorId,
              receiverId: studentId,
              content: message,
            });
            if (result && result.attempted) {
              delivery.whatsapp = {
                attempted: true,
                status: result.status || "failed",
                reason: result.reason || "",
              };
            } else {
              delivery.whatsapp = { attempted: false, status: "skipped", reason: result?.reason || "Not attempted." };
            }
          }
        } catch (error) {
          console.error("Student inquiry->application WhatsApp failed:", error);
          delivery.whatsapp = {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send WhatsApp message."),
          };
        }

        merged.applicationAccountDetailsSentAt = nowIso;
        merged.applicationAccountDetailsDelivery = delivery;
        logEvent("student", "moved to Application: sent account details", {
          studentId,
          email: emailAddress,
          counselorId: String(merged.inquiryCounselorId || merged.counselor || ""),
          delivery,
        });
      }

      if (transitionedToDocumentation && !alreadySent) {
        const emailAddress = normalizeEmail(merged.email);
        const password = String(merged.password || "");
        const studentName = String(merged.name || "").trim();
        const loginUrl = buildStudentPortalLoginUrl(req);

        const delivery = {
          email: { attempted: false, status: "skipped", reason: "" },
          whatsapp: { attempted: false, status: "skipped", reason: "" },
        };

        // Email (SMTP)
        try {
          const smtpError = getSmtpConfigError();
          if (smtpError) {
            delivery.email = { attempted: false, status: "skipped", reason: smtpError };
          } else if (!emailAddress || !password) {
            delivery.email = { attempted: false, status: "skipped", reason: "Missing student email or password." };
          } else {
            const users = await readUsers();
            const counselorId = String(merged.counselor || "").trim();
            const counselorUser = users.find((u) => String(u.id || "") === counselorId);
            const counselorNameForEmail =
              String(merged.counselorName || "").trim() ||
              (counselorUser ? String(counselorUser.username || "").trim() || normalizeEmail(counselorUser.email) : "") ||
              "Not assigned yet";
            await sendStudentWelcomeEmail({
              to: emailAddress,
              studentName: studentName || emailAddress,
              loginUrl,
              emailAddress,
              password,
              counselorName: counselorNameForEmail,
            });
            delivery.email = { attempted: true, status: "sent", reason: "" };
          }
        } catch (error) {
          console.error("Student documentation-stage email failed:", error);
          delivery.email = {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send email."),
          };
        }

        // WhatsApp (sent from assigned counselor's connected WhatsApp)
        try {
          const inquiryCounselorId = String(merged.inquiryCounselorId || "").trim();
          const counselorId = inquiryCounselorId || String(merged.counselor || "").trim();
          if (!counselorId || counselorId === "Unassigned") {
            delivery.whatsapp = { attempted: false, status: "skipped", reason: "Student has no assigned counselor." };
          } else {
            const message = buildStudentAccountDetailsWhatsappMessage({
              studentName: studentName || emailAddress,
              emailAddress,
              password,
              loginUrl,
            });
            const result = await deliverCounselorMessageToStudentWhatsapp({
              senderId: counselorId,
              receiverId: studentId,
              content: message,
            });
            if (result && result.attempted) {
              delivery.whatsapp = {
                attempted: true,
                status: result.status || "failed",
                reason: result.reason || "",
              };
            } else {
              delivery.whatsapp = { attempted: false, status: "skipped", reason: result?.reason || "Not attempted." };
            }
          }
        } catch (error) {
          console.error("Student documentation-stage WhatsApp failed:", error);
          delivery.whatsapp = {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send WhatsApp message."),
          };
        }

        merged.accountDetailsSentAt = nowIso;
        merged.accountDetailsDelivery = delivery;
        logEvent("student", "moved to Documentation: sent account details", {
          studentId,
          email: emailAddress,
          counselorId: String(merged.inquiryCounselorId || merged.counselor || ""),
          delivery,
        });
      }

      const documentWhatsappNotifications = [];
      if (Array.isArray(merged.documents)) {
        const transitions = collectDocumentVerificationTransitions(previous.documents, merged.documents);
        const studentName = String(merged.name || "").trim();
        const counselorId = String(merged.inquiryCounselorId || merged.counselor || "").trim();
        for (const t of transitions) {
          if (!counselorId || counselorId === "Unassigned") {
            documentWhatsappNotifications.push({
              docId: t.docId,
              decision: t.decision,
              whatsapp: { attempted: false, status: "skipped", reason: "Student has no assigned counselor." },
            });
            continue;
          }
          const message = buildDocumentDecisionWhatsappMessage({
            studentName,
            docName: t.docName,
            docType: t.docType,
            decision: t.decision,
            rejectionReason: t.rejectionReason,
          });
          try {
            const result = await deliverCounselorMessageToStudentWhatsapp({
              senderId: counselorId,
              receiverId: studentId,
              content: message,
            });
            documentWhatsappNotifications.push({
              docId: t.docId,
              decision: t.decision,
              whatsapp: {
                attempted: Boolean(result?.attempted),
                status: String(result?.status || "failed"),
                reason: String(result?.reason || ""),
              },
            });
          } catch (error) {
            documentWhatsappNotifications.push({
              docId: t.docId,
              decision: t.decision,
              whatsapp: {
                attempted: true,
                status: "failed",
                reason: String(error?.message || "Failed to send WhatsApp message."),
              },
            });
          }
        }
      }

      const enrolledTransitionError = await getBlockedEnrolledTransitionError(previous, merged);
      if (enrolledTransitionError) {
        sendJson(res, 400, { ok: false, error: enrolledTransitionError });
        return;
      }

      const nextSla = reconcileSlaViolationsOnStudentRecord(merged);
      if (nextSla !== undefined) {
        merged.slaViolations = nextSla;
      }

      const prevDocs = Array.isArray(previous.documents) ? previous.documents : [];
      const nextDocs = Array.isArray(merged.documents) ? merged.documents : [];
      const nextDocIds = new Set(
        nextDocs.map((d) => (d && typeof d === "object" ? String(d.id || "").trim() : "")).filter(Boolean)
      );
      for (const d of prevDocs) {
        if (!d || typeof d !== "object") continue;
        const id = String(d.id || "").trim();
        if (!id || nextDocIds.has(id)) continue;
        const storedUrl = String(d.url || "").trim();
        if (storedUrl) {
          await safeUnlinkStoredPermissionDoc(storedUrl);
        }
      }

      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, {
        ok: true,
        data: publicStudentRecord(req, merged),
        documentWhatsappNotifications,
        counselorAssignmentWhatsapp,
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/move-to-requests")) {
    try {
      const studentId = decodeURIComponent(
        url.pathname.replace("/api/students/", "").replace("/move-to-requests", "").trim()
      ).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return;
      }
      const body = await parseBody(req);
      const nearestOfficeRaw = String(body.nearestOffice || body.branch || "").trim();
      if (!nearestOfficeRaw) {
        sendJson(res, 400, { ok: false, error: "Branch (nearest office) is required." });
        return;
      }

      const branchesList = await readBranches();
      const branchLocations = branchesList
        .map((b) => String(b?.location || "").trim())
        .filter(Boolean);
      const matchedOffice = branchLocations.find(
        (loc) => loc.toLowerCase() === nearestOfficeRaw.toLowerCase()
      );
      if (!matchedOffice) {
        sendJson(res, 400, { ok: false, error: "Please choose a valid nearest office from the list." });
        return;
      }

      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return;
      }
      const student = studemts[idx];

      const entry = {
        id: `REQ-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        submittedAt: new Date().toISOString(),
        name: String(student.name || "").trim(),
        email: normalizeEmail(student.email),
        phone: String(student.phone || "").trim(),
        countryToVisit: String(student.countryToVisit || student.country || "").trim(),
        city: String(student.city || "").trim() || null,
        nearestOffice: matchedOffice,
        currentEducationLevel: String(student.currentEducationLevel || "").trim(),
        intendedProgram: String(student.intendedProgram || "").trim(),
        message: String(student.message || "").trim() || null,
        source: "counselor-reassignment",
      };

      if (!entry.name || !entry.email || !entry.phone || !entry.countryToVisit) {
        sendJson(res, 400, {
          ok: false,
          error: "Student is missing required interest-form fields (name, email, phone, country).",
        });
        return;
      }
      if (!entry.currentEducationLevel || !entry.intendedProgram) {
        sendJson(res, 400, {
          ok: false,
          error: "Student is missing education level or intended program.",
        });
        return;
      }

      await appendReqStudent(entry);
      const updated = [...studemts];
      updated.splice(idx, 1);
      await writeStudemts(updated);
      sendJson(res, 200, { ok: true, data: { requestId: entry.id, studentId, nearestOffice: matchedOffice } });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/avatar")) {
    try {
      const studentId = decodeURIComponent(url.pathname.replace("/api/students/", "").replace("/avatar", "").trim()).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return;
      }
      const body = await parseBody(req);
      const avatar = String(body.avatar || "");
      if (!avatar.startsWith("data:image/")) {
        sendJson(res, 400, { ok: false, error: "Invalid image payload." });
        return;
      }
      if (avatar.length > 4_000_000) {
        sendJson(res, 400, { ok: false, error: "Image is too large." });
        return;
      }
      const storedAvatarPath = await storeImageDataUrl(avatar, "student-avatar");
      if (!storedAvatarPath) {
        sendJson(res, 400, { ok: false, error: "Unsupported image format." });
        return;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return;
      }
      const merged = {
        ...studemts[idx],
        avatar: storedAvatarPath,
        updatedAt: new Date().toISOString(),
      };
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, { ok: true, data: publicStudentRecord(req, merged) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/cv")) {
    try {
      const studentId = decodeURIComponent(url.pathname.replace("/api/students/", "").replace("/cv", "").trim()).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return;
      }
      const body = await parseBody(req);
      const dataUrl = String(body.dataUrl || "");
      const fileName = String(body.fileName || "cv");
      if (!dataUrl.startsWith("data:")) {
        sendJson(res, 400, { ok: false, error: "Invalid CV payload." });
        return;
      }
      const stored = await storeStudentCvDataUrl(dataUrl, fileName);
      if (!stored) {
        sendJson(res, 400, { ok: false, error: "Unsupported CV format. Use PDF, DOC, or DOCX." });
        return;
      }
      if (stored.error) {
        sendJson(res, 400, { ok: false, error: stored.error });
        return;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return;
      }
      const merged = {
        ...studemts[idx],
        cvFile: {
          name: stored.name,
          mime: stored.mime,
          size: stored.size,
          url: stored.url,
          uploadedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, { ok: true, data: publicStudentRecord(req, merged) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/documents")) {
    try {
      const studentId = decodeURIComponent(url.pathname.replace("/api/students/", "").replace("/documents", "").trim()).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return;
      }
      const body = await parseBody(req);
      const dataUrl = String(body.dataUrl || "");
      const fileName = String(body.fileName || "document");
      let docType = String(body.docType || "").trim();
      const tier = String(body.tier || "Global").trim() || "Global";
      const phaseNumber = Number(body.phase);
      const phase = Number.isFinite(phaseNumber) ? Math.max(1, Math.floor(phaseNumber)) : 1;
      const rawLink = body.taskDocumentLink && typeof body.taskDocumentLink === "object" ? body.taskDocumentLink : null;
      const taskDocumentLink = rawLink
        ? {
            taskId: String(rawLink.taskId || "").trim(),
            slotId: String(rawLink.slotId || "").trim(),
            label: String(rawLink.label || "")
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, 220),
          }
        : null;
      if (taskDocumentLink && (!taskDocumentLink.taskId || !taskDocumentLink.slotId)) {
        sendJson(res, 400, { ok: false, error: "taskDocumentLink.taskId and taskDocumentLink.slotId are required." });
        return;
      }
      if (taskDocumentLink) {
        docType = `taskDoc__${taskDocumentLink.taskId}__${taskDocumentLink.slotId}`;
      }
      if (!docType) {
        sendJson(res, 400, { ok: false, error: "Document type is required." });
        return;
      }
      if (!dataUrl.startsWith("data:")) {
        sendJson(res, 400, { ok: false, error: "Invalid document payload." });
        return;
      }
      const stored = await storeStudentPermissionDataUrl(dataUrl, fileName);
      if (!stored) {
        sendJson(res, 400, { ok: false, error: "Unsupported document format. Use PDF, JPG, PNG, DOC, or DOCX." });
        return;
      }
      if (stored.error) {
        sendJson(res, 400, { ok: false, error: stored.error });
        return;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return;
      }
      const newDocument = {
        id: `doc-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
        name: stored.name,
        type: docType,
        status: "Pending",
        uploadedAt: new Date().toISOString(),
        phase,
        tier,
        mime: stored.mime,
        size: stored.size,
        url: stored.url,
        ...(taskDocumentLink ? { taskDocumentLink } : {}),
      };
      let existingDocuments = Array.isArray(studemts[idx].documents) ? [...studemts[idx].documents] : [];
      if (taskDocumentLink) {
        existingDocuments = existingDocuments.filter((d) => {
          if (!d || typeof d !== "object") return true;
          const link = d.taskDocumentLink;
          if (!link || typeof link !== "object") return true;
          return !(String(link.taskId || "") === taskDocumentLink.taskId && String(link.slotId || "") === taskDocumentLink.slotId);
        });
      }
      const merged = {
        ...studemts[idx],
        documents: [...existingDocuments, newDocument],
        updatedAt: new Date().toISOString(),
      };
      const nextSla = reconcileSlaViolationsOnStudentRecord(merged);
      if (nextSla !== undefined) {
        merged.slaViolations = nextSla;
      }
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, {
        ok: true,
        data: publicStudentRecord(req, merged),
        document: { ...newDocument, url: publicStudentDocUrl(req, newDocument.url) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/profile-other-documents")) {
    try {
      const studentId = decodeURIComponent(
        url.pathname.replace("/api/students/", "").replace("/profile-other-documents", "").trim()
      ).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return;
      }
      const body = await parseBody(req);
      const dataUrl = String(body.dataUrl || "");
      const fileName = String(body.fileName || "document");
      const append = Boolean(body.append);
      const slotNumRaw = Number(body.slot);
      let label = String(body.label || "").trim().replace(/\s+/g, " ");
      if (!label) label = "Other document";
      if (label.length > 120) label = label.slice(0, 120);
      if (!dataUrl.startsWith("data:")) {
        sendJson(res, 400, { ok: false, error: "Invalid document payload." });
        return;
      }
      const stored = await storeStudentPermissionDataUrl(dataUrl, fileName);
      if (!stored) {
        sendJson(res, 400, { ok: false, error: "Unsupported document format. Use PDF, JPG, PNG, DOC, or DOCX." });
        return;
      }
      if (stored.error) {
        sendJson(res, 400, { ok: false, error: stored.error });
        return;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return;
      }
      const entries = migrateProfileOtherDocumentsToSlotEntries(studemts[idx].profileOtherDocuments);
      let targetSlot;
      if (append) {
        targetSlot = entries.length === 0 ? 1 : Math.max(...entries.map((e) => Number(e.slot) || 0)) + 1;
      } else {
        if (!Number.isFinite(slotNumRaw) || slotNumRaw < 1 || Math.floor(slotNumRaw) !== slotNumRaw) {
          sendJson(res, 400, { ok: false, error: "Slot must be a positive integer, or use append to add a new document." });
          return;
        }
        targetSlot = Math.floor(slotNumRaw);
      }
      if (targetSlot > PROFILE_OTHER_DOCUMENTS_MAX_SLOT) {
        sendJson(res, 400, {
          ok: false,
          error: `You can store at most ${PROFILE_OTHER_DOCUMENTS_MAX_SLOT} other documents.`,
        });
        return;
      }
      const previous = entries.find((e) => Number(e.slot) === targetSlot);
      if (previous && previous.url) {
        await safeUnlinkStoredPermissionDoc(String(previous.url));
      }
      const newEntry = {
        id: `pod-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        slot: targetSlot,
        label,
        name: stored.name,
        mime: stored.mime,
        size: stored.size,
        url: stored.url,
        uploadedAt: new Date().toISOString(),
      };
      const nextEntries = [...entries.filter((e) => Number(e.slot) !== targetSlot), newEntry].sort(
        (a, b) => Number(a.slot) - Number(b.slot)
      );
      const merged = {
        ...studemts[idx],
        profileOtherDocuments: nextEntries,
        updatedAt: new Date().toISOString(),
      };
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, {
        ok: true,
        data: publicStudentRecord(req, merged),
        profileOtherDocument: {
          ...newEntry,
          url: publicStudentDocUrl(req, newEntry.url),
        },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/university-offer-letters")) {
    try {
      const studentId = decodeURIComponent(
        url.pathname.replace("/api/students/", "").replace("/university-offer-letters", "").trim()
      ).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return;
      }
      const body = await parseBody(req);
      const offerStatus = normalizeUniversityOfferStatusInput(body.offerStatus);
      if (!UNIVERSITY_OFFER_STATUSES.has(offerStatus)) {
        sendJson(res, 400, { ok: false, error: "Offer status must be Unconditional, Conditional, or Rejected." });
        return;
      }
      const rawFiles = Array.isArray(body.files) ? body.files : [];
      const singleDataUrl = String(body.dataUrl || "");
      const singleFileName = String(body.fileName || "offer-letter");
      const fileInputs =
        rawFiles.length > 0
          ? rawFiles
              .map((f) => ({
                dataUrl: String(f?.dataUrl || ""),
                fileName: String(f?.fileName || "offer-letter"),
              }))
              .filter((f) => f.dataUrl.startsWith("data:"))
          : singleDataUrl.startsWith("data:")
            ? [{ dataUrl: singleDataUrl, fileName: singleFileName }]
            : [];
      if (fileInputs.length === 0) {
        sendJson(res, 400, { ok: false, error: "At least one offer letter file is required." });
        return;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return;
      }
      const newEntries = [];
      for (const fileInput of fileInputs) {
        const stored = await storeStudentPermissionDataUrl(fileInput.dataUrl, fileInput.fileName);
        if (!stored) {
          sendJson(res, 400, { ok: false, error: "Unsupported document format. Use PDF, JPG, PNG, DOC, or DOCX." });
          return;
        }
        if (stored.error) {
          sendJson(res, 400, { ok: false, error: stored.error });
          return;
        }
        newEntries.push({
          id: `uol-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          name: stored.name,
          offerStatus,
          mime: stored.mime,
          size: stored.size,
          url: stored.url,
          uploadedAt: new Date().toISOString(),
        });
      }
      const existing = normalizeUniversityOfferLetters(studemts[idx].universityOfferLetters);
      const merged = {
        ...studemts[idx],
        universityOfferLetters: [...existing, ...newEntries],
        updatedAt: new Date().toISOString(),
      };
      const offerLetterWhatsappNotifications = [];
      const studentName = String(merged.name || "").trim();
      const counselorId = String(merged.inquiryCounselorId || merged.counselor || "").trim();
      const letterCount = newEntries.length;
      for (const entry of newEntries) {
        if (!counselorId || counselorId === "Unassigned") {
          offerLetterWhatsappNotifications.push({
            letterId: entry.id,
            offerStatus: entry.offerStatus,
            whatsapp: { attempted: false, status: "skipped", reason: "Student has no assigned counselor." },
          });
          continue;
        }
        const message = buildUniversityOfferWhatsappMessage({
          studentName,
          fileName: entry.name,
          offerStatus: entry.offerStatus,
          letterCount,
        });
        const attachment =
          entry.url && entry.mime && isSupportedWhatsappMediaMime(entry.mime)
            ? { url: entry.url, mime: entry.mime, name: entry.name }
            : null;
        try {
          const result = await deliverCounselorMessageToStudentWhatsapp({
            senderId: counselorId,
            receiverId: studentId,
            content: message,
            attachment,
          });
          offerLetterWhatsappNotifications.push({
            letterId: entry.id,
            offerStatus: entry.offerStatus,
            whatsapp: {
              attempted: Boolean(result?.attempted),
              status: String(result?.status || "failed"),
              reason: String(result?.reason || ""),
            },
          });
        } catch (error) {
          offerLetterWhatsappNotifications.push({
            letterId: entry.id,
            offerStatus: entry.offerStatus,
            whatsapp: {
              attempted: true,
              status: "failed",
              reason: String(error?.message || "Failed to send WhatsApp message."),
            },
          });
        }
      }
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, {
        ok: true,
        data: publicStudentRecord(req, merged),
        universityOfferLetters: newEntries.map((entry) => ({
          ...entry,
          url: publicStudentDocUrl(req, entry.url),
        })),
        offerLetterWhatsappNotifications,
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/branches") {
    try {
      const body = await parseBody(req);
      const location = String(body.location || "").trim();
      const totalInquiries = Number.isFinite(Number(body.totalInquiries)) ? Number(body.totalInquiries) : 0;
      const successes = Number.isFinite(Number(body.successes)) ? Number(body.successes) : 0;
      const revenue = Number.isFinite(Number(body.revenue)) ? Number(body.revenue) : 0;
      if (!location) {
        sendJson(res, 400, { ok: false, error: "Branch location is required." });
        return;
      }

      const branches = await readBranches();
      if (branches.some((b) => String(b.location || "").toLowerCase() === location.toLowerCase())) {
        sendJson(res, 409, { ok: false, error: "Branch location already exists." });
        return;
      }

      const branch = {
        id: `BR-${crypto.randomUUID().slice(0, 8)}`,
        location,
        totalInquiries: Math.max(0, Math.floor(totalInquiries)),
        successes: Math.max(0, Math.floor(successes)),
        revenue: Math.max(0, revenue),
        createdAt: new Date().toISOString(),
      };
      const updated = [...branches, branch];
      await writeBranches(updated);
      sendJson(res, 201, { ok: true, data: branch });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin-ai-chats") {
    try {
      const email = normalizeEmail(url.searchParams.get("email"));
      if (!email) {
        sendJson(res, 400, { ok: false, error: "email query parameter is required." });
        return;
      }
      if (!(await isAuthorizedAdminChatEmail(email))) {
        sendJson(res, 403, { ok: false, error: "Not authorized for this chat history." });
        return;
      }
      const store = await readAdminChatsStore();
      const entry = store[email];
      const list = Array.isArray(entry?.messages) ? entry.messages : [];
      sendJson(res, 200, { ok: true, data: list });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load admin chat history." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/admin-ai-chats") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      if (!email) {
        sendJson(res, 400, { ok: false, error: "email is required." });
        return;
      }
      if (!(await isAuthorizedAdminChatEmail(email))) {
        sendJson(res, 403, { ok: false, error: "Not authorized for this chat history." });
        return;
      }
      const messages = sanitizeAdminAiMessagesForStore(body.messages);
      const store = await readAdminChatsStore();
      store[email] = { messages, updatedAt: new Date().toISOString() };
      await writeAdminChatsStore(store);
      sendJson(res, 200, { ok: true, data: messages });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/admin-ai-chats") {
    try {
      const email = normalizeEmail(url.searchParams.get("email"));
      if (!email) {
        sendJson(res, 400, { ok: false, error: "email query parameter is required." });
        return;
      }
      if (!(await isAuthorizedAdminChatEmail(email))) {
        sendJson(res, 403, { ok: false, error: "Not authorized for this chat history." });
        return;
      }
      const store = await readAdminChatsStore();
      delete store[email];
      await writeAdminChatsStore(store);
      sendJson(res, 200, { ok: true });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to clear admin chat history." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/ai/chat/status") {
    sendJson(res, 200, {
      ok: true,
      enabled: Boolean(OPENAI_API_KEY),
      model: OPENAI_MODEL,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/chat") {
    try {
      if (!OPENAI_API_KEY) {
        sendJson(res, 503, {
          ok: false,
          error: "AI assistant is disabled. Add OPENAI_API_KEY to backend/.env and restart the server.",
        });
        return;
      }
      const body = await parseBody(req);
      const message = String(body.message || body.question || "").trim();
      if (!message) {
        sendJson(res, 400, { ok: false, error: "Message is required." });
        return;
      }
      if (message.length > 4000) {
        sendJson(res, 400, { ok: false, error: "Message is too long (max 4000 characters)." });
        return;
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
        return;
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
    return;
  }

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
    return;
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
    return;
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
    return;
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
    return;
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
    return;
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
        return;
      } catch {
        // If current frontend root misses a static file, try both known output dirs
        // (`frontend/build` and `frontend/dist`) before returning 404.
        if (isStaticAssetRequest) {
          const assetFromOtherBuild = await tryReadFrontendAssetFromBuildOutputs(requestedPath);
          if (assetFromOtherBuild) {
            res.statusCode = 200;
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            res.setHeader("Content-Type", getContentType(assetFromOtherBuild.filePath));
            res.end(assetFromOtherBuild.file);
            return;
          }
          sendJson(res, 404, { ok: false, error: "Frontend asset not found." });
          return;
        }
        // Fall through to SPA fallback for client-side routes.
      }
    }

    try {
      await sendFrontendFile(res, path.join(frontendRoot, "index.html"));
      return;
    } catch {
      sendJson(res, 404, { ok: false, error: "Frontend build not found. Run frontend build first." });
      return;
    }
  }

  sendJson(res, 404, { ok: false, error: "Not found." });
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the existing process or change PORT in backend/.env.`);
    return;
  }
  console.error("Server failed to start:", error);
});

async function logDataStoreStatus() {
  const stores = [
    ["invoices.json", INVOICES_FILE],
    ["studemts.json", STUDEMTS_FILE],
    ["tasks.json", TASKS_FILE],
    ["branches.json", BRANCHES_FILE],
  ];
  const missing = [];
  for (const [label, filePath] of stores) {
    try {
      await fs.access(filePath);
    } catch {
      missing.push(label);
    }
  }
  console.log(`Data directory (live server store): ${DATA_DIR}`);
  if (missing.length) {
    console.warn(
      `Missing data files (API endpoints will return empty arrays until created on the server): ${missing.join(", ")}`
    );
  }
  try {
    const invoiceCount = (await readInvoices()).length;
    console.log(`invoices.json: ${invoiceCount} record(s) at ${INVOICES_FILE}`);
  } catch (error) {
    console.warn(`invoices.json: failed to read ${INVOICES_FILE}`, error);
  }
}

server.listen(PORT, async () => {
  console.log(`Backend listening at http://localhost:${PORT}`);
  await logDataStoreStatus();
  await initializeWhatsappSessionsOnStartup();
  setInterval(() => {
    reconnectActiveWhatsappSessions().catch((error) => {
      console.error("Periodic WhatsApp reconnect failed:", error);
    });
  }, WHATSAPP_RECONNECT_INTERVAL_MS);
  setInterval(() => {
    processMeetingReminders().catch((error) => {
      console.error("Meeting reminder processing failed:", error);
    });
  }, MEETING_REMINDER_POLL_MS);
});
