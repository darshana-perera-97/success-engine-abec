const ENROLLMENT_STATUSES = ["active", "diverted", "dropped"];
const REQUESTABLE_ENROLLMENT_STATUSES = ["active", "dropped"];

function normalizeEnrollmentStatus(value, fallback = "active") {
  const key = String(value || "").trim().toLowerCase();
  if (key === "active" || key === "diverted" || key === "dropped") return key;
  return fallback;
}

function formatEnrollmentStatusLabel(value) {
  const key = normalizeEnrollmentStatus(value);
  if (key === "diverted") return "Diverted";
  if (key === "dropped") return "Dropped";
  return "Active";
}

module.exports = {
  ENROLLMENT_STATUSES,
  REQUESTABLE_ENROLLMENT_STATUSES,
  normalizeEnrollmentStatus,
  formatEnrollmentStatusLabel,
};
