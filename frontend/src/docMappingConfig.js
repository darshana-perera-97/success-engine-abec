import { COUNTRY_CHECKLISTS } from "./constants";
import { PIPELINE_STEPS, STAGE_CONFIG, normalizePipelineStatus, getVisibleCountryChecklistStages } from "./pipeline";
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

export const DEFAULT_ACCOUNT_DETAILS_STAGE_ID = "application";

/**
 * @param {{ stages?: Array<{id:string,label:string}>, pipelineDocs?: Array, visaDocs?: Array }} apiData
 */
export function buildCountryDocConfig(apiData) {
  const stages = Array.isArray(apiData?.stages) && apiData.stages.length > 0 ? apiData.stages : DEFAULT_STAGE_ROWS;
  const pipelineDocs = Array.isArray(apiData?.pipelineDocs) ? apiData.pipelineDocs : [];
  const visaDocs = Array.isArray(apiData?.visaDocs) ? apiData.visaDocs : [];
  const stageTasks = normalizeStageTasksMap(apiData?.stageTasks);
  const stageDeadlines = normalizeStageDeadlinesMap(apiData?.stageDeadlines, stages);
  const accountDetailsStageId = normalizeAccountDetailsStageId(apiData?.accountDetailsStageId, stages);
  const documentNotifyDocs = normalizeDocumentNotifyDocs(apiData?.documentNotifyDocs);
  return {
    stages,
    pipelineSteps: stages.map((s) => s.label),
    checklist: pipelineDocsToChecklist(pipelineDocs),
    visaWorkflow: normalizeVisaWorkflowStages(visaDocsToWorkflow(visaDocs)),
    pipelineDocs,
    visaDocs,
    stageTasks,
    stageDeadlines,
    accountDetailsStageId,
    documentNotifyDocs,
  };
}

/** @returns {Array<{id:string,docName:string,source:'pipeline'|'visa'}>} */
export function normalizeDocumentNotifyDocs(raw) {
  if (!Array.isArray(raw)) {
    return [{ id: "dn-offer-letter", docName: "Offer Letter", source: "pipeline" }];
  }
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const docName = String(entry?.docName || entry?.name || "").trim();
    if (!docName || docName === "(placeholder)") continue;
    const key = docName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: String(entry?.id || "").trim() || `dn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      docName,
      source: entry?.source === "visa" ? "visa" : "pipeline",
    });
  }
  return out;
}

export function isDocumentWhatsappNotifyEnabled(countryConfig, docType) {
  const list = countryConfig?.documentNotifyDocs || [];
  if (!list.length) return false;
  const dt = String(docType || "").trim();
  if (!dt) return false;
  return list.some((entry) => documentTypeMatchesRequirement(dt, entry.docName));
}

export function normalizeAccountDetailsStageId(raw, stages) {
  const fallback = DEFAULT_ACCOUNT_DETAILS_STAGE_ID;
  const id = String(raw || fallback).trim() || fallback;
  const stageList = Array.isArray(stages) && stages.length > 0 ? stages : DEFAULT_STAGE_ROWS;
  if (stageList.some((s) => s.id === id)) return id;
  const application = stageList.find(
    (s) => s.id === fallback || String(s.label || "").trim().toLowerCase() === "application"
  );
  return application ? application.id : stageList[0]?.id || fallback;
}

/** @returns {Record<string, Array<{id:string,title:string,priority:string,dueDays:number}>>} */
export function normalizeStageTasksMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  const allowedPriority = new Set(["High", "Medium", "Low"]);
  for (const [stageId, tasks] of Object.entries(raw)) {
    const key = String(stageId || "").trim();
    if (!key || !Array.isArray(tasks)) continue;
    const cleaned = tasks
      .map((t) => {
        const title = String(t?.title || t?.task || "").trim();
        if (!title) return null;
        const priority = allowedPriority.has(String(t?.priority || ""))
          ? String(t.priority)
          : "Medium";
        const dueDaysRaw = Number(t?.dueDays);
        const dueDays = Number.isFinite(dueDaysRaw)
          ? Math.min(90, Math.max(1, Math.round(dueDaysRaw)))
          : 3;
        return {
          id: String(t?.id || "").trim() || `stt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          priority,
          dueDays,
        };
      })
      .filter(Boolean);
    if (cleaned.length > 0) out[key] = cleaned;
  }
  return out;
}

export function getConfiguredStageTasks(stageId, countryConfig) {
  const key = String(stageId || "").trim();
  if (!key) return [];
  const map = countryConfig?.stageTasks;
  return Array.isArray(map?.[key]) ? map[key] : [];
}

const DEFAULT_STAGE_DEADLINE_BY_ID = {
  inquiry: { value: 1, unit: "hours" },
  application: { value: 24, unit: "hours" },
  documentation: { value: 7, unit: "days" },
  visa: { value: 30, unit: "days" },
};

function slaMsToDeadlineEntry(slaMs) {
  const ms = Number(slaMs);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  if (ms % dayMs === 0) return { value: ms / dayMs, unit: "days" };
  return { value: Math.max(1, Math.round(ms / hourMs)), unit: "hours" };
}

/** Build default stage SLA deadlines from pipeline stages and STAGE_CONFIG. */
export function buildDefaultStageDeadlines(stages) {
  const out = {};
  for (const stage of Array.isArray(stages) ? stages : DEFAULT_STAGE_ROWS) {
    const id = String(stage?.id || "").trim();
    if (!id) continue;
    if (DEFAULT_STAGE_DEADLINE_BY_ID[id]) {
      out[id] = { ...DEFAULT_STAGE_DEADLINE_BY_ID[id] };
      continue;
    }
    const canonical = normalizePipelineStatus(stage?.label || stage?.id || "");
    const cfg = STAGE_CONFIG[canonical] || STAGE_CONFIG[stage?.label];
    out[id] = cfg?.slaMs ? slaMsToDeadlineEntry(cfg.slaMs) : null;
  }
  return out;
}

/** @returns {Record<string, {value:number,unit:'hours'|'days'}|null>} */
export function normalizeStageDeadlinesMap(raw, stages) {
  const defaults = buildDefaultStageDeadlines(stages);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const out = { ...defaults };
  for (const stage of Array.isArray(stages) ? stages : DEFAULT_STAGE_ROWS) {
    const id = String(stage?.id || "").trim();
    if (!id || !(id in raw)) continue;
    const entry = raw[id];
    if (entry === null) {
      out[id] = null;
      continue;
    }
    const value = Number(entry?.value);
    const unit = entry?.unit === "days" ? "days" : entry?.unit === "hours" ? "hours" : null;
    if (!Number.isFinite(value) || value <= 0 || !unit) {
      out[id] = null;
      continue;
    }
    const max = unit === "days" ? 365 : 8760;
    out[id] = { value: Math.min(max, Math.max(1, Math.round(value))), unit };
  }
  return out;
}

export function deadlineEntryToMs(entry) {
  if (!entry || typeof entry !== "object") return null;
  const value = Number(entry.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (entry.unit === "days") return value * 24 * 60 * 60 * 1000;
  if (entry.unit === "hours") return value * 60 * 60 * 1000;
  return null;
}

export function formatStageDeadlineLabel(entry) {
  if (!entry || typeof entry !== "object") return "";
  const value = Number(entry.value);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (entry.unit === "days") return value === 1 ? "1 day" : `${value} days`;
  return value === 1 ? "1 hour" : `${value} hours`;
}

export function buildStageTransitionTaskKey(studentId, stageId, configTaskId) {
  return `stage-task:${String(studentId || "").trim()}:${String(stageId || "").trim()}:${String(configTaskId || "").trim()}`;
}

/**
 * Build counselor tasks when a student enters a pipeline stage (from doc mapping).
 */
export function buildStageTransitionTasks({
  student,
  targetStageLabel,
  countryConfig,
  existingTasks = [],
  assigneeIds = [],
}) {
  const studentId = String(student?.id || "").trim();
  if (!studentId || !targetStageLabel) return [];
  const stages = countryConfig?.stages || [];
  const stageId = resolveStudentStageId(targetStageLabel, stages);
  if (!stageId) return [];
  const configured = getConfiguredStageTasks(stageId, countryConfig);
  if (configured.length === 0) return [];

  const openKeys = new Set(
    (existingTasks || [])
      .filter((t) => {
        const tid = String(t?.student_id || t?.studentId || "").trim();
        return tid === studentId && String(t?.status || "").trim().toLowerCase() !== "completed";
      })
      .map((t) => String(t?.stageSourceKey || "").trim())
      .filter(Boolean)
  );

  const assignees = Array.from(
    new Set((assigneeIds || []).map((id) => String(id || "").trim()).filter((id) => id && id !== "Unassigned"))
  );
  const counselorId = String(student?.counselor || "").trim();
  if (assignees.length === 0 && counselorId) assignees.push(counselorId);

  const buildDueDate = (dueDays) => {
    const due = new Date();
    due.setDate(due.getDate() + (Number.isFinite(dueDays) ? dueDays : 3));
    return due.toISOString().split("T")[0];
  };

  const now = Date.now();
  return configured
    .map((cfg, idx) => {
      const configId = String(cfg.id || "").trim() || `cfg-${idx}`;
      const stageSourceKey = buildStageTransitionTaskKey(studentId, stageId, configId);
      if (openKeys.has(stageSourceKey)) return null;
      return {
        id: `T-STG-${studentId}-${stageId}-${configId}-${now}-${idx}`,
        stageSourceKey,
        task: String(cfg.title).trim(),
        assigned_to: assignees,
        counselor_ids: assignees,
        student_id: studentId,
        priority: cfg.priority || "Medium",
        status: "Pending",
        dueDate: buildDueDate(cfg.dueDays),
        tier: "Global",
        phase: 1,
        isBlocking: false,
        isPrivate: true,
        stageId,
        stageLabel: targetStageLabel,
      };
    })
    .filter(Boolean);
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
    stageTasks: {},
    stageDeadlines: buildDefaultStageDeadlines(DEFAULT_STAGE_ROWS),
    accountDetailsStageId: DEFAULT_ACCOUNT_DETAILS_STAGE_ID,
    documentNotifyDocs: normalizeDocumentNotifyDocs(undefined),
  };
}

export function pipelineDocsToChecklist(pipelineDocs) {
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
      description: "",
      required: doc.required !== false,
      locked: doc.locked === true,
      visibleFrom: doc.visibleFrom
        ? String(doc.visibleFrom).trim()
        : stageIds[0] || "",
      stageIds,
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

function getPipelineStageIndex(stages, stageId) {
  return (Array.isArray(stages) ? stages : []).findIndex((s) => s.id === stageId);
}

function getEnrolledPipelineStageIndex(stages) {
  const stageList = Array.isArray(stages) ? stages : [];
  const enrolledIdx = stageList.findIndex(
    (s) =>
      String(s?.id || "").trim().toLowerCase() === "enrolled" ||
      String(s?.label || "").trim().toLowerCase() === "enrolled"
  );
  return enrolledIdx >= 0 ? enrolledIdx : stageList.length - 1;
}

/** True when a mapped pipeline doc should appear at the student's current stage (start → Enrolled). */
export function isPipelineChecklistItemVisibleAtStage(item, currentStageId, stages) {
  const stageList = Array.isArray(stages) ? stages : [];
  const currentIdx = getPipelineStageIndex(stageList, currentStageId);
  if (currentIdx < 0) return false;
  const endIdx = getEnrolledPipelineStageIndex(stageList);
  if (endIdx < 0) return true;

  const visibleFromId = String(item?.visibleFrom || "").trim();
  const stageIds = Array.isArray(item?.stageIds)
    ? item.stageIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  let startIdx = -1;
  if (visibleFromId) {
    startIdx = getPipelineStageIndex(stageList, visibleFromId);
  } else if (stageIds.length > 0) {
    const indices = stageIds
      .map((id) => getPipelineStageIndex(stageList, id))
      .filter((idx) => idx >= 0);
    startIdx = indices.length > 0 ? Math.min(...indices) : -1;
  }

  if (startIdx < 0) return currentIdx <= endIdx;
  return currentIdx >= startIdx && currentIdx <= endIdx;
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
  const hasVisibleFrom = list.some((cat) =>
    (cat.items || []).some((item) => String(item?.visibleFrom || "").trim())
  );

  if (!hasStageIds && !hasVisibleFrom) {
    const visibleGroups = new Set(getVisibleCountryChecklistStages(status));
    return list
      .filter((category) => visibleGroups.has(category.stage))
      .map((category) => ({ ...category, items: [...(category.items || [])] }));
  }

  if (!stageId) return [];

  return list
    .map((category) => ({
      ...category,
      items: (category.items || []).filter((item) =>
        isPipelineChecklistItemVisibleAtStage(item, stageId, stages)
      ),
    }))
    .filter((category) => category.items.length > 0);
}

export function isOfferLetterChecklistGroup(stage) {
  return OFFER_LETTER_GROUPS.has(String(stage || "").trim());
}

export function shouldShowUniversityOfferLetters(status, countryConfig) {
  const visible = filterChecklistForStudent(
    countryConfig?.checklist,
    status,
    countryConfig?.stages
  );
  return visible.some((cat) => isOfferLetterChecklistGroup(cat.stage));
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

function studentHasVerifiedDocType(studentDocs, docType) {
  return (studentDocs || []).some((d) => {
    return (
      documentTypeMatchesRequirement(d?.type, docType) &&
      String(d?.status || "").trim().toLowerCase() === "verified"
    );
  });
}

function isStageLinkedTask(task, studentId, stageId, stageLabel) {
  const tid = String(task?.student_id || task?.studentId || "").trim();
  if (!studentId || tid !== studentId) return false;
  const sourceKey = String(task?.stageSourceKey || "").trim();
  if (sourceKey.startsWith("missing-doc:")) return false;
  const taskStageId = String(task?.stageId || "").trim();
  if (taskStageId && taskStageId === stageId) return true;
  const taskStageLabel = String(task?.stageLabel || "").trim();
  if (taskStageLabel && stageLabelsEquivalent(taskStageLabel, stageLabel)) return true;
  if (sourceKey.startsWith("stage-task:")) {
    const parts = sourceKey.split(":");
    return parts[2] === stageId;
  }
  return false;
}

function isConfiguredStageTaskCompleted(configTask, stageTasks, studentId, stageId) {
  const configId = String(configTask?.id || "").trim();
  const title = String(configTask?.title || "").trim();
  const expectedKey = buildStageTransitionTaskKey(studentId, stageId, configId);
  const match = stageTasks.find((task) => {
    const sourceKey = String(task?.stageSourceKey || "").trim();
    if (sourceKey && sourceKey === expectedKey) return true;
    const taskTitle = String(task?.task || "").trim();
    return title && taskTitle === title;
  });
  return String(match?.status || "").trim().toLowerCase() === "completed";
}

function isStageRequirementDocSatisfied({ group, docType }, student, studentDocs, stageId, countryConfig) {
  if (studentHasVerifiedDocType(studentDocs, docType)) return true;
  if (
    isOfferLetterChecklistGroup(group) &&
    documentTypeMatchesRequirement(docType, "Offer Letter") &&
    studentHasUniversityOfferLetter(student)
  ) {
    return true;
  }
  if (stageId === "documentation") {
    const visaState = student?.visa && typeof student.visa === "object" ? student.visa : {};
    const itemName = String(docType || "")
      .trim()
      .replace(new RegExp(`^${VISA_PILOT_DOC_TYPE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "")
      .trim();
    if (itemName && visaState[itemName] === "Completed") return true;
  }
  return false;
}

function collectCurrentStageDocRequirements(statusLabel, student, countryConfig, stageId) {
  const studentDocs = Array.isArray(student?.documents) ? student.documents : [];
  const required = getRequiredDocTypesBeforeAdvance(statusLabel, countryConfig);
  const items = required.map((entry) => ({
    kind: "doc",
    satisfied: isStageRequirementDocSatisfied(entry, student, studentDocs, stageId, countryConfig),
  }));

  if (stageId === "documentation") {
    const seen = new Set(required.map(({ docType }) => String(docType || "").trim().toLowerCase()));
    const visaState = student?.visa && typeof student.visa === "object" ? student.visa : {};
    for (const stage of countryConfig?.visaWorkflow || []) {
      for (const item of stage.items || []) {
        const { name, required: isRequired } = normalizeVisaWorkflowItem(item);
        if (!isRequired || !name) continue;
        const docType = `${VISA_PILOT_DOC_TYPE_PREFIX}${name}`;
        const key = docType.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const satisfied =
          visaState[name] === "Completed" || studentHasVerifiedDocType(studentDocs, docType);
        items.push({ kind: "doc", satisfied });
      }
    }
  }

  return items;
}

function collectCurrentStageTaskRequirements(student, tasks, stageId, stageLabel, countryConfig) {
  const studentId = String(student?.id || "").trim();
  if (!studentId || !stageId) return [];

  const stageTasks = (tasks || []).filter((task) => isStageLinkedTask(task, studentId, stageId, stageLabel));
  const configured = getConfiguredStageTasks(stageId, countryConfig);
  const items = [];
  const matchedTaskIds = new Set();

  for (const configTask of configured) {
    const match = stageTasks.find((task) => {
      const configId = String(configTask?.id || "").trim();
      const expectedKey = buildStageTransitionTaskKey(studentId, stageId, configId);
      const sourceKey = String(task?.stageSourceKey || "").trim();
      if (sourceKey && sourceKey === expectedKey) return true;
      const title = String(configTask?.title || "").trim();
      const taskTitle = String(task?.task || "").trim();
      return title && taskTitle === title;
    });
    if (match?.id != null) matchedTaskIds.add(String(match.id));
    const satisfied = isConfiguredStageTaskCompleted(configTask, stageTasks, studentId, stageId);
    items.push({ kind: "task", satisfied });
  }

  for (const task of stageTasks) {
    const taskId = String(task?.id ?? "").trim();
    if (!taskId || matchedTaskIds.has(taskId)) continue;
    const satisfied = String(task?.status || "").trim().toLowerCase() === "completed";
    items.push({ kind: "task", satisfied });
  }

  return items;
}

/** Verified docs and completed stage tasks for the student's current pipeline stage. */
export function getCurrentStageCompletionSummary(student, tasks = [], countryConfig) {
  const statusLabel = String(student?.status || "").trim();
  if (!statusLabel) return null;

  const stages = countryConfig?.stages || [];
  const stageId = resolveStudentStageId(statusLabel, stages);
  if (!stageId) return null;

  const docItems = collectCurrentStageDocRequirements(statusLabel, student, countryConfig, stageId);
  const taskItems = collectCurrentStageTaskRequirements(student, tasks, stageId, statusLabel, countryConfig);
  const items = [...docItems, ...taskItems];
  if (items.length === 0) return null;

  const completed = items.filter((item) => item.satisfied).length;
  const total = items.length;
  return {
    completed,
    total,
    percent: Math.round((completed / total) * 100),
    docCompleted: docItems.filter((item) => item.satisfied).length,
    docTotal: docItems.length,
    taskCompleted: taskItems.filter((item) => item.satisfied).length,
    taskTotal: taskItems.length,
  };
}

function studentHasUniversityOfferLetter(student) {
  return (student?.universityOfferLetters || []).some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const hasFile = Boolean(String(entry.url || "").trim());
    if (!hasFile) return false;
    const status = String(entry.offerStatus || "").trim().toLowerCase();
    return status !== "rejected";
  });
}

/** Doc types still missing for the stage the student is leaving (before advance). */
export function collectMissingDocTypesForStage(student, previousStatusLabel, countryConfig) {
  const statusLabel = String(previousStatusLabel || "").trim();
  if (!statusLabel) return [];
  const studentDocs = Array.isArray(student?.documents) ? student.documents : [];
  const stageId = resolveStudentStageId(statusLabel, countryConfig?.stages);
  let missing = getRequiredDocTypesBeforeAdvance(statusLabel, countryConfig)
    .filter(({ group, docType }) => {
      if (studentHasUploadedDocType(studentDocs, docType)) return false;
      if (
        isOfferLetterChecklistGroup(group) &&
        documentTypeMatchesRequirement(docType, "Offer Letter") &&
        studentHasUniversityOfferLetter(student)
      ) {
        return false;
      }
      return true;
    })
    .map(({ docType }) => docType);
  if (stageId === "documentation") {
    const visaState = student?.visa && typeof student.visa === "object" ? student.visa : {};
    for (const stage of countryConfig?.visaWorkflow || []) {
      for (const item of stage.items || []) {
        const { name, required } = normalizeVisaWorkflowItem(item);
        if (!required) continue;
        if (visaState[name] === "Completed") continue;
        const docType = `${VISA_PILOT_DOC_TYPE_PREFIX}${name}`;
        if (!studentHasUploadedDocType(studentDocs, docType)) missing.push(docType);
      }
    }
  }
  return [...new Set(missing.map((d) => String(d || "").trim()).filter(Boolean))];
}

export function buildMissingStageDocTaskKey(studentId, stageId, docType) {
  return `missing-doc:${String(studentId || "").trim()}:${String(stageId || "").trim()}:${String(docType || "").trim()}`;
}

/**
 * Counselor tasks for documents required on the stage being left when a student advances early.
 */
export function buildMissingStageDocTasks({
  student,
  previousStatusLabel,
  countryConfig,
  existingTasks = [],
  assigneeId = "",
  relatedCounselorIds = [],
}) {
  const studentId = String(student?.id || "").trim();
  if (!studentId) return [];
  const allMissingItems = collectMissingDocTypesForStage(student, previousStatusLabel, countryConfig);
  if (allMissingItems.length === 0) return [];

  const openKeys = new Set(
    (existingTasks || [])
      .filter((t) => {
        const tid = String(t?.student_id || t?.studentId || "").trim();
        return tid === studentId && String(t?.status || "").trim().toLowerCase() !== "completed";
      })
      .map((t) => String(t?.stageSourceKey || "").trim())
      .filter(Boolean)
  );
  const openDocTypes = new Set(
    (existingTasks || [])
      .filter((t) => {
        const tid = String(t?.student_id || t?.studentId || "").trim();
        return tid === studentId && String(t?.status || "").trim().toLowerCase() !== "completed";
      })
      .map((t) => String(t?.documentType || "").trim())
      .filter(Boolean)
  );

  const counselorId = String(assigneeId || student?.counselor || "").trim();
  const related = Array.from(
    new Set(
      [counselorId, ...(relatedCounselorIds || []).map((id) => String(id || "").trim())].filter(
        (id) => id && id !== "Unassigned"
      )
    )
  );
  const assignedTo = counselorId ? [counselorId] : related;

  const buildDueDate = (daysFromNow = 3) => {
    const due = new Date();
    due.setDate(due.getDate() + daysFromNow);
    return due.toISOString().split("T")[0];
  };

  const previousStageId = resolveStudentStageId(previousStatusLabel, countryConfig?.stages);
  const now = Date.now();

  return allMissingItems
    .filter((docType) => {
      const dt = String(docType || "").trim();
      if (!dt) return false;
      if (openDocTypes.has(dt)) return false;
      const key = buildMissingStageDocTaskKey(studentId, previousStageId, dt);
      return !openKeys.has(key);
    })
    .map((docType, idx) => ({
      id: `T-DOC-${studentId}-${now}-${idx}`,
      task: `Upload ${docType}`,
      assigned_to: assignedTo,
      counselor_ids: related.length > 0 ? related : assignedTo,
      student_id: studentId,
      priority: "High",
      status: "Pending",
      dueDate: buildDueDate(3),
      tier: "Global",
      phase: 1,
      isBlocking: true,
      isPrivate: true,
      documentType: docType,
      stageId: previousStageId,
      stageLabel: String(previousStatusLabel || "").trim(),
      stageSourceKey: buildMissingStageDocTaskKey(studentId, previousStageId, docType),
    }));
}
