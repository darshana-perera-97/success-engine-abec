const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { readJsonCached } = require("../lib/jsonCache");
const { BRANCHES_FILE } = require("../config");

function normalizeCountryNames(list) {
  return Array.from(
    new Map(
      (list || [])
        .map((n) => String(n || "").trim())
        .filter(Boolean)
        .map((n) => [n.toLowerCase(), n])
    ).values()
  ).sort((a, b) => a.localeCompare(b));
}

function getStoredBranchCountries(branch) {
  if (!branch || !Array.isArray(branch.countries)) return [];
  return normalizeCountryNames(branch.countries);
}

function resolveCountriesForBranch(branch, globalCountries, branchCountriesEnabled = false) {
  if (!branchCountriesEnabled) return normalizeCountryNames(globalCountries);
  const stored = getStoredBranchCountries(branch);
  if (stored.length > 0) return stored;
  return normalizeCountryNames(globalCountries);
}

async function resolveCountriesForBranchLocation(location, globalCountries, branchCountriesEnabled = false) {
  if (!branchCountriesEnabled) return normalizeCountryNames(globalCountries);
  const branch = await findBranchByLocation(location);
  if (!branch) return normalizeCountryNames(globalCountries);
  return resolveCountriesForBranch(branch, globalCountries, true);
}

async function findBranchById(branchId) {
  const branches = await readBranches();
  const key = String(branchId || "").trim();
  if (!key) return null;
  return branches.find((b) => String(b?.id || "") === key) || null;
}

async function findBranchByLocation(location) {
  const branches = await readBranches();
  const key = String(location || "").trim().toLowerCase();
  if (!key) return null;
  return (
    branches.find((b) => String(b?.location || "").trim().toLowerCase() === key) || null
  );
}

function officesMatch(a, b) {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}

function findBranchByOfficeLoose(branches, office) {
  const key = String(office || "").trim().toLowerCase();
  if (!key) return null;
  return (
    (branches || []).find((branch) => {
      const location = String(branch?.location || "").trim().toLowerCase();
      if (!location) return false;
      return officesMatch(location, key);
    }) || null
  );
}

function countryIsInList(country, list) {
  const key = String(country || "").trim().toLowerCase();
  if (!key) return false;
  return (list || []).some((name) => String(name).trim().toLowerCase() === key);
}

function resolveCountriesForOfficeLoose(branches, office, globalCountries, branchCountriesEnabled = false) {
  if (!branchCountriesEnabled) return normalizeCountryNames(globalCountries);
  const branch = findBranchByOfficeLoose(branches, office);
  if (!branch) return normalizeCountryNames(globalCountries);
  return resolveCountriesForBranch(branch, globalCountries, true);
}

async function readBranches() {
  try {
    return await readJsonCached(BRANCHES_FILE, (parsed) => (Array.isArray(parsed) ? parsed : []));
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeBranches(branches) {
  return withFileLock(BRANCHES_FILE, () =>
    atomicWriteFile(BRANCHES_FILE, JSON.stringify(branches, null, 2))
  );
}

module.exports = {
  readBranches,
  writeBranches,
  normalizeCountryNames,
  getStoredBranchCountries,
  resolveCountriesForBranch,
  findBranchById,
  findBranchByLocation,
  resolveCountriesForBranchLocation,
  officesMatch,
  findBranchByOfficeLoose,
  countryIsInList,
  resolveCountriesForOfficeLoose,
};
