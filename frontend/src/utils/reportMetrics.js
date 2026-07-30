import { documentTypeMatchesRequirement } from "../docMappingConfig";
import { normalizePipelineStatus, isVisaGrantedStatus, PIPELINE_STEPS } from "../pipeline";
import { normalizeOfferStatus } from "./universityOfferLetters";
import { getAssignedCounselorIds } from "../studentContactHelpers";

export const REPORT_SECTIONS = [
  {
    id: "leads",
    title: "Lead Pipeline",
    metrics: [
      { id: "totalLeadsAllocated", label: "Total Leads Allocated" },
      { id: "prospectiveLeads", label: "Prospective Leads" },
      { id: "nonProspectiveLeads", label: "Non prospective Leads" },
      { id: "signUp", label: "Sign Up (all Information shared students)" },
      { id: "registered", label: "Registered" },
    ],
  },
  {
    id: "offers",
    title: "Offers & Admissions",
    metrics: [
      { id: "conditionalOffer", label: "Conditional Offer Received" },
      { id: "unconditionalOffer", label: "Unconditional Offer Received" },
      { id: "coeReceivedJapan", label: "COE Received (Japan)" },
    ],
  },
  {
    id: "interviews",
    title: "Interviews",
    metrics: [
      { id: "preCasInterviewCompleted", label: "Pre Cas Interview Completed" },
      { id: "preInterviewCompletedJapan", label: "Pre Interview Completed (Japan)" },
      { id: "preInterviewPassedJapan", label: "Pre Interview Passed (Japan)" },
      { id: "regularInterviewCompletedJapan", label: "Regular Interview Completed (Japan)" },
      { id: "regularInterviewFailedJapan", label: "Regular Interview Failed (Japan)" },
    ],
  },
  {
    id: "cas",
    title: "CAS & GS",
    metrics: [
      { id: "gsAnswersCompleted", label: "GS Answers Completed" },
      { id: "casRequested", label: "CAS Requested" },
      { id: "casReceived", label: "CAS Received" },
      { id: "casPending", label: "CAS Pending" },
    ],
  },
  {
    id: "financial",
    title: "Financial",
    metrics: [
      { id: "universityPaymentDone", label: "University Payment Done" },
      { id: "financialArranged", label: "Financial arranged" },
      { id: "incomeStatementsArranged", label: "Income statements arranged" },
    ],
  },
  {
    id: "visa",
    title: "Visa & Enrollment",
    metrics: [
      { id: "visaSubmitted", label: "Visa Submitted" },
      { id: "scanDocsSubmittedVisaJapan", label: "Scan Documents Submitted for Visa (Japan)" },
      { id: "visaGrants", label: "Visa Grants" },
      { id: "visaRefused", label: "Visa Refused" },
      { id: "visaDecisionPending", label: "Visa Decision Pending" },
      { id: "enrolled", label: "Enrolled" },
    ],
  },
];

const VISA_LODGMENT_ITEMS = [
  "Portal Lodgment",
  "UKVI Lodgment",
  "ImmiAccount Lodgment",
  "IRCC Portal Lodgment",
];

const GS_DOC_TYPES = ["Final GS", "Draft GS", "GTE/GS Approval"];
const FINANCIAL_DOC_TYPES = ["Financials", "Financial Clearance"];
const TUITION_DOC_TYPES = ["Tuition Receipt", "LOA"];
const VISA_GRANT_DOC_TYPES = ["Visa Grant Notice", "Visa Grant", "Vignette", "Passport Request (PPR)"];
const VISA_REFUSAL_DOC_TYPES = ["Visa Refusal", "Visa Refused", "Refusal Letter"];
const COE_DOC_TYPES = ["CoE", "COE"];
const CAS_DOC_TYPES = ["CAS"];

function norm(value) {
  return String(value || "").trim().toLowerCase();
}

function isJapan(country) {
  return norm(country) === "japan";
}

function isUk(country) {
  return norm(country) === "uk" || norm(country) === "united kingdom";
}

function parseDateMs(value) {
  const ms = new Date(String(value || "").trim()).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function inDateRange(value, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const ms = parseDateMs(value);
  if (!ms) return !dateFrom && !dateTo;
  const fromMs = dateFrom ? parseDateMs(`${dateFrom}T00:00:00`) : null;
  const toMs = dateTo ? parseDateMs(`${dateTo}T23:59:59.999`) : null;
  if (fromMs && ms < fromMs) return false;
  if (toMs && ms > toMs) return false;
  return true;
}

function studentBranch(student) {
  return String(student?.branch || student?.nearestOffice || "").trim();
}

function hasDocMatching(student, docTypes, { verifiedOnly = false, pendingOnly = false } = {}) {
  for (const doc of student?.documents || []) {
    if (!doc || typeof doc !== "object") continue;
    const docType = String(doc.type || "").trim();
    const status = norm(doc.status);
    if (status === "rejected") continue;
    const matches = docTypes.some((t) => documentTypeMatchesRequirement(docType, t));
    if (!matches) continue;
    if (verifiedOnly && status !== "verified") continue;
    if (pendingOnly && status !== "pending") continue;
    return true;
  }
  return false;
}

function hasOfferStatus(student, targetStatus) {
  for (const entry of student?.universityOfferLetters || []) {
    if (!entry || typeof entry !== "object" || !String(entry.url || "").trim()) continue;
    const status = normalizeOfferStatus(entry.offerStatus);
    if (status === targetStatus) return true;
  }
  return false;
}

function visaItemCompleted(student, itemName) {
  const visa = student?.visa || {};
  return norm(visa[itemName]) === "completed";
}

function hasVisaLodgmentSubmitted(student) {
  return VISA_LODGMENT_ITEMS.some((item) => visaItemCompleted(student, item));
}

function hasVisaPilotDocs(student) {
  return (student?.documents || []).some(
    (doc) => doc && norm(doc.tier) === "visapilot" && norm(doc.status) !== "rejected"
  );
}

function isSignUpComplete(student) {
  const hasEmail = !!String(student?.email || "").trim();
  const hasPhone = !!String(student?.phone || "").trim();
  const hasPassword = !!student?.passwordChangedAt || student?.forcePasswordChange === false;
  return hasEmail && hasPhone && hasPassword;
}

function stageIndex(status) {
  const canonical = normalizePipelineStatus(status);
  const idx = PIPELINE_STEPS.indexOf(canonical);
  return idx >= 0 ? idx : -1;
}

function studentMatchesAppointment(student, appointments, { type, status = "Completed", countryFilter = null, passedOnly = false, failedOnly = false }) {
  const sid = String(student?.id || "").trim();
  if (!sid) return false;
  if (countryFilter && !countryFilter(student)) return false;
  for (const apt of appointments || []) {
    if (String(apt?.studentId || "").trim() !== sid) continue;
    if (norm(apt?.type) !== norm(type)) continue;
    if (norm(apt?.status) !== norm(status)) continue;
    const notes = norm(apt?.outcomeNotes);
    if (passedOnly && (notes.includes("fail") || notes.includes("failed"))) continue;
    if (failedOnly && !(notes.includes("fail") || notes.includes("failed"))) continue;
    return true;
  }
  return false;
}

function studentMatchesFilters(student, filters, employees) {
  const counselor = String(filters.counselor || "All");
  if (counselor !== "All") {
    const ids = getAssignedCounselorIds(student);
    const match = ids.some((id) => id === counselor);
    if (!match) return false;
  }
  const branch = String(filters.branch || "All");
  if (branch !== "All" && studentBranch(student) !== branch) return false;
  const country = String(filters.country || "All");
  if (country !== "All" && String(student?.country || "").trim() !== country) return false;
  if (!inDateRange(student?.createdAt, filters.dateFrom, filters.dateTo)) return false;
  return true;
}

function reqStudentMatchesFilters(entry, filters) {
  const branch = String(filters.branch || "All");
  if (branch !== "All") {
    const entryBranch = String(entry?.nearestOffice || entry?.branch || "").trim();
    if (entryBranch !== branch) return false;
  }
  const country = String(filters.country || "All");
  if (country !== "All") {
    const entryCountry = String(entry?.countryToVisit || "").trim();
    if (entryCountry !== country) return false;
  }
  if (!inDateRange(entry?.submittedAt, filters.dateFrom, filters.dateTo)) return false;
  return true;
}

function computeMetricForStudent(metricId, student, appointments) {
  const status = normalizePipelineStatus(student?.status);
  const inquiryIdx = stageIndex("Inquiry");
  const registrationIdx = stageIndex("Registration");
  const currentIdx = stageIndex(status);

  switch (metricId) {
    case "totalLeadsAllocated":
      return true;
    case "prospectiveLeads":
      return currentIdx <= inquiryIdx;
    case "nonProspectiveLeads":
      return currentIdx > inquiryIdx;
    case "signUp":
      return isSignUpComplete(student);
    case "registered":
      return currentIdx >= registrationIdx;
    case "conditionalOffer":
      return hasOfferStatus(student, "Conditional");
    case "unconditionalOffer":
      return hasOfferStatus(student, "Unconditional");
    case "coeReceivedJapan":
      return isJapan(student?.country) && hasDocMatching(student, COE_DOC_TYPES, { verifiedOnly: true });
    case "preCasInterviewCompleted":
      return (
        isUk(student?.country) &&
        (studentMatchesAppointment(student, appointments, { type: "Pre Cas Interview", status: "Completed" }) ||
          studentMatchesAppointment(student, appointments, { type: "Mock Interview", status: "Completed" }) ||
          visaItemCompleted(student, "CAS Issuance"))
      );
    case "preInterviewCompletedJapan":
      return studentMatchesAppointment(student, appointments, {
        type: "Pre interview",
        status: "Completed",
        countryFilter: (s) => isJapan(s?.country),
      });
    case "preInterviewPassedJapan":
      return studentMatchesAppointment(student, appointments, {
        type: "Pre interview",
        status: "Completed",
        countryFilter: (s) => isJapan(s?.country),
        passedOnly: true,
      });
    case "regularInterviewCompletedJapan":
      return studentMatchesAppointment(student, appointments, {
        type: "Regular Interview",
        status: "Completed",
        countryFilter: (s) => isJapan(s?.country),
      });
    case "regularInterviewFailedJapan":
      return studentMatchesAppointment(student, appointments, {
        type: "Regular Interview",
        status: "Completed",
        countryFilter: (s) => isJapan(s?.country),
        failedOnly: true,
      });
    case "gsAnswersCompleted":
      return (
        hasDocMatching(student, GS_DOC_TYPES, { verifiedOnly: true }) ||
        GS_DOC_TYPES.some((item) => visaItemCompleted(student, item))
      );
    case "casRequested":
      return (
        hasDocMatching(student, CAS_DOC_TYPES) ||
        visaItemCompleted(student, "CAS Issuance") ||
        (isUk(student?.country) && stageIndex(status) >= stageIndex("Documentation"))
      );
    case "casReceived":
      return hasDocMatching(student, CAS_DOC_TYPES, { verifiedOnly: true });
    case "casPending":
      return hasDocMatching(student, CAS_DOC_TYPES, { pendingOnly: true });
    case "universityPaymentDone":
      return (
        Number(student?.financials?.paidTuition || 0) > 0 ||
        hasDocMatching(student, TUITION_DOC_TYPES, { verifiedOnly: true })
      );
    case "financialArranged":
      return (
        hasDocMatching(student, FINANCIAL_DOC_TYPES, { verifiedOnly: true }) ||
        visaItemCompleted(student, "Financial Clearance") ||
        (Array.isArray(student?.financials?.assets) && student.financials.assets.length > 0)
      );
    case "incomeStatementsArranged":
      return hasDocMatching(student, ["Financials", "Income Statement", "Income statements"], { verifiedOnly: true });
    case "visaSubmitted":
      return hasVisaLodgmentSubmitted(student) || visaItemCompleted(student, "Portal Lodgment");
    case "scanDocsSubmittedVisaJapan":
      return isJapan(student?.country) && hasVisaPilotDocs(student);
    case "visaGrants":
      return (
        hasDocMatching(student, VISA_GRANT_DOC_TYPES, { verifiedOnly: true }) ||
        isVisaGrantedStatus(status)
      );
    case "visaRefused":
      return (
        hasDocMatching(student, VISA_REFUSAL_DOC_TYPES) ||
        norm(student?.visaOutcome) === "refused" ||
        norm(student?.visa?.["Visa Decision"]) === "refused"
      );
    case "visaDecisionPending":
      return (
        (hasVisaLodgmentSubmitted(student) || hasVisaPilotDocs(student)) &&
        !hasDocMatching(student, VISA_GRANT_DOC_TYPES, { verifiedOnly: true }) &&
        !hasDocMatching(student, VISA_REFUSAL_DOC_TYPES) &&
        !isVisaGrantedStatus(status) &&
        status !== "Enrolled"
      );
    case "enrolled":
      return status === "Enrolled";
    default:
      return false;
  }
}

export function filterReportStudents(students, filters = {}, employees = []) {
  return (students || []).filter((student) => studentMatchesFilters(student, filters, employees));
}

export function filterReportReqStudents(reqStudents, filters = {}) {
  return (reqStudents || []).filter((entry) => reqStudentMatchesFilters(entry, filters));
}

function resolveCounselorLabel(student, employees) {
  const id = String(student?.counselor || "").trim();
  const emp = (employees || []).find((e) => String(e?.id || "") === id);
  return String(emp?.name || emp?.username || student?.counselorName || "—").trim() || "—";
}

export function buildReportRowFromStudent(student, employees = []) {
  return {
    key: `student-${String(student?.id || "").trim()}`,
    kind: "student",
    student,
    name: String(student?.name || student?.id || "Unknown").trim(),
    id: String(student?.id || "").trim(),
    country: String(student?.country || "—").trim() || "—",
    branch: studentBranch(student) || "—",
    counselor: resolveCounselorLabel(student, employees),
  };
}

export function buildReportRowFromReqStudent(entry) {
  return {
    key: `req-${String(entry?.id || "").trim()}`,
    kind: "lead",
    entry,
    name: String(entry?.name || entry?.id || "Unknown lead").trim(),
    id: String(entry?.id || "").trim(),
    country: String(entry?.countryToVisit || "—").trim() || "—",
    branch: String(entry?.nearestOffice || entry?.branch || "—").trim() || "—",
    counselor: "—",
  };
}

function getMetricRows(metricId, filteredStudents, filteredReqStudents, appointments, employees) {
  if (metricId === "totalLeadsAllocated") {
    return [
      ...filteredStudents.map((s) => buildReportRowFromStudent(s, employees)),
      ...filteredReqStudents.map((e) => buildReportRowFromReqStudent(e)),
    ];
  }
  if (metricId === "prospectiveLeads") {
    return [
      ...filteredStudents
        .filter((s) => computeMetricForStudent("prospectiveLeads", s, appointments))
        .map((s) => buildReportRowFromStudent(s, employees)),
      ...filteredReqStudents.map((e) => buildReportRowFromReqStudent(e)),
    ];
  }
  return filteredStudents
    .filter((s) => computeMetricForStudent(metricId, s, appointments))
    .map((s) => buildReportRowFromStudent(s, employees));
}

export function computeReportMetrics(students, appointments = [], reqStudents = [], filters = {}, employees = []) {
  const filteredStudents = filterReportStudents(students, filters, employees);
  const filteredReqStudents = filterReportReqStudents(reqStudents, filters);
  const counts = {};
  const lists = {};

  for (const section of REPORT_SECTIONS) {
    for (const metric of section.metrics) {
      const rows = getMetricRows(
        metric.id,
        filteredStudents,
        filteredReqStudents,
        appointments,
        employees
      );
      lists[metric.id] = rows;
      counts[metric.id] = rows.length;
    }
  }

  return { counts, lists, filteredStudents, filteredReqStudents };
}

export function collectReportFilterOptions(students = [], employees = [], reqStudents = []) {
  const branches = new Set();
  const countries = new Set();
  const counselors = new Map();

  for (const student of students) {
    const branch = studentBranch(student);
    if (branch) branches.add(branch);
    const country = String(student?.country || "").trim();
    if (country) countries.add(country);
    for (const id of getAssignedCounselorIds(student)) {
      if (!counselors.has(id)) {
        const emp = employees.find((e) => String(e?.id || "") === id);
        counselors.set(id, String(emp?.name || emp?.username || student?.counselorName || id).trim());
      }
    }
  }

  for (const entry of reqStudents) {
    const branch = String(entry?.nearestOffice || entry?.branch || "").trim();
    if (branch) branches.add(branch);
    const country = String(entry?.countryToVisit || "").trim();
    if (country) countries.add(country);
  }

  return {
    branches: [...branches].sort((a, b) => a.localeCompare(b)),
    countries: [...countries].sort((a, b) => a.localeCompare(b)),
    counselors: [...counselors.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}
