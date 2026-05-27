/**
 * Seed data for Doc Mapping admin — mirrors frontend COUNTRY_CHECKLISTS and VISA_WORKFLOWS.
 */
const fs = require("fs/promises");
const path = require("path");
const { COUNTRIES_FILE } = require("../config");
const { DEFAULT_PIPELINE_DOC, DEFAULT_STAGES } = require("../models/docMapping");

const PIPELINE_DOC_STAGE_IDS = ["application", "documentation", "visa", "enrolled"];
const VISA_DOC_STAGE_IDS = ["documentation", "visa", "enrolled"];

/** @type {Record<string, Array<{ stage: string, items: Array<{ docType: string, description: string }> }>>} */
const COUNTRY_CHECKLISTS = {
  Australia: [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "High-resolution color scan (All pages)." },
        { docType: "National ID", description: "Front/Back + Certified Translation." },
        { docType: "Birth Certificate", description: "Original + Certified Translation." },
        { docType: "Academic", description: "A/L & O/L authenticated by MFA (e-DAS)." },
        { docType: "English", description: "IELTS/PTE Academic Result." },
        { docType: "Professional CV", description: "Chronological with no gaps." },
      ],
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "Direct or Authorized Agent portal." },
        { docType: "Backlog Summary", description: "(Mandatory for PG/Master's)." },
        { docType: "References", description: "Two Academic Reference Letters." },
        { docType: "Draft GS", description: 'Preliminary "Genuine Student" statement.' },
      ],
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "Offer Letter Acceptance", description: "Offer Letter Acceptance." },
        { docType: "CoE", description: "Confirmation of Enrolment issued." },
        { docType: "Financials", description: "AUD 29,710 + Tuition (3-month history/Loan)." },
        { docType: "OSHC", description: "Health cover for full visa duration." },
        { docType: "HAP ID", description: "Medical examination generated." },
        { docType: "Final GS", description: "Finalized 2026 Genuine Student prompts." },
      ],
    },
  ],
  Canada: [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "All pages (Travel History focused)." },
        { docType: "National ID & Birth Certificate", description: "National ID & Translated Birth Certificate." },
        { docType: "Academic", description: "A/L & O/L Transcripts." },
        { docType: "English", description: "IELTS (6.0 min band) or PTE." },
        { docType: "WES Evaluation", description: "(If required for specific Master's)." },
        { docType: "Professional CV", description: "Chronological with no gaps." },
      ],
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Predicted Grade Form", description: "(If currently in school)." },
        { docType: "References", description: "Employment/Academic letters." },
        { docType: "Portal Submission", description: "OUAC or Direct DLI Portal." },
        { docType: "Draft SOP", description: "Focus on program choice logic." },
      ],
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "LOA", description: "Letter of Acceptance from DLI." },
        { docType: "PAL", description: "Provincial Attestation Letter facilitated by Uni." },
        { docType: "GIC Receipt", description: "Proof of CAD 20,635 deposit." },
        { docType: "Tuition Receipt", description: "First-year fee payment." },
        { docType: "Final SOP", description: 'Focus on "Temporary Resident Intent."' },
      ],
    },
  ],
  UK: [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "Bio-data + all stamped pages." },
        { docType: "National ID & Birth Certificate", description: "National ID & Translated Birth Certificate." },
        { docType: "Academic", description: "O/L & A/L Final Certificates." },
        { docType: "English", description: "SELT (IELTS for UKVI)." },
      ],
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "UCAS/Direct Portal Submission." },
        { docType: "Personal Statement", description: "(2026 Undergraduate 3-question format)." },
        { docType: "References", description: "1 for UG / 2 for PG." },
      ],
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "CAS", description: "Confirmation of Acceptance for Studies Reference." },
        { docType: "Financials", description: "£13,761 (London) / £10,539 (Outside) held for 28 days." },
        { docType: "IHS Payment", description: "Immigration Health Surcharge reference." },
        { docType: "TB Test", description: "Certificate from approved clinic." },
        { docType: "ATAS Certificate", description: "(If required for specific Science/Tech subjects)." },
      ],
    },
  ],
  "New Zealand": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "All pages + 2-3 Photos." },
        { docType: "National ID & Birth Certificate", description: "National ID & Translated Birth Certificate." },
        { docType: "Academic", description: "A/L (3 'C' passes min) & O/L." },
        { docType: "English", description: "IELTS/PTE Official Result." },
      ],
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "Portal Submission." },
        { docType: "References", description: "Academic/Employment." },
        { docType: "Work Experience Evidence", description: "(For PG pathways)." },
      ],
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "Offer of Place", description: "From NZQA-approved provider." },
        { docType: "Tuition Receipt", description: "Payment for first year." },
        { docType: "Financials", description: "NZD 20,000 + 6-month source history." },
        { docType: "X-Ray Certificate", description: "(For stays > 6 months)." },
        { docType: "Final SOP", description: '"Genuine Intending Student" focus.' },
      ],
    },
  ],
  Japan: [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "All pages + Family Registry." },
        { docType: "Birth Certificate", description: "Original + Notarized Translation." },
        { docType: "Academic", description: "O/L & A/L Original + Translation." },
        { docType: "Language", description: "150-hour Japanese study cert or JLPT N5." },
      ],
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "University-specific Portal Submission (T-ADS/PEAK/G30)." },
        { docType: "Research Plan", description: "(Postgraduate only)." },
        { docType: "English", description: "TOEFL iBT preferred/accepted." },
      ],
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "COE", description: "Certificate of Eligibility issued." },
        { docType: "Financial Sponsor Docs", description: "3yr Tax Returns + Income Cert + Employment Letter." },
        { docType: "Final SOP", description: "Study logic in English/Japanese." },
      ],
    },
  ],
  Singapore: [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "Bio-data + all pages." },
        { docType: "Birth Certificate", description: "Notarized English translation." },
        { docType: "Academic", description: "O/L & A/L Certificates + Transcripts." },
        { docType: "English", description: "IELTS/TOEFL." },
      ],
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "SAT/ACT Scores", description: "(For NUS/NTU/SMU)." },
        { docType: "CCA/Leadership List", description: "Co-curricular records." },
        { docType: "MTL Exemption Request", description: "Mother Tongue Exemption Request." },
      ],
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "IPA", description: "In-Principle Approval via SOLAR system." },
        { docType: "SOLAR eForm 16", description: "Printed/Signed." },
        { docType: "Tuition Grant Decision", description: "MOE Bond commitment." },
        { docType: "Medical Report", description: "HIV/TB screening results." },
      ],
    },
  ],
  Default: [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "High-resolution color scan of bio-data page." },
        { docType: "National ID", description: "Front and back." },
        { docType: "Academic", description: "O/L and A/L Certificates." },
        { docType: "English", description: "IELTS/PTE Result." },
        { docType: "Professional CV", description: "Chronological with no gaps." },
      ],
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "Portal Submission." },
        { docType: "SOP", description: "Statement of Purpose." },
      ],
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "Offer Letter", description: "Offer Letter Acceptance." },
        { docType: "Financials", description: "Bank Balance Certificate." },
      ],
    },
  ],
};

/** @type {Record<string, Array<{ name: string, items: string[] }>>} */
const VISA_WORKFLOWS = {
  Australia: [
    { name: "Pre-Flight Check", items: ["FAR (Financial Audit)", "GTE/GS Approval", "OSHC"] },
    { name: "Launch", items: ["ImmiAccount Lodgment", "HAP ID (Medical)", "Biometrics"] },
    { name: "Landing", items: ["Visa Grant Notice", "VEVO Check", "Flight Ticket"] },
  ],
  Canada: [
    { name: "Pre-Flight Check", items: ["PAL (Provincial Attestation)", "GIC Certificate", "Upfront Medicals"] },
    { name: "Launch", items: ["IRCC Portal Lodgment", "Biometrics Instruction Letter (BIL)"] },
    { name: "Landing", items: ["Passport Request (PPR)", "POE Letter", "Flight Ticket"] },
  ],
  UK: [
    { name: "Pre-Flight Check", items: ["CAS Issuance", "TB Test Certificate", "Financials (28-day rule)"] },
    { name: "Launch", items: ["UKVI Lodgment", "IHS Payment", "VFS Appointment"] },
    { name: "Landing", items: ["BRP Collection Letter", "Vignette", "Flight Ticket"] },
  ],
  Default: [
    { name: "Pre-Flight Check", items: ["Financial Clearance", "Medical Check"] },
    { name: "Launch", items: ["Portal Lodgment", "Biometrics"] },
    { name: "Landing", items: ["Visa Decision", "Flight Ticket"] },
  ],
};

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function checklistForCountry(country) {
  return COUNTRY_CHECKLISTS[country] || COUNTRY_CHECKLISTS.Default;
}

function visaWorkflowForCountry(country) {
  return VISA_WORKFLOWS[country] || VISA_WORKFLOWS.Default;
}

function buildPipelineDocs(country) {
  const checklist = checklistForCountry(country);
  const prefix = `${slug(country)}-pl`;
  const docs = [{ ...DEFAULT_PIPELINE_DOC }];

  for (const category of checklist) {
    const group = category.stage;
    for (const item of category.items) {
      docs.push({
        id: `${prefix}-${slug(group)}-${slug(item.docType)}`,
        group,
        name: item.docType,
        required: true,
        stageIds: [...PIPELINE_DOC_STAGE_IDS],
      });
    }
  }

  return docs;
}

function buildVisaDocs(country) {
  const workflow = visaWorkflowForCountry(country);
  const prefix = `${slug(country)}-visa`;
  const docs = [];

  for (const stage of workflow) {
    for (const itemName of stage.items) {
      docs.push({
        id: `${prefix}-${slug(stage.name)}-${slug(itemName)}`,
        group: stage.name,
        name: itemName,
        required: true,
        stageIds: [...VISA_DOC_STAGE_IDS],
      });
    }
  }

  return docs;
}

function buildDocMappingForCountry(country) {
  return {
    pipelineDocs: buildPipelineDocs(country),
    visaDocs: buildVisaDocs(country),
  };
}

function buildDocMapping(countries) {
  const out = {};
  for (const country of countries) {
    out[country] = buildDocMappingForCountry(country);
  }
  return out;
}

function buildDefaultStages() {
  return DEFAULT_STAGES.map((s) => ({ ...s }));
}

function buildStages(countries) {
  const out = {};
  for (const country of countries) {
    out[country] = buildDefaultStages();
  }
  return out;
}

async function readSeedCountries() {
  try {
    const raw = await fs.readFile(COUNTRIES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((c) => String(c).trim()).filter(Boolean);
    }
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
  return Object.keys(COUNTRY_CHECKLISTS).filter((k) => k !== "Default");
}

module.exports = {
  COUNTRY_CHECKLISTS,
  VISA_WORKFLOWS,
  readSeedCountries,
  buildDocMapping,
  buildDocMappingForCountry,
  buildStages,
  buildPipelineDocs,
  buildVisaDocs,
};
