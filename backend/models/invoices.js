const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse, parseJsonArray } = require("../lib/fileUtils");
const { INVOICES_FILE } = require("../config");

async function readInvoices() {
  try {
    const raw = await fs.readFile(INVOICES_FILE, "utf8");
    const parsed = safeJsonParse(raw, INVOICES_FILE);
    return parseJsonArray(parsed);
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeInvoices(invoices) {
  return withFileLock(INVOICES_FILE, () =>
    atomicWriteFile(INVOICES_FILE, JSON.stringify(invoices, null, 2))
  );
}

module.exports = {
  readInvoices,
  writeInvoices,
};
