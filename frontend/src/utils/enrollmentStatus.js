export function normalizeEnrollmentStatus(value, fallback = "active") {
  const key = String(value || "").trim().toLowerCase();
  if (key === "active" || key === "diverted" || key === "dropped") return key;
  return fallback;
}

export function formatEnrollmentStatusLabel(value) {
  const key = normalizeEnrollmentStatus(value);
  if (key === "diverted") return "Diverted";
  if (key === "dropped") return "Dropped";
  return "Active";
}

export function enrollmentStatusBadgeClass(value) {
  const key = normalizeEnrollmentStatus(value);
  if (key === "diverted") return "bg-amber-50 text-amber-800 border-amber-200";
  if (key === "dropped") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}
