import JSZip from "jszip";
import { toAbsoluteAssetUrl } from "../apiConfig";
import {
  buildPipelineDocTypeGroupMap,
  buildVisaDocTypeGroupMap,
  filterChecklistForStudent,
  resolvePipelineDocGroup,
  resolveVisaDocGroup,
} from "../docMappingConfig";
import { normalizeOfferStatus } from "./universityOfferLetters";

const NOT_REVIEWED_FOLDER = "not reviewed";
const PIPELINE_ROOT = "Pipeline docs";
const VISA_ROOT = "visa documents";
const PROFILE_OTHER_ROOT = "Profile other documents";
const OFFER_LETTERS_ROOT = "University offer letters";
const CV_ROOT = "CV";

function sanitizeZipSegment(value, fallback = "file") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return cleaned || fallback;
}

function isReviewedDocument(status) {
  return String(status || "").trim() === "Verified";
}

function isVisaTierDocument(doc) {
  const tier = String(doc?.tier || "").toLowerCase();
  if (tier === "visapilot") return true;
  return String(doc?.type || "").trim().startsWith("Visa Pilot - ");
}

function uniqueZipFileName(baseName, usedNames) {
  const safe = sanitizeZipSegment(baseName, "document");
  if (!usedNames.has(safe)) {
    usedNames.add(safe);
    return safe;
  }
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  let n = 2;
  while (usedNames.has(`${stem} (${n})${ext}`)) n += 1;
  const next = `${stem} (${n})${ext}`;
  usedNames.add(next);
  return next;
}

function zipPathForDocument(doc, groupName, usedNamesInFolder, rootFolder) {
  const group = sanitizeZipSegment(groupName, "Ungrouped");
  const fileName = uniqueZipFileName(doc.name || `${doc.type || "document"}.bin`, usedNamesInFolder);
  const base = `${rootFolder}/${group}`;
  if (isReviewedDocument(doc.status)) return `${base}/${fileName}`;
  return `${base}/${NOT_REVIEWED_FOLDER}/${fileName}`;
}

function zipPathForSimpleFile(fileName, groupName, usedNamesInFolder, rootFolder) {
  const group = sanitizeZipSegment(groupName, "Ungrouped");
  const safeName = uniqueZipFileName(fileName || "document", usedNamesInFolder);
  return `${rootFolder}/${group}/${safeName}`;
}

function migrateProfileOtherDocumentsToSlotEntries(value) {
  if (!Array.isArray(value)) return [];
  const bySlot = new Map();
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (!entry || typeof entry !== "object" || !String(entry.url || "").trim()) continue;
    const slotRaw = Number(entry.slot);
    const slot =
      Number.isFinite(slotRaw) && slotRaw >= 1 && Math.floor(slotRaw) === slotRaw ? Math.floor(slotRaw) : i + 1;
    bySlot.set(slot, { ...entry, slot });
  }
  return [...bySlot.keys()].sort((a, b) => a - b).map((k) => bySlot.get(k));
}

function normalizeAssetUrl(url) {
  return String(toAbsoluteAssetUrl(String(url || "").trim()) || "").trim();
}

function escapeCsvCell(value) {
  if (value == null) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildStudentCsv(student) {
  const rows = [["field", "value"]];
  for (const [key, val] of Object.entries(student || {})) {
    const cell =
      val == null
        ? ""
        : typeof val === "object"
          ? JSON.stringify(val)
          : String(val);
    rows.push([key, cell]);
  }
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

async function fetchDocumentBlob(url) {
  const resolvedUrl = toAbsoluteAssetUrl(String(url || "").trim());
  if (!resolvedUrl) throw new Error("Missing document URL");
  // Static student-doc files are served with Access-Control-Allow-Origin: * — do not send credentials.
  const res = await fetch(resolvedUrl);
  if (!res.ok) throw new Error(`Failed to download ${resolvedUrl} (${res.status})`);
  return res.blob();
}

async function addDocumentsToZip({
  zip,
  documents,
  rootFolder,
  resolveGroup,
  usedPaths,
  folderUsedNames,
}) {
  let exportedCount = 0;
  const failures = [];

  for (const doc of documents) {
    const groupName = resolveGroup(doc);
    const folderKey = `${rootFolder}::${groupName}::${isReviewedDocument(doc.status) ? "reviewed" : "not-reviewed"}`;
    if (!folderUsedNames.has(folderKey)) folderUsedNames.set(folderKey, new Set());
    let zipPath = zipPathForDocument(doc, groupName, folderUsedNames.get(folderKey), rootFolder);
    if (usedPaths.has(zipPath)) {
      const dot = zipPath.lastIndexOf("/");
      const dir = dot >= 0 ? zipPath.slice(0, dot + 1) : "";
      const file = dot >= 0 ? zipPath.slice(dot + 1) : zipPath;
      const alt = uniqueZipFileName(file, new Set([...usedPaths].map((p) => p.split("/").pop())));
      zipPath = `${dir}${alt}`;
    }
    usedPaths.add(zipPath);

    try {
      const blob = await fetchDocumentBlob(doc.url);
      zip.file(zipPath, blob);
      exportedCount += 1;
    } catch (err) {
      failures.push(doc.name || doc.type || "document");
      console.warn("exportStudentDocumentsZip: skip document", doc.url, err);
    }
  }

  return { exportedCount, failures };
}

async function addSimpleFilesToZip({
  zip,
  files,
  rootFolder,
  resolveGroup,
  usedPaths,
  folderUsedNames,
  exportedUrls,
}) {
  let exportedCount = 0;
  const failures = [];

  for (const file of files) {
    const url = String(file?.url || "").trim();
    if (!url) continue;
    const normalizedUrl = normalizeAssetUrl(url);
    if (normalizedUrl && exportedUrls.has(normalizedUrl)) continue;

    const groupName = resolveGroup(file);
    const folderKey = `${rootFolder}::${groupName}`;
    if (!folderUsedNames.has(folderKey)) folderUsedNames.set(folderKey, new Set());
    let zipPath = zipPathForSimpleFile(
      file.name || file.label || "document",
      groupName,
      folderUsedNames.get(folderKey),
      rootFolder
    );
    if (usedPaths.has(zipPath)) {
      const dot = zipPath.lastIndexOf("/");
      const dir = dot >= 0 ? zipPath.slice(0, dot + 1) : "";
      const leaf = dot >= 0 ? zipPath.slice(dot + 1) : zipPath;
      const alt = uniqueZipFileName(leaf, new Set([...usedPaths].map((p) => p.split("/").pop())));
      zipPath = `${dir}${alt}`;
    }
    usedPaths.add(zipPath);

    try {
      const blob = await fetchDocumentBlob(url);
      zip.file(zipPath, blob);
      if (normalizedUrl) exportedUrls.add(normalizedUrl);
      exportedCount += 1;
    } catch (err) {
      failures.push(file.name || file.label || "document");
      console.warn("exportStudentDocumentsZip: skip file", url, err);
    }
  }

  return { exportedCount, failures };
}

function triggerZipDownload(zipBlob, student) {
  const studentId = sanitizeZipSegment(student.id || "student", "student");
  const studentName = sanitizeZipSegment(student.name || "student", "student").replace(/\s+/g, "-");
  const fileLabel = `${studentName}_${studentId}_export.zip`;
  const url = URL.createObjectURL(zipBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileLabel;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Build and trigger download of a zip with pipeline/visa documents, CSV, and JSON.
 * @returns {{ ok: boolean, error?: string, exportedCount?: number, skippedCount?: number }}
 */
export async function exportStudentDocumentsZip(student, countryDocConfig) {
  if (!student || typeof student !== "object") {
    return { ok: false, error: "No student record to export." };
  }

  const allDocuments = (student.documents || []).filter((d) => d && String(d.url || "").trim());
  const pipelineDocuments = allDocuments.filter((d) => !isVisaTierDocument(d));
  const visaDocuments = allDocuments.filter((d) => isVisaTierDocument(d));

  const checklist = filterChecklistForStudent(
    countryDocConfig?.checklist,
    student.status,
    countryDocConfig?.stages
  );
  const pipelineGroupMap = buildPipelineDocTypeGroupMap(countryDocConfig?.pipelineDocs);
  const visaGroupMap = buildVisaDocTypeGroupMap(countryDocConfig?.visaDocs);
  const visaWorkflow = countryDocConfig?.visaWorkflow || [];

  const zip = new JSZip();
  const usedPaths = new Set();
  const folderUsedNames = new Map();

  const pipelineResult = await addDocumentsToZip({
    zip,
    documents: pipelineDocuments,
    rootFolder: PIPELINE_ROOT,
    resolveGroup: (doc) => resolvePipelineDocGroup(doc.type, pipelineGroupMap, checklist),
    usedPaths,
    folderUsedNames,
  });

  const visaResult = await addDocumentsToZip({
    zip,
    documents: visaDocuments,
    rootFolder: VISA_ROOT,
    resolveGroup: (doc) => resolveVisaDocGroup(doc.type, visaGroupMap, visaWorkflow),
    usedPaths,
    folderUsedNames,
  });

  const exportedUrls = new Set(
    allDocuments.map((doc) => normalizeAssetUrl(doc.url)).filter(Boolean)
  );

  const profileOtherFiles = migrateProfileOtherDocumentsToSlotEntries(student.profileOtherDocuments);
  const offerLetterFiles = (student.universityOfferLetters || []).filter(
    (entry) => entry && typeof entry === "object" && String(entry.url || "").trim()
  );
  const cvFile =
    student.cvFile && typeof student.cvFile === "object" && String(student.cvFile.url || "").trim()
      ? [student.cvFile]
      : [];

  const profileOtherResult = await addSimpleFilesToZip({
    zip,
    files: profileOtherFiles,
    rootFolder: PROFILE_OTHER_ROOT,
    resolveGroup: (entry) => String(entry.label || "").trim() || `Slot ${entry.slot || "?"}`,
    usedPaths,
    folderUsedNames,
    exportedUrls,
  });

  const offerLettersResult = await addSimpleFilesToZip({
    zip,
    files: offerLetterFiles,
    rootFolder: OFFER_LETTERS_ROOT,
    resolveGroup: (entry) => normalizeOfferStatus(entry.offerStatus),
    usedPaths,
    folderUsedNames,
    exportedUrls,
  });

  const cvResult = await addSimpleFilesToZip({
    zip,
    files: cvFile,
    rootFolder: CV_ROOT,
    resolveGroup: () => "Uploaded CV",
    usedPaths,
    folderUsedNames,
    exportedUrls,
  });

  const exportedCount =
    pipelineResult.exportedCount +
    visaResult.exportedCount +
    profileOtherResult.exportedCount +
    offerLettersResult.exportedCount +
    cvResult.exportedCount;
  const failures = [
    ...pipelineResult.failures,
    ...visaResult.failures,
    ...profileOtherResult.failures,
    ...offerLettersResult.failures,
    ...cvResult.failures,
  ];
  const totalFileCandidates =
    allDocuments.length + profileOtherFiles.length + offerLetterFiles.length + cvFile.length;

  zip.file("student-data.csv", buildStudentCsv(student));
  zip.file("student-data.json", JSON.stringify(student, null, 2));

  const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  triggerZipDownload(zipBlob, student);

  if (exportedCount === 0 && totalFileCandidates > 0) {
    const detail = failures.length > 0 ? " Could not download any files." : "";
    return {
      ok: true,
      exportedCount: 0,
      skippedCount: failures.length,
      includedDataFiles: true,
      partial: true,
      warning: `No documents could be downloaded.${detail} CSV and JSON were still included.`,
    };
  }

  return {
    ok: true,
    exportedCount,
    skippedCount: failures.length,
    includedDataFiles: true,
  };
}
