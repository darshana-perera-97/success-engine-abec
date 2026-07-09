const crypto = require("crypto");
const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { BRANCH_CHANGE_REQUESTS_FILE } = require("../config");

function normalizeBranchChangeRequest(entry) {
  const src = entry && typeof entry === "object" ? entry : {};
  return {
    id: String(src.id || "").trim(),
    studentId: String(src.studentId || "").trim(),
    studentName: String(src.studentName || "").trim(),
    currentBranch: String(src.currentBranch || "").trim(),
    requestedBranch: String(src.requestedBranch || "").trim(),
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
    approvedCounselorId: String(src.approvedCounselorId || "").trim(),
    approvedCounselorName: String(src.approvedCounselorName || "").trim(),
  };
}

async function readBranchChangeRequests() {
  try {
    const raw = await fs.readFile(BRANCH_CHANGE_REQUESTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, BRANCH_CHANGE_REQUESTS_FILE);
    return Array.isArray(parsed) ? parsed.map(normalizeBranchChangeRequest) : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeBranchChangeRequests(list) {
  const normalized = Array.isArray(list) ? list.map(normalizeBranchChangeRequest) : [];
  return withFileLock(BRANCH_CHANGE_REQUESTS_FILE, () =>
    atomicWriteFile(BRANCH_CHANGE_REQUESTS_FILE, JSON.stringify(normalized, null, 2))
  );
}

async function appendBranchChangeRequest(entry) {
  const normalized = normalizeBranchChangeRequest({
    ...entry,
    id: entry?.id || `BCR-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    status: "pending",
    requestedAt: entry?.requestedAt || new Date().toISOString(),
  });
  if (!normalized.studentId) return { ok: false, error: "Student id is required." };
  if (!normalized.requestedBranch) return { ok: false, error: "Requested branch is required." };
  if (!normalized.reason) return { ok: false, error: "Reason is required." };
  if (!normalized.requestedByUserId) return { ok: false, error: "Requester id is required." };

  return withFileLock(BRANCH_CHANGE_REQUESTS_FILE, async () => {
    const list = await readBranchChangeRequests();
    const hasPending = list.some(
      (row) =>
        row.studentId === normalized.studentId &&
        row.status === "pending"
    );
    if (hasPending) {
      return { ok: false, error: "A pending branch change request already exists for this student." };
    }
    list.unshift(normalized);
    await atomicWriteFile(BRANCH_CHANGE_REQUESTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: normalized };
  });
}

async function decideBranchChangeRequest(requestId, decision, reviewer = {}) {
  const id = String(requestId || "").trim();
  const normalizedDecision = String(decision || "").trim().toLowerCase();
  if (!id) return { ok: false, error: "Request id is required." };
  if (normalizedDecision !== "approved" && normalizedDecision !== "rejected") {
    return { ok: false, error: "Decision must be approved or rejected." };
  }

  return withFileLock(BRANCH_CHANGE_REQUESTS_FILE, async () => {
    const list = await readBranchChangeRequests();
    const idx = list.findIndex((row) => row.id === id);
    if (idx === -1) return { ok: false, error: "Request not found." };
    const current = list[idx];
    if (current.status !== "pending") {
      return { ok: false, error: "This request has already been reviewed." };
    }
    const updated = normalizeBranchChangeRequest({
      ...current,
      status: normalizedDecision,
      reviewedByUserId: String(reviewer.userId || "").trim(),
      reviewedByName: String(reviewer.name || "").trim(),
      reviewedByRole: String(reviewer.role || "").trim(),
      reviewedAt: new Date().toISOString(),
      reviewNote: String(reviewer.reviewNote || "").trim(),
      approvedCounselorId:
        normalizedDecision === "approved" ? String(reviewer.approvedCounselorId || "").trim() : "",
      approvedCounselorName:
        normalizedDecision === "approved" ? String(reviewer.approvedCounselorName || "").trim() : "",
    });
    list[idx] = updated;
    await atomicWriteFile(BRANCH_CHANGE_REQUESTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: updated };
  });
}

module.exports = {
  normalizeBranchChangeRequest,
  readBranchChangeRequests,
  writeBranchChangeRequests,
  appendBranchChangeRequest,
  decideBranchChangeRequest,
};
