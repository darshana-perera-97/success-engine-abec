const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { readJsonCached } = require("../lib/jsonCache");
const { ACTIVITIES_FILE } = require("../config");

async function readActivities() {
  try {
    return await readJsonCached(ACTIVITIES_FILE, (parsed) => (Array.isArray(parsed) ? parsed : []));
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
