const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { REQ_STUDENTS_FILE } = require("../config");

async function readReqStudents() {
  try {
    const raw = await fs.readFile(REQ_STUDENTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, REQ_STUDENTS_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function appendReqStudent(entry) {
  return withFileLock(REQ_STUDENTS_FILE, async () => {
    const list = await readReqStudents();
    list.push(entry);
    await atomicWriteFile(REQ_STUDENTS_FILE, JSON.stringify(list, null, 2));
  });
}

async function removeReqStudentById(requestId) {
  const id = String(requestId || "").trim();
  if (!id) return { ok: false, error: "Request id is required." };
  return withFileLock(REQ_STUDENTS_FILE, async () => {
    const list = await readReqStudents();
    const next = list.filter((entry) => String(entry.id || "") !== id);
    if (next.length === list.length) {
      return { ok: false, error: "Request not found." };
    }
    await atomicWriteFile(REQ_STUDENTS_FILE, JSON.stringify(next, null, 2));
    return { ok: true };
  });
}

module.exports = {
  readReqStudents,
  appendReqStudent,
  removeReqStudentById,
};
