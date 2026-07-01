const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse, parseJsonArray } = require("../lib/fileUtils");
const { readJsonCached } = require("../lib/jsonCache");
const { INVOICES_FILE } = require("../config");

async function readInvoices() {
  try {
    return await readJsonCached(INVOICES_FILE, (parsed) => parseJsonArray(parsed));
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
