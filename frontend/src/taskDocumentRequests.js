/**
 * Helpers for counselor-assigned tasks that request specific student uploads.
 */

import { isCounselorEquivalentPortalRole } from "./roles";

/** Students and staff who manage the student profile may upload into task-request slots. */
export function canUploadTaskRequestedDocuments(userRole) {
  const role = String(userRole || "").trim();
  if (role === "Student") return true;
  if (role === "Accountant") return false;
  if (
    role === "Admin" ||
    role === "Manager" ||
    role === "Team Lead" ||
    role === "Country Coordinator"
  ) {
    return true;
  }
  return isCounselorEquivalentPortalRole(role);
}

/** True when a slot accepts a new file (not yet verified). */
export function canUploadTaskDocumentSlot(doc) {
  if (!doc) return true;
  return String(doc.status || "").trim() !== "Verified";
}

export function taskDocumentSlotUploadLabel(doc) {
  if (!doc) return "Upload";
  const status = String(doc.status || "").trim();
  if (status === "Rejected") return "Re-upload";
  if (status === "Pending" || status === "Reviewing") return "Replace";
  return "Upload";
}

export function findTaskDocumentForSlot(documents, taskId, slotId) {
  const tid = String(taskId || "").trim();
  const sid = String(slotId || "").trim();
  if (!tid || !sid) return null;
  const list = Array.isArray(documents) ? documents : [];
  const matches = list.filter((d) => {
    const link = d?.taskDocumentLink;
    if (!link || typeof link !== "object") return false;
    return String(link.taskId || "") === tid && String(link.slotId || "") === sid;
  });
  if (matches.length === 0) return null;
  return matches.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime())[0];
}

export function areAllTaskDocumentSlotsVerified(task, documents) {
  if (!task || !task.requiresStudentDocuments || !Array.isArray(task.taskDocumentRequests)) return false;
  const slots = task.taskDocumentRequests.filter((s) => s && String(s.id || "").trim());
  if (slots.length === 0) return false;
  return slots.every((slot) => {
    const doc = findTaskDocumentForSlot(documents, task.id, slot.id);
    return doc && String(doc.status || "") === "Verified";
  });
}
