const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { UNIVERSITY_FILE } = require("../config");

async function readUniversityPrograms() {
  try {
    const raw = await fs.readFile(UNIVERSITY_FILE, "utf8");
    const parsed = safeJsonParse(raw, UNIVERSITY_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeUniversityPrograms(programs) {
  return withFileLock(UNIVERSITY_FILE, () =>
    atomicWriteFile(UNIVERSITY_FILE, JSON.stringify(programs, null, 2))
  );
}

module.exports = {
  readUniversityPrograms,
  writeUniversityPrograms,
};
