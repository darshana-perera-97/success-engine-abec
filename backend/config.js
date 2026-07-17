require("dotenv").config();

const path = require("path");
const { buildAdminAiSystemPrompt } = require("./prompts");
const {
  ACTIVE_PROFILE,
  COMPANY_NAME,
  COMPANY_NAME_NBSP,
  DEFAULT_SMTP_FROM_NAME,
} = require("./profileConfig");

const PORT = parseInt(process.env.PORT || "", 10) || 3334;

function resolveDataDir() {
  const fromEnv = String(process.env.DATA_DIR || "").trim();
  if (!fromEnv) return path.join(__dirname, "data");
  return path.isAbsolute(fromEnv) ? path.resolve(fromEnv) : path.resolve(__dirname, fromEnv);
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
const SYSTEM_DATA_FILE = path.join(DATA_DIR, "systemData.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const APPOINTMENTS_FILE = path.join(DATA_DIR, "appointments.json");
const INVOICES_FILE = path.join(DATA_DIR, "invoices.json");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const REQ_STUDENTS_FILE = path.join(DATA_DIR, "req-students.json");
const COUNTRY_CHANGE_REQUESTS_FILE = path.join(DATA_DIR, "countryChangeRequests.json");
const STUDENT_DETAIL_CHANGE_REQUESTS_FILE = path.join(DATA_DIR, "studentDetailChangeRequests.json");
const STUDENT_REMOVAL_REQUESTS_FILE = path.join(DATA_DIR, "studentRemovalRequests.json");
const INTAKE_CHANGE_REQUESTS_FILE = path.join(DATA_DIR, "intakeChangeRequests.json");
const BRANCH_CHANGE_REQUESTS_FILE = path.join(DATA_DIR, "branchChangeRequests.json");
const BRANCH_WHATSAPP_MESSENGER_CHANGE_REQUESTS_FILE = path.join(
  DATA_DIR,
  "branchWhatsappMessengerChangeRequests.json"
);
const REFUND_REQUESTS_FILE = path.join(DATA_DIR, "refundRequests.json");
const DOC_MAPPING_FILE = path.join(DATA_DIR, "docMapping.json");
const WEB_FORMS_FILE = path.join(DATA_DIR, "webForms.json");
const STAGES_FILE = path.join(DATA_DIR, "stages.json");
const WHATSAPP_CONNECTIONS_DIR = path.join(DATA_DIR, "whatsapp-connections");
const WHATSAPP_WEB_VERSION = String(process.env.WHATSAPP_WEB_VERSION || "2.3000.1042432568-alpha").trim();
const WHATSAPP_WEB_VERSION_CACHE_REMOTE_PATH = String(
  process.env.WHATSAPP_WEB_VERSION_CACHE_REMOTE_PATH ||
    "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html"
).trim();
const WHATSAPP_INCOMING_FILE = path.join(DATA_DIR, "whatsapp-incoming.json");
const CHAT_FILES_DIR = path.join(DATA_DIR, "chats");
const ASSETS_DIR = path.join(DATA_DIR, "assets");
const FRONTEND_BUILD_DIR = path.join(__dirname, "..", "frontend", "build");
const FRONTEND_DIST_DIR = path.join(__dirname, "..", "frontend", "dist");
const STUDENT_CV_DIR = path.join(DATA_DIR, "studentDocs", "cv");
const STUDENT_PERMISSIONS_DIR = path.join(DATA_DIR, "studentDocs", "permissions");
const PAYMENTS_DIR = path.join(DATA_DIR, "payments");
// Resolved via the SPA fallback to `frontend/public/companyIcon.png` (or the
// equivalent file in the production build output).
const DEFAULT_MALE_AVATAR_PATH = "/companyIcon.png";
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_UPLOAD_LABEL = "15MB";
/** Base64 data URLs in JSON need headroom above decoded file size. */
const MAX_JSON_BODY_BYTES = 24 * 1024 * 1024;

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
const DEFAULT_SYSTEM_DATA = {
  counselorCanAcceptPayments: false,
  adminChatEnabled: false,
  branchCountriesEnabled: false,
  branchWhatsappEnabled: false,
  goldLoansAcceptable: true,
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

const PIPELINE_STEPS = [
  "Inquiry", "Registration", "Application", "Interview training",
  "Documentation", "Visa", "Enrolled"
];

const LEGACY_STATUS_TO_CANONICAL = {
  "New Inquiry": "Inquiry", Inquiry: "Inquiry",
  Registration: "Registration", Counseling: "Registration",
  "Uni Application": "Application", Application: "Application",
  "Offer Received": "Interview training", "Interview training": "Interview training",
  Documentation: "Documentation", "Visa Pilot": "Visa", Visa: "Visa",
  Enrolled: "Enrolled"
};

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

const ADMIN_AI_CHAT_MAX_MESSAGES = 200;
const ADMIN_AI_CHAT_MAX_CONTENT = 32000;

const UNIVERSITY_OFFER_STATUSES = new Set(["Unconditional", "Conditional", "Rejected"]);

const PROFILE_OTHER_DOCUMENTS_MAX_SLOT = 25;

const MEETING_REMINDER_MIN_MS = 14 * 60 * 1000;
const MEETING_REMINDER_MAX_MS = 16 * 60 * 1000;
const {
  IS_PRODUCTION,
  HOST,
  WHATSAPP_LAZY_START,
  WARM_JSON_CACHE_ON_START,
  MEETING_REMINDER_POLL_MS,
  BRANCH_ANALYTICS_CACHE_MS,
  ADMIN_AI_CONTEXT_CACHE_MS,
} = require("./runtimeConfig");

module.exports = {
  PORT,
  resolveDataDir,
  DATA_DIR,
  USERS_FILE,
  STUDEMTS_FILE,
  BRANCHES_FILE,
  COUNTRIES_FILE,
  PAYMENT_ACCOUNTS_FILE,
  UNIVERSITY_FILE,
  CHATS_FILE,
  ADMIN_CHATS_FILE,
  ACTIVITIES_FILE,
  MEETING_DATA_FILE,
  SYSTEM_DATA_FILE,
  DEFAULT_SYSTEM_DATA,
  BOOKINGS_FILE,
  APPOINTMENTS_FILE,
  INVOICES_FILE,
  TASKS_FILE,
  REQ_STUDENTS_FILE,
  COUNTRY_CHANGE_REQUESTS_FILE,
  STUDENT_DETAIL_CHANGE_REQUESTS_FILE,
  STUDENT_REMOVAL_REQUESTS_FILE,
  INTAKE_CHANGE_REQUESTS_FILE,
  BRANCH_CHANGE_REQUESTS_FILE,
  BRANCH_WHATSAPP_MESSENGER_CHANGE_REQUESTS_FILE,
  REFUND_REQUESTS_FILE,
  DOC_MAPPING_FILE,
  WEB_FORMS_FILE,
  STAGES_FILE,
  WHATSAPP_CONNECTIONS_DIR,
  WHATSAPP_WEB_VERSION,
  WHATSAPP_WEB_VERSION_CACHE_REMOTE_PATH,
  WHATSAPP_INCOMING_FILE,
  CHAT_FILES_DIR,
  ASSETS_DIR,
  FRONTEND_BUILD_DIR,
  FRONTEND_DIST_DIR,
  STUDENT_CV_DIR,
  STUDENT_PERMISSIONS_DIR,
  PAYMENTS_DIR,
  DEFAULT_MALE_AVATAR_PATH,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  MAX_JSON_BODY_BYTES,
  DEFAULT_DAY_SCHEDULE,
  DEFAULT_MEETING_SETTINGS,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_DISPLAY_NAME,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  APP_PUBLIC_URL,
  STUDENT_SIGN_IN_PATH,
  OPENAI_API_KEY,
  OPENAI_MODEL,
  OPENAI_API_URL,
  OPENAI_MAX_HISTORY_MESSAGES,
  OPENAI_REQUEST_TIMEOUT_MS,
  FORGOT_PASSWORD_OTP_TTL_MS,
  forgotPasswordOtps,
  VISA_OFFICER_ROLE,
  VISA_OFFICER_COUNSELOR_ROLE,
  ALLOWED_ROLES,
  DEFAULT_COUNTRY_NAMES,
  COUNSELOR_ROLES,
  whatsappSessions,
  whatsappSessionRecoveryChains,
  WHATSAPP_RECONNECT_INTERVAL_MS,
  PIPELINE_STEPS,
  LEGACY_STATUS_TO_CANONICAL,
  FALLBACK_EXCHANGE_RATES_LKR,
  EXCHANGE_RATES_API_TTL_MS,
  EXCHANGE_RATES_FETCH_TIMEOUT_MS,
  exchangeRatesApiCache,
  ADMIN_AI_CHAT_MAX_MESSAGES,
  ADMIN_AI_CHAT_MAX_CONTENT,
  UNIVERSITY_OFFER_STATUSES,
  PROFILE_OTHER_DOCUMENTS_MAX_SLOT,
  MEETING_REMINDER_MIN_MS,
  MEETING_REMINDER_MAX_MS,
  MEETING_REMINDER_POLL_MS,
  IS_PRODUCTION,
  HOST,
  WHATSAPP_LAZY_START,
  WARM_JSON_CACHE_ON_START,
  BRANCH_ANALYTICS_CACHE_MS,
  ADMIN_AI_CONTEXT_CACHE_MS,
  ACTIVE_PROFILE,
  COMPANY_NAME,
  COMPANY_NAME_NBSP,
  DEFAULT_SMTP_FROM_NAME,
  buildAdminAiSystemPrompt,
};
