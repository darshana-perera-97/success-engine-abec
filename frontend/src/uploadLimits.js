/** Max decoded file size for document, CV, payment, and chat uploads. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "15MB";

/** Max files a user can attach to one chat message. */
export const MAX_CHAT_ATTACHMENTS = 3;

/** Max pipeline / visa documents per single upload action. */
export const MAX_DOCUMENTS_PER_UPLOAD = 3;

export const ALLOWED_DOCUMENT_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/**
 * @param {FileList | File[] | null | undefined} fileList
 * @param {{ maxCount?: number }} [options]
 * @returns {{ ok: true, files: File[] } | { ok: false, error: string }}
 */
export function validateDocumentUploadFileList(fileList, { maxCount = MAX_DOCUMENTS_PER_UPLOAD } = {}) {
  if (!fileList || fileList.length === 0) {
    return { ok: false, error: "Choose at least one file." };
  }
  const files = Array.from(fileList);
  if (files.length > maxCount) {
    return { ok: false, error: `You can upload up to ${maxCount} files at a time.` };
  }
  for (const file of files) {
    if (!ALLOWED_DOCUMENT_UPLOAD_MIME_TYPES.has(file.type)) {
      return { ok: false, error: "Unsupported format. Use PDF, JPG, PNG, DOC, or DOCX." };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: `Each file must be under ${MAX_UPLOAD_LABEL}.` };
    }
  }
  return { ok: true, files };
}
