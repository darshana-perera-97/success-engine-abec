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
  stageIds: ["registration", "application"],
  visibleFrom: "registration",
  completeBy: "application",
};

function defaultPipelineDocs() {
  return [{ ...DEFAULT_PIPELINE_DOC }];
}

function emptyDocConfig() {
  return { pipelineDocs: defaultPipelineDocs(), visaDocs: [] };
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
  defaultStagesCopy,
  defaultPipelineDocs,
  ensureDefaultPipelineDocs,
  DEFAULT_STAGES,
  DEFAULT_PIPELINE_DOC,
};
