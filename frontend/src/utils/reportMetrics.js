import { documentTypeMatchesRequirement } from "../docMappingConfig";
import { normalizePipelineStatus, isVisaGrantedStatus, PIPELINE_STEPS } from "../pipeline";
import { normalizeOfferStatus, listUniversityOfferLetters } from "./universityOfferLetters";
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

export const OFFERS_SECTION_ID = "offers";
export const INTERVIEWS_SECTION_ID = "interviews";

const OFFER_METRIC_IDS = new Set(["conditionalOffer", "unconditionalOffer", "coeReceivedJapan"]);
const INTERVIEW_METRIC_IDS = new Set([
  "preCasInterviewCompleted",
  "preInterviewCompletedJapan",
  "preInterviewPassedJapan",
  "regularInterviewCompletedJapan",
  "regularInterviewFailedJapan",
]);

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
  return listUniversityOfferLetters(student).some((entry) => {
    const status = normalizeOfferStatus(entry.offerStatus);
    return status !== "Rejected" && status === targetStatus;
  });
}

function sortReportRows(rows) {
  return [...rows].sort((a, b) => {
    const nameCmp = String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
      sensitivity: "base",
    });
    if (nameCmp !== 0) return nameCmp;
    return String(a?.key || "").localeCompare(String(b?.key || ""));
  });
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

function appointmentOutcomeNotesMatch(apt, { passedOnly = false, failedOnly = false } = {}) {
  const notes = norm(apt?.outcomeNotes);
  if (passedOnly && (notes.includes("fail") || notes.includes("failed"))) return false;
  if (failedOnly && !(notes.includes("fail") || notes.includes("failed"))) return false;
  return true;
}

function listMatchingAppointments(student, appointments, { type, status = "Completed", countryFilter = null, passedOnly = false, failedOnly = false }) {
  const sid = String(student?.id || "").trim();
  if (!sid) return [];
  if (countryFilter && !countryFilter(student)) return [];
  const matches = [];
  for (const apt of appointments || []) {
    if (String(apt?.studentId || "").trim() !== sid) continue;
    if (norm(apt?.type) !== norm(type)) continue;
    if (norm(apt?.status) !== norm(status)) continue;
    if (!appointmentOutcomeNotesMatch(apt, { passedOnly, failedOnly })) continue;
    matches.push(apt);
  }
  return matches;
}

function studentMatchesAppointment(student, appointments, criteria) {
  return listMatchingAppointments(student, appointments, criteria).length > 0;
}

function getAppointmentCompletedAt(apt) {
  const updatedAt = String(apt?.updatedAt || "").trim();
  if (updatedAt) return updatedAt;
  const date = String(apt?.date || "").trim();
  const time = String(apt?.time || "").trim();
  if (date && time) return `${date}T${time}`;
  if (date) return date;
  return "";
}

function appointmentMatchesDateFilter(apt, filters) {
  if (!filters.dateFrom && !filters.dateTo) return true;
  return inDateRange(getAppointmentCompletedAt(apt), filters.dateFrom, filters.dateTo);
}

function deriveInterviewOutcome(apt) {
  const notes = String(apt?.outcomeNotes || "").trim();
  if (notes) return notes;
  const status = String(apt?.status || "").trim();
  return status || "Completed";
}

function studentMatchesFilters(student, filters, employees, { skipDate = false } = {}) {
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
  if (!skipDate && !inDateRange(student?.createdAt, filters.dateFrom, filters.dateTo)) return false;
  return true;
}

function getMatchingOfferEntries(student, targetStatus) {
  return listUniversityOfferLetters(student).filter((entry) => {
    const status = normalizeOfferStatus(entry.offerStatus);
    return status !== "Rejected" && status === targetStatus;
  });
}

function offerEntryMatchesDateFilter(entry, filters) {
  if (!filters.dateFrom && !filters.dateTo) return true;
  return inDateRange(entry?.uploadedAt, filters.dateFrom, filters.dateTo);
}

function getLatestVerifiedCoeDoc(student) {
  let best = null;
  let bestMs = -1;
  for (const doc of student?.documents || []) {
    if (!doc || typeof doc !== "object") continue;
    const docType = String(doc.type || "").trim();
    const status = norm(doc.status);
    if (status !== "verified") continue;
    if (!COE_DOC_TYPES.some((t) => documentTypeMatchesRequirement(docType, t))) continue;
    const ms = parseDateMs(doc.verifiedAt || doc.uploadedAt) || 0;
    if (ms >= bestMs) {
      bestMs = ms;
      best = doc;
    }
  }
  return best;
}

function getOfferMetricEventDate(student, metricId) {
  if (metricId === "conditionalOffer") {
    return getMatchingOfferEntries(student, "Conditional")[0]?.uploadedAt || "";
  }
  if (metricId === "unconditionalOffer") {
    return getMatchingOfferEntries(student, "Unconditional")[0]?.uploadedAt || "";
  }
  if (metricId === "coeReceivedJapan") {
    const doc = getLatestVerifiedCoeDoc(student);
    return doc ? String(doc.verifiedAt || doc.uploadedAt || "").trim() : "";
  }
  return "";
}

function studentMatchesOfferDateFilter(student, metricId, filters) {
  if (!filters.dateFrom && !filters.dateTo) return true;
  const eventDate = getOfferMetricEventDate(student, metricId);
  return inDateRange(eventDate, filters.dateFrom, filters.dateTo);
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

export function filterReportStudents(students, filters = {}, employees = [], options = {}) {
  return (students || []).filter((student) => studentMatchesFilters(student, filters, employees, options));
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

export function buildOfferReportRowFromStudent(student, employees = [], metricId) {
  const base = buildReportRowFromStudent(student, employees);
  if (metricId === "coeReceivedJapan") {
    const doc = getLatestVerifiedCoeDoc(student);
    const status = String(doc?.status || "").trim();
    return {
      ...base,
      tableVariant: "offer",
      offerName: String(doc?.name || doc?.type || "COE").trim() || "COE",
      offerStatus: status ? status.charAt(0).toUpperCase() + status.slice(1) : "Verified",
      receivedAt: String(doc?.verifiedAt || doc?.uploadedAt || "").trim(),
    };
  }
  return { ...base, tableVariant: "offer" };
}

function buildOfferLetterReportRows(students, employees, targetStatus, filters) {
  const rows = [];
  for (const student of students || []) {
    if (!studentMatchesFilters(student, filters, employees, { skipDate: true })) continue;
    const sid = String(student?.id || "").trim();
    for (const entry of listUniversityOfferLetters(student)) {
      const status = normalizeOfferStatus(entry.offerStatus);
      if (status === "Rejected" || status !== targetStatus) continue;
      if (!offerEntryMatchesDateFilter(entry, filters)) continue;
      const base = buildReportRowFromStudent(student, employees);
      rows.push({
        ...base,
        key: `offer-${sid}-${String(entry.id || entry.name || rows.length).trim()}`,
        tableVariant: "offer",
        offerName: String(entry.name || "Offer letter").trim() || "Offer letter",
        offerStatus: status,
        receivedAt: String(entry.uploadedAt || "").trim(),
      });
    }
  }
  return rows;
}

function getOfferMetricStudents(students, metricId, appointments, filters) {
  return students.filter((student) => {
    if (!computeMetricForStudent(metricId, student, appointments)) return false;
    return studentMatchesOfferDateFilter(student, metricId, filters);
  });
}

function finalizeMetricRows(rows) {
  return sortReportRows(rows);
}

function sortOfferLetterReportRows(rows) {
  return [...rows].sort((a, b) => {
    const dateCmp = (parseDateMs(b.receivedAt) || 0) - (parseDateMs(a.receivedAt) || 0);
    if (dateCmp !== 0) return dateCmp;
    return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" });
  });
}

function sortInterviewReportRows(rows) {
  return [...rows].sort((a, b) => {
    const dateCmp = (parseDateMs(b.completedAt) || 0) - (parseDateMs(a.completedAt) || 0);
    if (dateCmp !== 0) return dateCmp;
    return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" });
  });
}

function buildInterviewReportRowFromAppointment(student, employees, apt, keySuffix) {
  const sid = String(student?.id || "").trim();
  const base = buildReportRowFromStudent(student, employees);
  const aptId = String(apt?.id || keySuffix || "").trim();
  return {
    ...base,
    key: `interview-${sid}-${aptId || keySuffix}`,
    tableVariant: "interview",
    interviewType: String(apt?.type || apt?.title || "Interview").trim() || "Interview",
    interviewOutcome: deriveInterviewOutcome(apt),
    completedAt: getAppointmentCompletedAt(apt),
  };
}

function buildInterviewReportRowFromVisaItem(student, employees, itemName) {
  const sid = String(student?.id || "").trim();
  const base = buildReportRowFromStudent(student, employees);
  return {
    ...base,
    key: `interview-visa-${sid}-${norm(itemName)}`,
    tableVariant: "interview",
    interviewType: `${itemName} (Visa checklist)`,
    interviewOutcome: "Completed",
    completedAt: "",
  };
}

function buildPreCasInterviewReportRows(students, appointments, employees, filters) {
  const rows = [];
  for (const student of students || []) {
    if (!studentMatchesFilters(student, filters, employees, { skipDate: true })) continue;
    if (!isUk(student?.country)) continue;
    const appointmentTypes = ["Pre Cas Interview", "Mock Interview"];
    for (const type of appointmentTypes) {
      for (const apt of listMatchingAppointments(student, appointments, { type, status: "Completed" })) {
        if (!appointmentMatchesDateFilter(apt, filters)) continue;
        rows.push(buildInterviewReportRowFromAppointment(student, employees, apt, type));
      }
    }
    if (visaItemCompleted(student, "CAS Issuance")) {
      const visaRow = buildInterviewReportRowFromVisaItem(student, employees, "CAS Issuance");
      if (inDateRange(visaRow.completedAt, filters.dateFrom, filters.dateTo)) {
        rows.push(visaRow);
      }
    }
  }
  return rows;
}

function buildJapanInterviewReportRows(students, appointments, employees, filters, { type, passedOnly = false, failedOnly = false }) {
  const rows = [];
  const countryFilter = (s) => isJapan(s?.country);
  for (const student of students || []) {
    if (!studentMatchesFilters(student, filters, employees, { skipDate: true })) continue;
    for (const apt of listMatchingAppointments(student, appointments, {
      type,
      status: "Completed",
      countryFilter,
      passedOnly,
      failedOnly,
    })) {
      if (!appointmentMatchesDateFilter(apt, filters)) continue;
      rows.push(buildInterviewReportRowFromAppointment(student, employees, apt, type));
    }
  }
  return rows;
}

function buildInterviewReportRows(students, appointments, employees, metricId, filters) {
  if (metricId === "preCasInterviewCompleted") {
    return buildPreCasInterviewReportRows(students, appointments, employees, filters);
  }
  if (metricId === "preInterviewCompletedJapan") {
    return buildJapanInterviewReportRows(students, appointments, employees, filters, { type: "Pre interview" });
  }
  if (metricId === "preInterviewPassedJapan") {
    return buildJapanInterviewReportRows(students, appointments, employees, filters, {
      type: "Pre interview",
      passedOnly: true,
    });
  }
  if (metricId === "regularInterviewCompletedJapan") {
    return buildJapanInterviewReportRows(students, appointments, employees, filters, { type: "Regular Interview" });
  }
  if (metricId === "regularInterviewFailedJapan") {
    return buildJapanInterviewReportRows(students, appointments, employees, filters, {
      type: "Regular Interview",
      failedOnly: true,
    });
  }
  return [];
}

function getMetricRows(metricId, filteredStudents, filteredReqStudents, appointments, employees, filters = {}, studentsWithoutDateFilter = []) {
  if (metricId === "totalLeadsAllocated") {
    return finalizeMetricRows([
      ...filteredStudents.map((s) => buildReportRowFromStudent(s, employees)),
      ...filteredReqStudents.map((e) => buildReportRowFromReqStudent(e)),
    ]);
  }
  if (metricId === "prospectiveLeads") {
    return finalizeMetricRows([
      ...filteredStudents
        .filter((s) => computeMetricForStudent("prospectiveLeads", s, appointments))
        .map((s) => buildReportRowFromStudent(s, employees)),
      ...filteredReqStudents.map((e) => buildReportRowFromReqStudent(e)),
    ]);
  }
  if (OFFER_METRIC_IDS.has(metricId)) {
    if (metricId === "conditionalOffer") {
      return sortOfferLetterReportRows(
        buildOfferLetterReportRows(studentsWithoutDateFilter, employees, "Conditional", filters)
      );
    }
    if (metricId === "unconditionalOffer") {
      return sortOfferLetterReportRows(
        buildOfferLetterReportRows(studentsWithoutDateFilter, employees, "Unconditional", filters)
      );
    }
    return finalizeMetricRows(
      getOfferMetricStudents(studentsWithoutDateFilter, metricId, appointments, filters).map((s) =>
        buildOfferReportRowFromStudent(s, employees, metricId)
      )
    );
  }
  if (INTERVIEW_METRIC_IDS.has(metricId)) {
    return sortInterviewReportRows(
      buildInterviewReportRows(studentsWithoutDateFilter, appointments, employees, metricId, filters)
    );
  }
  return finalizeMetricRows(
    filteredStudents
      .filter((s) => computeMetricForStudent(metricId, s, appointments))
      .map((s) => buildReportRowFromStudent(s, employees))
  );
}

export function computeReportMetrics(students, appointments = [], reqStudents = [], filters = {}, employees = []) {
  const filteredStudents = filterReportStudents(students, filters, employees);
  const filteredStudentsNoDate = filterReportStudents(students, filters, employees, { skipDate: true });
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
        employees,
        filters,
        filteredStudentsNoDate
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
