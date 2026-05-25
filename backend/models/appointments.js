const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { APPOINTMENTS_FILE } = require("../config");

async function readAppointments() {
  try {
    const raw = await fs.readFile(APPOINTMENTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, APPOINTMENTS_FILE);
    return Array.isArray(parsed) ? parsed : [];
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
