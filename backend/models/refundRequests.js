const crypto = require("crypto");
const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { REFUND_REQUESTS_FILE } = require("../config");

function normalizeRefundRequest(entry) {
  const src = entry && typeof entry === "object" ? entry : {};
  return {
    id: String(src.id || "").trim(),
    studentId: String(src.studentId || "").trim(),
    studentName: String(src.studentName || "").trim(),
    amount: Number(src.amount) || 0,
    currency: String(src.currency || "LKR").trim() || "LKR",
    invoiceId: String(src.invoiceId || "").trim(),
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
    refundedByUserId: String(src.refundedByUserId || "").trim(),
    refundedByName: String(src.refundedByName || "").trim(),
    refundedAt: String(src.refundedAt || "").trim(),
    refundNote: String(src.refundNote || "").trim(),
  };
}

async function readRefundRequests() {
  try {
    const raw = await fs.readFile(REFUND_REQUESTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, REFUND_REQUESTS_FILE);
    return Array.isArray(parsed) ? parsed.map(normalizeRefundRequest) : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeRefundRequests(list) {
  const normalized = Array.isArray(list) ? list.map(normalizeRefundRequest) : [];
  return withFileLock(REFUND_REQUESTS_FILE, () =>
    atomicWriteFile(REFUND_REQUESTS_FILE, JSON.stringify(normalized, null, 2))
  );
}

async function appendRefundRequest(entry) {
  const amount = Number(entry?.amount);
  const normalized = normalizeRefundRequest({
    ...entry,
    id: entry?.id || `REF-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    amount,
    status: "pending",
    requestedAt: entry?.requestedAt || new Date().toISOString(),
  });
  if (!normalized.studentId) return { ok: false, error: "Student id is required." };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "A valid refund amount is required." };
  if (!normalized.reason) return { ok: false, error: "Reason is required." };
  if (!normalized.requestedByUserId) return { ok: false, error: "Requester id is required." };

  return withFileLock(REFUND_REQUESTS_FILE, async () => {
    const list = await readRefundRequests();
    const hasPending = list.some(
      (row) => row.studentId === normalized.studentId && row.status === "pending"
    );
    if (hasPending) {
      return { ok: false, error: "A pending refund request already exists for this student." };
    }
    list.unshift(normalized);
    await atomicWriteFile(REFUND_REQUESTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: normalized };
  });
}

async function decideRefundRequest(requestId, decision, reviewer = {}) {
  const id = String(requestId || "").trim();
  const normalizedDecision = String(decision || "").trim().toLowerCase();
  if (!id) return { ok: false, error: "Request id is required." };
  if (normalizedDecision !== "approved" && normalizedDecision !== "rejected") {
    return { ok: false, error: "Decision must be approved or rejected." };
  }

  return withFileLock(REFUND_REQUESTS_FILE, async () => {
    const list = await readRefundRequests();
    const idx = list.findIndex((row) => row.id === id);
    if (idx === -1) return { ok: false, error: "Request not found." };
    const current = list[idx];
    if (current.status !== "pending") {
      return { ok: false, error: "This request has already been reviewed." };
    }
    const updated = normalizeRefundRequest({
      ...current,
      status: normalizedDecision,
      reviewedByUserId: String(reviewer.userId || "").trim(),
      reviewedByName: String(reviewer.name || "").trim(),
      reviewedByRole: String(reviewer.role || "").trim(),
      reviewedAt: new Date().toISOString(),
      reviewNote: String(reviewer.reviewNote || "").trim(),
    });
    list[idx] = updated;
    await atomicWriteFile(REFUND_REQUESTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: updated };
  });
}

async function markRefundRequestRefunded(requestId, actor = {}, refundNote = "") {
  const id = String(requestId || "").trim();
  if (!id) return { ok: false, error: "Request id is required." };

  return withFileLock(REFUND_REQUESTS_FILE, async () => {
    const list = await readRefundRequests();
    const idx = list.findIndex((row) => row.id === id);
    if (idx === -1) return { ok: false, error: "Request not found." };
    const current = list[idx];
    if (current.status !== "approved") {
      return { ok: false, error: "Only approved refund requests can be marked as refunded." };
    }
    const updated = normalizeRefundRequest({
      ...current,
      status: "refunded",
      refundedByUserId: String(actor.userId || "").trim(),
      refundedByName: String(actor.name || "").trim(),
      refundedAt: new Date().toISOString(),
      refundNote: String(refundNote || "").trim(),
    });
    list[idx] = updated;
    await atomicWriteFile(REFUND_REQUESTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: updated };
  });
}

module.exports = {
  normalizeRefundRequest,
  readRefundRequests,
  writeRefundRequests,
  appendRefundRequest,
  decideRefundRequest,
  markRefundRequestRefunded,
};
