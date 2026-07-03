const crypto = require("crypto");
const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { INTAKE_CHANGE_REQUESTS_FILE } = require("../config");
const { normalizeIntakeMonth, normalizeIntakeYear } = require("../lib/intakeUtils");

function normalizeIntakeChangeRequest(entry) {
  const src = entry && typeof entry === "object" ? entry : {};
  return {
    id: String(src.id || "").trim(),
    studentId: String(src.studentId || "").trim(),
    studentName: String(src.studentName || "").trim(),
    currentIntakeMonth: normalizeIntakeMonth(src.currentIntakeMonth) || null,
    currentIntakeYear: normalizeIntakeYear(src.currentIntakeYear) || null,
    requestedIntakeMonth: normalizeIntakeMonth(src.requestedIntakeMonth) || null,
    requestedIntakeYear: normalizeIntakeYear(src.requestedIntakeYear) || null,
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

async function readIntakeChangeRequests() {
  try {
    const raw = await fs.readFile(INTAKE_CHANGE_REQUESTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, INTAKE_CHANGE_REQUESTS_FILE);
    return Array.isArray(parsed) ? parsed.map(normalizeIntakeChangeRequest) : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function appendIntakeChangeRequest(entry) {
  const normalized = normalizeIntakeChangeRequest({
    ...entry,
    id: entry?.id || `ICR-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    status: "pending",
    requestedAt: entry?.requestedAt || new Date().toISOString(),
  });
  if (!normalized.studentId) return { ok: false, error: "Student id is required." };
  if (!normalized.requestedIntakeMonth || !normalized.requestedIntakeYear) {
    return { ok: false, error: "Requested intake month and year are required." };
  }
  if (!normalized.reason) return { ok: false, error: "Reason is required." };
  if (!normalized.requestedByUserId) return { ok: false, error: "Requester id is required." };

  return withFileLock(INTAKE_CHANGE_REQUESTS_FILE, async () => {
    const list = await readIntakeChangeRequests();
    const hasPending = list.some((row) => row.studentId === normalized.studentId && row.status === "pending");
    if (hasPending) {
      return { ok: false, error: "A pending intake change request already exists for this student." };
    }
    list.unshift(normalized);
    await atomicWriteFile(INTAKE_CHANGE_REQUESTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: normalized };
  });
}

async function decideIntakeChangeRequest(requestId, decision, reviewer = {}) {
  const id = String(requestId || "").trim();
  const normalizedDecision = String(decision || "").trim().toLowerCase();
  if (!id) return { ok: false, error: "Request id is required." };
  if (normalizedDecision !== "approved" && normalizedDecision !== "rejected") {
    return { ok: false, error: "Decision must be approved or rejected." };
  }

  return withFileLock(INTAKE_CHANGE_REQUESTS_FILE, async () => {
    const list = await readIntakeChangeRequests();
    const idx = list.findIndex((row) => row.id === id);
    if (idx === -1) return { ok: false, error: "Request not found." };
    const current = list[idx];
    if (current.status !== "pending") {
      return { ok: false, error: "This request has already been reviewed." };
    }
    const updated = normalizeIntakeChangeRequest({
      ...current,
      status: normalizedDecision,
      reviewedByUserId: String(reviewer.userId || "").trim(),
      reviewedByName: String(reviewer.name || "").trim(),
      reviewedByRole: String(reviewer.role || "").trim(),
      reviewedAt: new Date().toISOString(),
      reviewNote: String(reviewer.reviewNote || "").trim(),
    });
    list[idx] = updated;
    await atomicWriteFile(INTAKE_CHANGE_REQUESTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: updated };
  });
}

module.exports = {
  normalizeIntakeChangeRequest,
  readIntakeChangeRequests,
  appendIntakeChangeRequest,
  decideIntakeChangeRequest,
};
