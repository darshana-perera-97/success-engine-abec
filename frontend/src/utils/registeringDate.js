export function todayLocalIso(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function normalizeRegisteringDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return raw;
}

export function formatRegisteringDate(value) {
  const iso = normalizeRegisteringDate(value);
  if (iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { dateStyle: "medium" });
  }
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function studentRegisteringDateIso(student) {
  const joined = normalizeRegisteringDate(student?.joinedDate);
  if (joined) return joined;
  const created = String(student?.createdAt || "").trim();
  if (!created) return "";
  const parsed = new Date(created);
  if (Number.isNaN(parsed.getTime())) return "";
  return todayLocalIso(parsed);
}

export function formatStudentRegisteringDate(student, emptyLabel = "—") {
  const iso = studentRegisteringDateIso(student);
  if (!iso) return emptyLabel;
  return formatRegisteringDate(iso);
}
