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

/** Country checklist section names (see COUNTRY_CHECKLISTS in constants.js). */
export const COUNTRY_CHECKLIST_STAGES = ["Documentation", "Uni Application", "Offer Received"];

/**
 * Checklist sections shown in the student profile / upload UI for the current pipeline stage.
 * Documentation + Offer Received appear from Application onward — not during Inquiry.
 */
export function getVisibleCountryChecklistStages(status) {
  const st = normalizePipelineStatus(status);
  if (st === "Inquiry") return [];
  if (st === "Application") return ["Documentation", "Offer Received"];
  return COUNTRY_CHECKLIST_STAGES;
}

/**
 * Checklist sections that must be satisfied before advancing past the current pipeline stage.
 * Inquiry → Application has no document gate; Application requires Documentation + Offer Received.
 */
export function getRequiredCountryChecklistStagesBeforeAdvance(status) {
  const st = normalizePipelineStatus(status);
  if (st === "Application") return ["Documentation", "Offer Received"];
  if (st === "Interview training") return ["Uni Application"];
  return [];
}

/** True when the student has reached Documentation or a later pipeline stage. */
export function isAtOrPastPipelineStage(status, stageName) {
  const st = normalizePipelineStatus(status);
  const target = normalizePipelineStatus(stageName);
  const idx = PIPELINE_STEPS.indexOf(st);
  const targetIdx = PIPELINE_STEPS.indexOf(target);
  if (idx === -1 || targetIdx === -1) return false;
  return idx >= targetIdx;
}

/** Visa Pilot tab / uploads unlock at Documentation stage. */
export function isVisaPilotUnlocked(status) {
  return isAtOrPastPipelineStage(status, "Documentation");
}

/**
 * Counts students per canonical pipeline stage for dashboards (counselor/manager scope).
 * Unknown / non-canonical statuses are counted under `other`.
 * @returns {{ byStage: Record<string, number>, other: number, total: number }}
 */
export function computePipelineStageCounts(students = []) {
  const list = Array.isArray(students) ? students : [];
  const byStage = Object.fromEntries(PIPELINE_STEPS.map((s) => [s, 0]));
  let other = 0;
  for (const student of list) {
    const stage = normalizePipelineStatus(student?.status);
    if (PIPELINE_STEPS.includes(stage)) {
      byStage[stage] += 1;
    } else {
      other += 1;
    }
  }
  return { byStage, other, total: list.length };
}

const MS_SEC = 1000;
const MS_MIN = 60 * MS_SEC;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;
const MS_WEEK = 7 * MS_DAY;

/**
 * Overdue duration split into calendar-style weeks (7d), days (0–6), hours (0–23).
 * @param {number} overdueMs
 * @returns {{ weeks: number, days: number, hours: number }}
 */
export function partitionOverdueMs(overdueMs) {
  const t = Math.max(0, Math.floor(Number(overdueMs) || 0));
  const weeks = Math.floor(t / MS_WEEK);
  let r = t % MS_WEEK;
  const days = Math.floor(r / MS_DAY);
  r %= MS_DAY;
  const hours = Math.floor(r / MS_HOUR);
  return { weeks, days, hours };
}

/**
 * Time remaining until deadline, for a live countdown (includes minutes and seconds).
 * @param {number} remainingMs
 * @returns {{ weeks: number, days: number, hours: number, minutes: number, seconds: number }}
 */
export function partitionRemainingCountdownMs(remainingMs) {
  const t = Math.max(0, Math.floor(Number(remainingMs) || 0));
  const weeks = Math.floor(t / MS_WEEK);
  let r = t % MS_WEEK;
  const days = Math.floor(r / MS_DAY);
  r %= MS_DAY;
  const hours = Math.floor(r / MS_HOUR);
  r %= MS_HOUR;
  const minutes = Math.floor(r / MS_MIN);
  r %= MS_MIN;
  const seconds = Math.floor(r / MS_SEC);
  return { weeks, days, hours, minutes, seconds };
}

/**
 * Formats time until a stage SLA deadline. Positive `remainingMs` = time left; overdue uses negative remaining.
 * Returns structured parts for UI (weeks / days / hours when overdue; full countdown when on time).
 */
export function formatRemainingMsForSla(remainingMs) {
  if (remainingMs <= 0) {
    const overdue = -remainingMs;
    const { weeks, days, hours } = partitionOverdueMs(overdue);
    const mins = Math.floor((overdue % MS_HOUR) / MS_MIN);
    let text = "Overdue";
    if (weeks > 0) text = `Overdue · ${weeks}w ${days}d ${hours}h`;
    else if (days > 0) text = `Overdue · ${days}d ${hours}h`;
    else if (hours > 0) text = `Overdue · ${hours}h ${mins}m`;
    else text = `Overdue · ${Math.max(1, mins)}m`;
    return { text, isOverdue: true, overdue: { weeks, days, hours } };
  }
  const cd = partitionRemainingCountdownMs(remainingMs);
  const { weeks, days, hours, minutes, seconds } = cd;
  let text = `${seconds}s left`;
  if (weeks > 0) text = `${weeks}w ${days}d ${hours}h left`;
  else if (days > 0) text = `${days}d ${hours}h ${minutes}m ${seconds}s left`;
  else if (hours > 0) text = `${hours}h ${minutes}m ${seconds}s left`;
  else if (minutes > 0) text = `${minutes}m ${seconds}s left`;
  return { text, isOverdue: false, countdown: cd };
}

/**
 * UI color for stage SLA chip: green while more than 20% of SLA duration remains,
 * orange in the final 20%, red when past the deadline.
 */
export function getStageSlaVisualTone(remainingMs, slaMs) {
  if (remainingMs <= 0) return "red";
  const total = typeof slaMs === "number" && slaMs > 0 ? slaMs : 0;
  if (total > 0 && remainingMs <= total * 0.2) return "orange";
  return "green";
}

/**
 * Live countdown for the student's current pipeline stage vs STAGE_CONFIG SLA (from stageEnteredAt or createdAt).
 * @returns {{ stage: string, slaLabel: string, text: string, remainingMs: number, slaMs: number, visualTone: 'green'|'orange'|'red', isOverdue: boolean, overdue?: { weeks: number, days: number, hours: number }, countdown?: { weeks: number, days: number, hours: number, minutes: number, seconds: number } } | null}
 */
export function getCurrentStageSlaDisplay(student, options = {}) {
  const now = typeof options.now === "number" ? options.now : Date.now();
  const stage = normalizePipelineStatus(student?.status);
  if (!PIPELINE_STEPS.includes(stage)) return null;
  const cfg = STAGE_CONFIG[stage];
  if (!cfg?.slaMs) return null;
  const enteredRaw = student?.stageEnteredAt || student?.createdAt;
  if (!enteredRaw) return null;
  const start = new Date(enteredRaw).getTime();
  if (Number.isNaN(start)) return null;
  const deadlineMs = start + cfg.slaMs;
  const remainingMs = deadlineMs - now;
  const formatted = formatRemainingMsForSla(remainingMs);
  const visualTone = getStageSlaVisualTone(remainingMs, cfg.slaMs);
  return {
    stage,
    slaLabel: cfg.slaLabel,
    text: formatted.text,
    remainingMs,
    slaMs: cfg.slaMs,
    visualTone,
    isOverdue: formatted.isOverdue,
    overdue: formatted.overdue,
    countdown: formatted.countdown
  };
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

/** Same scope as App.js counselorScopedStudents: assigned, inquiry, or prior counselor (counselorHistory). */
export function studentMatchesCounselorIdentitySet(student, identitySet) {
  if (!student || !identitySet || identitySet.size === 0) return false;
  const n = (v) => String(v || "").trim().toLowerCase();
  const counselorId = n(student.counselor);
  const inquiryId = n(student.inquiryCounselorId);
  const history = Array.isArray(student.counselorHistory) ? student.counselorHistory : [];
  if (counselorId && identitySet.has(counselorId)) return true;
  if (inquiryId && identitySet.has(inquiryId)) return true;
  return history.some((id) => identitySet.has(n(id)));
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

/**
 * `students` must already be counselor-scoped (same rules as App.js counselorScopedStudents).
 * Do not re-filter with counselorOwnsStudent — that only checks student.counselor and misses
 * inquiryCounselorId / counselorHistory matches.
 */
export function filterEscalationsForCounselor(escalations, currentUser, students) {
  void currentUser;
  const scopedIds = new Set(
    (students || []).map((s) => String(s?.id || "").trim()).filter(Boolean)
  );
  return escalations.filter((e) => scopedIds.has(String(e.studentId || "").trim()));
}

export function documentTypeMatchesSlaRequirement(docType, requiredDocType) {
  const dt = String(docType || "");
  const req = String(requiredDocType || "");
  if (!req) return false;
  return dt === req || dt.includes(req) || req.includes(dt);
}

/** True when a checklist requirement is covered by a staff-verified upload (same type rules as pipeline advance). */
export function requirementSatisfiedByVerifiedDocument(studentDocuments, requiredDocType) {
  const docs = Array.isArray(studentDocuments) ? studentDocuments : [];
  return docs.some((d) => {
    if (!documentTypeMatchesSlaRequirement(d?.type, requiredDocType)) return false;
    const st = String(d?.status || "").trim().toLowerCase();
    return st === "verified";
  });
}

/** Items from a stored violation that are still missing given current documents. */
export function getEffectiveSlaViolationMissingItems(violation, studentDocuments) {
  if (!violation) return [];
  const missingItems = Array.isArray(violation.missingItems) ? violation.missingItems.filter(Boolean) : [];
  return missingItems.filter((req) => !requirementSatisfiedByVerifiedDocument(studentDocuments, req));
}

/** Updates each violation's `resolved` flag from verified documents (does not shrink stored `missingItems`). */
export function reconcileStudentSlaViolationsWithDocuments(student) {
  const raw = student?.slaViolations;
  if (!Array.isArray(raw) || raw.length === 0) return raw;
  const docs = Array.isArray(student?.documents) ? student.documents : [];
  return raw.map((v) => {
    if (!v) return v;
    const remaining = getEffectiveSlaViolationMissingItems(v, docs);
    return { ...v, resolved: remaining.length === 0 };
  });
}

/** Number of SLA requirement violation records that still have at least one unverified mandatory item. */
export function countOpenSlaRequirementViolations(student) {
  const violations = Array.isArray(student?.slaViolations) ? student.slaViolations : [];
  const docs = Array.isArray(student?.documents) ? student.documents : [];
  return violations.filter((v) => getEffectiveSlaViolationMissingItems(v, docs).length > 0).length;
}

/**
 * Builds a flat list of unresolved SLA requirement-violation rows from students.
 * These are students who were advanced through a stage without completing all
 * mandatory requirements (recorded in `student.slaViolations`).
 *
 * @returns {Array<{ studentId: string, studentName: string, branch: string, counselorId: string, stage: string, missingItems: string[], timestamp: string, violationId: string }>}
 */
export function computeRequirementViolations(students = []) {
  const list = Array.isArray(students) ? students : [];
  const out = [];
  for (const student of list) {
    const violations = Array.isArray(student?.slaViolations) ? student.slaViolations : [];
    const docs = Array.isArray(student?.documents) ? student.documents : [];
    const seen = new Map();
    for (const v of violations) {
      if (!v) continue;
      const missingItems = Array.isArray(v.missingItems) ? v.missingItems.filter(Boolean) : [];
      const effectiveMissing = missingItems.filter((req) => !requirementSatisfiedByVerifiedDocument(docs, req));
      if (effectiveMissing.length === 0) continue;
      const stage = v.stage || normalizePipelineStatus(student.status) || "";
      const dedupeKey = `${stage}::${[...effectiveMissing].map((s) => String(s).trim().toLowerCase()).sort().join("|")}`;
      const existing = seen.get(dedupeKey);
      if (existing) {
        const existingTs = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
        const currentTs = v.timestamp ? new Date(v.timestamp).getTime() : 0;
        if (currentTs > existingTs) {
          existing.timestamp = v.timestamp || existing.timestamp;
          existing.violationId = v.id || existing.violationId;
        }
        existing.duplicateCount = (existing.duplicateCount || 1) + 1;
        continue;
      }
      const row = {
        studentId: student.id,
        studentName: student.name || student.id,
        branch: student.branch || "",
        counselorId: student.counselor || "",
        stage,
        missingItems: effectiveMissing,
        timestamp: v.timestamp || "",
        violationId: v.id || `${student.id}-${stage || "stage"}`,
        duplicateCount: 1
      };
      seen.set(dedupeKey, row);
      out.push(row);
    }
  }
  return out.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });
}

export function filterRequirementViolationsForManager(rows, managerBranch) {
  const branch = String(managerBranch || "").trim();
  if (!branch) return rows;
  return rows.filter((r) => branchesMatch(r.branch, branch));
}

export function filterRequirementViolationsForCounselor(rows, currentUser, students) {
  void currentUser;
  const scopedIds = new Set(
    (students || []).map((s) => String(s?.id || "").trim()).filter(Boolean)
  );
  return rows.filter((r) => scopedIds.has(String(r.studentId || "").trim()));
}
