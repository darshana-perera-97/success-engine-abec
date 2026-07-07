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

/** Roles that connect and send from their own WhatsApp account (counselor-style integration). */
export function isWhatsappIntegrationRole(role) {
  return isCounselorEquivalentPortalRole(role) || String(role || "").trim() === "Country Coordinator";
}

const PRIMARY_COUNSELOR_LEADERSHIP_PORTAL_ROLES = new Set(["Admin", "Manager", "Team Lead"]);

/** Staff who may be linked to students as primary or secondary counselors. */
export function isStudentContactStaffAccountRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return (
    isCounselorEquivalentAccountRole(role) ||
    normalized === "country coordinator" ||
    normalized === "admin" ||
    normalized === "manager" ||
    normalized === "team lead"
  );
}

/** Portal roles that may be assigned as a student's primary counselor (including self-assign on intake). */
export function canActAsPrimaryCounselorPortalRole(role) {
  const r = String(role || "").trim();
  return isStudentMessagingStaffRole(r) || PRIMARY_COUNSELOR_LEADERSHIP_PORTAL_ROLES.has(r);
}

/** Portal role with counselor-style student messaging (send + receive, not ghost mode). */
export function isStudentMessagingStaffRole(role) {
  return isCounselorEquivalentPortalRole(role) || String(role || "").trim() === "Country Coordinator";
}

/** Admin messaging setting unlocks Omni-Channel send + Integrations for these roles. */
export function isStaffOmniChannelMessenger(role, adminChatEnabled = false) {
  if (adminChatEnabled !== true) return false;
  return STAFF_OMNI_CHANNEL_ROLES.has(String(role || "").trim());
}

/** Leadership may reply in Omni-Channel (not ghost mode) when staff chat or branch WhatsApp is enabled. */
export function canSendStaffStudentMessages(role, adminChatEnabled = false, branchWhatsappEnabled = false) {
  if (isStaffOmniChannelMessenger(role, adminChatEnabled)) return true;
  if (branchWhatsappEnabled === true && isBranchWhatsappManagerRole(role)) return true;
  return false;
}

/** Manager / Team Lead may link branch WhatsApp when branch mode is enabled. */
export function isBranchWhatsappManagerRole(role) {
  const r = String(role || "").trim();
  return r === "Manager" || r === "Team Lead";
}

/** Counselors and coordinators who may view but not connect branch WhatsApp. */
export function isBranchWhatsappViewerRole(role) {
  return isWhatsappIntegrationRole(role) && !isBranchWhatsappManagerRole(role);
}

/** Roles that can open Integrations and poll WhatsApp status in the navbar. */
export function canAccessWhatsappIntegration(role, adminChatEnabled = false, branchWhatsappEnabled = false) {
  if (isWhatsappIntegrationRole(role)) return true;
  if (isStaffOmniChannelMessenger(role, adminChatEnabled)) return true;
  if (branchWhatsappEnabled === true && isBranchWhatsappManagerRole(role)) return true;
  if (branchWhatsappEnabled === true && String(role || "").trim() === "Admin") return true;
  return false;
}
