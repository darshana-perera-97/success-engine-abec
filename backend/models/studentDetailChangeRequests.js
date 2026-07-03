const crypto = require("crypto");
const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { STUDENT_DETAIL_CHANGE_REQUESTS_FILE } = require("../config");

const DETAIL_FIELDS = ["name", "email", "phone", "whatsappNumber", "currentEducationLevel"];

function normalizeStudentDetailChangeRequest(entry) {
  const src = entry && typeof entry === "object" ? entry : {};
  return {
    id: String(src.id || "").trim(),
    studentId: String(src.studentId || "").trim(),
    studentName: String(src.studentName || "").trim(),
    currentName: String(src.currentName || "").trim(),
    requestedName: String(src.requestedName || "").trim(),
    currentEmail: String(src.currentEmail || "").trim(),
    requestedEmail: String(src.requestedEmail || "").trim(),
    currentPhone: String(src.currentPhone || "").trim(),
    requestedPhone: String(src.requestedPhone || "").trim(),
    currentWhatsappNumber: String(src.currentWhatsappNumber || "").trim(),
    requestedWhatsappNumber: String(src.requestedWhatsappNumber || "").trim(),
    currentEducationLevel: String(src.currentEducationLevel || "").trim(),
    requestedEducationLevel: String(src.requestedEducationLevel || "").trim(),
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

function collectChangedDetailFields(normalized) {
  const pairs = [
    ["name", normalized.currentName, normalized.requestedName],
    ["email", normalized.currentEmail, normalized.requestedEmail],
    ["phone", normalized.currentPhone, normalized.requestedPhone],
    ["whatsappNumber", normalized.currentWhatsappNumber, normalized.requestedWhatsappNumber],
    ["currentEducationLevel", normalized.currentEducationLevel, normalized.requestedEducationLevel],
  ];
  return pairs.filter(([, current, requested]) => current !== requested).map(([field]) => field);
}

async function readStudentDetailChangeRequests() {
  try {
    const raw = await fs.readFile(STUDENT_DETAIL_CHANGE_REQUESTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, STUDENT_DETAIL_CHANGE_REQUESTS_FILE);
    return Array.isArray(parsed) ? parsed.map(normalizeStudentDetailChangeRequest) : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeStudentDetailChangeRequests(list) {
  const normalized = Array.isArray(list) ? list.map(normalizeStudentDetailChangeRequest) : [];
  return withFileLock(STUDENT_DETAIL_CHANGE_REQUESTS_FILE, () =>
    atomicWriteFile(STUDENT_DETAIL_CHANGE_REQUESTS_FILE, JSON.stringify(normalized, null, 2))
  );
}

async function appendStudentDetailChangeRequest(entry) {
  const normalized = normalizeStudentDetailChangeRequest({
    ...entry,
    id: entry?.id || `SDR-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    status: "pending",
    requestedAt: entry?.requestedAt || new Date().toISOString(),
  });
  if (!normalized.studentId) return { ok: false, error: "Student id is required." };
  if (!normalized.reason) return { ok: false, error: "Reason is required." };
  if (!normalized.requestedByUserId) return { ok: false, error: "Requester id is required." };

  const changedFields = collectChangedDetailFields(normalized);
  if (changedFields.length === 0) {
    return { ok: false, error: "At least one student detail must change." };
  }

  return withFileLock(STUDENT_DETAIL_CHANGE_REQUESTS_FILE, async () => {
    const list = await readStudentDetailChangeRequests();
    const hasPending = list.some(
      (row) => row.studentId === normalized.studentId && row.status === "pending"
    );
    if (hasPending) {
      return { ok: false, error: "A pending student detail change request already exists for this student." };
    }
    list.unshift(normalized);
    await atomicWriteFile(STUDENT_DETAIL_CHANGE_REQUESTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: normalized };
  });
}

async function decideStudentDetailChangeRequest(requestId, decision, reviewer = {}) {
  const id = String(requestId || "").trim();
  const normalizedDecision = String(decision || "").trim().toLowerCase();
  if (!id) return { ok: false, error: "Request id is required." };
  if (normalizedDecision !== "approved" && normalizedDecision !== "rejected") {
    return { ok: false, error: "Decision must be approved or rejected." };
  }

  return withFileLock(STUDENT_DETAIL_CHANGE_REQUESTS_FILE, async () => {
    const list = await readStudentDetailChangeRequests();
    const idx = list.findIndex((row) => row.id === id);
    if (idx === -1) return { ok: false, error: "Request not found." };
    const current = list[idx];
    if (current.status !== "pending") {
      return { ok: false, error: "This request has already been reviewed." };
    }
    const updated = normalizeStudentDetailChangeRequest({
      ...current,
      status: normalizedDecision,
      reviewedByUserId: String(reviewer.userId || "").trim(),
      reviewedByName: String(reviewer.name || "").trim(),
      reviewedByRole: String(reviewer.role || "").trim(),
      reviewedAt: new Date().toISOString(),
      reviewNote: String(reviewer.reviewNote || "").trim(),
    });
    list[idx] = updated;
    await atomicWriteFile(STUDENT_DETAIL_CHANGE_REQUESTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: updated };
  });
}

module.exports = {
  DETAIL_FIELDS,
  normalizeStudentDetailChangeRequest,
  collectChangedDetailFields,
  readStudentDetailChangeRequests,
  writeStudentDetailChangeRequests,
  appendStudentDetailChangeRequest,
  decideStudentDetailChangeRequest,
};
