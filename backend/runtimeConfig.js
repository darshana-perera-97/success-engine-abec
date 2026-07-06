/**
 * Runtime tuning for EC2 production (4 vCPU / 8 GB, ~20 concurrent users)
 * vs local development. Override any value via environment variables.
 */

function envBool(name, defaultValue) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return defaultValue;
}

const NODE_ENV = String(process.env.NODE_ENV || "development").trim();
const IS_PRODUCTION = NODE_ENV === "production";

/** Bind address: production listens on all interfaces; dev stays on localhost. */
const HOST =
  String(process.env.HOST || "").trim() ||
  (IS_PRODUCTION ? "0.0.0.0" : "127.0.0.1");

/** Defer Puppeteer/WhatsApp until a user opens Integration or sends a message. Saves ~100–300 MB per session at boot. */
const WHATSAPP_LAZY_START = envBool("WHATSAPP_LAZY_START", false);

/** Warm in-memory JSON cache on boot so first user requests are fast. */
const WARM_JSON_CACHE_ON_START = envBool("WARM_JSON_CACHE_ON_START", IS_PRODUCTION);

/** Background reminder poll (meeting + inquiry calls). */
const MEETING_REMINDER_POLL_MS =
  parseInt(process.env.MEETING_REMINDER_POLL_MS || "", 10) ||
  (IS_PRODUCTION ? 120_000 : 60_000);

/** Branch analytics cache TTL (ms). */
const BRANCH_ANALYTICS_CACHE_MS =
  parseInt(process.env.BRANCH_ANALYTICS_CACHE_MS || "", 10) ||
  (IS_PRODUCTION ? 300_000 : 60_000);

/** Admin AI context cache TTL (ms). */
const ADMIN_AI_CONTEXT_CACHE_MS =
  parseInt(process.env.ADMIN_AI_CONTEXT_CACHE_MS || "", 10) ||
  (IS_PRODUCTION ? 60_000 : 0);

module.exports = {
  NODE_ENV,
  IS_PRODUCTION,
  HOST,
  WHATSAPP_LAZY_START,
  WARM_JSON_CACHE_ON_START,
  MEETING_REMINDER_POLL_MS,
  BRANCH_ANALYTICS_CACHE_MS,
  ADMIN_AI_CONTEXT_CACHE_MS,
};
