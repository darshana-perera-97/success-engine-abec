const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { SYSTEM_DATA_FILE, DEFAULT_SYSTEM_DATA } = require("../config");

function normalizeSystemData(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    counselorCanAcceptPayments: src.counselorCanAcceptPayments === true,
    adminChatEnabled: src.adminChatEnabled === true,
    branchCountriesEnabled: src.branchCountriesEnabled === true,
    goldLoansAcceptable: src.goldLoansAcceptable !== false,
  };
}

async function readSystemData() {
  try {
    const raw = await fs.readFile(SYSTEM_DATA_FILE, "utf8");
    const parsed = safeJsonParse(raw, SYSTEM_DATA_FILE);
    if (!parsed) return { ...DEFAULT_SYSTEM_DATA };
    return normalizeSystemData(parsed);
  } catch (error) {
    if (error && error.code === "ENOENT") return { ...DEFAULT_SYSTEM_DATA };
    throw error;
  }
}

async function writeSystemData(data) {
  return withFileLock(SYSTEM_DATA_FILE, () =>
    atomicWriteFile(SYSTEM_DATA_FILE, JSON.stringify(normalizeSystemData(data), null, 2))
  );
}

module.exports = {
  normalizeSystemData,
  readSystemData,
  writeSystemData,
};
