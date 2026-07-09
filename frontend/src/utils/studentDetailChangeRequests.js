import { formatIntakeLabel } from "./intakeFields";

const DETAIL_FIELD_LABELS = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  whatsappNumber: "WhatsApp",
  currentEducationLevel: "Education level",
};

export function getStudentDetailChangeRows(row) {
  if (!row || row.requestType !== "student-details") return [];
  const pairs = [
    ["name", row.currentName, row.requestedName],
    ["email", row.currentEmail, row.requestedEmail],
    ["phone", row.currentPhone, row.requestedPhone],
    ["whatsappNumber", row.currentWhatsappNumber, row.requestedWhatsappNumber],
    ["currentEducationLevel", row.currentEducationLevel, row.requestedEducationLevel],
  ];
  return pairs
    .filter(([, current, requested]) => String(current || "").trim() !== String(requested || "").trim())
    .map(([field, current, requested]) => ({
      field,
      label: DETAIL_FIELD_LABELS[field] || field,
      current: current || "—",
      requested: requested || "—",
    }));
}

export function formatStudentDetailChangeSummary(row) {
  const changes = getStudentDetailChangeRows(row);
  if (!changes.length) return "—";
  return changes.map((item) => `${item.label}: ${item.current} → ${item.requested}`).join("; ");
}

export function formatRequestTypeLabel(row) {
  if (row?.requestType === "student-details") return "Student details";
  if (row?.requestType === "student-removal") return "Student removal";
  if (row?.requestType === "invoice-wave-off") return "Invoice wave-off";
  if (row?.requestType === "intake-change") return "Intake change";
  if (row?.requestType === "branch-change") return "Branch change";
  if (row?.requestType === "whatsapp-contact-change") return "WhatsApp contact";
  if (row?.requestType === "refund") return "Refund";
  return "Country change";
}

export function mergeRequestRows(
  countryRows = [],
  detailRows = [],
  waveOffRows = [],
  removalRows = [],
  intakeRows = [],
  refundRows = [],
  branchRows = [],
  whatsappContactRows = []
) {
  const taggedCountry = (countryRows || []).map((row) => ({
    ...row,
    requestType: "country-change",
  }));
  const taggedDetail = (detailRows || []).map((row) => ({
    ...row,
    requestType: "student-details",
  }));
  const taggedWaveOff = (waveOffRows || []).map((row) => ({
    ...row,
    requestType: "invoice-wave-off",
  }));
  const taggedRemoval = (removalRows || []).map((row) => ({
    ...row,
    requestType: "student-removal",
  }));
  const taggedIntake = (intakeRows || []).map((row) => ({
    ...row,
    requestType: "intake-change",
  }));
  const taggedRefund = (refundRows || []).map((row) => ({
    ...row,
    requestType: "refund",
  }));
  const taggedBranch = (branchRows || []).map((row) => ({
    ...row,
    requestType: "branch-change",
  }));
  const taggedWhatsappContact = (whatsappContactRows || []).map((row) => ({
    ...row,
    requestType: "whatsapp-contact-change",
  }));
  return [
    ...taggedCountry,
    ...taggedDetail,
    ...taggedWaveOff,
    ...taggedRemoval,
    ...taggedIntake,
    ...taggedRefund,
    ...taggedBranch,
    ...taggedWhatsappContact,
  ].sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
}

export function formatSubmittedAt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(iso);
  }
}

export function requestStatusBadgeClass(status) {
  const key = String(status || "").toLowerCase();
  if (key === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (key === "refunded") return "bg-sky-50 text-sky-700 border-sky-200";
  if (key === "rejected") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

export function requestStatusLabel(status) {
  const key = String(status || "").toLowerCase();
  if (key === "approved") return "Approved";
  if (key === "refunded") return "Refunded";
  if (key === "rejected") return "Rejected";
  return "Pending";
}

export function buildRequestDetailRows(row, { showRequestedBy = false } = {}) {
  if (!row) return [];
  const rows = [
    { label: "Type", value: formatRequestTypeLabel(row) },
    {
      label: "Student",
      value: row.studentName || row.studentId || "—",
      studentId: row.studentId,
      studentName: row.studentName,
    },
  ];

  if (row.requestType === "student-details") {
    const changes = getStudentDetailChangeRows(row);
    if (changes.length) {
      rows.push({ label: "Changes", value: "", isSection: true });
      for (const item of changes) {
        rows.push({ label: item.label, value: `${item.current} → ${item.requested}`, indent: true });
      }
    } else {
      rows.push({ label: "Change", value: "—" });
    }
  } else if (row.requestType !== "refund") {
    rows.push({ label: "Change", value: formatRequestChangeSummary(row) });
  } else {
    rows.push({ label: "Refund", value: formatRequestChangeSummary(row) });
  }

  if (row.reason) {
    rows.push({ label: "Reason", value: row.reason, multiline: true });
  }

  if (showRequestedBy) {
    const requester = [row.requestedByName, row.requestedByRole ? `(${row.requestedByRole})` : ""]
      .filter(Boolean)
      .join(" ");
    rows.push({ label: "Requested by", value: requester || "—" });
  }

  rows.push({ label: "Submitted", value: formatSubmittedAt(row.requestedAt) });
  rows.push({ label: "Status", value: requestStatusLabel(row.status), status: row.status });

  if (row.status !== "pending" && row.reviewedByName) {
    const reviewer = [row.reviewedByName, row.reviewedByRole ? `(${row.reviewedByRole})` : ""]
      .filter(Boolean)
      .join(" ");
    rows.push({ label: "Reviewed by", value: reviewer });
  }

  if (row.reviewedAt) {
    rows.push({ label: "Reviewed", value: formatSubmittedAt(row.reviewedAt) });
  }

  if (row.reviewNote) {
    rows.push({
      label: row.status === "rejected" ? "Rejection note" : "Review note",
      value: row.reviewNote,
      multiline: true,
      highlight: row.status === "rejected",
    });
  }

  if (row.requestType === "branch-change" && row.status === "approved" && row.approvedCounselorName) {
    rows.push({ label: "New counselor", value: row.approvedCounselorName });
  }

  if (row.refundNote) {
    rows.push({
      label: "Refund note",
      value: row.refundNote,
      multiline: true,
    });
  }

  if (row.refundedAt) {
    rows.push({ label: "Refunded", value: formatSubmittedAt(row.refundedAt) });
  }

  if (row.refundedByName) {
    rows.push({ label: "Processed by", value: row.refundedByName });
  }

  return rows;
}

export function formatRequestChangeSummary(row) {
  if (row?.requestType === "student-details") {
    return formatStudentDetailChangeSummary(row);
  }
  if (row?.requestType === "student-removal") {
    return "Remove student and all stored files";
  }
  if (row?.requestType === "invoice-wave-off") {
    const desc = String(row.description || "").trim();
    const invoiceId = String(row.invoiceId || row.id || "").trim();
    if (desc && invoiceId) return `${invoiceId}: ${desc}`;
    return desc || invoiceId || "Wave-off invoice";
  }
  if (row?.requestType === "intake-change") {
    const current = formatIntakeLabel(row.currentIntakeMonth, row.currentIntakeYear) || "—";
    const requested = formatIntakeLabel(row.requestedIntakeMonth, row.requestedIntakeYear) || "—";
    return `${current} → ${requested}`;
  }
  if (row?.requestType === "branch-change") {
    return `${row.currentBranch || "—"} → ${row.requestedBranch || "—"}`;
  }
  if (row?.requestType === "whatsapp-contact-change") {
    const current = row.currentWhatsappName || row.currentMessengerName || "—";
    const requested = row.requestedWhatsappName || row.requestedMessengerName || "—";
    return `${current} → ${requested}`;
  }
  if (row?.requestType === "refund") {
    const amountLabel = `${row.currency || "LKR"} ${Number(row.amount || 0).toLocaleString()}`;
    const invoicePart = row.invoiceId ? ` on ${row.invoiceId}` : "";
    return `${amountLabel}${invoicePart}`;
  }
  return `${row.currentCountry || "—"} → ${row.requestedCountry || "—"}`;
}
