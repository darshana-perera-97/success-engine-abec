import { COUNTRY_CHECKLISTS } from "./constants.js";
import { VISA_WORKFLOWS } from "./visaWorkflows.js";
import {
  buildFallbackCountryDocConfig,
  documentTypeMatchesRequirement,
  isOfferLetterChecklistGroup,
  normalizeVisaWorkflowItem,
  studentHasUploadedDocType,
} from "./docMappingConfig.js";

function resolveConfig(countryConfig, country) {
  if (countryConfig?.checklist) return countryConfig;
  return buildFallbackCountryDocConfig(country);
}

function studentHasUniversityOfferLetter(student) {
  return (student?.universityOfferLetters || []).some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    if (!String(entry.url || "").trim()) return false;
    return String(entry.offerStatus || "").trim().toLowerCase() !== "rejected";
  });
}

/**
 * Required pipeline docs from doc mapping only (respects optional / required toggle).
 * @returns {Array<{ stage: string, docType: string }>}
 */
export function collectMissingPipelineDocuments(student, countryConfig) {
  const cfg = resolveConfig(countryConfig, student?.country);
  const studentDocs = Array.isArray(student?.documents) ? student.documents : [];
  const missing = [];
  const seen = new Set();
  const pipelineDocs = Array.isArray(cfg.pipelineDocs) ? cfg.pipelineDocs : [];

  if (pipelineDocs.length > 0) {
    for (const doc of pipelineDocs) {
      const name = String(doc?.name || "").trim();
      if (!name || name === "(placeholder)" || doc.required === false) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      if (
        isOfferLetterChecklistGroup(doc.group) &&
        documentTypeMatchesRequirement(name, "Offer Letter") &&
        studentHasUniversityOfferLetter(student)
      ) {
        continue;
      }
      if (!studentHasUploadedDocType(studentDocs, name)) {
        missing.push({ stage: String(doc.group || "").trim() || "Ungrouped", docType: name });
      }
    }
    return missing;
  }

  for (const category of cfg.checklist || []) {
    for (const item of category.items || []) {
      if (item.required === false) continue;
      const docType = item.docType;
      if (seen.has(docType)) continue;
      seen.add(docType);
      if (
        isOfferLetterChecklistGroup(category.stage) &&
        documentTypeMatchesRequirement(docType, "Offer Letter") &&
        studentHasUniversityOfferLetter(student)
      ) {
        continue;
      }
      if (!studentHasUploadedDocType(studentDocs, docType)) {
        missing.push({ stage: category.stage, docType });
      }
    }
  }
  return missing;
}

/**
 * Required Visa tab checklist items not ticked (Completed).
 * Uses doc-mapping visaDocs when present; only items visible at the Visa pipeline stage
 * (stageIds includes "visa") count toward Enrolled.
 * @returns {string[]}
 */
export function collectIncompleteVisaItems(student, countryConfig) {
  const cfg = resolveConfig(countryConfig, student?.country);
  const incomplete = [];
  const seen = new Set();
  const visaDocs = Array.isArray(cfg.visaDocs) ? cfg.visaDocs : [];

  if (visaDocs.length > 0) {
    for (const doc of visaDocs) {
      const name = String(doc?.name || "").trim();
      if (!name || name === "(placeholder)" || doc.required === false) continue;
      const stageIds = Array.isArray(doc.stageIds)
        ? doc.stageIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [];
      if (stageIds.length > 0 && !stageIds.includes("visa")) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      if (!isVisaChecklistItemTicked(student, name)) incomplete.push(name);
    }
    return incomplete;
  }

  for (const stage of cfg.visaWorkflow || []) {
    for (const item of stage.items || []) {
      const { name, required } = normalizeVisaWorkflowItem(item);
      if (!required || !name || seen.has(name)) continue;
      seen.add(name);
      if (!isVisaChecklistItemTicked(student, name)) incomplete.push(name);
    }
  }
  return incomplete;
}

export const VISA_PILOT_DOC_TYPE_PREFIX = "Visa Pilot - ";

export function buildVisaPilotDocType(item) {
  return `${VISA_PILOT_DOC_TYPE_PREFIX}${item}`;
}

/** Label after "Visa Pilot - " on an uploaded document type. */
export function parseVisaPilotItemFromDocType(docType) {
  const raw = String(docType || "").trim();
  if (!raw.startsWith(VISA_PILOT_DOC_TYPE_PREFIX)) return "";
  return raw.slice(VISA_PILOT_DOC_TYPE_PREFIX.length).trim();
}

/** True when the Visa tab checklist item is marked Completed (ticked). */
export function isVisaChecklistItemTicked(student, itemName) {
  const name = String(itemName || "").trim();
  if (!name) return true;
  const visaState = student?.visa && typeof student.visa === "object" ? student.visa : {};
  return visaState[name] === "Completed";
}

/** Merge a verified Visa Pilot upload into student.visa (auto-tick required item). */
export function applyVisaTickForVerifiedDocument(student, doc) {
  const itemName = parseVisaPilotItemFromDocType(doc?.type);
  if (!itemName || String(doc?.status || "").trim() !== "Verified") return student;
  const visa = student?.visa && typeof student.visa === "object" ? { ...student.visa } : {};
  if (visa[itemName] === "Completed") return student;
  return { ...student, visa: { ...visa, [itemName]: "Completed" } };
}

/**
 * Visa Pilot items required before leaving Documentation stage.
 * @returns {Array<{ item: string, docType: string }>}
 */
export function collectMissingVisaPilotUploads(student, countryConfig) {
  const cfg = resolveConfig(countryConfig, student?.country);
  const studentDocs = Array.isArray(student?.documents) ? student.documents : [];
  const visaState = student?.visa && typeof student.visa === "object" ? student.visa : {};
  const missing = [];
  for (const stage of cfg.visaWorkflow || []) {
    for (const item of stage.items || []) {
      const { name, required } = normalizeVisaWorkflowItem(item);
      if (!required) continue;
      if (visaState[name] === "Completed") continue;
      const docType = buildVisaPilotDocType(name);
      const hasUploaded = studentDocs.some(
        (d) => String(d?.type || "") === docType && String(d?.status || "").trim() !== "Rejected"
      );
      if (!hasUploaded) missing.push({ item: name, docType });
    }
  }
  return missing;
}

export function getMissingVisaPilotUploadLabels(student, countryConfig) {
  return collectMissingVisaPilotUploads(student, countryConfig).map((m) => m.item);
}

export function getUnpaidInvoicesForStudent(studentId, invoices) {
  const sid = String(studentId || "").trim();
  if (!sid) return [];
  return (invoices || []).filter((inv) => String(inv.studentId || "") === sid && String(inv.status || "") !== "Paid");
}

/**
 * @returns {string[]} human-readable block reasons (empty = allowed)
 */
export function getEnrolledAdvanceBlockReasons(student, invoices, countryConfig) {
  const reasons = [];
  const missingPipeline = collectMissingPipelineDocuments(student, countryConfig);
  if (missingPipeline.length > 0) {
    const sample = missingPipeline.slice(0, 8).map((m) => `${m.stage}: ${m.docType}`).join("; ");
    reasons.push(
      `Required pipeline documents missing (${missingPipeline.length}). ${sample}${missingPipeline.length > 8 ? "…" : ""}`
    );
  }
  const incompleteVisa = collectIncompleteVisaItems(student, countryConfig);
  if (incompleteVisa.length > 0) {
    const sample = incompleteVisa.slice(0, 8).join(", ");
    reasons.push(
      `Visa tab: tick required checklist items (${incompleteVisa.length} pending). ${sample}${incompleteVisa.length > 8 ? "…" : ""}`
    );
  }
  const unpaid = getUnpaidInvoicesForStudent(student?.id, invoices);
  if (unpaid.length > 0) {
    reasons.push(
      `${unpaid.length} invoice(s) not paid (status must be Paid): ${unpaid.map((i) => String(i.id || "").trim() || "?").join(", ")}`
    );
  }
  return reasons;
}

/** @deprecated Use country doc config — kept for tests referencing legacy constants shape */
export const LEGACY_COUNTRY_CHECKLISTS = COUNTRY_CHECKLISTS;
export const LEGACY_VISA_WORKFLOWS = VISA_WORKFLOWS;
