import {
  buildPlaceholderEmail,
  cellText,
  normalizeHeader,
  normalizePhone,
  parseCreatedTime,
  titleCaseWords
} from "./importShared";
import { normalizeIntakeMonth, normalizeIntakeYear } from "./intakeFields";

const MONTH_ABBREVIATIONS = {
  jan: "January",
  feb: "February",
  mar: "March",
  apr: "April",
  may: "May",
  jun: "June",
  jul: "July",
  aug: "August",
  sep: "September",
  sept: "September",
  oct: "October",
  nov: "November",
  dec: "December"
};

function isEmptyCell(value) {
  const text = cellText(value);
  return !text || text === "—" || text === "-";
}

function expandMonthToken(raw) {
  const key = cellText(raw).toLowerCase();
  if (!key) return "";
  if (MONTH_ABBREVIATIONS[key]) return MONTH_ABBREVIATIONS[key];
  return titleCaseWords(key);
}

function expandYearToken(raw) {
  const text = cellText(raw);
  if (!text) return "";
  if (/^\d{4}$/.test(text)) return text;
  if (/^\d{2}$/.test(text)) {
    const twoDigit = Number(text);
    return String(2000 + twoDigit);
  }
  return "";
}

export function parsePreferredIntake(raw) {
  const text = cellText(raw);
  if (!text || isEmptyCell(text)) {
    return { intakeMonth: null, intakeYear: null };
  }

  const shortMatch = text.match(/^([A-Za-z]+)\s+(\d{2,4})$/);
  if (shortMatch) {
    const intakeMonth = normalizeIntakeMonth(expandMonthToken(shortMatch[1])) || null;
    const intakeYear = normalizeIntakeYear(expandYearToken(shortMatch[2])) || null;
    return { intakeMonth, intakeYear };
  }

  const longMatch = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (longMatch) {
    const intakeMonth = normalizeIntakeMonth(expandMonthToken(longMatch[1])) || null;
    const intakeYear = normalizeIntakeYear(longMatch[2]) || null;
    return { intakeMonth, intakeYear };
  }

  return { intakeMonth: null, intakeYear: null };
}

function formatCountry(raw) {
  const text = cellText(raw);
  if (!text || isEmptyCell(text)) return "";
  const key = text.toLowerCase();
  if (key === "uk") return "UK";
  if (key === "uae") return "UAE";
  if (key === "usa") return "USA";
  return titleCaseWords(text);
}

function resolveEmail(rawEmail, conversationId, name) {
  const email = cellText(rawEmail);
  if (email && email.includes("@") && !isEmptyCell(email)) {
    return email.toLowerCase();
  }
  return buildPlaceholderEmail(conversationId, name);
}

function resolvePhone(rawWhatsapp, rawPhone) {
  const whatsapp = isEmptyCell(rawWhatsapp) ? "" : cellText(rawWhatsapp);
  const phone = isEmptyCell(rawPhone) ? "" : cellText(rawPhone);
  return normalizePhone(whatsapp, phone);
}

export function isInquiriesExportHeaders(headers) {
  const normalized = (headers || []).map(normalizeHeader);
  return (
    normalized.includes("name") &&
    normalized.includes("email") &&
    normalized.includes("conversation_id") &&
    (normalized.includes("preferred_study_destination") || normalized.includes("preferred_intake"))
  );
}

export function mapInquiriesExportRow(rawRow) {
  const row = {};
  for (const [key, value] of Object.entries(rawRow || {})) {
    row[normalizeHeader(key)] = value;
  }

  const conversationId = cellText(row.conversation_id);
  const name = cellText(row.name);
  const phone = resolvePhone(row.whatsapp_number, row.phone);
  const whatsappNumber = phone;
  const sourceLabel = cellText(row.source);
  const countryToVisit = formatCountry(row.preferred_study_destination) || "UAE";
  const currentEducationLevel = isEmptyCell(row.current_qualification)
    ? null
    : cellText(row.current_qualification);
  const intendedProgram = isEmptyCell(row.level_of_study) ? null : cellText(row.level_of_study);
  const { intakeMonth, intakeYear } = parsePreferredIntake(row.preferred_intake);

  const messageParts = [];
  if (sourceLabel && !isEmptyCell(sourceLabel)) messageParts.push(`Source: ${sourceLabel}`);
  if (conversationId) messageParts.push(`Conversation: ${conversationId}`);

  return {
    importKey: conversationId || `${name}-${phone}`,
    metaLeadId: conversationId || null,
    submittedAt: parseCreatedTime(row.updated),
    name,
    email: resolveEmail(row.email, conversationId, name),
    phone,
    whatsappNumber,
    countryToVisit,
    city: null,
    nearestOffice: null,
    livingStatus: null,
    visaRejectionAnyCountry: "No",
    currentEducationLevel,
    intendedProgram,
    intakeMonth,
    intakeYear,
    message: messageParts.length ? messageParts.join(" · ") : null,
    source: "import",
    platform: sourceLabel || null,
    campaignName: null,
    formName: null
  };
}

export function mapInquiriesExportRows(rawRows) {
  return (rawRows || [])
    .map((rawRow) => mapInquiriesExportRow(rawRow))
    .filter((row) => row.name || row.phone);
}
