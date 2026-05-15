import { COUNTRY_CHECKLISTS } from "./constants.js";
import { VISA_WORKFLOWS } from "./visaWorkflows.js";

const PIPELINE_DOC_STAGES = ["Documentation", "Uni Application", "Offer Received"];

/**
 * @returns {Array<{ stage: string, docType: string }>}
 */
export function collectMissingPipelineDocuments(student) {
  const country = student?.country;
  const countryChecklist = COUNTRY_CHECKLISTS[country] || COUNTRY_CHECKLISTS["Default"];
  const studentDocs = Array.isArray(student?.documents) ? student.documents : [];
  const missing = [];
  for (const stageName of PIPELINE_DOC_STAGES) {
    const stageReqs = countryChecklist.find((c) => c.stage === stageName);
    if (!stageReqs) continue;
    for (const item of stageReqs.items) {
      const hasUploaded = studentDocs.some((d) => {
        const dt = String(d?.type || "");
        const req = String(item.docType || "");
        const typeMatch = dt === req || dt.includes(req) || req.includes(dt);
        return typeMatch && String(d?.status || "").trim() !== "Rejected";
      });
      if (!hasUploaded) missing.push({ stage: stageName, docType: item.docType });
    }
  }
  return missing;
}

/** @returns {string[]} visa workflow item labels not marked Completed */
export function collectIncompleteVisaItems(student) {
  const country = student?.country;
  const workflow = VISA_WORKFLOWS[country] || VISA_WORKFLOWS.Default;
  const visaState = student?.visa && typeof student.visa === "object" ? student.visa : {};
  const incomplete = [];
  for (const stage of workflow) {
    for (const item of stage.items) {
      if (visaState[item] !== "Completed") incomplete.push(item);
    }
  }
  return incomplete;
}

export function buildVisaPilotDocType(item) {
  return `Visa Pilot - ${item}`;
}

/**
 * Visa Pilot items required before leaving Documentation stage.
 * Satisfied by an upload for the item's doc type, or by ticking the item Complete in Visa Pilot.
 * @returns {Array<{ item: string, docType: string }>}
 */
export function collectMissingVisaPilotUploads(student) {
  const country = student?.country;
  const workflow = VISA_WORKFLOWS[country] || VISA_WORKFLOWS.Default;
  const studentDocs = Array.isArray(student?.documents) ? student.documents : [];
  const visaState = student?.visa && typeof student.visa === "object" ? student.visa : {};
  const missing = [];
  for (const stage of workflow) {
    for (const item of stage.items) {
      if (visaState[item] === "Completed") continue;
      const docType = buildVisaPilotDocType(item);
      const hasUploaded = studentDocs.some((d) => {
        const dt = String(d?.type || "");
        return dt === docType && String(d?.status || "").trim() !== "Rejected";
      });
      if (!hasUploaded) missing.push({ item, docType });
    }
  }
  return missing;
}

/** @returns {string[]} visa workflow labels not satisfied (no upload and not ticked Complete) */
export function getMissingVisaPilotUploadLabels(student) {
  return collectMissingVisaPilotUploads(student).map((m) => m.item);
}

/** Invoices for this student that are not fully paid (blocks Enrolled). */
export function getUnpaidInvoicesForStudent(studentId, invoices) {
  const sid = String(studentId || "").trim();
  if (!sid) return [];
  return (invoices || []).filter((inv) => String(inv.studentId || "") === sid && String(inv.status || "") !== "Paid");
}

/**
 * @returns {string[]} human-readable block reasons (empty = allowed)
 */
export function getEnrolledAdvanceBlockReasons(student, invoices) {
  const reasons = [];
  const missingPipeline = collectMissingPipelineDocuments(student);
  if (missingPipeline.length > 0) {
    const sample = missingPipeline.slice(0, 8).map((m) => `${m.stage}: ${m.docType}`).join("; ");
    reasons.push(
      `Pipeline documents incomplete (${missingPipeline.length} missing). ${sample}${missingPipeline.length > 8 ? "…" : ""}`
    );
  }
  const visaInc = collectIncompleteVisaItems(student);
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
