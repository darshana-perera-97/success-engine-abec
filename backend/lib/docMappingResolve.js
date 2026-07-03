const {
  readStages,
  readDocMapping,
  emptyDocConfig,
  ensureDefaultPipelineDocs,
  normalizeStageTasks,
  normalizeAccountDetailsStageId,
  normalizeDocumentNotifyDocs,
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
    documentNotifyDocs: normalizeDocumentNotifyDocs(docs.documentNotifyDocs),
  };
}

function isDocumentWhatsappNotifyEnabled(countryConfig, docType) {
  const list = countryConfig?.documentNotifyDocs || [];
  if (!list.length) return false;
  const dt = String(docType || "").trim();
  if (!dt) return false;
  return list.some((entry) => documentTypeMatchesRequirement(dt, entry.docName));
}

function isOfferLetterPipelineItem(category, item) {
  return (
    OFFER_LETTER_GROUPS.has(String(category?.stage || "").trim()) &&
    documentTypeMatchesRequirement(item?.docType, "Offer Letter")
  );
}

function studentHasUniversityOfferLetter(student) {
  return (student?.universityOfferLetters || []).some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    if (!String(entry.url || "").trim()) return false;
    return String(entry.offerStatus || "").trim().toLowerCase() !== "rejected";
  });
}

function collectMissingPipelineDocuments(student, countryConfig) {
  if (!countryConfig) return [];
  const studentDocs = Array.isArray(student?.documents) ? student.documents : [];
  const missing = [];
  const seen = new Set();
  const pipelineDocs = Array.isArray(countryConfig.pipelineDocs) ? countryConfig.pipelineDocs : [];

  if (pipelineDocs.length > 0) {
    for (const doc of pipelineDocs) {
      const name = String(doc?.name || "").trim();
      if (!name || name === "(placeholder)" || doc.required === false) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      if (
        OFFER_LETTER_GROUPS.has(String(doc.group || "").trim()) &&
        documentTypeMatchesRequirement(name, "Offer Letter") &&
        studentHasUniversityOfferLetter(student)
      ) {
        continue;
      }
      const hasUploaded = studentDocs.some(
        (d) =>
          documentTypeMatchesRequirement(d?.type, name) &&
          String(d?.status || "").trim() !== "Rejected"
      );
      if (!hasUploaded) {
        missing.push({ stage: String(doc.group || "").trim() || "Ungrouped", docType: name });
      }
    }
    return missing;
  }

  for (const category of countryConfig.checklist || []) {
    for (const item of category.items || []) {
      if (item.required === false) continue;
      const docType = item.docType;
      if (seen.has(docType)) continue;
      seen.add(docType);
      if (isOfferLetterPipelineItem(category, item) && studentHasUniversityOfferLetter(student)) {
        continue;
      }
      const hasUploaded = studentDocs.some(
        (d) =>
          documentTypeMatchesRequirement(d?.type, docType) &&
          String(d?.status || "").trim() !== "Rejected"
      );
      if (!hasUploaded) missing.push({ stage: category.stage, docType });
    }
  }
  return missing;
}

function normalizeVisaWorkflowItem(item) {
  if (typeof item === "string") {
    return { name: item, required: true };
  }
  const name = String(item?.name || item?.label || "").trim();
  return { name, required: item?.required !== false };
}

function isVisaChecklistItemTicked(student, itemName) {
  const name = String(itemName || "").trim();
  if (!name) return true;
  const visaState = student?.visa && typeof student.visa === "object" ? student.visa : {};
  return visaState[name] === "Completed";
}

function collectIncompleteVisaItems(student, countryConfig) {
  if (!countryConfig) return [];
  const incomplete = [];
  const seen = new Set();
  const visaDocs = Array.isArray(countryConfig.visaDocs) ? countryConfig.visaDocs : [];

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

  for (const stage of countryConfig.visaWorkflow || []) {
    for (const item of stage.items || []) {
      const { name, required } = normalizeVisaWorkflowItem(item);
      if (!required || !name || seen.has(name)) continue;
      seen.add(name);
      if (!isVisaChecklistItemTicked(student, name)) incomplete.push(name);
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
      const { name, required } = normalizeVisaWorkflowItem(item);
      if (!required || !name) continue;
      if (visaState[name] === "Completed") continue;
      const docType = `Visa Pilot - ${name}`;
      const hasUploaded = studentDocs.some(
        (d) => String(d?.type || "") === docType && String(d?.status || "").trim() !== "Rejected"
      );
      if (!hasUploaded) missing.push({ item: name, docType });
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
  const sid = String(student?.id || "").trim();
  const settledStatuses = new Set(["Paid", "Waived", "Wave-off Rejected"]);
  const unpaid = (invoices || []).filter(
    (inv) => String(inv.studentId || "") === sid && !settledStatuses.has(String(inv.status || "").trim())
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
  isDocumentWhatsappNotifyEnabled,
  documentTypeMatchesRequirement,
  OFFER_LETTER_GROUPS,
  DEFAULT_STAGE_ROWS,
  normalizeAccountDetailsStageId,
};
