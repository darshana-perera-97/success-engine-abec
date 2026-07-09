const crypto = require("crypto");
const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { BRANCH_WHATSAPP_MESSENGER_CHANGE_REQUESTS_FILE } = require("../config");

function normalizeBranchWhatsappMessengerChangeRequest(entry) {
  const src = entry && typeof entry === "object" ? entry : {};
  return {
    id: String(src.id || "").trim(),
    studentId: String(src.studentId || "").trim(),
    studentName: String(src.studentName || "").trim(),
    currentMessengerUserId: String(src.currentMessengerUserId || "").trim(),
    currentMessengerName: String(src.currentMessengerName || "").trim(),
    currentWhatsappName: String(src.currentWhatsappName || "").trim(),
    currentWhatsappNumber: String(src.currentWhatsappNumber || "").trim(),
    requestedMessengerUserId: String(src.requestedMessengerUserId || "").trim(),
    requestedMessengerName: String(src.requestedMessengerName || "").trim(),
    requestedWhatsappName: String(src.requestedWhatsappName || "").trim(),
    requestedWhatsappNumber: String(src.requestedWhatsappNumber || "").trim(),
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

async function readBranchWhatsappMessengerChangeRequests() {
  try {
    const raw = await fs.readFile(BRANCH_WHATSAPP_MESSENGER_CHANGE_REQUESTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, BRANCH_WHATSAPP_MESSENGER_CHANGE_REQUESTS_FILE);
    return Array.isArray(parsed) ? parsed.map(normalizeBranchWhatsappMessengerChangeRequest) : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeBranchWhatsappMessengerChangeRequests(list) {
  const normalized = Array.isArray(list) ? list.map(normalizeBranchWhatsappMessengerChangeRequest) : [];
  return withFileLock(BRANCH_WHATSAPP_MESSENGER_CHANGE_REQUESTS_FILE, () =>
    atomicWriteFile(BRANCH_WHATSAPP_MESSENGER_CHANGE_REQUESTS_FILE, JSON.stringify(normalized, null, 2))
  );
}

async function appendBranchWhatsappMessengerChangeRequest(entry) {
  const normalized = normalizeBranchWhatsappMessengerChangeRequest({
    ...entry,
    id: entry?.id || `BWCR-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    status: "pending",
    requestedAt: entry?.requestedAt || new Date().toISOString(),
  });
  if (!normalized.studentId) return { ok: false, error: "Student id is required." };
  if (!normalized.requestedMessengerUserId) return { ok: false, error: "Requested WhatsApp account is required." };
  if (!normalized.reason) return { ok: false, error: "Reason is required." };
  if (!normalized.requestedByUserId) return { ok: false, error: "Requester id is required." };

  return withFileLock(BRANCH_WHATSAPP_MESSENGER_CHANGE_REQUESTS_FILE, async () => {
    const list = await readBranchWhatsappMessengerChangeRequests();
    const hasPending = list.some(
      (row) => row.studentId === normalized.studentId && row.status === "pending"
    );
    if (hasPending) {
      return {
        ok: false,
        error: "A pending WhatsApp contact change request already exists for this student.",
      };
    }
    list.unshift(normalized);
    await atomicWriteFile(
      BRANCH_WHATSAPP_MESSENGER_CHANGE_REQUESTS_FILE,
      JSON.stringify(list, null, 2)
    );
    return { ok: true, data: normalized };
  });
}

async function decideBranchWhatsappMessengerChangeRequest(requestId, decision, reviewer = {}) {
  const id = String(requestId || "").trim();
  const normalizedDecision = String(decision || "").trim().toLowerCase();
  if (!id) return { ok: false, error: "Request id is required." };
  if (normalizedDecision !== "approved" && normalizedDecision !== "rejected") {
    return { ok: false, error: "Decision must be approved or rejected." };
  }

  return withFileLock(BRANCH_WHATSAPP_MESSENGER_CHANGE_REQUESTS_FILE, async () => {
    const list = await readBranchWhatsappMessengerChangeRequests();
    const idx = list.findIndex((row) => row.id === id);
    if (idx === -1) return { ok: false, error: "Request not found." };
    const current = list[idx];
    if (current.status !== "pending") {
      return { ok: false, error: "This request has already been reviewed." };
    }
    const updated = normalizeBranchWhatsappMessengerChangeRequest({
      ...current,
      status: normalizedDecision,
      reviewedByUserId: String(reviewer.userId || "").trim(),
      reviewedByName: String(reviewer.name || "").trim(),
      reviewedByRole: String(reviewer.role || "").trim(),
      reviewedAt: new Date().toISOString(),
      reviewNote: String(reviewer.reviewNote || "").trim(),
    });
    list[idx] = updated;
    await atomicWriteFile(
      BRANCH_WHATSAPP_MESSENGER_CHANGE_REQUESTS_FILE,
      JSON.stringify(list, null, 2)
    );
    return { ok: true, data: updated };
  });
}

module.exports = {
  normalizeBranchWhatsappMessengerChangeRequest,
  readBranchWhatsappMessengerChangeRequests,
  writeBranchWhatsappMessengerChangeRequests,
  appendBranchWhatsappMessengerChangeRequest,
  decideBranchWhatsappMessengerChangeRequest,
};
