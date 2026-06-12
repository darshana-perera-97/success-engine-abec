import * as XLSX from "xlsx";

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\?/g, "")
    .replace(/\s+/g, "_");
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function normalizePhone(rawPhone, rawWorkPhone) {
  const primary = cellText(rawPhone);
  const fallback = cellText(rawWorkPhone);
  let phone = primary || fallback;
  if (!phone) return "";
  if (/^\+/.test(phone)) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("7")) return `+94${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+94${digits.slice(1)}`;
  if (digits.length >= 10) return `+${digits}`;
  return phone;
}

function titleCaseWords(value) {
  return String(value || "")
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

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

function matchBranchLocation(rawBranch, branchLocations) {
  const key = cellText(rawBranch).toLowerCase();
  if (!key) return "";
  const exact = (branchLocations || []).find((loc) => String(loc).trim().toLowerCase() === key);
  if (exact) return exact;
  const partial = (branchLocations || []).find((loc) => {
    const normalized = String(loc).trim().toLowerCase();
    return normalized.includes(key) || key.includes(normalized);
  });
  return partial || titleCaseWords(key);
}

function parseCreatedTime(raw) {
  const text = cellText(raw);
  if (!text) return new Date().toISOString();
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function buildPlaceholderEmail(metaLeadId, name) {
  const idPart = cellText(metaLeadId).replace(/\W+/g, "") || Date.now().toString(36);
  const namePart = cellText(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 24);
  return `lead.${namePart || "student"}.${idPart}@imported.local`;
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
    source: "meta-leads-import",
    platform: platform || null,
    campaignName: campaignName || null,
    formName: formName || null
  };
}

export async function parseMetaLeadsFile(file) {
  if (!file) {
    return { ok: false, error: "No file selected." };
  }

  const name = String(file.name || "").toLowerCase();
  if (!name.endsWith(".xls") && !name.endsWith(".xlsx") && !name.endsWith(".csv")) {
    return { ok: false, error: "Please upload a Meta leads export (.xls, .xlsx, or .csv)." };
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { ok: false, error: "The spreadsheet has no worksheets." };
    }
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rawRows.length) {
      return { ok: false, error: "No lead rows found in the file." };
    }

    const headers = Object.keys(rawRows[0] || {}).map(normalizeHeader);
    const hasLeadColumns = headers.includes("full_name") || headers.includes("phone_number");
    if (!hasLeadColumns) {
      return {
        ok: false,
        error: "This file does not look like a Meta leads export (missing full_name / phone_number columns)."
      };
    }

    const rows = rawRows
      .map((raw) => mapMetaLeadRow(raw))
      .filter((row) => row.name || row.phone);

    if (!rows.length) {
      return { ok: false, error: "No valid leads with a name or phone number were found." };
    }

    return { ok: true, data: rows, fileName: file.name };
  } catch {
    return { ok: false, error: "Could not read the spreadsheet. Check the file format and try again." };
  }
}
