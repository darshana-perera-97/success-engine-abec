import * as XLSX from "xlsx";
import { cellText, normalizeHeader } from "./importShared";

const SUPPORTED_EXTENSIONS = [".xls", ".xlsx", ".csv"];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export const UNIVERSITY_IMPORT_COLUMNS = [
  "University name",
  "Logo link",
  "Country",
  "University page link",
  "University course link",
];

const FIELD_ALIASES = {
  university: ["university_name", "university", "uni_name", "name"],
  logoUrl: ["logo_link", "logo_url", "university_logo", "logo", "image_link", "image_url"],
  country: ["country"],
  pageLink: ["university_page_link", "page_link", "university_page", "uni_page_link", "website", "university_link"],
  courseLink: ["university_course_link", "course_link", "university_course", "course_page_link"],
};

function isSupportedSpreadsheet(fileName) {
  const name = String(fileName || "").toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function isHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function hasUniversityLogo(value) {
  const logo = String(value || "").trim();
  return logo.startsWith("data:image/") || isHttpUrl(logo);
}

function matchCountryName(value, countries) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return "";
  return (countries || []).find((name) => String(name).trim().toLowerCase() === key) || "";
}

export function validateUniversityFields(input, countries = []) {
  const university = String(input?.university || "").trim();
  const logoUrl = String(input?.logoUrl || "").trim();
  const countryInput = String(input?.country || "").trim();
  const pageLink = String(input?.pageLink || "").trim();
  const courseLink = String(input?.courseLink || "").trim();
  const country = matchCountryName(countryInput, countries);

  if (!university) return { ok: false, error: "University name is required." };
  if (!logoUrl) return { ok: false, error: "University logo is required." };
  if (!hasUniversityLogo(logoUrl)) {
    return { ok: false, error: "Logo must be an uploaded image or an image link (http or https)." };
  }
  if (logoUrl.startsWith("data:image/")) {
    const base64 = logoUrl.split(",")[1] || "";
    const bytes = Math.floor((base64.length * 3) / 4);
    if (bytes > LOGO_MAX_BYTES) return { ok: false, error: "Logo must be under 2MB." };
  }
  if (!countryInput) return { ok: false, error: "Country is required." };
  if (!countries.length) return { ok: false, error: "Country list is not available yet." };
  if (!country) return { ok: false, error: `Country "${countryInput}" is not in the country list.` };
  if (pageLink && !isHttpUrl(pageLink)) {
    return { ok: false, error: "University page link must be a valid http or https URL." };
  }
  if (courseLink && !isHttpUrl(courseLink)) {
    return { ok: false, error: "University course link must be a valid http or https URL." };
  }
  if (!pageLink && !courseLink) {
    return { ok: false, error: "Add a university page link, a course link, or both." };
  }

  return {
    ok: true,
    value: { university, logoUrl, country, pageLink, courseLink },
  };
}

function rowFromRaw(raw) {
  const normalized = {};
  Object.entries(raw || {}).forEach(([key, value]) => {
    normalized[normalizeHeader(key)] = cellText(value);
  });
  const pick = (aliases) => {
    for (const alias of aliases) {
      if (normalized[alias]) return normalized[alias];
    }
    return "";
  };
  return {
    university: pick(FIELD_ALIASES.university),
    logoUrl: pick(FIELD_ALIASES.logoUrl),
    country: pick(FIELD_ALIASES.country),
    pageLink: pick(FIELD_ALIASES.pageLink),
    courseLink: pick(FIELD_ALIASES.courseLink),
  };
}

function isBlankRow(row) {
  return !row.university && !row.logoUrl && !row.country && !row.pageLink && !row.courseLink;
}

function sampleRows(exampleCountry) {
  return [
    {
      "University name": "University of Melbourne",
      "Logo link": "https://example.com/university-logo.png",
      "Country": exampleCountry || "Australia",
      "University page link": "https://www.unimelb.edu.au",
      "University course link": "",
    },
  ];
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadUniversitySample(format, exampleCountry) {
  const rows = sampleRows(exampleCountry);
  if (format === "csv") {
    const lines = [
      UNIVERSITY_IMPORT_COLUMNS.join(","),
      ...rows.map((row) => UNIVERSITY_IMPORT_COLUMNS.map((column) => csvCell(row[column])).join(",")),
    ];
    triggerDownload(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), "university-import-sample.csv");
    return;
  }
  const sheet = XLSX.utils.json_to_sheet(rows, { header: UNIVERSITY_IMPORT_COLUMNS });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Universities");
  XLSX.writeFile(book, "university-import-sample.xlsx");
}

export async function parseUniversityImportFile(file, { countries = [] } = {}) {
  if (!file) return { ok: false, error: "No file selected." };
  if (!isSupportedSpreadsheet(file.name)) {
    return { ok: false, error: "Please upload a spreadsheet (.xls, .xlsx, or .csv)." };
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { ok: false, error: "The spreadsheet has no worksheets." };
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    const rows = rawRows
      .map((raw, index) => {
        const fields = rowFromRaw(raw);
        return { ...fields, rowNumber: index + 2 };
      })
      .filter((row) => !isBlankRow(row))
      .map((row) => {
        const validated = validateUniversityFields(row, countries);
        return validated.ok
          ? { ...validated.value, rowNumber: row.rowNumber, error: "" }
          : { ...row, rowNumber: row.rowNumber, error: validated.error };
      });

    if (!rows.length) return { ok: false, error: "No university rows found in the file." };
    return { ok: true, fileName: file.name, rows };
  } catch {
    return { ok: false, error: "Could not read the spreadsheet. Check the file format and try again." };
  }
}
