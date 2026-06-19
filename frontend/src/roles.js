/** Portal role for visa-focused staff with counselor-level access. */
export const VISA_OFFICER_ROLE = "Visa Officer";
/** Portal role combining visa and counseling duties; same access as Counselor. */
export const VISA_OFFICER_COUNSELOR_ROLE = "Visa Officer & Counselor";
/** Branch-scoped finance role: dashboard, students, and invoices only. */
export const ACCOUNTANT_ROLE = "Accountant";

export const COUNSELOR_EQUIVALENT_PORTAL_ROLES = new Set([
  "Counselor",
  VISA_OFFICER_ROLE,
  VISA_OFFICER_COUNSELOR_ROLE,
]);

/** Backend may store legacy counselor accounts as Consultor. */
export function isCounselorEquivalentAccountRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return (
    normalized === "counselor" ||
    normalized === "consultor" ||
    normalized === "counsellor" ||
    normalized === "visa officer" ||
    normalized === "visa officer & counselor" ||
    normalized === "visa officer & counsellor"
  );
}

/** After authSession normalizePortalRole (Consultor → Counselor). */
export function isCounselorEquivalentPortalRole(role) {
  const r = String(role || "").trim();
  if (r === "Consultor") return true;
  return COUNSELOR_EQUIVALENT_PORTAL_ROLES.has(r);
}

export function isRecognizedPortalRole(role) {
  const r = String(role || "").trim();
  return (
    r === "Admin" ||
    r === "Manager" ||
    r === "Team Lead" ||
    r === "Country Coordinator" ||
    r === ACCOUNTANT_ROLE ||
    r === "Student" ||
    isCounselorEquivalentPortalRole(r)
  );
}

const STAFF_OMNI_CHANNEL_ROLES = new Set(["Admin", "Manager", "Team Lead"]);

/** Admin messaging setting unlocks Omni-Channel send + Integrations for these roles. */
export function isStaffOmniChannelMessenger(role, adminChatEnabled = false) {
  if (adminChatEnabled !== true) return false;
  return STAFF_OMNI_CHANNEL_ROLES.has(String(role || "").trim());
}
