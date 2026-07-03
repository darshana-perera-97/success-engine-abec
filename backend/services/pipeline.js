const { PIPELINE_STEPS, LEGACY_STATUS_TO_CANONICAL } = require("../config");
const { isStudentContactStaffRole } = require("./roles");

function normalizePipelineStatus(status) {
  const raw = String(status || "").trim();
  if (LEGACY_STATUS_TO_CANONICAL[raw]) return LEGACY_STATUS_TO_CANONICAL[raw];
  if (PIPELINE_STEPS.includes(raw)) return raw;
  return raw;
}

function branchesMatchBackend(a, b) {
  const na = String(a || "").trim().toLowerCase();
  const nb = String(b || "").trim().toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function buildCounselorIdentitySet(users, branch) {
  const branchLabel = String(branch || "").trim();
  if (!branchLabel) return new Set();
  const identitySet = new Set();
  const n = (v) => String(v || "").trim().toLowerCase();
  for (const user of Array.isArray(users) ? users : []) {
    if (!isStudentContactStaffRole(user?.role)) continue;
    if (!branchesMatchBackend(user?.branch, branchLabel)) continue;
    const id = n(user.id); if (id) identitySet.add(id);
    const email = n(user.email); if (email) identitySet.add(email);
    const username = n(user.username); if (username) identitySet.add(username);
  }
  return identitySet;
}

function studentMatchesCounselorSet(student, identitySet) {
  if (!student || !identitySet || identitySet.size === 0) return false;
  const n = (v) => String(v || "").trim().toLowerCase();
  if (identitySet.has(n(student.counselor))) return true;
  if (identitySet.has(n(student.inquiryCounselorId))) return true;
  const history = Array.isArray(student.counselorHistory) ? student.counselorHistory : [];
  return history.some((id) => identitySet.has(n(id)));
}

function studentMatchesManagerBranchBackend(student, branchLabel, branchCounselorIds) {
  const branch = String(branchLabel || "").trim();
  if (!branch) return true;
  const studentBranch = String(student?.branch || student?.nearestOffice || "").trim();
  if (studentBranch && branchesMatchBackend(studentBranch, branch)) return true;
  if (branchCounselorIds && branchCounselorIds.size > 0) {
    return studentMatchesCounselorSet(student, branchCounselorIds);
  }
  return false;
}

function applyRoleScope(students, { role, userId, branch, country, users }) {
  const normalizedRole = String(role || "").trim();
  if (normalizedRole === "Counselor" || normalizedRole === "Consultor" || normalizedRole === "Counsellor") {
    if (!userId) return [];
    const uid = String(userId).trim().toLowerCase();
    const identitySet = new Set();
    if (uid) identitySet.add(uid);
    const user = (users || []).find((u) => String(u.id || "").trim().toLowerCase() === uid);
    if (user) {
      const email = String(user.email || "").trim().toLowerCase();
      const username = String(user.username || "").trim().toLowerCase();
      if (email) identitySet.add(email);
      if (username) identitySet.add(username);
    }
    return students.filter((s) => studentMatchesCounselorSet(s, identitySet));
  }
  if (normalizedRole === "Manager" || normalizedRole === "Accountant") {
    const branchLabel = String(branch || "").trim();
    if (!branchLabel) return students;
    const branchCounselorIds = buildCounselorIdentitySet(users || [], branchLabel);
    return students.filter((s) => studentMatchesManagerBranchBackend(s, branchLabel, branchCounselorIds));
  }
  if (normalizedRole === "Country Coordinator") {
    const countryKey = String(country || "").trim().toLowerCase();
    if (!countryKey) return students;
    return students.filter((s) => String(s.country || "").trim().toLowerCase() === countryKey);
  }
  return students;
}

function pipelineStageOrder(status) {
  const canonical = normalizePipelineStatus(status);
  const idx = PIPELINE_STEPS.indexOf(canonical);
  return idx >= 0 ? idx : PIPELINE_STEPS.length;
}

function studentTimeMs(student) {
  const raw = student?.stageEnteredAt || student?.createdAt;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

function isApplicationStage(value) {
  return String(value || "").trim().toLowerCase() === "application";
}

function isRegistrationStage(value) {
  return String(value || "").trim().toLowerCase() === "registration";
}

function isInquiryStage(value) {
  return String(value || "").trim().toLowerCase() === "inquiry";
}

function isDocumentationStage(value) {
  return String(value || "").trim().toLowerCase() === "documentation";
}

function normalizeStage(value) {
  return String(value || "").trim().toLowerCase();
}

module.exports = {
  normalizePipelineStatus,
  branchesMatchBackend,
  buildCounselorIdentitySet,
  studentMatchesCounselorSet,
  studentMatchesManagerBranchBackend,
  applyRoleScope,
  pipelineStageOrder,
  studentTimeMs,
  isApplicationStage,
  isRegistrationStage,
  isInquiryStage,
  isDocumentationStage,
  normalizeStage,
};
