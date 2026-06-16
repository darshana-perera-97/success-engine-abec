const { ROLE_DISPLAY_NAMES } = require("../profileConfig");

function getRoleDisplayName(role) {
  const r = String(role || "").trim();
  if (!r) return r;
  return ROLE_DISPLAY_NAMES[r] || r;
}

function isTeamLeadAssignableAccountRole(role) {
  const r = String(role || "").trim();
  if (r === "Team Lead") return true;
  if (r === "Manager" && ROLE_DISPLAY_NAMES.Manager === "Team Lead") return true;
  return false;
}

module.exports = {
  getRoleDisplayName,
  isTeamLeadAssignableAccountRole,
};
