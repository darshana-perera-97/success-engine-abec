/**
 * Normalizes the API base URL from the active profile's companyConfig.js
 * (selected via ACTIVE_PROFILE in profileConfig.js).
 */
function normalizeApiBaseUrl(base) {
  let url = String(base || "").trim().replace(/\/+$/, "");
  if (!url) return url;
  // Hosted APIs redirect HTTP → HTTPS; browsers may drop the POST body on redirect.
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      parsed.protocol = "https:";
      url = parsed.toString().replace(/\/+$/, "");
    }
  } catch {
    // Keep original string if it is not a valid absolute URL.
  }
  return url;
}

export function resolveApiBase(apiBaseFromProfile) {
  const explicit = String(process.env.REACT_APP_API_BASE || "").trim();
  if (explicit) return normalizeApiBaseUrl(explicit);

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return normalizeApiBaseUrl("http://localhost:3334");
    }
    const { protocol, host: fullHost } = window.location;
    if (fullHost && !fullHost.includes(":")) {
      return normalizeApiBaseUrl(`${protocol}//${fullHost}`);
    }
  }

  return normalizeApiBaseUrl(apiBaseFromProfile);
}

/** Backend paths stored relative to the API host (see exportStudentDocumentsZip). */
export const BACKEND_RELATIVE_PREFIXES = [
  "/student-docs/",
  "/payments/",
  "/chat-files/",
  "/assets/",
];

/** Prefix relative backend file paths with the active profile API_BASE. */
export function toAbsoluteBackendUrl(path, apiBase) {
  if (!path) return path;
  const value = String(path).trim();
  if (!value) return value;
  if (BACKEND_RELATIVE_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return `${String(apiBase || "").replace(/\/+$/, "")}${value}`;
  }
  return path;
}
