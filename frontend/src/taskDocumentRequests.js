/**
 * Helpers for counselor-assigned tasks that request specific student uploads.
 */

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
