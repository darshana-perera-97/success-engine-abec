const crypto = require("crypto");
const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { DOC_MAPPING_FILE, STAGES_FILE } = require("../config");

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

function emptyDocConfig() {
  return {
    pipelineDocs: defaultPipelineDocs(),
    visaDocs: [],
    stageTasks: {},
    accountDetailsStageId: DEFAULT_ACCOUNT_DETAILS_STAGE_ID,
  };
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
  DEFAULT_STAGES,
  DEFAULT_PIPELINE_DOC,
  DEFAULT_ACCOUNT_DETAILS_STAGE_ID,
};
