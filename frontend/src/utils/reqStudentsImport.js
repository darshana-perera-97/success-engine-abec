import * as XLSX from "xlsx";
import { normalizeHeader } from "./importShared";
import { mapMetaLeadRow } from "./metaLeadsImport";
import { isNexGenTeamProgressHeaders, mapNexGenTeamProgressRows } from "./nexgenTeamProgressImport";

const SUPPORTED_EXTENSIONS = [".xls", ".xlsx", ".csv"];

function isSupportedSpreadsheet(fileName) {
  const name = String(fileName || "").toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function isMetaLeadsHeaders(headers) {
  const normalized = (headers || []).map(normalizeHeader);
  return normalized.includes("full_name") || normalized.includes("phone_number");
}

export async function parseReqStudentsImportFile(file, { branchLocations = [] } = {}) {
  if (!file) {
    return { ok: false, error: "No file selected." };
  }

  if (!isSupportedSpreadsheet(file.name)) {
    return {
      ok: false,
      error: "Please upload a spreadsheet (.xls, .xlsx, or .csv)."
    };
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

    const headers = Object.keys(rawRows[0] || {});
    const normalizedHeaders = headers.map(normalizeHeader);

    if (isNexGenTeamProgressHeaders(normalizedHeaders)) {
      const rows = mapNexGenTeamProgressRows(rawRows, { branchLocations });
      if (!rows.length) {
        return { ok: false, error: "No valid students with a name or phone number were found." };
      }
      return {
        ok: true,
        data: rows,
        fileName: file.name,
        format: "nexgen-team-progress",
        formatLabel: "NexGen Team Progress"
      };
    }

    if (isMetaLeadsHeaders(normalizedHeaders)) {
      const rows = rawRows
        .map((raw) => mapMetaLeadRow(raw, { branchLocations }))
        .filter((row) => row.name || row.phone);
      if (!rows.length) {
        return { ok: false, error: "No valid leads with a name or phone number were found." };
      }
      return {
        ok: true,
        data: rows,
        fileName: file.name,
        format: "meta-leads",
        formatLabel: "Meta leads"
      };
    }

    return {
      ok: false,
      error:
        "This file format is not recognized. Upload a Meta leads export or NexGen Team Progress sheet."
    };
  } catch {
    return { ok: false, error: "Could not read the spreadsheet. Check the file format and try again." };
  }
}
