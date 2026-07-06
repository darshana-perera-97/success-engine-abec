export function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\?/g, "")
    .replace(/\s+/g, "_");
}

export function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

export function normalizePhone(rawPhone, rawWorkPhone) {
  const primary = cellText(rawPhone);
  const fallback = cellText(rawWorkPhone);
  let phone = primary || fallback;
  if (!phone || phone === "-") return "";
  if (/^\+/.test(phone)) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("7")) return `+94${digits}`;
  if (digits.length === 10 && digits.startsWith("7")) return `+94${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+94${digits.slice(1)}`;
  if (digits.length >= 10) return `+${digits}`;
  return phone;
}

export function titleCaseWords(value) {
  return String(value || "")
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function matchBranchLocation(rawBranch, branchLocations) {
  const key = cellText(rawBranch).toLowerCase();
  if (!key) return "";
  const exact = (branchLocations || []).find((loc) => String(loc).trim().toLowerCase() === key);
  if (exact) return exact;
  const partial = (branchLocations || []).find((loc) => {
    const normalized = String(loc).trim().toLowerCase();
    return normalized.includes(key) || key.includes(normalized);
  });
  return partial || titleCaseWords(key);
}

export function parseCreatedTime(raw) {
  const text = cellText(raw);
  if (!text) return new Date().toISOString();
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

export function buildPlaceholderEmail(metaLeadId, name) {
  const idPart = cellText(metaLeadId).replace(/\W+/g, "") || Date.now().toString(36);
  const namePart = cellText(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 24);
  return `lead.${namePart || "student"}.${idPart}@imported.local`;
}
