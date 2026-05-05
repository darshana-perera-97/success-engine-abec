/**
 * Canonical student pipeline stages and per-stage SLAs (see product spec).
 * Legacy CRM status strings are normalized for display and escalation logic.
 */

export const PIPELINE_STEPS = [
  "Inquiry",
  "Application",
  "Interview training",
  "Documentation",
  "Visa",
  "Enrolled"
];

/** Maps historical UI statuses to the canonical stage names. */
export const LEGACY_STATUS_TO_CANONICAL = {
  "New Inquiry": "Inquiry",
  Inquiry: "Inquiry",
  Counseling: "Application",
  "Uni Application": "Application",
  Application: "Application",
  "Offer Received": "Interview training",
  "Interview training": "Interview training",
  Documentation: "Documentation",
  "Visa Pilot": "Visa",
  Visa: "Visa",
  Enrolled: "Enrolled"
};

/** Per-stage SLA and ownership (for labels and routing). */
export const STAGE_CONFIG = {
  Inquiry: {
    slaMs: 60 * 60 * 1000,
    slaLabel: "1 hour",
    owners: "Counsellor",
    detail: "Leads followed up within 1 hour"
  },
  Application: {
    slaMs: 24 * 60 * 60 * 1000,
    slaLabel: "24 hours",
    owners: "Counsellor / Visa Officer",
    detail: "When documents are in order, submit application within 24 hours"
  },
  "Interview training": {
    slaMs: 72 * 60 * 60 * 1000,
    slaLabel: "72 hours",
    owners: "Interview practitioner",
    detail: "Schedule and complete interview training"
  },
  Documentation: {
    slaMs: 7 * 24 * 60 * 60 * 1000,
    slaLabel: "7 days",
    owners: "Visa Officer",
    detail: "Complete documentation package"
  },
  Visa: {
    slaMs: 30 * 24 * 60 * 60 * 1000,
    slaLabel: "30 days",
    owners: "Visa Officer",
    detail: "Visa lodgment and decision tracking"
  },
  Enrolled: {
    slaMs: 14 * 24 * 60 * 60 * 1000,
    slaLabel: "14 days",
    owners: "Visa Officer / Counsellor",
    detail: "Confirm enrolment and handover"
  }
};

export function normalizePipelineStatus(status) {
  const raw = String(status || "").trim();
  if (LEGACY_STATUS_TO_CANONICAL[raw]) return LEGACY_STATUS_TO_CANONICAL[raw];
  if (PIPELINE_STEPS.includes(raw)) return raw;
  return raw;
}

export function branchesMatch(branchA, branchB) {
  const a = String(branchA || "").trim().toLowerCase();
  const b = String(branchB || "").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

export function counselorOwnsStudent(student, currentUser) {
  if (!student || !currentUser) return false;
  const cid = String(student.counselor || "").trim().toLowerCase();
  if (!cid) return false;
  const candidates = [
    String(currentUser.id || "").trim().toLowerCase(),
    String(currentUser.email || "").trim().toLowerCase(),
    String(currentUser.username || "").trim().toLowerCase()
  ].filter(Boolean);
  return candidates.some((c) => c && cid === c);
}

export function findManagersForBranch(branch, employees = []) {
  const list = Array.isArray(employees) ? employees : [];
  return list.filter(
    (e) =>
      String(e.role || "").trim() === "Manager" &&
      branchesMatch(e.branch, branch)
  );
}

/**
 * @returns {Array<{ studentId: string, studentName: string, branch: string, counselorId: string, stage: string, slaLabel: string, owners: string, detail: string, overdueMs: number, enteredAt: string, deadlineAt: number }>}
 */
export function computePipelineEscalations(students = [], options = {}) {
  const now = typeof options.now === "number" ? options.now : Date.now();
  const out = [];
  const list = Array.isArray(students) ? students : [];
  for (const student of list) {
    const stage = normalizePipelineStatus(student.status);
    if (!PIPELINE_STEPS.includes(stage)) continue;
    const cfg = STAGE_CONFIG[stage];
    if (!cfg || !cfg.slaMs) continue;
    const enteredRaw = student.stageEnteredAt || student.createdAt;
    if (!enteredRaw) continue;
    const start = new Date(enteredRaw).getTime();
    if (Number.isNaN(start)) continue;
    if (now - start <= cfg.slaMs) continue;
    const overdueMs = now - start - cfg.slaMs;
    out.push({
      studentId: student.id,
      studentName: student.name || student.id,
      branch: student.branch || "",
      counselorId: student.counselor || "",
      stage,
      slaLabel: cfg.slaLabel,
      owners: cfg.owners,
      detail: cfg.detail,
      overdueMs,
      enteredAt: enteredRaw,
      deadlineAt: start + cfg.slaMs
    });
  }
  return out.sort((a, b) => b.overdueMs - a.overdueMs);
}

export function filterEscalationsForManager(escalations, managerBranch, employees) {
  const branch = String(managerBranch || "").trim();
  if (!branch) return escalations;
  return escalations.filter((e) => branchesMatch(e.branch, branch));
}

export function filterEscalationsForCounselor(escalations, currentUser, students) {
  const ownedIds = new Set(
    (students || [])
      .filter((s) => counselorOwnsStudent(s, currentUser))
      .map((s) => String(s.id || "").trim())
  );
  return escalations.filter((e) => ownedIds.has(String(e.studentId || "").trim()));
}
