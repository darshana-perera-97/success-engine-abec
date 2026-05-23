const STORAGE_PREFIX = "portal-dismissed-notifications";

const storageKeyForUser = (userKey) => {
  const id = String(userKey || "").trim();
  if (!id) return "";
  return `${STORAGE_PREFIX}:${id}`;
};

export const loadDismissedNotificationKeys = (userKey) => {
  const storageKey = storageKeyForUser(userKey);
  if (!storageKey || typeof window === "undefined") return /* @__PURE__ */ new Set();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return /* @__PURE__ */ new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return /* @__PURE__ */ new Set();
    return new Set(parsed.map((k) => String(k || "").trim()).filter(Boolean));
  } catch {
    return /* @__PURE__ */ new Set();
  }
};

export const saveDismissedNotificationKeys = (userKey, keys) => {
  const storageKey = storageKeyForUser(userKey);
  if (!storageKey || typeof window === "undefined") return;
  try {
    const list = Array.from(keys).map((k) => String(k || "").trim()).filter(Boolean);
    window.localStorage.setItem(storageKey, JSON.stringify(list.slice(0, 500)));
  } catch {
    /* ignore quota / privacy errors */
  }
};

export const mergeDismissedNotificationKeys = (userKey, existingSet, keysToAdd) => {
  const next = new Set(existingSet);
  for (const key of keysToAdd) {
    const normalized = String(key || "").trim();
    if (normalized) next.add(normalized);
  }
  saveDismissedNotificationKeys(userKey, next);
  return next;
};
