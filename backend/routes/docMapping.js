const crypto = require("crypto");
const { parseBody, sendJson } = require("../lib/httpUtils");
const {
  readStages, writeStages, getCountryStages,
  readDocMapping, writeDocMapping, emptyDocConfig, ensureDefaultPipelineDocs, DEFAULT_STAGES
} = require("../models/docMapping");

function genId() {
  return `dm-${crypto.randomUUID().slice(0, 8)}`;
}

async function handle(req, res, url) {

  // GET /api/doc-mapping/all — all countries (for student views preload)
  if (req.method === "GET" && url.pathname === "/api/doc-mapping/all") {
    const [allStages, allDocs] = await Promise.all([readStages(), readDocMapping()]);
    const countries = new Set([
      ...Object.keys(allStages || {}),
      ...Object.keys(allDocs || {}),
    ]);
    const data = {};
    for (const country of countries) {
      const stages = getCountryStages(allStages, country);
      const docs = allDocs[country] || emptyDocConfig();
      const pipelineDocs = ensureDefaultPipelineDocs(docs.pipelineDocs || []);
      data[country] = {
        stages,
        pipelineDocs,
        visaDocs: docs.visaDocs || [],
      };
    }
    sendJson(res, 200, { ok: true, data });
    return true;
  }

  // GET /api/doc-mapping?country=<name>
  if (req.method === "GET" && url.pathname === "/api/doc-mapping") {
    const country = String(url.searchParams.get("country") || "").trim();
    if (!country) {
      sendJson(res, 400, { ok: false, error: "Country query parameter is required." });
      return true;
    }
    const [allStages, allDocs] = await Promise.all([readStages(), readDocMapping()]);
    const stages = getCountryStages(allStages, country);
    const docs = allDocs[country] || emptyDocConfig();
    const pipelineDocs = ensureDefaultPipelineDocs(docs.pipelineDocs || []);
    sendJson(res, 200, { ok: true, data: { stages, pipelineDocs, visaDocs: docs.visaDocs || [] } });
    return true;
  }

  // PUT /api/doc-mapping/stages  — save stages array for a country → stages.json
  if (req.method === "PUT" && url.pathname === "/api/doc-mapping/stages") {
    try {
      const body = await parseBody(req);
      const country = String(body.country || "").trim();
      if (!country) { sendJson(res, 400, { ok: false, error: "Country is required." }); return true; }
      const stages = body.stages;
      if (!Array.isArray(stages)) { sendJson(res, 400, { ok: false, error: "Stages must be an array." }); return true; }

      const lockedIds = new Set(DEFAULT_STAGES.map((s) => s.id));
      const lockedPresent = new Set();
      const cleaned = stages.map((s) => {
        const id = String(s.id || "").trim() || genId();
        const locked = lockedIds.has(id);
        const label = locked
          ? DEFAULT_STAGES.find((ds) => ds.id === id).label
          : String(s.label || "").trim();
        if (locked) lockedPresent.add(id);
        return { id, label, locked };
      }).filter((s) => s.label);

      for (const ds of DEFAULT_STAGES) {
        if (!lockedPresent.has(ds.id)) {
          sendJson(res, 400, { ok: false, error: `Default stage "${ds.label}" cannot be removed.` });
          return true;
        }
      }

      const defaultOrder = DEFAULT_STAGES.map((s) => s.id);
      const lockedInResult = cleaned.filter((s) => s.locked).map((s) => s.id);
      for (let i = 0; i < lockedInResult.length; i++) {
        if (lockedInResult[i] !== defaultOrder[i]) {
          sendJson(res, 400, { ok: false, error: "Default stages must keep their original order." });
          return true;
        }
      }

      const allStages = await readStages();
      allStages[country] = cleaned;
      await writeStages(allStages);

      const allDocs = await readDocMapping();
      const docs = allDocs[country] || emptyDocConfig();
      sendJson(res, 200, { ok: true, data: { stages: cleaned, pipelineDocs: docs.pipelineDocs || [], visaDocs: docs.visaDocs || [] } });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  // PUT /api/doc-mapping/pipeline-docs  — save pipeline docs → docMapping.json
  if (req.method === "PUT" && url.pathname === "/api/doc-mapping/pipeline-docs") {
    try {
      const body = await parseBody(req);
      const country = String(body.country || "").trim();
      if (!country) { sendJson(res, 400, { ok: false, error: "Country is required." }); return true; }
      const docs = body.docs;
      if (!Array.isArray(docs)) { sendJson(res, 400, { ok: false, error: "Docs must be an array." }); return true; }

      const cleaned = docs.map((d) => ({
        id: String(d.id || "").trim() || genId(),
        group: String(d.group || "").trim(),
        name: String(d.name || "").trim(),
        required: d.required !== false,
        locked: d.locked === true,
        stageIds: Array.isArray(d.stageIds) ? d.stageIds.map((s) => String(s).trim()).filter(Boolean) : [],
        ...(d.visibleFrom ? { visibleFrom: String(d.visibleFrom).trim() } : {}),
        ...(d.completeBy ? { completeBy: String(d.completeBy).trim() } : {}),
      })).filter((d) => d.name);

      const finalDocs = ensureDefaultPipelineDocs(cleaned);

      const allDocs = await readDocMapping();
      if (!allDocs[country]) allDocs[country] = emptyDocConfig();
      allDocs[country].pipelineDocs = finalDocs;
      await writeDocMapping(allDocs);

      const allStages = await readStages();
      const stages = getCountryStages(allStages, country);
      sendJson(res, 200, { ok: true, data: { stages, pipelineDocs: finalDocs, visaDocs: allDocs[country].visaDocs || [] } });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  // PUT /api/doc-mapping/visa-docs  — save visa docs → docMapping.json
  if (req.method === "PUT" && url.pathname === "/api/doc-mapping/visa-docs") {
    try {
      const body = await parseBody(req);
      const country = String(body.country || "").trim();
      if (!country) { sendJson(res, 400, { ok: false, error: "Country is required." }); return true; }
      const docs = body.docs;
      if (!Array.isArray(docs)) { sendJson(res, 400, { ok: false, error: "Docs must be an array." }); return true; }

      const cleaned = docs.map((d) => ({
        id: String(d.id || "").trim() || genId(),
        group: String(d.group || "").trim(),
        name: String(d.name || "").trim(),
        required: d.required !== false,
        stageIds: Array.isArray(d.stageIds) ? d.stageIds.map((s) => String(s).trim()).filter(Boolean) : [],
      })).filter((d) => d.name);

      const allDocs = await readDocMapping();
      if (!allDocs[country]) allDocs[country] = emptyDocConfig();
      allDocs[country].visaDocs = cleaned;
      await writeDocMapping(allDocs);

      const allStages = await readStages();
      const stages = getCountryStages(allStages, country);
      sendJson(res, 200, { ok: true, data: { stages, pipelineDocs: allDocs[country].pipelineDocs || [], visaDocs: cleaned } });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
