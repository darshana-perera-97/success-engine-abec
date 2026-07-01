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
 * Ordered counselor roster: current primary counselor/visa officer first, then secondary staff.
 */
export function buildCounselorTeamEntries(student, employees) {
  const inquiry = String(student.inquiryCounselorId || "").trim();
  const primary = String(student.counselor || "").trim();
  const history = Array.isArray(student.counselorHistory) ? student.counselorHistory.map((id) => String(id || "").trim()).filter(Boolean) : [];
  const visaAgentIds = normalizeVisaAgentIds(student);
  const badgesById = /* @__PURE__ */ new Map();
  const addBadge = (id, badge) => {
    if (!isAssignedCounselorId(id)) return;
    if (!badgesById.has(id)) badgesById.set(id, []);
    const arr = badgesById.get(id);
    if (!arr.includes(badge)) arr.push(badge);
  };
  if (isAssignedCounselorId(primary)) {
    addBadge(primary, "Primary");
  }
  if (isAssignedCounselorId(inquiry) && inquiry !== primary) {
    addBadge(inquiry, "Secondary");
  }
  for (const hid of history) {
    if (hid !== primary) addBadge(hid, "Secondary");
  }
  for (const visaId of visaAgentIds) {
    if (visaId !== primary) addBadge(visaId, "Secondary");
  }
  const orderedIds = [];
  const pushUnique = (id) => {
    const sid = String(id || "").trim();
    if (!isAssignedCounselorId(sid)) return;
    if (!badgesById.has(sid)) return;
    if (!orderedIds.includes(sid)) orderedIds.push(sid);
  };
  pushUnique(primary);
  pushUnique(inquiry);
  for (const hid of history) pushUnique(hid);
  for (const visaId of visaAgentIds) pushUnique(visaId);
  for (const id of badgesById.keys()) pushUnique(id);
  return orderedIds.map((id) => {
    const emp = resolveEmployee(employees, id);
    const badges = badgesById.get(id) || [];
    const isPrimary = badges.includes("Primary");
    const fallbackName = isPrimary ? String(student.counselorName || "").trim() : "";
    return {
      id,
      badges,
      isPrimary,
      badgeLabel: badges.join(" · "),
      name: emp?.name || emp?.username || fallbackName || (isVisaAgentEmployee(emp) ? "Visa Officer" : "Counselor"),
      role: normalizeCounselorRoleDisplay(emp?.role || emp?.position || (isPrimary ? student.counselorRole : "")),
      email: emp?.email || (isPrimary ? student.counselorEmail : "") || "Not available",
      phone: emp?.phone || (isPrimary ? student.counselorPhone : "") || "Not available",
      avatar: toAbsoluteAssetUrl(emp?.avatar || (isPrimary ? student.counselorAvatar : "") || "")
    };
  });
}

export function isAssignedCounselorId(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized !== "" && normalized !== "unassigned" && normalized !== "none" && normalized !== "null";
}

function isCounselorStillLinkedOnStudent(student, counselorId) {
  const targetNorm = String(counselorId || "").trim().toLowerCase();
  if (!targetNorm) return false;
  return getAssignedCounselorIds(student).some((id) => id.toLowerCase() === targetNorm);
}

/**
 * When primary counselor changes, move every previously linked counselor into
 * counselorHistory (except the new primary) so nobody loses student access.
 */
export function buildCounselorTransferHistory(student, nextCounselorId, previousCounselorId = null) {
  const next = String(nextCounselorId ?? "").trim();
  const nextNorm = next.toLowerCase();
  if (!isAssignedCounselorId(next)) {
    return Array.isArray(student?.counselorHistory)
      ? student.counselorHistory.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
  }

  const snapshot =
    previousCounselorId != null
      ? { ...student, counselor: String(previousCounselorId || "").trim() || student?.counselor }
      : student;
  const linked = getAssignedCounselorIds(snapshot);
  const existingHistory = Array.isArray(student?.counselorHistory)
    ? student.counselorHistory.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const nextHistory = [...existingHistory, ...linked].filter(
    (id) => isAssignedCounselorId(id) && String(id).trim().toLowerCase() !== nextNorm
  );
  return Array.from(new Set(nextHistory));
}

export function buildCounselorReassignPatch(student, nextCounselorId, nextCounselorName = "", employees = []) {
  const nextId = String(nextCounselorId || "").trim();
  if (!nextId || !isAssignedCounselorId(nextId)) return null;
  const prevId = String(student?.counselor || "").trim();
  if (prevId === nextId) return null;
  const resolvedName =
    String(nextCounselorName || "").trim() ||
    resolveCounselorDisplayName(nextId, employees) ||
    String(student?.counselorName || "").trim();
  return {
    counselor: nextId,
    counselorName: resolvedName,
    counselorHistory: buildCounselorTransferHistory(student, nextId, prevId),
  };
}

export function isCounselorLinkedOnStudent(student, counselorId) {
  const norm = String(counselorId || "").trim().toLowerCase();
  if (!norm) return false;
  return getAssignedCounselorIds(student).some((id) => id.toLowerCase() === norm);
}

/** Add another counselor to counselorHistory without changing the primary counselor. */
export function buildAddSecondaryCounselorPatch(student, counselorId) {
  const id = String(counselorId || "").trim();
  if (!id || !isAssignedCounselorId(id)) return null;
  if (isCounselorLinkedOnStudent(student, id)) return null;
  const history = Array.isArray(student?.counselorHistory)
    ? student.counselorHistory.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  return { counselorHistory: Array.from(new Set([...history, id])) };
}

/** Unique counselor IDs linked on the student (enrolling, primary, previous). */
export function getAssignedCounselorIds(student) {
  const byNorm = /* @__PURE__ */ new Map();
  const add = (value) => {
    const id = String(value || "").trim();
    if (!isAssignedCounselorId(id)) return;
    const norm = id.toLowerCase();
    if (!byNorm.has(norm)) byNorm.set(norm, id);
  };
  add(student?.inquiryCounselorId);
  add(student?.counselor);
  const history = Array.isArray(student?.counselorHistory) ? student.counselorHistory : [];
  for (const entry of history) add(entry);
  return [...byNorm.values()];
}

export function wouldStudentHaveNoCounselorsAfterRemoval(student, counselorId) {
  const targetNorm = String(counselorId || "").trim().toLowerCase();
  if (!targetNorm) return false;
  const ids = getAssignedCounselorIds(student);
  if (!ids.some((id) => id.toLowerCase() === targetNorm)) return false;
  return ids.length <= 1;
}

function resolveCounselorDisplayName(counselorId, employees) {
  const id = String(counselorId || "").trim();
  if (!id) return "";
  const emp = Array.isArray(employees)
    ? employees.find((entry) => String(entry?.id || "").trim() === id)
    : null;
  return String(emp?.name || emp?.username || "").trim();
}

/**
 * Pick the next primary counselor after one is removed: enrolling (inquiry) first, then previous transfers.
 */
export function pickNextPrimaryCounselorId(student, removedCounselorId, afterRemoval = {}) {
  const removedNorm = String(removedCounselorId || "").trim().toLowerCase();
  const isRemoved = (value) => String(value || "").trim().toLowerCase() === removedNorm;

  const inquiry = Object.prototype.hasOwnProperty.call(afterRemoval, "inquiryCounselorId")
    ? String(afterRemoval.inquiryCounselorId || "").trim()
    : String(student?.inquiryCounselorId || "").trim();
  if (isAssignedCounselorId(inquiry) && !isRemoved(inquiry)) return inquiry;

  const history = Object.prototype.hasOwnProperty.call(afterRemoval, "counselorHistory")
    ? afterRemoval.counselorHistory
    : Array.isArray(student?.counselorHistory)
      ? student.counselorHistory.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];
  for (const entry of history) {
    const historyId = String(entry || "").trim();
    if (isAssignedCounselorId(historyId) && !isRemoved(historyId)) return historyId;
  }
  return "";
}

/**
 * Build a partial student update that unlinks a counselor from all roles on the record.
 */
export function buildStudentCounselorRemovalPatch(student, counselorId, employees = []) {
  const id = String(counselorId || "").trim();
  if (!id || !isAssignedCounselorId(id)) return null;
  if (wouldStudentHaveNoCounselorsAfterRemoval(student, id)) return null;

  const patch = {};
  const inquiry = String(student?.inquiryCounselorId || "").trim();
  const primary = String(student?.counselor || "").trim();
  const history = Array.isArray(student?.counselorHistory)
    ? student.counselorHistory.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  if (inquiry === id) {
    patch.inquiryCounselorId = "";
  }
  const nextHistory = history.filter((entry) => entry !== id);
  if (nextHistory.length !== history.length) {
    patch.counselorHistory = nextHistory;
  }

  if (primary === id) {
    const afterRemoval = {
      inquiryCounselorId: Object.prototype.hasOwnProperty.call(patch, "inquiryCounselorId")
        ? patch.inquiryCounselorId
        : inquiry,
      counselorHistory: Object.prototype.hasOwnProperty.call(patch, "counselorHistory")
        ? patch.counselorHistory
        : nextHistory,
    };
    const nextPrimary = pickNextPrimaryCounselorId(student, id, afterRemoval);
    if (nextPrimary) {
      patch.counselor = nextPrimary;
      patch.counselorName = resolveCounselorDisplayName(nextPrimary, employees);
      if (nextPrimary !== inquiry && history.includes(nextPrimary)) {
        patch.counselorHistory = nextHistory.filter((entry) => entry !== nextPrimary);
      }
    } else {
      patch.counselor = "Unassigned";
      patch.counselorName = "";
    }
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
      isPrimary: true,
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
