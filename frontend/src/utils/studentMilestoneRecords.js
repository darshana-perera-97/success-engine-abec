import { documentTypeMatchesRequirement } from "../docMappingConfig";
import { isVisaGrantedStatus } from "../pipeline";
import { normalizeOfferStatus } from "./universityOfferLetters";

export const MILESTONE_TYPES = ["Offer Letter", "Granted Visa", "COE", "CAS"];

function resolveStudentCounselorDisplayName(student, employees) {
  const match = (employees || []).find((e) => e && e.id === student?.counselor);
  return String(match?.name || match?.username || student?.counselorName || "").trim() || "—";
}

export function parseMilestoneEventDateMs(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function formatMilestoneDisplayDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isCoeDocType(docType) {
  return (
    documentTypeMatchesRequirement(docType, "CoE") ||
    documentTypeMatchesRequirement(docType, "COE")
  );
}

function isCasDocType(docType) {
  return documentTypeMatchesRequirement(docType, "CAS");
}

function isVisaGrantDocType(docType) {
  return (
    documentTypeMatchesRequirement(docType, "Visa Grant Notice") ||
    documentTypeMatchesRequirement(docType, "Visa Grant")
  );
}

function pushDocumentMilestone(rows, student, meta, doc, milestoneType) {
  const sid = meta.sid;
  const docType = String(doc.type || "").trim();
  const status = String(doc.status || "Pending").trim();
  if (!docType || status.toLowerCase() === "rejected") return;
  const uploadedAt = String(doc.verifiedAt || doc.uploadedAt || "").trim();
  const eventDateMs = parseMilestoneEventDateMs(uploadedAt);
  rows.push({
    key: `${sid}-doc-${doc.id || docType}-${rows.length}`,
    student,
    studentName: meta.studentName,
    branch: meta.branch,
    country: meta.country,
    counselorLabel: meta.counselorLabel,
    milestoneType,
    status,
    eventDate: uploadedAt,
    eventDateMs,
    docName: String(doc.name || "").trim(),
  });
}

export function buildStudentMilestoneRecords(students, employees) {
  const rows = [];
  for (const student of students || []) {
    const sid = String(student?.id || "").trim();
    const studentName = String(student?.name || "").trim() || sid || "Unknown student";
    const branch = String(student?.branch || "").trim() || "—";
    const country = String(student?.country || "").trim() || "—";
    const counselorLabel = resolveStudentCounselorDisplayName(student, employees);
    const meta = { sid, studentName, branch, country, counselorLabel };

    for (const entry of student?.universityOfferLetters || []) {
      if (!entry || typeof entry !== "object" || !String(entry.url || "").trim()) continue;
      const uploadedAt = String(entry.uploadedAt || "").trim();
      const eventDateMs = parseMilestoneEventDateMs(uploadedAt);
      rows.push({
        key: `${sid}-offer-${entry.id || entry.name || rows.length}`,
        student,
        studentName,
        branch,
        country,
        counselorLabel,
        milestoneType: "Offer Letter",
        status: normalizeOfferStatus(entry.offerStatus),
        eventDate: uploadedAt,
        eventDateMs,
      });
    }

    let hasVisaGrantRow = false;
    for (const doc of student?.documents || []) {
      if (!doc || typeof doc !== "object") continue;
      const docType = String(doc.type || "").trim();
      if (isCoeDocType(docType)) {
        pushDocumentMilestone(rows, student, meta, doc, "COE");
      } else if (isCasDocType(docType)) {
        pushDocumentMilestone(rows, student, meta, doc, "CAS");
      } else if (isVisaGrantDocType(docType)) {
        pushDocumentMilestone(rows, student, meta, doc, "Granted Visa");
        hasVisaGrantRow = true;
      }
    }

    if (!hasVisaGrantRow && isVisaGrantedStatus(student?.status)) {
      const eventDate = String(student.updatedAt || student.createdAt || "").trim();
      const eventDateMs = parseMilestoneEventDateMs(eventDate);
      rows.push({
        key: `${sid}-visa-status`,
        student,
        studentName,
        branch,
        country,
        counselorLabel,
        milestoneType: "Granted Visa",
        status: String(student.status || "").trim() || "Visa",
        eventDate,
        eventDateMs,
        detail: "Pipeline stage",
      });
    }
  }

  rows.sort((a, b) => (b.eventDateMs || 0) - (a.eventDateMs || 0));
  return rows;
}

export function filterMilestoneRecords(rows, filters = {}) {
  const searchLower = String(filters.search || "").trim().toLowerCase();
  const milestoneType = String(filters.milestoneType || "All");
  const branch = String(filters.branch || "All");
  const country = String(filters.country || "All");
  const counselor = String(filters.counselor || "All");
  const status = String(filters.status || "All");
  const dateFrom = String(filters.dateFrom || "").trim();
  const dateTo = String(filters.dateTo || "").trim();

  const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
  const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

  return (rows || []).filter((row) => {
    if (searchLower) {
      const hay = `${row.studentName} ${row.student?.id || ""} ${row.counselorLabel}`.toLowerCase();
      if (!hay.includes(searchLower)) return false;
    }
    if (milestoneType !== "All" && row.milestoneType !== milestoneType) return false;
    if (branch !== "All" && row.branch !== branch) return false;
    if (country !== "All" && row.country !== country) return false;
    if (counselor !== "All" && row.counselorLabel !== counselor) return false;
    if (status !== "All" && row.status !== status) return false;
    if (fromMs != null && Number.isFinite(fromMs)) {
      if (!row.eventDateMs || row.eventDateMs < fromMs) return false;
    }
    if (toMs != null && Number.isFinite(toMs)) {
      if (!row.eventDateMs || row.eventDateMs > toMs) return false;
    }
    return true;
  });
}

export function collectMilestoneFilterOptions(rows) {
  const branches = new Set();
  const countries = new Set();
  const counselors = new Set();
  const statuses = new Set();
  for (const row of rows || []) {
    if (row.branch && row.branch !== "—") branches.add(row.branch);
    if (row.country && row.country !== "—") countries.add(row.country);
    if (row.counselorLabel && row.counselorLabel !== "—") counselors.add(row.counselorLabel);
    if (row.status) statuses.add(row.status);
  }
  const sortAlpha = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });
  return {
    branches: Array.from(branches).sort(sortAlpha),
    countries: Array.from(countries).sort(sortAlpha),
    counselors: Array.from(counselors).sort(sortAlpha),
    statuses: Array.from(statuses).sort(sortAlpha),
  };
}
