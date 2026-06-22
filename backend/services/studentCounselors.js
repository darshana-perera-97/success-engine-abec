function isAssignedCounselorId(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized !== "" && normalized !== "unassigned" && normalized !== "none" && normalized !== "null";
}

/** Unique counselor IDs linked on the student (enrolling, primary, previous). */
function getAssignedCounselorIds(student) {
  const byNorm = new Map();
  const add = (value) => {
    const id = String(value || "").trim();
    if (!isAssignedCounselorId(id)) return;
    const norm = id.toLowerCase();
    if (!byNorm.has(norm)) byNorm.set(norm, id);
  };
  add(student?.inquiryCounselorId);
  add(student?.counselor);
  const history = Array.isArray(student?.counselorHistory) ? student.counselorHistory : [];
  for (const entry of history) add(entry);
  return [...byNorm.values()];
}

function counselorFieldsTouched(body) {
  return ["counselor", "counselorName", "inquiryCounselorId", "counselorHistory"].some((key) =>
    Object.prototype.hasOwnProperty.call(body || {}, key)
  );
}

function validateStudentCounselorAssignment(student, body) {
  if (!counselorFieldsTouched(body)) return null;
  if (getAssignedCounselorIds(student).length > 0) return null;
  return "Each student must have at least one counselor. Assign another counselor before removing the last one.";
}

function pickNextPrimaryCounselorId(student) {
  const inquiry = String(student?.inquiryCounselorId || "").trim();
  if (isAssignedCounselorId(inquiry)) return inquiry;

  const history = Array.isArray(student?.counselorHistory) ? student.counselorHistory : [];
  for (const entry of history) {
    const historyId = String(entry || "").trim();
    if (isAssignedCounselorId(historyId)) return historyId;
  }
  return "";
}

/** When primary is unassigned but other counselors remain, promote one to primary. */
function promoteRemainingCounselorToPrimary(student) {
  const primary = String(student?.counselor || "").trim();
  if (isAssignedCounselorId(primary)) return student;

  const nextPrimary = pickNextPrimaryCounselorId(student);
  if (!nextPrimary) return student;

  const updated = { ...student, counselor: nextPrimary };
  const inquiry = String(student?.inquiryCounselorId || "").trim();
  if (nextPrimary !== inquiry) {
    const history = Array.isArray(student?.counselorHistory) ? student.counselorHistory : [];
    const nextHistory = history
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .filter((entry) => entry !== nextPrimary);
    if (nextHistory.length !== history.length) {
      updated.counselorHistory = nextHistory;
    }
  }
  return updated;
}

function isCounselorStillLinkedOnStudent(student, counselorId) {
  const targetNorm = String(counselorId || "").trim().toLowerCase();
  if (!targetNorm) return false;
  return getAssignedCounselorIds(student).some((id) => id.toLowerCase() === targetNorm);
}

module.exports = {
  getAssignedCounselorIds,
  validateStudentCounselorAssignment,
  promoteRemainingCounselorToPrimary,
  isCounselorStillLinkedOnStudent,
};
