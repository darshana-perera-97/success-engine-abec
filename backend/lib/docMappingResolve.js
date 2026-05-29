const {
  readStages,
  readDocMapping,
  emptyDocConfig,
  ensureDefaultPipelineDocs,
  normalizeStageTasks,
  normalizeAccountDetailsStageId,
  getCountryStages,
  DEFAULT_STAGES,
} = require("../models/docMapping");

const DEFAULT_STAGE_ROWS = DEFAULT_STAGES.map((s) => ({ ...s }));

const OFFER_LETTER_GROUPS = new Set(["Offer Letter", "Offer Received", "Uni Application"]);

function pipelineDocsToChecklist(pipelineDocs) {
  const groupMap = new Map();
  for (const doc of pipelineDocs || []) {
    const name = String(doc?.name || "").trim();
    if (!name || name === "(placeholder)") continue;
    const group = String(doc?.group || "").trim() || "Ungrouped";
    if (!groupMap.has(group)) groupMap.set(group, []);
    const stageIds = Array.isArray(doc.stageIds)
      ? doc.stageIds.map((s) => String(s).trim()).filter(Boolean)
      : [];
    groupMap.get(group).push({
      docType: name,
      required: doc.required !== false,
      visibleFrom: doc.visibleFrom
        ? String(doc.visibleFrom).trim()
        : stageIds[0] || "",
      stageIds,
      completeBy: doc.completeBy ? String(doc.completeBy).trim() : "",
    });
  }
  return Array.from(groupMap.entries()).map(([stage, items]) => ({ stage, items }));
}

function visaDocsToWorkflow(visaDocs) {
  const groupMap = new Map();
  for (const doc of visaDocs || []) {
    const name = String(doc?.name || "").trim();
    if (!name || name === "(placeholder)") continue;
    const group = String(doc?.group || "").trim() || "Ungrouped";
    if (!groupMap.has(group)) groupMap.set(group, []);
    groupMap.get(group).push(name);
  }
  return Array.from(groupMap.entries()).map(([name, items]) => ({ name, items }));
}

function resolveStudentStageId(status, stages) {
  const raw = String(status || "").trim();
  if (!raw || !Array.isArray(stages) || stages.length === 0) return null;
  const byLabel = stages.find((s) => s.label === raw);
  if (byLabel) return byLabel.id;
  const lower = raw.toLowerCase();
  const byId = stages.find((s) => s.id === lower);
  if (byId) return byId.id;
  return null;
}

function documentTypeMatchesRequirement(docType, requiredDocType) {
  const normalizeDocType = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, " ")
      .replace(/[^a-z0-9 ]/g, "");
  const dt = normalizeDocType(docType);
  const req = normalizeDocType(requiredDocType);
  if (!dt || !req) return false;
  return dt === req || dt.includes(req) || req.includes(dt);
}

function getRequiredDocTypesBeforeAdvance(status, countryConfig) {
  const stages = countryConfig?.stages || [];
  const stageId = resolveStudentStageId(status, stages);
  if (!stageId) return [];
  const required = [];
  const seen = new Set();

  for (const doc of countryConfig?.pipelineDocs || []) {
    const name = String(doc?.name || "").trim();
    if (!name || name === "(placeholder)" || doc.required === false) continue;
    if (doc.completeBy === stageId && !seen.has(name)) {
      seen.add(name);
      required.push({ group: doc.group, docType: name });
    }
  }
  if (required.length > 0) return required;

  const legacyGroups = stageId === "application" ? ["Documentation", "Offer Received"] : [];
  for (const category of countryConfig?.checklist || []) {
    if (!legacyGroups.includes(category.stage)) continue;
    for (const item of category.items || []) {
      if (!seen.has(item.docType)) {
        seen.add(item.docType);
        required.push({ group: category.stage, docType: item.docType });
      }
    }
  }
  return required;
}

async function readCountryDocConfig(country) {
  const countryKey = String(country || "").trim();
  if (!countryKey) return null;
  const [allStages, allDocs] = await Promise.all([readStages(), readDocMapping()]);
  const stages = getCountryStages(allStages, countryKey);
  const docs = allDocs[countryKey] || emptyDocConfig();
  const pipelineDocs = ensureDefaultPipelineDocs(docs.pipelineDocs || []);
  return {
    stages,
    pipelineSteps: stages.map((s) => s.label),
    checklist: pipelineDocsToChecklist(pipelineDocs),
    visaWorkflow: visaDocsToWorkflow(docs.visaDocs || []),
    pipelineDocs,
    visaDocs: docs.visaDocs || [],
    stageTasks: normalizeStageTasks(docs.stageTasks),
    accountDetailsStageId: normalizeAccountDetailsStageId(docs.accountDetailsStageId, stages),
  };
}

function isOfferLetterPipelineItem(category, item) {
  return (
    OFFER_LETTER_GROUPS.has(String(category?.stage || "").trim()) &&
    documentTypeMatchesRequirement(item?.docType, "Offer Letter")
  );
}

function collectMissingPipelineDocuments(student, countryConfig) {
  if (!countryConfig) return [];
  const studentDocs = Array.isArray(student?.documents) ? student.documents : [];
  const missing = [];
  for (const category of countryConfig.checklist || []) {
    for (const item of category.items || []) {
      if (isOfferLetterPipelineItem(category, item)) continue;
      const hasUploaded = studentDocs.some(
        (d) =>
          documentTypeMatchesRequirement(d?.type, item.docType) &&
          String(d?.status || "").trim() !== "Rejected"
      );
      if (!hasUploaded) missing.push({ stage: category.stage, docType: item.docType });
    }
  }
  return missing;
}

function collectIncompleteVisaItems(student, countryConfig) {
  if (!countryConfig) return [];
  const visaState = student?.visa && typeof student.visa === "object" ? student.visa : {};
  const incomplete = [];
  for (const stage of countryConfig.visaWorkflow || []) {
    for (const item of stage.items || []) {
      if (visaState[item] !== "Completed") incomplete.push(item);
    }
  }
  return incomplete;
}

function collectMissingVisaPilotUploads(student, countryConfig) {
  if (!countryConfig) return [];
  const studentDocs = Array.isArray(student?.documents) ? student.documents : [];
  const visaState = student?.visa && typeof student.visa === "object" ? student.visa : {};
  const missing = [];
  for (const stage of countryConfig.visaWorkflow || []) {
    for (const item of stage.items || []) {
      if (visaState[item] === "Completed") continue;
      const docType = `Visa Pilot - ${item}`;
      const hasUploaded = studentDocs.some(
        (d) => String(d?.type || "") === docType && String(d?.status || "").trim() !== "Rejected"
      );
      if (!hasUploaded) missing.push({ item, docType });
    }
  }
  return missing;
}

function getEnrolledAdvanceBlockReasons(student, invoices, countryConfig) {
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
  const sid = String(student?.id || "").trim();
  const unpaid = (invoices || []).filter(
    (inv) => String(inv.studentId || "") === sid && String(inv.status || "") !== "Paid"
  );
  if (unpaid.length > 0) {
    reasons.push(
      `${unpaid.length} invoice(s) not paid (status must be Paid): ${unpaid.map((i) => String(i.id || "").trim() || "?").join(", ")}`
    );
  }
  return reasons;
}

module.exports = {
  readCountryDocConfig,
  getRequiredDocTypesBeforeAdvance,
  getEnrolledAdvanceBlockReasons,
  resolveStudentStageId,
  OFFER_LETTER_GROUPS,
  DEFAULT_STAGE_ROWS,
  normalizeAccountDetailsStageId,
};
