const crypto = require("crypto");
const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { INVOICE_AMOUNT_CHANGE_REQUESTS_FILE } = require("../config");

function normalizeAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeInvoiceAmountChangeRequest(entry) {
  const src = entry && typeof entry === "object" ? entry : {};
  return {
    id: String(src.id || "").trim(),
    invoiceId: String(src.invoiceId || "").trim(),
    studentId: String(src.studentId || "").trim(),
    studentName: String(src.studentName || "").trim(),
    description: String(src.description || "").trim(),
    currency: String(src.currency || "LKR").trim() || "LKR",
    currentAmount: normalizeAmount(src.currentAmount),
    requestedAmount: normalizeAmount(src.requestedAmount),
    reason: String(src.reason || "").trim(),
    status: String(src.status || "pending").trim().toLowerCase(),
    requestedByUserId: String(src.requestedByUserId || "").trim(),
    requestedByName: String(src.requestedByName || "").trim(),
    requestedByRole: String(src.requestedByRole || "").trim(),
    requestedAt: String(src.requestedAt || "").trim(),
    reviewedByUserId: String(src.reviewedByUserId || "").trim(),
    reviewedByName: String(src.reviewedByName || "").trim(),
    reviewedByRole: String(src.reviewedByRole || "").trim(),
    reviewedAt: String(src.reviewedAt || "").trim(),
    reviewNote: String(src.reviewNote || "").trim(),
  };
}

async function readInvoiceAmountChangeRequests() {
  try {
    const raw = await fs.readFile(INVOICE_AMOUNT_CHANGE_REQUESTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, INVOICE_AMOUNT_CHANGE_REQUESTS_FILE);
    return Array.isArray(parsed) ? parsed.map(normalizeInvoiceAmountChangeRequest) : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function appendInvoiceAmountChangeRequest(entry) {
  const requestedAmount = Number(entry?.requestedAmount);
  const currentAmount = Number(entry?.currentAmount);
  const normalized = normalizeInvoiceAmountChangeRequest({
    ...entry,
    id: entry?.id || `IAC-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    currentAmount,
    requestedAmount,
    status: "pending",
    requestedAt: entry?.requestedAt || new Date().toISOString(),
  });
  if (!normalized.invoiceId) return { ok: false, error: "Invoice id is required." };
  if (!normalized.studentId) return { ok: false, error: "Student id is required." };
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return { ok: false, error: "A valid requested amount is required." };
  }
  if (!normalized.reason) return { ok: false, error: "Reason is required." };
  if (!normalized.requestedByUserId) return { ok: false, error: "Requester id is required." };

  return withFileLock(INVOICE_AMOUNT_CHANGE_REQUESTS_FILE, async () => {
    const list = await readInvoiceAmountChangeRequests();
    const hasPending = list.some(
      (row) => row.invoiceId === normalized.invoiceId && row.status === "pending"
    );
    if (hasPending) {
      return { ok: false, error: "A pending amount change request already exists for this invoice." };
    }
    list.unshift(normalized);
    await atomicWriteFile(INVOICE_AMOUNT_CHANGE_REQUESTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: normalized };
  });
}

async function decideInvoiceAmountChangeRequest(requestId, decision, reviewer = {}) {
  const id = String(requestId || "").trim();
  const normalizedDecision = String(decision || "").trim().toLowerCase();
  if (!id) return { ok: false, error: "Request id is required." };
  if (normalizedDecision !== "approved" && normalizedDecision !== "rejected") {
    return { ok: false, error: "Decision must be approved or rejected." };
  }

  return withFileLock(INVOICE_AMOUNT_CHANGE_REQUESTS_FILE, async () => {
    const list = await readInvoiceAmountChangeRequests();
    const idx = list.findIndex((row) => row.id === id);
    if (idx === -1) return { ok: false, error: "Request not found." };
    const current = list[idx];
    if (current.status !== "pending") {
      return { ok: false, error: "This request has already been reviewed." };
    }
    const updated = normalizeInvoiceAmountChangeRequest({
      ...current,
      status: normalizedDecision,
      reviewedByUserId: String(reviewer.userId || "").trim(),
      reviewedByName: String(reviewer.name || "").trim(),
      reviewedByRole: String(reviewer.role || "").trim(),
      reviewedAt: new Date().toISOString(),
      reviewNote: String(reviewer.reviewNote || "").trim(),
    });
    list[idx] = updated;
    await atomicWriteFile(INVOICE_AMOUNT_CHANGE_REQUESTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: updated };
  });
}

module.exports = {
  normalizeInvoiceAmountChangeRequest,
  readInvoiceAmountChangeRequests,
  appendInvoiceAmountChangeRequest,
  decideInvoiceAmountChangeRequest,
};
