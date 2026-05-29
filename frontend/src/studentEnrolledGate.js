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

/**
 * @returns {Array<{ stage: string, docType: string }>}
 */
export function collectMissingPipelineDocuments(student, countryConfig) {
  const cfg = resolveConfig(countryConfig, student?.country);
  const studentDocs = Array.isArray(student?.documents) ? student.documents : [];
  const missing = [];
  for (const category of cfg.checklist || []) {
    for (const item of category.items || []) {
      if (item.required === false) continue;
      if (
        isOfferLetterChecklistGroup(category.stage) &&
        documentTypeMatchesRequirement(item.docType, "Offer Letter")
      ) {
        continue;
      }
      if (!studentHasUploadedDocType(studentDocs, item.docType)) {
        missing.push({ stage: category.stage, docType: item.docType });
      }
    }
  }
  return missing;
}

/** @returns {string[]} visa workflow item labels not marked Completed */
export function collectIncompleteVisaItems(student, countryConfig) {
  const cfg = resolveConfig(countryConfig, student?.country);
  const visaState = student?.visa && typeof student.visa === "object" ? student.visa : {};
  const incomplete = [];
  for (const stage of cfg.visaWorkflow || []) {
    for (const item of stage.items || []) {
      const { name, required } = normalizeVisaWorkflowItem(item);
      if (!required) continue;
      if (visaState[name] !== "Completed") incomplete.push(name);
    }
  }
  return incomplete;
}

export function buildVisaPilotDocType(item) {
  return `Visa Pilot - ${item}`;
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
      `Pipeline documents incomplete (${missingPipeline.length} missing). ${sample}${missingPipeline.length > 8 ? "…" : ""}`
    );
  }
  const visaInc = collectIncompleteVisaItems(student, countryConfig);
  if (visaInc.length > 0) {
    reasons.push(`Visa checklist incomplete (${visaInc.length}): ${visaInc.join(", ")}`);
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
