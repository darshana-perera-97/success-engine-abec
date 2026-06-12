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
  const source = String(row?.source || "").trim().toLowerCase();

  if (source === "meta-leads-import") return "Import";
  if (source === "student-reg-form") return "Student-reg-form";
  if (source === "counselor-reassignment" || source === "custom-input") return "Custom Input";
  if (source === "web-form") {
    const formName = resolveWebFormName(row);
    return formName ? `Web form — ${formName}` : "Web form";
  }

  const raw = String(row?.source || "").trim();
  return raw || "—";
}
