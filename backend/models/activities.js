const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { ACTIVITIES_FILE } = require("../config");

async function readActivities() {
  try {
    const raw = await fs.readFile(ACTIVITIES_FILE, "utf8");
    const parsed = safeJsonParse(raw, ACTIVITIES_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeActivities(activities) {
  return withFileLock(ACTIVITIES_FILE, () =>
    atomicWriteFile(ACTIVITIES_FILE, JSON.stringify(activities, null, 2))
  );
}

module.exports = {
  readActivities,
  writeActivities,
};
