const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { BRANCHES_FILE } = require("../config");

async function readBranches() {
  try {
    const raw = await fs.readFile(BRANCHES_FILE, "utf8");
    const parsed = safeJsonParse(raw, BRANCHES_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeBranches(branches) {
  return withFileLock(BRANCHES_FILE, () =>
    atomicWriteFile(BRANCHES_FILE, JSON.stringify(branches, null, 2))
  );
}

module.exports = {
  readBranches,
  writeBranches,
};
