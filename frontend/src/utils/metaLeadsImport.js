import {
  buildPlaceholderEmail,
  cellText,
  matchBranchLocation,
  normalizeHeader,
  normalizePhone,
  parseCreatedTime,
  titleCaseWords
} from "./importShared";

function formatQualification(raw) {
  const key = cellText(raw).toLowerCase();
  const map = {
    master_: "Master's",
    masters: "Master's",
    bachelor_degree: "Bachelor's Degree",
    bachelor: "Bachelor's Degree",
    hnd: "HND",
    a_levels: "A Levels",
    o_levels: "O Levels"
  };
  return map[key] || titleCaseWords(key.replace(/_/g, " "));
}

function formatIntake(raw) {
  const key = cellText(raw).toLowerCase();
  if (!key) return "";
  const match = key.match(/^([a-z]+)_(\d{4})$/);
  if (match) return `${titleCaseWords(match[1])} ${match[2]}`;
  return titleCaseWords(key.replace(/_/g, " "));
}

// Whole words only, so "AUS" is Australia and the "US" inside "AUS" is ignored.
// Two-letter English words ("us", "can") match only as uppercase campaign codes.
const COUNTRY_RULES = [
  { country: "UAE", pattern: /\b(?:uae|u\.a\.e\.?|dubai|united arab emirates)\b/i },
  { country: "UK", pattern: /\b(?:uk|u\.k\.?|united kingdom|britain|england)\b/i },
  { country: "USA", pattern: /\b(?:usa|u\.s\.a\.?|united states|america)\b/i },
  { country: "USA", pattern: /\bUS\b/ },
  { country: "Canada", pattern: /\bcanada\b/i },
  { country: "Canada", pattern: /\bCAN\b/ },
  { country: "Australia", pattern: /\b(?:australia|aus)\b/i },
  { country: "New Zealand", pattern: /\b(?:new zealand|nz)\b/i }
];

function inferCountryFromText(text) {
  const haystack = cellText(text);
  if (!haystack) return "";
  for (const rule of COUNTRY_RULES) {
    if (rule.pattern.test(haystack)) return rule.country;
  }
  return "";
}

function inferCountryToVisit(row, fileName = "") {
  const fromCampaign = inferCountryFromText(
    [row.campaign_name, row.ad_name, row.form_name, row.adset_name].map(cellText).join(" ")
  );
  if (fromCampaign) return fromCampaign;
  return inferCountryFromText(fileName) || "UAE";
}

export function mapMetaLeadRow(rawRow, { branchLocations = [], fileName = "" } = {}) {
  const row = {};
  for (const [key, value] of Object.entries(rawRow || {})) {
    row[normalizeHeader(key)] = value;
  }

  const metaLeadId = cellText(row.id);
  const name = cellText(row.full_name);
  const phone = normalizePhone(row.phone_number, row.work_phone_number);
  const nearestOffice = matchBranchLocation(row.nearest_branch, branchLocations);
  const countryToVisit = inferCountryToVisit(row, fileName);
  const currentEducationLevel = formatQualification(row.highest_qualification);
  const intendedProgram = formatIntake(row.preferred_intake);
  const platform = cellText(row.platform);
  const campaignName = cellText(row.campaign_name);
  const formName = cellText(row.form_name);

  const messageParts = [];
  if (cellText(row.age)) messageParts.push(`Age: ${cellText(row.age)}`);
  if (platform) messageParts.push(`Platform: ${platform}`);
  if (campaignName) messageParts.push(`Campaign: ${campaignName}`);
  if (formName) messageParts.push(`Form: ${formName}`);

  return {
    importKey: metaLeadId || `${name}-${phone}`,
    metaLeadId,
    submittedAt: parseCreatedTime(row.created_time),
    name,
    email: buildPlaceholderEmail(metaLeadId, name),
    phone,
    countryToVisit,
    city: cellText(row.city) || null,
    nearestOffice: nearestOffice || null,
    livingStatus: null,
    visaRejectionAnyCountry: "No",
    currentEducationLevel: currentEducationLevel || null,
    intendedProgram: intendedProgram || null,
    message: messageParts.length ? messageParts.join(" · ") : null,
    source: "marketing-team",
    platform: platform || null,
    campaignName: campaignName || null,
    formName: formName || null
  };
}

export async function parseMetaLeadsFile(file) {
  const { parseReqStudentsImportFile } = await import("./reqStudentsImport");
  const parsed = await parseReqStudentsImportFile(file);
  if (!parsed.ok) return parsed;
  if (parsed.format !== "meta-leads") {
    return {
      ok: false,
      error: "This file does not look like a Meta leads export (missing full_name / phone_number columns)."
    };
  }
  return { ok: true, data: parsed.data, fileName: parsed.fileName };
}
