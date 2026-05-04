const SESSION_KEY = "abec-session";
const SESSION_USER_KEY = "abec-session-user";

export function clearLoginSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_USER_KEY);
}

export function saveLoginSession(user = null) {
  sessionStorage.setItem(SESSION_KEY, "1");
  if (user) {
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
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
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
