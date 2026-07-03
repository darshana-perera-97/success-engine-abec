const crypto = require("crypto");
const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { DOC_MAPPING_FILE, STAGES_FILE } = require("../config");
const { defaultCountryIntakeOptions, normalizeCountryIntakeOptions } = require("../lib/intakeUtils");

/**
 * stages.json shape (country-keyed array):
 * {
 *   "Australia": [ { id, label, locked }, ... ],
 *   "UK": [ ... ]
 * }
 *
 * docMapping.json shape (pipeline & visa docs):
 * {
 *   "Australia": { pipelineDocs: [...], visaDocs: [...] },
 *   ...
 * }
 */

const DEFAULT_STAGES = [
  { id: "inquiry",       label: "Inquiry",       locked: true },
  { id: "registration",  label: "Registration",  locked: true },
  { id: "application",   label: "Application",   locked: true },
  { id: "documentation", label: "Documentation", locked: true },
  { id: "visa",          label: "Visa",          locked: true },
  { id: "enrolled",      label: "Enrolled",      locked: true },
];

function defaultStagesCopy() {
  return DEFAULT_STAGES.map((s) => ({ ...s }));
}

const DEFAULT_PIPELINE_DOC = {
  id: "offer-letter",
  group: "Offer Letter",
  name: "Offer Letter",
  required: true,
  locked: true,
  stageIds: ["registration", "application", "documentation", "visa", "enrolled"],
  visibleFrom: "registration",
  completeBy: "application",
};

function defaultPipelineDocs() {
  return [{ ...DEFAULT_PIPELINE_DOC }];
}

const DEFAULT_ACCOUNT_DETAILS_STAGE_ID = "application";

function defaultDocumentNotifyDocs() {
  return [{ id: "dn-offer-letter", docName: "Offer Letter", source: "pipeline" }];
}

/** Default SLA durations (hours/days) keyed by default stage id — mirrors frontend STAGE_CONFIG. */
const DEFAULT_STAGE_DEADLINE_BY_ID = {
  inquiry: { value: 1, unit: "hours" },
  application: { value: 24, unit: "hours" },
  documentation: { value: 7, unit: "days" },
  visa: { value: 30, unit: "days" },
};

function buildDefaultStageDeadlines(stages) {
  const out = {};
  for (const stage of Array.isArray(stages) ? stages : defaultStagesCopy()) {
    const id = String(stage?.id || "").trim();
    if (!id) continue;
    out[id] = DEFAULT_STAGE_DEADLINE_BY_ID[id] ? { ...DEFAULT_STAGE_DEADLINE_BY_ID[id] } : null;
  }
  return out;
}

/** @returns {Record<string, {value:number,unit:'hours'|'days'}|null>} */
function normalizeStageDeadlines(raw, stages) {
  const defaults = buildDefaultStageDeadlines(stages);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const out = { ...defaults };
  for (const stage of Array.isArray(stages) ? stages : defaultStagesCopy()) {
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

function emptyDocConfig() {
  return {
    pipelineDocs: defaultPipelineDocs(),
    visaDocs: [],
    stageTasks: {},
    stageDeadlines: {},
    accountDetailsStageId: DEFAULT_ACCOUNT_DETAILS_STAGE_ID,
    documentNotifyDocs: defaultDocumentNotifyDocs(),
    intakeOptions: defaultCountryIntakeOptions(),
  };
}

/** @returns {Array<{id:string,docName:string,source:'pipeline'|'visa'}>} */
function normalizeDocumentNotifyDocs(raw) {
  if (!Array.isArray(raw)) return defaultDocumentNotifyDocs();
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const docName = String(entry?.docName || entry?.name || "").trim();
    if (!docName || docName === "(placeholder)") continue;
    const key = docName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: String(entry?.id || "").trim() || `dn-${crypto.randomUUID().slice(0, 8)}`,
      docName,
      source: entry?.source === "visa" ? "visa" : "pipeline",
    });
  }
  return out;
}

/** Resolve configured stage for sending portal login; defaults to Application. */
function normalizeAccountDetailsStageId(raw, stages) {
  const fallback = DEFAULT_ACCOUNT_DETAILS_STAGE_ID;
  const id = String(raw || fallback).trim() || fallback;
  const stageList = Array.isArray(stages) && stages.length > 0 ? stages : defaultStagesCopy();
  if (stageList.some((s) => s.id === id)) return id;
  const application = stageList.find(
    (s) => s.id === fallback || String(s.label || "").trim().toLowerCase() === "application"
  );
  return application ? application.id : stageList[0]?.id || fallback;
}

/** @returns {Record<string, Array<{id:string,title:string,priority?:string,dueDays?:number}>>} */
function normalizeStageTasks(raw) {
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
          id: String(t?.id || "").trim() || `stt-${crypto.randomUUID().slice(0, 8)}`,
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

function ensureDefaultPipelineDocs(pipelineDocs) {
  const hasOfferLetter = pipelineDocs.some((d) => d.id === DEFAULT_PIPELINE_DOC.id);
  if (!hasOfferLetter) {
    return [{ ...DEFAULT_PIPELINE_DOC }, ...pipelineDocs];
  }
  return pipelineDocs.map((d) =>
    d.id === DEFAULT_PIPELINE_DOC.id
      ? { ...d, group: DEFAULT_PIPELINE_DOC.group, name: DEFAULT_PIPELINE_DOC.name, locked: true, stageIds: DEFAULT_PIPELINE_DOC.stageIds, visibleFrom: DEFAULT_PIPELINE_DOC.visibleFrom, completeBy: DEFAULT_PIPELINE_DOC.completeBy }
      : d
  );
}

// ── Stages (stages.json) ────────────────────────────────────────

async function readStages() {
  try {
    const raw = await fs.readFile(STAGES_FILE, "utf8");
    const parsed = safeJsonParse(raw, STAGES_FILE);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error && error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeStages(data) {
  return withFileLock(STAGES_FILE, () =>
    atomicWriteFile(STAGES_FILE, JSON.stringify(data, null, 2))
  );
}

function getCountryStages(allStages, country) {
  return Array.isArray(allStages[country]) ? allStages[country] : defaultStagesCopy();
}

// ── Doc Mapping (docMapping.json — pipeline & visa docs only) ───

async function readDocMapping() {
  try {
    const raw = await fs.readFile(DOC_MAPPING_FILE, "utf8");
    const parsed = safeJsonParse(raw, DOC_MAPPING_FILE);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error && error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeDocMapping(data) {
  return withFileLock(DOC_MAPPING_FILE, () =>
    atomicWriteFile(DOC_MAPPING_FILE, JSON.stringify(data, null, 2))
  );
}

module.exports = {
  readStages,
  writeStages,
  getCountryStages,
  readDocMapping,
  writeDocMapping,
  emptyDocConfig,
  normalizeStageTasks,
  normalizeAccountDetailsStageId,
  defaultStagesCopy,
  defaultPipelineDocs,
  ensureDefaultPipelineDocs,
  normalizeDocumentNotifyDocs,
  defaultDocumentNotifyDocs,
  normalizeStageDeadlines,
  buildDefaultStageDeadlines,
  normalizeCountryIntakeOptions,
  defaultCountryIntakeOptions,
  DEFAULT_STAGES,
  DEFAULT_PIPELINE_DOC,
  DEFAULT_ACCOUNT_DETAILS_STAGE_ID,
};
