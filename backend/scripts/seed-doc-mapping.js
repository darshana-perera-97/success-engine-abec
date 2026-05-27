#!/usr/bin/env node
/**
 * Seeds backend/data/docMapping.json and stages.json from system checklists.
 * Run: node scripts/seed-doc-mapping.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs/promises");
const { DOC_MAPPING_FILE, STAGES_FILE } = require("../config");
const { readSeedCountries, buildDocMapping, buildStages } = require("../lib/docMappingSeed");

async function main() {
  const countries = await readSeedCountries();
  if (countries.length === 0) {
    console.error("No countries found. Add entries to backend/data/countries.json first.");
    process.exit(1);
  }

  const docMapping = buildDocMapping(countries);
  const stages = buildStages(countries);

  await Promise.all([
    fs.writeFile(DOC_MAPPING_FILE, `${JSON.stringify(docMapping, null, 2)}\n`),
    fs.writeFile(STAGES_FILE, `${JSON.stringify(stages, null, 2)}\n`),
  ]);

  console.log(`Seeded doc mapping for ${countries.length} countries: ${countries.join(", ")}`);
  for (const country of countries) {
    const cfg = docMapping[country];
    console.log(
      `  ${country}: ${cfg.pipelineDocs.length} pipeline docs, ${cfg.visaDocs.length} visa docs`
    );
  }
  console.log(`Wrote ${DOC_MAPPING_FILE}`);
  console.log(`Wrote ${STAGES_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
