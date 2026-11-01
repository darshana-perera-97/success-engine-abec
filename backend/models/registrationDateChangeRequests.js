const crypto = require("crypto");
const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { REGISTRATION_DATE_CHANGE_REQUESTS_FILE } = require("../config");
const { normalizeRegisteringDate } = require("../lib/registeringDate");

function normalizeRegistrationDateChangeRequest(entry) {
  const src = entry && typeof entry === "object" ? entry : {};
  return {
    id: String(src.id || "").trim(),
    studentId: String(src.studentId || "").trim(),
    studentName: String(src.studentName || "").trim(),
    currentDate: normalizeRegisteringDate(src.currentDate),
    requestedDate: normalizeRegisteringDate(src.requestedDate),
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

async function readRegistrationDateChangeRequests() {
  try {
    const raw = await fs.readFile(REGISTRATION_DATE_CHANGE_REQUESTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, REGISTRATION_DATE_CHANGE_REQUESTS_FILE);
    return Array.isArray(parsed) ? parsed.map(normalizeRegistrationDateChangeRequest) : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function appendRegistrationDateChangeRequest(entry) {
  const normalized = normalizeRegistrationDateChangeRequest({
    ...entry,
    id: entry?.id || `RDR-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    status: "pending",
    requestedAt: entry?.requestedAt || new Date().toISOString(),
  });
  if (!normalized.studentId) return { ok: false, error: "Student id is required." };
  if (!normalized.requestedDate) return { ok: false, error: "Enter a valid registering date." };
  if (!normalized.reason) return { ok: false, error: "Reason is required." };
  if (!normalized.requestedByUserId) return { ok: false, error: "Requester id is required." };
  if (normalized.currentDate && normalized.currentDate === normalized.requestedDate) {
    return { ok: false, error: "Requested registering date matches the student's current date." };
  }

  return withFileLock(REGISTRATION_DATE_CHANGE_REQUESTS_FILE, async () => {
    const list = await readRegistrationDateChangeRequests();
    const hasPending = list.some((row) => row.studentId === normalized.studentId && row.status === "pending");
    if (hasPending) {
      return { ok: false, error: "A pending registering date change request already exists for this student." };
    }
    list.unshift(normalized);
    await atomicWriteFile(REGISTRATION_DATE_CHANGE_REQUESTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: normalized };
  });
}

async function decideRegistrationDateChangeRequest(requestId, decision, reviewer = {}) {
  const id = String(requestId || "").trim();
  const normalizedDecision = String(decision || "").trim().toLowerCase();
  if (!id) return { ok: false, error: "Request id is required." };
  if (normalizedDecision !== "approved" && normalizedDecision !== "rejected") {
    return { ok: false, error: "Decision must be approved or rejected." };
  }

  return withFileLock(REGISTRATION_DATE_CHANGE_REQUESTS_FILE, async () => {
    const list = await readRegistrationDateChangeRequests();
    const idx = list.findIndex((row) => row.id === id);
    if (idx === -1) return { ok: false, error: "Request not found." };
    const current = list[idx];
    if (current.status !== "pending") {
      return { ok: false, error: "This request has already been reviewed." };
    }
    const updated = normalizeRegistrationDateChangeRequest({
      ...current,
      status: normalizedDecision,
      reviewedByUserId: String(reviewer.userId || "").trim(),
      reviewedByName: String(reviewer.name || "").trim(),
      reviewedByRole: String(reviewer.role || "").trim(),
      reviewedAt: new Date().toISOString(),
      reviewNote: String(reviewer.reviewNote || "").trim(),
    });
    list[idx] = updated;
    await atomicWriteFile(REGISTRATION_DATE_CHANGE_REQUESTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: updated };
  });
}

module.exports = {
  normalizeRegistrationDateChangeRequest,
  readRegistrationDateChangeRequests,
  appendRegistrationDateChangeRequest,
  decideRegistrationDateChangeRequest,
};
