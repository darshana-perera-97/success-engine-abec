import { toAbsoluteAssetUrl } from "./apiConfig";

export function normalizeCounselorRoleDisplay(role) {
  const value = String(role || "").trim();
  if (!value) return "Counselor";
  return value.toLowerCase() === "consultor" ? "Counselor" : value;
}

export function isVisaAgentEmployee(emp) {
  const r = String(emp?.role || emp?.position || "").toLowerCase();
  return r.includes("visa");
}

function resolveEmployee(employees, id) {
  const s = String(id || "").trim();
  if (!s) return null;
  return employees.find((e) => String(e.id || "").trim() === s) || null;
}

/**
 * Ordered counselor roster: enrolling (inquiry), primary, previous transfers — deduped with role badges.
 */
export function buildCounselorTeamEntries(student, employees) {
  const inquiry = String(student.inquiryCounselorId || "").trim();
  const primary = String(student.counselor || "").trim();
  const history = Array.isArray(student.counselorHistory) ? student.counselorHistory.map((id) => String(id || "").trim()).filter(Boolean) : [];
  const badgesById = /* @__PURE__ */ new Map();
  const addBadge = (id, badge) => {
    if (!id || id.toLowerCase() === "unassigned") return;
    if (!badgesById.has(id)) badgesById.set(id, []);
    const arr = badgesById.get(id);
    if (!arr.includes(badge)) arr.push(badge);
  };
  addBadge(inquiry, "Enrolling");
  addBadge(primary, "Primary");
  for (const hid of history) addBadge(hid, "Previous");
  const orderedIds = [];
  const pushUnique = (id) => {
    const sid = String(id || "").trim();
    if (!sid || sid.toLowerCase() === "unassigned") return;
    if (!badgesById.has(sid)) return;
    if (!orderedIds.includes(sid)) orderedIds.push(sid);
  };
  pushUnique(inquiry);
  pushUnique(primary);
  for (const hid of history) pushUnique(hid);
  for (const id of badgesById.keys()) pushUnique(id);
  return orderedIds.map((id) => {
    const emp = resolveEmployee(employees, id);
    const badges = badgesById.get(id) || [];
    return {
      id,
      badges,
      badgeLabel: badges.join(" · "),
      name: emp?.name || emp?.username || String(student.counselorName || "").trim() || "Counselor",
      role: normalizeCounselorRoleDisplay(emp?.role || emp?.position || student.counselorRole),
      email: emp?.email || student.counselorEmail || "Not available",
      phone: emp?.phone || student.counselorPhone || "Not available",
      avatar: toAbsoluteAssetUrl(emp?.avatar || student.counselorAvatar || "")
    };
  });
}

function isAssignedCounselorId(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized !== "" && normalized !== "unassigned" && normalized !== "none" && normalized !== "null";
}

/**
 * Build a partial student update that unlinks a counselor from all roles on the record.
 */
export function buildStudentCounselorRemovalPatch(student, counselorId) {
  const id = String(counselorId || "").trim();
  if (!id || !isAssignedCounselorId(id)) return null;

  const patch = {};
  const inquiry = String(student?.inquiryCounselorId || "").trim();
  const primary = String(student?.counselor || "").trim();
  const history = Array.isArray(student?.counselorHistory)
    ? student.counselorHistory.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  if (inquiry === id) {
    patch.inquiryCounselorId = "";
  }
  if (primary === id) {
    patch.counselor = "Unassigned";
    patch.counselorName = "";
  }
  const nextHistory = history.filter((entry) => entry !== id);
  if (nextHistory.length !== history.length) {
    patch.counselorHistory = nextHistory;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export function buildCounselorTeamEntriesWithFallback(student, employees) {
  const built = buildCounselorTeamEntries(student, employees);
  if (built.length > 0) return built;
  const primary = String(student.counselor || "").trim();
  if (!primary || primary.toLowerCase() === "unassigned") return [];
  const emp = resolveEmployee(employees, primary);
  return [
    {
      id: primary,
      badges: ["Primary"],
      badgeLabel: "Primary",
      name: emp?.name || emp?.username || String(student.counselorName || "").trim() || "Assigned Counselor",
      role: normalizeCounselorRoleDisplay(emp?.role || emp?.position || student.counselorRole),
      email: emp?.email || student.counselorEmail || "Not available",
      phone: emp?.phone || student.counselorPhone || "Not available",
      avatar: toAbsoluteAssetUrl(emp?.avatar || student.counselorAvatar || "")
    }
  ];
}

/**
 * Student dashboard "Your counselors": only staff linked on the student record —
 * enrolling (inquiry), primary assigned counselor, and previous transfers.
 */
export function buildStudentDashboardCounselorRoster(student, employees) {
  return buildCounselorTeamEntriesWithFallback(student, employees);
}

export function normalizeVisaAgentIds(student) {
  const raw = student.visaAgentIds ?? student.visaAgentId;
  if (Array.isArray(raw)) return raw.map((id) => String(id || "").trim()).filter(Boolean);
  const single = String(raw || "").trim();
  return single ? [single] : [];
}

export function buildVisaAgentEntries(student, employees) {
  const ids = normalizeVisaAgentIds(student);
  return ids.map((id) => {
    const emp = resolveEmployee(employees, id);
    return {
      id,
      name: emp?.name || emp?.username || "Visa agent",
      role: normalizeCounselorRoleDisplay(emp?.role || emp?.position || "Visa Agent"),
      email: emp?.email || "Not available",
      phone: emp?.phone || "Not available",
      avatar: toAbsoluteAssetUrl(emp?.avatar || "")
    };
  });
}
