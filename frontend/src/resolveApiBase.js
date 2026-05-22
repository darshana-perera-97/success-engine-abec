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
  return normalizeApiBaseUrl(apiBaseFromProfile);
}
