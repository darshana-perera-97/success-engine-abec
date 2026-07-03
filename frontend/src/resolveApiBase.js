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

function isLocalhostHostname(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

function isLocalhostApiBase(base) {
  try {
    return isLocalhostHostname(new URL(base).hostname);
  } catch {
    return /localhost|127\.0\.0\.1/.test(String(base || ""));
  }
}

export function resolveApiBase(apiBaseFromProfile) {
  const explicit = String(process.env.REACT_APP_API_BASE || "").trim();
  if (explicit) return normalizeApiBaseUrl(explicit);

  const profileBase = normalizeApiBaseUrl(apiBaseFromProfile);

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (isLocalhostHostname(host)) {
      const useLocalBackend =
        String(process.env.REACT_APP_USE_LOCAL_BACKEND || "").trim().toLowerCase() === "true";
      if (useLocalBackend || isLocalhostApiBase(profileBase)) {
        return normalizeApiBaseUrl("http://localhost:3334");
      }
      return profileBase;
    }
    const { protocol, host: fullHost } = window.location;
    if (fullHost && !fullHost.includes(":")) {
      return normalizeApiBaseUrl(`${protocol}//${fullHost}`);
    }
  }

  return profileBase;
}

/** Backend paths stored relative to the API host (see exportStudentDocumentsZip). */
export const BACKEND_RELATIVE_PREFIXES = [
  "/student-docs/",
  "/payments/",
  "/chat-files/",
  "/assets/",
];

/** Extract a known backend-relative path from a stored URL (relative or absolute). */
export function extractBackendRelativePath(path) {
  const value = String(path || "").trim();
  if (!value) return null;

  for (const prefix of BACKEND_RELATIVE_PREFIXES) {
    if (value.startsWith(prefix)) return value;
  }

  try {
    const parsed = new URL(value);
    const pathname = `${parsed.pathname || ""}${parsed.search || ""}${parsed.hash || ""}`;
    for (const prefix of BACKEND_RELATIVE_PREFIXES) {
      if (pathname.startsWith(prefix)) return pathname;
    }
  } catch {
    // Fall through to embedded-path search below.
  }

  for (const prefix of BACKEND_RELATIVE_PREFIXES) {
    const idx = value.indexOf(prefix);
    if (idx !== -1) return value.slice(idx);
  }

  return null;
}

/** Prefix relative backend file paths with the active profile API_BASE. */
export function toAbsoluteBackendUrl(path, apiBase) {
  if (!path) return path;
  const value = String(path).trim();
  if (!value) return value;

  const relativePath = extractBackendRelativePath(value);
  if (relativePath) {
    return `${String(apiBase || "").replace(/\/+$/, "")}${relativePath}`;
  }

  return path;
}
