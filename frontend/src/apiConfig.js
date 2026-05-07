export const API_BASE = "http://13.235.8.144:3334";
// export const API_BASE = "http://13.235.8.144:3334";
// export const API_BASE = "http://localhost:3334";

export function toAbsoluteAssetUrl(path) {
  if (!path) return path;
  if (String(path).startsWith("/assets/")) {
    return `${API_BASE}${path}`;
  }
  return path;
}
