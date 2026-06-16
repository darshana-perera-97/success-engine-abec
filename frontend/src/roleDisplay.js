import { ROLE_DISPLAY_NAMES } from "./profileConfig";

/** Profile-specific label for a stored account/portal role (canonical role unchanged). */
export function getRoleDisplayName(role) {
  const r = String(role || "").trim();
  if (!r) return r;
  return ROLE_DISPLAY_NAMES[r] || r;
}

/** Accounts that may be assigned as a counselor's team lead (stored role, not display label). */
export function isTeamLeadAssignableAccountRole(role) {
  const r = String(role || "").trim();
  if (r === "Team Lead") return true;
  if (r === "Manager" && ROLE_DISPLAY_NAMES.Manager === "Team Lead") return true;
  return false;
}
