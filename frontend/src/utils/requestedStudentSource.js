import { formatInquirySource } from "./inquirySource";

function extractWebFormNameFromMessage(message) {
  const text = String(message || "").trim();
  const match = text.match(/^Form:\s*(.+?)(?:\n\n|$)/s);
  return match ? String(match[1] || "").trim() : "";
}

export function resolveWebFormName(row) {
  const stored = String(row?.webFormName || "").trim();
  if (stored) return stored;
  return extractWebFormNameFromMessage(row?.message);
}

export function formatRequestedStudentSource(row) {
  return formatInquirySource(row?.source);
}
