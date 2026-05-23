/**
 * Canonical student pipeline stages and per-stage SLAs (see product spec).
 * Legacy CRM status strings are normalized for display and escalation logic.
 */

export const PIPELINE_STEPS = [
  "Inquiry",
  "Registration",
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
  Registration: "Registration",
  Counseling: "Registration",
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
  Registration: {
    owners: "Counsellor",
    detail: "Complete student registration — no stage SLA timer"
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
    owners: "Visa Officer / Counsellor",
    detail: "Enrolled — no stage SLA timer"
  }
};

/** First-contact SLA for Inquiry (matches counselor priority list / STAGE_CONFIG.Inquiry). */
export const INQUIRY_INTAKE_SLA_MS = 60 * 60 * 1000;

/**
 * Remaining time until the 1-hour inquiry intake deadline (same wording as counselor dashboard).
 * @param {number} remainingMs deadline - now
 * @returns {{ tone: 'overdue'|'urgent'|'soon'|'ok', text: string }}
 */
export function formatInquiryIntakeRemainingMs(remainingMs) {
  const ms = Number(remainingMs) || 0;
  if (ms <= 0) {
    const overdue = -ms;
    const days = Math.floor(overdue / 86400000);
    const hours = Math.floor((overdue % 86400000) / 3600000);
    const mins = Math.floor((overdue % 3600000) / 60000);
    if (days > 0) return { tone: "overdue", text: `Overdue by ${days}d ${hours}h` };
    if (hours > 0) return { tone: "overdue", text: `Overdue by ${hours}h ${mins}m` };
    return { tone: "overdue", text: `Overdue by ${Math.max(1, mins)}m` };
  }
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (days > 0) return { tone: days >= 3 ? "ok" : "soon", text: `${days}d ${hours}h left` };
  if (hours > 0) return { tone: hours >= 6 ? "soon" : "urgent", text: `${hours}h ${mins}m ${secs}s left` };
  if (mins > 0) return { tone: "urgent", text: `${mins}m ${secs}s left` };
  return { tone: "urgent", text: `${secs}s left` };
}

/**
 * @param {string|number|Date|undefined|null} enteredAtIso stageEnteredAt or createdAt
 * @param {number} [nowMs]
 * @returns {{ text: string, tone: string, remainingMs: number } | null}
 */
export function getInquiryIntakeSlaRemainingParts(enteredAtIso, nowMs = Date.now()) {
  if (!enteredAtIso) return null;
  const start = new Date(enteredAtIso).getTime();
  if (Number.isNaN(start)) return null;
  const remainingMs = start + INQUIRY_INTAKE_SLA_MS - nowMs;
  const { tone, text } = formatInquiryIntakeRemainingMs(remainingMs);
  return { text, tone, remainingMs };
}

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
  if (st === "Inquiry" || st === "Registration") return [];
  if (st === "Application") return ["Documentation", "Offer Received"];
  return COUNTRY_CHECKLIST_STAGES;
}

/**
 * Checklist sections that must be satisfied before advancing past the current pipeline stage.
 * Inquiry → Registration and Registration → Application have no document gate;
 * Application requires Documentation + Offer Received.
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

/** Canonical stages counted as a regional conversion (past initial inquiry). */
export const BRANCH_CONVERSION_STAGES = [
  "Registration",
  "Application",
  "Interview training",
  "Documentation",
  "Visa",
  "Enrolled"
];

export function normalizeBranchKey(branch) {
  return String(branch || "").trim().toLowerCase();
}

export function isBranchConversionStatus(status) {
  return BRANCH_CONVERSION_STAGES.includes(normalizePipelineStatus(status));
}

export function isVisaGrantedStatus(status) {
  const stage = normalizePipelineStatus(status);
  return stage === "Visa" || stage === "Enrolled" || String(status || "").trim() === "Visa Pilot";
}

/** Invoice total in LKR for analytics (amount × FX rate). */
export function invoiceAmountLkr(invoice, ratesMap = {}) {
  const amount = Number(invoice?.amount);
  if (!Number.isFinite(amount)) return 0;
  const currency = String(invoice?.currency || "LKR").trim().toUpperCase();
  const rate = ratesMap[currency] ?? ratesMap.USD ?? 1;
  return amount * rate;
}

const PAID_INVOICE_STATUSES = new Set(["paid"]);

export function isPaidInvoice(invoice) {
  return PAID_INVOICE_STATUSES.has(String(invoice?.status || "").trim().toLowerCase());
}

/** Annual budget from inquiry form, converted to LKR (not realized revenue). */
export function parseStudentBudgetLkr(student, ratesMap = {}) {
  const raw = Number(String(student?.budget || "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const currency = String(student?.budgetCurrency || "LKR").trim().toUpperCase();
  if (currency === "LKR") return raw;
  const rate = ratesMap[currency] ?? ratesMap.USD ?? 1;
  return raw * rate;
}

/**
 * Per-branch metrics for Regional Conversion Performance and related analytics.
 * Only registered branches from `/api/branches` appear; students are attributed to those offices.
 * When `branchScopedStudents` is true (manager view), every student in `students` counts
 * toward `scopeBranch` — including those matched via branch counselors, not only `branch` field.
 */
export function buildBranchConversionMetrics({
  branches = [],
  students = [],
  allStudents = null,
  invoices = [],
  exchangeRates = null,
  scopeBranch = null,
  branchScopedStudents = false,
  employees = []
} = {}) {
  const scopeKey = scopeBranch ? normalizeBranchKey(scopeBranch) : "";
  const locationByKey = new Map();

  const registerLocation = (location) => {
    const label = String(location || "").trim();
    if (!label) return;
    const key = normalizeBranchKey(label);
    if (scopeKey && key !== scopeKey) return;
    if (!locationByKey.has(key)) {
      locationByKey.set(key, label);
    }
  };

  const branchList = Array.isArray(branches) ? branches : [];
  const employeeList = Array.isArray(employees) ? employees : [];
  branchList.forEach((branch) => registerLocation(branch?.location));

  const registeredKeys = new Set(
    branchList.map((branch) => normalizeBranchKey(branch?.location)).filter(Boolean)
  );
  const studentList = Array.isArray(students) ? students : [];
  const studentLookupList =
    Array.isArray(allStudents) && allStudents.length > 0 ? allStudents : studentList;
  const invoiceList = Array.isArray(invoices) ? invoices : [];
  const rates = exchangeRates && typeof exchangeRates === "object" ? exchangeRates : {};
  const studentById = new Map(
    studentLookupList
      .map((student) => [String(student?.id || "").trim(), student])
      .filter(([sid]) => Boolean(sid))
  );

  return Array.from(locationByKey.entries())
    .map(([key, name]) => {
      const branchStudents = studentList.filter(
        (student) =>
          resolveStudentBranchKey(
            student,
            locationByKey,
            employeeList,
            scopeKey,
            branchScopedStudents
          ) === key
      );
      const studentsCount = branchStudents.length;
      const conversionsCount = branchStudents.filter((student) =>
        isBranchConversionStatus(student?.status)
      ).length;
      const visaGrantedCount = branchStudents.filter((student) =>
        isVisaGrantedStatus(student?.status)
      ).length;
      const revenue = invoiceList.reduce((sum, invoice) => {
        if (!isPaidInvoice(invoice)) return sum;
        const sid = String(invoice?.studentId || invoice?.student_id || "").trim();
        if (!sid) return sum;
        const student = studentById.get(sid);
        if (!student) return sum;
        const invoiceBranchKey = resolveStudentBranchKey(
          student,
          locationByKey,
          employeeList,
          scopeKey,
          branchScopedStudents
        );
        if (invoiceBranchKey !== key) return sum;
        return sum + invoiceAmountLkr(invoice, rates);
      }, 0);
      const paidInvoiceCount = invoiceList.filter((invoice) => {
        if (!isPaidInvoice(invoice)) return false;
        const sid = String(invoice?.studentId || invoice?.student_id || "").trim();
        const student = studentById.get(sid);
        if (!student) return false;
        return (
          resolveStudentBranchKey(
            student,
            locationByKey,
            employeeList,
            scopeKey,
            branchScopedStudents
          ) === key
        );
      }).length;

      return {
        name,
        students: studentsCount,
        revenue,
        conversions: conversionsCount,
        visaGranted: visaGrantedCount,
        visaSuccessRate: studentsCount ? Math.round((visaGrantedCount / studentsCount) * 100) : 0,
        pastInquiryRate: studentsCount ? Math.round((conversionsCount / studentsCount) * 100) : 0,
        paidInvoiceCount
      };
    })
    .filter((row) => registeredKeys.has(normalizeBranchKey(row.name)))
    .sort((a, b) => b.revenue - a.revenue || b.students - a.students || a.name.localeCompare(b.name));
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

/**
 * Remaining time until the end of the *next* pipeline stage's SLA window, projected as if the
 * student enters that stage at max(now, current stage SLA deadline) (same start anchor as current
 * stage: stageEnteredAt or createdAt).
 *
 * @returns {{ nextStage: string, slaLabel: string, text: string, remainingMs: number, slaMs: number, visualTone: 'green'|'orange'|'red', isOverdue: boolean } | null}
 */
export function getNextStageSlaProjection(student, options = {}) {
  const now = typeof options.now === "number" ? options.now : Date.now();
  const stage = normalizePipelineStatus(student?.status);
  const idx = PIPELINE_STEPS.indexOf(stage);
  if (idx < 0 || idx >= PIPELINE_STEPS.length - 1) return null;
  let nextStage = null;
  let nextCfg = null;
  for (let i = idx + 1; i < PIPELINE_STEPS.length; i++) {
    const candidate = PIPELINE_STEPS[i];
    const cfg = STAGE_CONFIG[candidate];
    if (cfg?.slaMs) {
      nextStage = candidate;
      nextCfg = cfg;
      break;
    }
  }
  if (!nextStage || !nextCfg) return null;
  const curCfg = STAGE_CONFIG[stage];
  const enteredRaw = student?.stageEnteredAt || student?.createdAt;
  if (!enteredRaw) return null;
  const start = new Date(enteredRaw).getTime();
  if (Number.isNaN(start)) return null;
  const nextStageStartMs = curCfg?.slaMs
    ? Math.max(now, start + curCfg.slaMs)
    : Math.max(now, start);
  const nextDeadlineMs = nextStageStartMs + nextCfg.slaMs;
  const remainingMs = nextDeadlineMs - now;
  const formatted = formatRemainingMsForSla(remainingMs);
  const visualTone = getStageSlaVisualTone(remainingMs, nextCfg.slaMs);
  return {
    nextStage,
    slaLabel: nextCfg.slaLabel,
    text: formatted.text,
    remainingMs,
    slaMs: nextCfg.slaMs,
    visualTone,
    isOverdue: formatted.isOverdue
  };
}

export function branchesMatch(branchA, branchB) {
  const a = String(branchA || "").trim().toLowerCase();
  const b = String(branchB || "").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

/** Branch label on a student record (`branch` or inquiry `nearestOffice`). */
export function getStudentBranchLabel(student) {
  return String(student?.branch || student?.nearestOffice || "").trim();
}

/** Branch key for a student (office label, counselor branch, or scoped fallback). */
export function resolveStudentBranchKey(
  student,
  locationByKey,
  employees = [],
  scopeKey = "",
  branchScopedStudents = false
) {
  if (!student) return "";
  const label = getStudentBranchLabel(student);
  const labelKey = normalizeBranchKey(label);
  if (labelKey) return labelKey;
  const employeeList = Array.isArray(employees) ? employees : [];
  const locations =
    locationByKey instanceof Map ? locationByKey : new Map(locationByKey || []);
  for (const [key, name] of locations) {
    const counselorSet = buildBranchCounselorIdentitySet(employeeList, name);
    if (counselorSet?.size && studentMatchesCounselorIdentitySet(student, counselorSet)) {
      return key;
    }
  }
  if (scopeKey && branchScopedStudents) return scopeKey;
  return "";
}

/** Counselor/consultor account ids and emails at a branch (normalized lowercase). */
export function buildBranchCounselorIdentitySet(employees = [], managerBranch) {
  const branch = String(managerBranch || "").trim();
  if (!branch) return new Set();
  const identitySet = new Set();
  const n = (v) => String(v || "").trim().toLowerCase();
  const addIdentity = (value) => {
    const normalized = n(value);
    if (normalized) identitySet.add(normalized);
  };
  for (const employee of Array.isArray(employees) ? employees : []) {
    const role = String(employee?.role || "").trim().toLowerCase();
    if (
      !role.includes("counsel") &&
      role !== "consultor" &&
      role !== "visa officer" &&
      role !== "visa officer & counselor" &&
      role !== "visa officer & counsellor"
    ) {
      continue;
    }
    if (!branchesMatch(employee?.branch, branch)) continue;
    addIdentity(employee.id);
    addIdentity(employee.email);
    addIdentity(employee.username);
  }
  return identitySet;
}

/**
 * Whether a student belongs to a manager's branch: matching office label or assigned
 * to a counselor at that branch.
 */
export function studentMatchesManagerBranch(student, managerBranch, branchCounselorIds = null) {
  const branch = String(managerBranch || "").trim();
  if (!branch) return true;
  const studentBranch = getStudentBranchLabel(student);
  if (studentBranch && branchesMatch(studentBranch, branch)) return true;
  if (branchCounselorIds && branchCounselorIds.size > 0) {
    return studentMatchesCounselorIdentitySet(student, branchCounselorIds);
  }
  return false;
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

/** True when a stored violation was recorded for the student's current pipeline stage. */
export function slaViolationMatchesCurrentPipelineStage(violation, studentStatus) {
  if (!violation) return false;
  const current = normalizePipelineStatus(studentStatus);
  const violationStage = normalizePipelineStatus(violation.stage || "");
  return Boolean(current) && violationStage === current;
}

/**
 * Open SLA violations that still have missing items, limited to the current pipeline stage.
 * Past-stage violations remain on the record for reporting but are not shown on the profile notice.
 */
export function getOpenSlaViolationsForCurrentStage(student) {
  const violations = Array.isArray(student?.slaViolations) ? student.slaViolations : [];
  const docs = Array.isArray(student?.documents) ? student.documents : [];
  return violations.filter((v) => {
    if (!slaViolationMatchesCurrentPipelineStage(v, student?.status)) return false;
    return getEffectiveSlaViolationMissingItems(v, docs).length > 0;
  });
}

export function hasOpenSlaViolationsForCurrentStage(student) {
  return getOpenSlaViolationsForCurrentStage(student).length > 0;
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
