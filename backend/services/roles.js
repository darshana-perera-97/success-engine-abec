const { COMPANY_NAME } = require("../config");
const { getRoleDisplayName } = require("./roleDisplay");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRoleKey(role) {
  return String(role || "").trim().toLowerCase();
}

function isCounselorRole(role) {
  const normalized = normalizeRoleKey(role);
  return (
    normalized === "counselor" ||
    normalized === "consultor" ||
    normalized === "counsellor" ||
    normalized === "visa officer" ||
    normalized === "visa officer & counselor" ||
    normalized === "visa officer & counsellor"
  );
}

function isCountryCoordinatorRole(role) {
  return String(role || "").trim() === "Country Coordinator";
}

/** Staff who may be linked to students as primary or secondary counselors. */
function isStudentContactStaffRole(role) {
  const normalized = normalizeRoleKey(role);
  return (
    isCounselorRole(role) ||
    isCountryCoordinatorRole(role) ||
    normalized === "admin" ||
    normalized === "manager" ||
    normalized === "team lead"
  );
}

/** Counselors and country coordinators connect their own WhatsApp sessions. */
function isWhatsappIntegratedStaffRole(role) {
  return isCounselorRole(role) || isCountryCoordinatorRole(role);
}

/** Manager, Admin, Team Lead, and Country Coordinator: same portal welcome as counselors but role-specific copy. */
function isStaffWelcomeEmailRole(role) {
  const r = String(role || "").trim();
  return r === "Manager" || r === "Admin" || r === "Team Lead" || r === "Country Coordinator" || r === "Accountant";
}

function staffWelcomeRolePhrase(role) {
  const display = getRoleDisplayName(role);
  if (display === "Country Coordinator") return "country coordinator";
  if (display === "Team Lead") return "team lead";
  if (display === "Manager Level") return "manager level";
  return display.toLowerCase() || "staff";
}

function staffWelcomeEmailCopy(role) {
  const displayRole = getRoleDisplayName(role) || "Staff";
  const phrase = staffWelcomeRolePhrase(role);
  return {
    headline: `Welcome to your ${displayRole} account`,
    pageTitle: `${displayRole} portal access`,
    rolePhrase: phrase,
    tagline: `${COMPANY_NAME} — ${phrase} portal access`,
    subject: `Welcome to ${COMPANY_NAME} — your ${displayRole} account`,
  };
}

function normalizeStoredRole(role) {
  if (role === "Counselor" || role === "Consultor") return "Consultor";
  return role;
}

function normalizeLoginRole(role) {
  if (role === "Consultor") return "Counselor";
  return role;
}

module.exports = {
  normalizeEmail,
  normalizeRoleKey,
  isCounselorRole,
  isCountryCoordinatorRole,
  isStudentContactStaffRole,
  isWhatsappIntegratedStaffRole,
  isStaffWelcomeEmailRole,
  staffWelcomeRolePhrase,
  staffWelcomeEmailCopy,
  normalizeStoredRole,
  normalizeLoginRole,
};
