const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const {
  ASSETS_DIR,
  CHAT_FILES_DIR,
  STUDENT_CV_DIR,
  STUDENT_PERMISSIONS_DIR,
  PAYMENTS_DIR,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
} = require("../config");

function detectImageExtension(dataUrl) {
  const mimeMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl);
  if (!mimeMatch) return null;
  const mime = mimeMatch[1].toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return null;
}

async function storeImageDataUrl(dataUrl, prefix) {
  const ext = detectImageExtension(dataUrl);
  if (!ext) return null;
  const base64 = dataUrl.split(",")[1] || "";
  if (!base64) return null;
  const buffer = Buffer.from(base64, "base64");
  const fileName = `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  await fs.writeFile(path.join(ASSETS_DIR, fileName), buffer);
  return `/assets/${fileName}`;
}

function getDataUrlMime(dataUrl) {
  const mimeMatch = /^data:([^;]+);base64,/.exec(String(dataUrl || ""));
  return mimeMatch ? String(mimeMatch[1] || "").toLowerCase() : "";
}

const MIME_TO_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

const EXT_TO_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const CHAT_ATTACHMENT_EXTS = new Set(Object.keys(EXT_TO_MIME));

function extensionFromMime(mime) {
  if (!mime) return "";
  return MIME_TO_EXT[String(mime).toLowerCase()] || "";
}

function mimeFromExtension(ext) {
  if (!ext) return "";
  return EXT_TO_MIME[String(ext).toLowerCase().replace(/^\./, "")] || "";
}

function extensionFromFileName(fileName) {
  const ext = String(path.parse(String(fileName || "")).ext || "")
    .toLowerCase()
    .replace(/^\./, "");
  return CHAT_ATTACHMENT_EXTS.has(ext) ? ext : "";
}

function resolveChatAttachmentMeta(dataUrl, originalName) {
  const nameExt = extensionFromFileName(originalName);
  if (nameExt) {
    return { mime: mimeFromExtension(nameExt), ext: nameExt };
  }

  const dataMime = getDataUrlMime(dataUrl);
  const ext = extensionFromMime(dataMime);
  const mime = dataMime;
  if (!ext || !mime || mime === "application/octet-stream") return null;
  return { mime, ext };
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

async function storeChatAttachmentDataUrl(dataUrl, originalName) {
  const meta = resolveChatAttachmentMeta(dataUrl, originalName);
  if (!meta) return null;
  const { mime, ext } = meta;
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (!base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  if (buffer.length > MAX_UPLOAD_BYTES) return { error: `File is too large. Max ${MAX_UPLOAD_LABEL} allowed.` };

  const originalBase = sanitizeFileName(path.parse(String(originalName || "attachment")).name) || "attachment";
  const fileName = `chat-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${originalBase}.${ext}`;
  await fs.mkdir(CHAT_FILES_DIR, { recursive: true });
  await fs.writeFile(path.join(CHAT_FILES_DIR, fileName), buffer);
  return {
    url: `/chat-files/${fileName}`,
    mime,
    size: buffer.length,
    name: `${originalBase}.${ext}`,
  };
}

function isSupportedWhatsappMediaMime(mime) {
  const allowed = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
  ]);
  return allowed.has(String(mime || "").toLowerCase());
}

async function storeStudentCvDataUrl(dataUrl, originalName) {
  const mime = getDataUrlMime(dataUrl);
  const allowed = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  if (!allowed.has(mime)) return null;
  const ext = extensionFromMime(mime);
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (!ext || !base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { error: `CV file is too large. Max ${MAX_UPLOAD_LABEL} allowed.` };
  }
  const originalBase = sanitizeFileName(path.parse(String(originalName || "cv")).name) || "cv";
  const fileName = `cv-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${originalBase}.${ext}`;
  await fs.mkdir(STUDENT_CV_DIR, { recursive: true });
  await fs.writeFile(path.join(STUDENT_CV_DIR, fileName), buffer);
  return {
    url: `/student-docs/cv/${fileName}`,
    mime,
    size: buffer.length,
    name: `${originalBase}.${ext}`,
  };
}

async function storeStudentPermissionDataUrl(dataUrl, originalName) {
  const mime = getDataUrlMime(dataUrl);
  const allowed = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  if (!allowed.has(mime)) return null;
  const ext = extensionFromMime(mime);
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (!ext || !base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { error: `Document file is too large. Max ${MAX_UPLOAD_LABEL} allowed.` };
  }
  const originalBase = sanitizeFileName(path.parse(String(originalName || "document")).name) || "document";
  const fileName = `perm-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${originalBase}.${ext}`;
  await fs.mkdir(STUDENT_PERMISSIONS_DIR, { recursive: true });
  await fs.writeFile(path.join(STUDENT_PERMISSIONS_DIR, fileName), buffer);
  return {
    url: `/student-docs/permissions/${fileName}`,
    mime,
    size: buffer.length,
    name: `${originalBase}.${ext}`,
  };
}

async function storePaymentProofDataUrl(dataUrl, originalName) {
  const mime = getDataUrlMime(dataUrl);
  const allowed = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  if (!allowed.has(mime)) return null;
  const ext = extensionFromMime(mime);
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (!ext || !base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { error: `Payment proof file is too large. Max ${MAX_UPLOAD_LABEL} allowed.` };
  }
  const originalBase = sanitizeFileName(path.parse(String(originalName || "payment-proof")).name) || "payment-proof";
  const fileName = `pay-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${originalBase}.${ext}`;
  await fs.mkdir(PAYMENTS_DIR, { recursive: true });
  await fs.writeFile(path.join(PAYMENTS_DIR, fileName), buffer);
  return {
    url: `/payments/${fileName}`,
    mime,
    size: buffer.length,
    name: `${originalBase}.${ext}`,
  };
}

async function safeUnlinkStoredPermissionDoc(storedUrl) {
  let s = String(storedUrl || "").trim();
  const permIdx = s.indexOf("/student-docs/permissions/");
  if (permIdx !== -1) s = s.slice(permIdx);
  if (!s.startsWith("/student-docs/permissions/")) return;
  const base = path.basename(s);
  if (!base || base.includes("..")) return;
  try {
    await fs.unlink(path.join(STUDENT_PERMISSIONS_DIR, base));
  } catch {
    // ignore
  }
}

module.exports = {
  detectImageExtension,
  storeImageDataUrl,
  getDataUrlMime,
  extensionFromMime,
  mimeFromExtension,
  extensionFromFileName,
  sanitizeFileName,
  storeChatAttachmentDataUrl,
  isSupportedWhatsappMediaMime,
  storeStudentCvDataUrl,
  storeStudentPermissionDataUrl,
  storePaymentProofDataUrl,
  safeUnlinkStoredPermissionDoc,
};
