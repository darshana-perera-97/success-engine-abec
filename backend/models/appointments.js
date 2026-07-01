const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { readJsonCached } = require("../lib/jsonCache");
const { APPOINTMENTS_FILE } = require("../config");

async function readAppointments() {
  try {
    return await readJsonCached(APPOINTMENTS_FILE, (parsed) => (Array.isArray(parsed) ? parsed : []));
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeAppointments(appointments) {
  return withFileLock(APPOINTMENTS_FILE, () =>
    atomicWriteFile(APPOINTMENTS_FILE, JSON.stringify(appointments, null, 2))
  );
}

module.exports = {
  readAppointments,
  writeAppointments,
};
