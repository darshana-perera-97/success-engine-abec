const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { readJsonCached } = require("../lib/jsonCache");
const { TASKS_FILE } = require("../config");

async function readTasks() {
  try {
    return await readJsonCached(TASKS_FILE, (parsed) => (Array.isArray(parsed) ? parsed : []));
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeTasks(tasks) {
  return atomicWriteFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

function withTasksMutationLock(operation) {
  return withFileLock(TASKS_FILE, operation);
}

module.exports = {
  readTasks,
  writeTasks,
  withTasksMutationLock,
};
