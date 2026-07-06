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

function inferCountryToVisit(row) {
  const haystack = [
    row.campaign_name,
    row.ad_name,
    row.form_name,
    row.adset_name
  ]
    .map(cellText)
    .join(" ")
    .toLowerCase();
  if (haystack.includes("dubai") || haystack.includes("uae")) return "UAE";
  if (haystack.includes("uk") || haystack.includes("britain")) return "UK";
  if (haystack.includes("usa") || haystack.includes("america")) return "USA";
  if (haystack.includes("canada")) return "Canada";
  if (haystack.includes("australia")) return "Australia";
  if (haystack.includes("new zealand")) return "New Zealand";
  return "UAE";
}

export function mapMetaLeadRow(rawRow, { branchLocations = [] } = {}) {
  const row = {};
  for (const [key, value] of Object.entries(rawRow || {})) {
    row[normalizeHeader(key)] = value;
  }

  const metaLeadId = cellText(row.id);
  const name = cellText(row.full_name);
  const phone = normalizePhone(row.phone_number, row.work_phone_number);
  const nearestOffice = matchBranchLocation(row.nearest_branch, branchLocations);
  const countryToVisit = inferCountryToVisit(row);
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
