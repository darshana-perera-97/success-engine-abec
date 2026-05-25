const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { BOOKINGS_FILE } = require("../config");

async function readBookings() {
  try {
    const raw = await fs.readFile(BOOKINGS_FILE, "utf8");
    const parsed = safeJsonParse(raw, BOOKINGS_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeBookings(bookings) {
  return withFileLock(BOOKINGS_FILE, () =>
    atomicWriteFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2))
  );
}

module.exports = {
  readBookings,
  writeBookings,
};
