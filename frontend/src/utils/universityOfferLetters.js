const UNIVERSITY_OFFER_STATUSES = new Set(["Unconditional", "Conditional", "Rejected"]);

function normalizeOfferStatus(status) {
  const s = String(status || "Conditional").trim();
  if (s === "Approved") return "Unconditional";
  return UNIVERSITY_OFFER_STATUSES.has(s) ? s : "Conditional";
}

function resolveStudentCounselorDisplayName(student, employees) {
  const match = (employees || []).find((e) => e && e.id === student?.counselor);
  return String(match?.name || match?.username || student?.counselorName || "").trim() || "—";
}

function offerStatusBadgeClass(status) {
  if (status === "Unconditional" || status === "Approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "Rejected") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function buildUniversityOfferLetterRows(students, employees) {
  const rows = [];
  for (const student of students || []) {
    const raw = student?.universityOfferLetters;
    if (!Array.isArray(raw)) continue;
    const sid = String(student?.id || "").trim();
    const studentName = String(student?.name || "").trim() || sid || "Unknown student";
    const counselorLabel = resolveStudentCounselorDisplayName(student, employees);
    for (const entry of raw) {
      if (!entry || typeof entry !== "object" || !String(entry.url || "").trim()) continue;
      const offerStatus = normalizeOfferStatus(entry.offerStatus);
      rows.push({
        key: `${sid}-${entry.id || entry.name || rows.length}`,
        student,
        studentName,
        counselorLabel,
        offerStatus,
        uploadedAt: String(entry.uploadedAt || "").trim(),
      });
    }
  }
  rows.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
  return rows;
}

export { offerStatusBadgeClass, buildUniversityOfferLetterRows, normalizeOfferStatus };
