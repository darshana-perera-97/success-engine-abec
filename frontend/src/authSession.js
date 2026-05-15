const SESSION_KEY = "abec-session";
const SESSION_USER_KEY = "abec-session-user";

/** Backend stores "Consultor"; portal UI and counselor logic use "Counselor". */
export function normalizePortalRole(role) {
  const r = String(role || "").trim();
  if (r === "Consultor") return "Counselor";
  return role;
}

export function clearLoginSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_USER_KEY);
}

export function saveLoginSession(user = null) {
  sessionStorage.setItem(SESSION_KEY, "1");
  if (user) {
    const next = user && typeof user === "object" && user.role != null
      ? { ...user, role: normalizePortalRole(user.role) }
      : user;
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(next));
  } else {
    sessionStorage.removeItem(SESSION_USER_KEY);
  }
}

export function hasLoginSession() {
  return typeof sessionStorage !== "undefined" && sessionStorage.getItem(SESSION_KEY) === "1";
}

export function getLoginSessionUser() {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_USER_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    if (user && typeof user === "object" && user.role != null) {
      return { ...user, role: normalizePortalRole(user.role) };
    }
    return user;
  } catch {
    return null;
  }
}
