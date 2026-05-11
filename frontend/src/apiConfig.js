// export const API_BASE = "http://13.235.8.144:3334";
export const API_BASE = "https://abec-dev.nexgenai.asia";
// export const API_BASE = "http://localhost:3334";

// Default avatar shown for any user (admin, counsellor, student, etc.)
// when they don't have a custom avatar uploaded. Place the actual image at
// `frontend/public/companyIcon.png`.
export const DEFAULT_USER_AVATAR = "/companyIcon.png";

export function toAbsoluteAssetUrl(path) {
  if (!path) return path;
  if (String(path).startsWith("/assets/")) {
    return `${API_BASE}${path}`;
  }
  return path;
}
