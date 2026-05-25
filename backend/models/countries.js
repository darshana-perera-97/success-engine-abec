const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { COUNTRIES_FILE, DEFAULT_COUNTRY_NAMES } = require("../config");

async function readCountries() {
  try {
    const raw = await fs.readFile(COUNTRIES_FILE, "utf8");
    const parsed = safeJsonParse(raw, COUNTRIES_FILE);
    if (!Array.isArray(parsed)) {
      await writeCountries([...DEFAULT_COUNTRY_NAMES]);
      return [...DEFAULT_COUNTRY_NAMES];
    }
    const names = parsed
      .map((x) => (typeof x === "string" ? x : String(x?.name || "")).trim())
      .filter(Boolean);
    if (names.length === 0) {
      await writeCountries([...DEFAULT_COUNTRY_NAMES]);
      return [...DEFAULT_COUNTRY_NAMES];
    }
    return Array.from(new Map(names.map((n) => [n.toLowerCase(), n])).values()).sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      await writeCountries([...DEFAULT_COUNTRY_NAMES]);
      return [...DEFAULT_COUNTRY_NAMES];
    }
    throw error;
  }
}

async function writeCountries(list) {
  const unique = Array.from(
    new Map(
      (list || [])
        .map((n) => String(n || "").trim())
        .filter(Boolean)
        .map((n) => [n.toLowerCase(), n])
    ).values()
  ).sort((a, b) => a.localeCompare(b));
  return withFileLock(COUNTRIES_FILE, () =>
    atomicWriteFile(COUNTRIES_FILE, JSON.stringify(unique, null, 2))
  );
}

module.exports = {
  readCountries,
  writeCountries,
};
