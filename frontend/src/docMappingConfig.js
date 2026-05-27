import { COUNTRY_CHECKLISTS } from "./constants";
import { PIPELINE_STEPS, normalizePipelineStatus, getVisibleCountryChecklistStages } from "./pipeline";
import { VISA_WORKFLOWS } from "./visaWorkflows";

const DEFAULT_STAGE_ROWS = [
  { id: "inquiry", label: "Inquiry", locked: true },
  { id: "registration", label: "Registration", locked: true },
  { id: "application", label: "Application", locked: true },
  { id: "documentation", label: "Documentation", locked: true },
  { id: "visa", label: "Visa", locked: true },
  { id: "enrolled", label: "Enrolled", locked: true },
];

const OFFER_LETTER_GROUPS = new Set(["Offer Letter", "Offer Received", "Uni Application"]);

/**
 * @param {{ stages?: Array<{id:string,label:string}>, pipelineDocs?: Array, visaDocs?: Array }} apiData
 */
export function buildCountryDocConfig(apiData) {
  const stages = Array.isArray(apiData?.stages) && apiData.stages.length > 0 ? apiData.stages : DEFAULT_STAGE_ROWS;
  const pipelineDocs = Array.isArray(apiData?.pipelineDocs) ? apiData.pipelineDocs : [];
  const visaDocs = Array.isArray(apiData?.visaDocs) ? apiData.visaDocs : [];
  return {
    stages,
    pipelineSteps: stages.map((s) => s.label),
    checklist: pipelineDocsToChecklist(pipelineDocs),
    visaWorkflow: normalizeVisaWorkflowStages(visaDocsToWorkflow(visaDocs)),
    pipelineDocs,
    visaDocs,
  };
}

function withDefaultRequiredOnChecklist(checklist) {
  return (checklist || []).map((category) => ({
    ...category,
    items: (category.items || []).map((item) => ({
      ...item,
      required: item.required !== false,
    })),
  }));
}

export function normalizeVisaWorkflowStages(stages) {
  return (stages || []).map((stage) => ({
    ...stage,
    items: (stage.items || []).map((item) => normalizeVisaWorkflowItem(item)),
  }));
}

/** @returns {{ name: string, required: boolean }} */
export function normalizeVisaWorkflowItem(item) {
  if (typeof item === "string") {
    return { name: item, required: true };
  }
  const name = String(item?.name || item?.label || "").trim();
  return { name, required: item?.required !== false };
}

export function visaItemLabel(item) {
  return normalizeVisaWorkflowItem(item).name;
}

/** Fallback when API fails — mirrors legacy constants. */
export function buildFallbackCountryDocConfig(country) {
  const countryKey = String(country || "").trim();
  return {
    stages: DEFAULT_STAGE_ROWS,
    pipelineSteps: [...PIPELINE_STEPS],
    checklist: withDefaultRequiredOnChecklist(
      COUNTRY_CHECKLISTS[countryKey] || COUNTRY_CHECKLISTS.Default
    ),
    visaWorkflow: normalizeVisaWorkflowStages(
      VISA_WORKFLOWS[countryKey] || VISA_WORKFLOWS.Default
    ),
    pipelineDocs: [],
    visaDocs: [],
  };
}

export function pipelineDocsToChecklist(pipelineDocs) {
  const groupMap = new Map();
  for (const doc of pipelineDocs || []) {
    const name = String(doc?.name || "").trim();
    if (!name || name === "(placeholder)") continue;
    const group = String(doc?.group || "").trim() || "Ungrouped";
    if (!groupMap.has(group)) groupMap.set(group, []);
    groupMap.get(group).push({
      docType: name,
      description: "",
      required: doc.required !== false,
      locked: doc.locked === true,
      stageIds: Array.isArray(doc.stageIds) ? doc.stageIds.map((s) => String(s).trim()).filter(Boolean) : [],
      completeBy: doc.completeBy ? String(doc.completeBy).trim() : "",
    });
  }
  return Array.from(groupMap.entries()).map(([stage, items]) => ({ stage, items }));
}

export function visaDocsToWorkflow(visaDocs) {
  const groupMap = new Map();
  for (const doc of visaDocs || []) {
    const name = String(doc?.name || "").trim();
    if (!name || name === "(placeholder)") continue;
    const group = String(doc?.group || "").trim() || "Ungrouped";
    if (!groupMap.has(group)) groupMap.set(group, []);
    groupMap.get(group).push({
      name,
      required: doc.required !== false,
    });
  }
  return Array.from(groupMap.entries()).map(([name, items]) => ({
    name,
    description: "",
    items,
    blockerMessage: "",
  }));
}

export function normalizeStageLabelKey(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** True when two stage labels/ids refer to the same pipeline step (e.g. "interview" ≈ "Interview training"). */
export function stageLabelsEquivalent(a, b) {
  const na = normalizeStageLabelKey(a);
  const nb = normalizeStageLabelKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

export function getPipelineStagesForConfig(countryConfig) {
  if (Array.isArray(countryConfig?.stages) && countryConfig.stages.length > 0) {
    return countryConfig.stages;
  }
  return DEFAULT_STAGE_ROWS.map((s) => ({ ...s }));
}

export function getPipelineStepLabels(countryConfig) {
  return getPipelineStagesForConfig(countryConfig).map((s) => s.label);
}

export function resolveStudentStageId(status, stages) {
  const raw = String(status || "").trim();
  if (!raw || !Array.isArray(stages) || stages.length === 0) return null;

  const canonical = normalizePipelineStatus(raw);
  const candidates = [raw, canonical];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const exact = stages.find((s) => s.label === candidate);
    if (exact) return exact.id;
    const lower = candidate.toLowerCase();
    const caseInsensitive = stages.find(
      (s) => s.label.toLowerCase() === lower || s.id === lower
    );
    if (caseInsensitive) return caseInsensitive.id;
    const fuzzy = stages.find(
      (s) => stageLabelsEquivalent(s.label, candidate) || stageLabelsEquivalent(s.id, candidate)
    );
    if (fuzzy) return fuzzy.id;
  }

  return null;
}

export function getStudentPipelineStepIndex(status, stages) {
  if (!Array.isArray(stages) || stages.length === 0) return -1;

  const stageId = resolveStudentStageId(status, stages);
  if (stageId) {
    const idx = stages.findIndex((s) => s.id === stageId);
    if (idx >= 0) return idx;
  }

  const raw = String(status || "").trim();
  const canonical = normalizePipelineStatus(raw);

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    if (
      stageLabelsEquivalent(stage.label, raw) ||
      stageLabelsEquivalent(stage.label, canonical) ||
      stageLabelsEquivalent(stage.id, raw) ||
      stageLabelsEquivalent(stage.id, canonical)
    ) {
      return i;
    }
  }

  return -1;
}

export function getNextPipelineStepLabel(status, countryConfig) {
  const stages = countryConfig?.stages;
  if (!Array.isArray(stages) || stages.length === 0) return null;
  const idx = getStudentPipelineStepIndex(status, stages);
  if (idx < 0 || idx >= stages.length - 1) return null;
  return stages[idx + 1]?.label || null;
}

export function isAtOrPastMappedStage(status, targetStageId, stages) {
  const idx = getStudentPipelineStepIndex(status, stages);
  const targetIdx = stages.findIndex((s) => s.id === targetStageId);
  if (idx < 0 || targetIdx < 0) return false;
  return idx >= targetIdx;
}

export function isVisaPilotUnlockedForConfig(status, countryConfig) {
  const stages = countryConfig?.stages;
  if (Array.isArray(stages) && stages.length > 0) {
    return isAtOrPastMappedStage(status, "documentation", stages);
  }
  return false;
}

/**
 * Checklist sections visible for the student's current pipeline stage (doc-mapping stageIds).
 */
export function filterChecklistForStudent(checklist, status, stages) {
  const list = checklist || [];
  if (!list.length) return [];

  const stageId = resolveStudentStageId(status, stages);
  const hasStageIds = list.some((cat) =>
    (cat.items || []).some((item) => Array.isArray(item.stageIds) && item.stageIds.length > 0)
  );

  if (!hasStageIds) {
    const visibleGroups = new Set(getVisibleCountryChecklistStages(status));
    return list
      .filter((category) => visibleGroups.has(category.stage))
      .map((category) => ({ ...category, items: [...(category.items || [])] }));
  }

  if (!stageId) return [];

  return list
    .map((category) => ({
      ...category,
      items: (category.items || []).filter((item) => {
        const ids = item.stageIds || [];
        if (ids.length === 0) return true;
        return ids.includes(stageId);
      }),
    }))
    .filter((category) => category.items.length > 0);
}

export function shouldShowUniversityOfferLetters(status, countryConfig) {
  const visible = filterChecklistForStudent(
    countryConfig?.checklist,
    status,
    countryConfig?.stages
  );
  return visible.some((cat) => OFFER_LETTER_GROUPS.has(cat.stage));
}

/** Doc types required before advancing from the current stage. */
export function getRequiredDocTypesBeforeAdvance(status, countryConfig) {
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

  const legacyGroups = legacyRequiredGroupsForStageId(stageId);
  for (const category of countryConfig?.checklist || []) {
    if (!legacyGroups.includes(category.stage)) continue;
    for (const item of category.items || []) {
      if (item.required === false) continue;
      const docType = item.docType;
      if (!seen.has(docType)) {
        seen.add(docType);
        required.push({ group: category.stage, docType });
      }
    }
  }
  return required;
}

function legacyRequiredGroupsForStageId(stageId) {
  if (stageId === "application") return ["Documentation", "Offer Received"];
  if (stageId === "documentation") return [];
  return [];
}

export function documentTypeMatchesRequirement(docType, requiredDocType) {
  const dt = String(docType || "");
  const req = String(requiredDocType || "");
  return dt === req || dt.includes(req) || req.includes(dt);
}

/** Map pipeline doc type name → checklist group label. */
export function buildPipelineDocTypeGroupMap(pipelineDocs) {
  const map = new Map();
  for (const doc of pipelineDocs || []) {
    const name = String(doc?.name || "").trim();
    if (!name || name === "(placeholder)") continue;
    const group = String(doc?.group || "").trim() || "Ungrouped";
    map.set(name, group);
  }
  return map;
}

export function resolvePipelineDocGroup(docType, groupMap, checklist) {
  const dt = String(docType || "").trim();
  if (!dt) return "Ungrouped";
  if (groupMap.has(dt)) return groupMap.get(dt);
  for (const [key, group] of groupMap) {
    if (documentTypeMatchesRequirement(dt, key)) return group;
  }
  for (const category of checklist || []) {
    const stage = String(category?.stage || "").trim() || "Ungrouped";
    for (const item of category?.items || []) {
      if (documentTypeMatchesRequirement(dt, item.docType)) return stage;
    }
  }
  if (dt.startsWith("taskDoc__")) return "Task document requests";
  return "Ungrouped";
}

const VISA_PILOT_DOC_TYPE_PREFIX = "Visa Pilot - ";

/** Map visa checklist item name → doc-mapping group label. */
export function buildVisaDocTypeGroupMap(visaDocs) {
  const map = new Map();
  for (const doc of visaDocs || []) {
    const name = String(doc?.name || "").trim();
    if (!name || name === "(placeholder)") continue;
    const group = String(doc?.group || "").trim() || "Ungrouped";
    map.set(`${VISA_PILOT_DOC_TYPE_PREFIX}${name}`, group);
    map.set(name, group);
  }
  return map;
}

export function resolveVisaDocGroup(docType, groupMap, visaWorkflow) {
  const dt = String(docType || "").trim();
  if (!dt) return "Ungrouped";
  if (groupMap.has(dt)) return groupMap.get(dt);
  const itemName = dt.startsWith(VISA_PILOT_DOC_TYPE_PREFIX)
    ? dt.slice(VISA_PILOT_DOC_TYPE_PREFIX.length).trim()
    : dt;
  if (itemName && groupMap.has(itemName)) return groupMap.get(itemName);
  for (const [key, group] of groupMap) {
    if (documentTypeMatchesRequirement(dt, key) || documentTypeMatchesRequirement(itemName, key)) {
      return group;
    }
  }
  for (const stage of visaWorkflow || []) {
    const group = String(stage?.name || "").trim() || "Ungrouped";
    for (const item of stage?.items || []) {
      const { name } = normalizeVisaWorkflowItem(item);
      if (name === itemName || documentTypeMatchesRequirement(itemName, name)) return group;
    }
  }
  return "Ungrouped";
}

export function studentHasUploadedDocType(studentDocs, docType) {
  return (studentDocs || []).some((d) => {
    return (
      documentTypeMatchesRequirement(d?.type, docType) &&
      String(d?.status || "").trim() !== "Rejected"
    );
  });
}
