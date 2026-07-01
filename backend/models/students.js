const fs = require("fs/promises");
const path = require("path");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { readJsonCached } = require("../lib/jsonCache");
const {
  STUDEMTS_FILE,
  CHAT_FILES_DIR,
  STUDENT_PERMISSIONS_DIR,
  UNIVERSITY_OFFER_STATUSES,
  PROFILE_OTHER_DOCUMENTS_MAX_SLOT,
} = require("../config");

async function readStudemts() {
  try {
    return await readJsonCached(STUDEMTS_FILE, (parsed) => (Array.isArray(parsed) ? parsed : []));
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeStudemts(studemts) {
  return withFileLock(STUDEMTS_FILE, () =>
    atomicWriteFile(STUDEMTS_FILE, JSON.stringify(studemts, null, 2))
  );
}

function stripStudentSecrets(student) {
  if (!student || typeof student !== "object") return student;
  const { password, ...rest } = student;
  return rest;
}

function requestPublicOrigin(req) {
  const host = String(req.headers.host || "").trim();
  if (!host) return "";
  const forwarded = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const proto =
    forwarded === "https" || forwarded === "http"
      ? forwarded
      : req.socket?.encrypted
        ? "https"
        : "http";
  return `${proto}://${host}`;
}

function publicAssetUrl(req, avatar) {
  if (!avatar) return avatar;
  if (avatar.startsWith("/assets/")) {
    return `${requestPublicOrigin(req)}${avatar}`;
  }
  return avatar;
}

function publicChatFileUrl(req, filePath) {
  if (!filePath) return filePath;
  if (filePath.startsWith("/chat-files/")) {
    return `${requestPublicOrigin(req)}${filePath}`;
  }
  return filePath;
}

function resolveChatFileDiskPath(filePath) {
  if (!filePath || !String(filePath).startsWith("/chat-files/")) return "";
  const fileName = path.basename(String(filePath || ""));
  if (!fileName) return "";
  return path.join(CHAT_FILES_DIR, fileName);
}

function resolveStudentDocDiskPath(filePath) {
  let s = String(filePath || "").trim();
  const permIdx = s.indexOf("/student-docs/permissions/");
  if (permIdx !== -1) s = s.slice(permIdx);
  if (!s.startsWith("/student-docs/permissions/")) return "";
  const fileName = path.basename(s);
  if (!fileName || fileName.includes("..")) return "";
  return path.join(STUDENT_PERMISSIONS_DIR, fileName);
}

function publicStudentDocUrl(req, filePath) {
  if (!filePath) return filePath;
  if (filePath.startsWith("/student-docs/")) {
    return `${requestPublicOrigin(req)}${filePath}`;
  }
  return filePath;
}

/** Normalize legacy 3-index arrays or slot-tagged entries into a sorted dense list with 1-based .slot. */
function migrateProfileOtherDocumentsToSlotEntries(value) {
  if (!Array.isArray(value)) return [];
  const bySlot = new Map();
  for (let i = 0; i < value.length; i++) {
    const e = value[i];
    if (!e || typeof e !== "object" || !String(e.url || "").trim()) continue;
    const slotRaw = Number(e.slot);
    const slot =
      Number.isFinite(slotRaw) && slotRaw >= 1 && Math.floor(slotRaw) === slotRaw ? Math.floor(slotRaw) : i + 1;
    bySlot.set(slot, { ...e, slot });
  }
  return [...bySlot.keys()].sort((a, b) => a - b).map((k) => bySlot.get(k));
}

function normalizeUniversityOfferLetters(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry === "object" && String(entry.url || "").trim());
}

function normalizeUniversityOfferStatusInput(status) {
  const s = String(status || "").trim();
  if (s === "Approved") return "Unconditional";
  return s;
}

function publicInvoiceRecord(req, invoice) {
  if (!invoice || typeof invoice !== "object") return invoice;
  const next = { ...invoice };
  const host = String(req.headers.host || "").trim();
  const absolutize = (urlValue) => {
    const u = String(urlValue || "").trim();
    if (!u || !host) return u;
    const origin = requestPublicOrigin(req);
    if (u.startsWith("/payments/") || u.startsWith("/chat-files/") || u.startsWith("/assets/")) {
      return `${origin}${u}`;
    }
    if (/^https?:\/\/localhost(:\d+)?/i.test(u)) {
      const pathPart = u.replace(/^https?:\/\/[^/]+/i, "");
      return pathPart ? `${origin}${pathPart}` : u;
    }
    return u;
  };
  if (next.paymentProofUrl) next.paymentProofUrl = absolutize(next.paymentProofUrl);
  if (Array.isArray(next.paymentProofHistory)) {
    next.paymentProofHistory = next.paymentProofHistory.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const url = entry.url ? absolutize(entry.url) : entry.url;
      return { ...entry, url };
    });
  }
  if (next.attachmentFileUrl) next.attachmentFileUrl = absolutize(next.attachmentFileUrl);
  if (next.attachmentLink) next.attachmentLink = String(next.attachmentLink || "").trim();
  if (next.generatedReceiptUrl) {
    const receipt = String(next.generatedReceiptUrl || "");
    if (receipt.startsWith("/chat-files/")) {
      next.generatedReceiptUrl = publicChatFileUrl(req, receipt);
    } else {
      next.generatedReceiptUrl = absolutize(receipt);
    }
  }
  return next;
}

function publicStudentRecord(req, student) {
  if (!student || typeof student !== "object") return student;
  const next = { ...student };
  next.avatar = publicAssetUrl(req, next.avatar);
  if (next.cvFile && typeof next.cvFile === "object") {
    next.cvFile = {
      ...next.cvFile,
      url: publicStudentDocUrl(req, String(next.cvFile.url || "")),
    };
  }
  if (Array.isArray(next.documents)) {
    next.documents = next.documents.map((doc) => {
      if (!doc || typeof doc !== "object") return doc;
      return {
        ...doc,
        url: publicStudentDocUrl(req, String(doc.url || "")),
      };
    });
  }
  if (Array.isArray(next.profileOtherDocuments)) {
    const migrated = migrateProfileOtherDocumentsToSlotEntries(next.profileOtherDocuments);
    next.profileOtherDocuments = migrated.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      return {
        ...entry,
        url: publicStudentDocUrl(req, String(entry.url || "")),
      };
    });
  }
  if (Array.isArray(next.universityOfferLetters)) {
    next.universityOfferLetters = next.universityOfferLetters.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      return {
        ...entry,
        url: publicStudentDocUrl(req, String(entry.url || "")),
      };
    });
  }
  return next;
}

/** Lightweight record for list views — omits heavy nested arrays. */
function studentSummaryRecord(req, student) {
  if (!student || typeof student !== "object") return student;
  const { password, documents, profileOtherDocuments, universityOfferLetters, cvFile, notes, ...rest } = student;
  const summary = { ...rest };
  summary.avatar = publicAssetUrl(req, summary.avatar);
  if (Array.isArray(documents)) {
    summary.documentCount = documents.length;
    summary.verifiedDocCount = documents.filter((d) => String(d?.status || "") === "Verified").length;
  }
  return summary;
}

module.exports = {
  readStudemts,
  writeStudemts,
  stripStudentSecrets,
  publicStudentRecord,
  studentSummaryRecord,
  publicAssetUrl,
  publicStudentDocUrl,
  publicChatFileUrl,
  resolveChatFileDiskPath,
  resolveStudentDocDiskPath,
  publicInvoiceRecord,
  migrateProfileOtherDocumentsToSlotEntries,
  normalizeUniversityOfferLetters,
  normalizeUniversityOfferStatusInput,
};
