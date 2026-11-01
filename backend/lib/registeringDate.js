function todayLocalIso(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeRegisteringDate(value) {
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

function studentRegisteringDateIso(student) {
  const joined = normalizeRegisteringDate(student?.joinedDate);
  if (joined) return joined;
  const created = String(student?.createdAt || "").trim();
  if (!created) return "";
  const parsed = new Date(created);
  if (Number.isNaN(parsed.getTime())) return "";
  return todayLocalIso(parsed);
}

module.exports = {
  todayLocalIso,
  normalizeRegisteringDate,
  studentRegisteringDateIso,
};
