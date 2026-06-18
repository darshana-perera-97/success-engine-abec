export function getStoredBranchCountries(branch) {
  if (!branch || !Array.isArray(branch.countries)) return [];
  return branch.countries
    .map((name) => String(name || "").trim())
    .filter(Boolean);
}

export function resolveCountriesForOffice(
  branchRecords,
  office,
  globalCountries = [],
  { branchCountriesEnabled = false } = {}
) {
  const fallback = Array.isArray(globalCountries) ? globalCountries : [];
  if (!branchCountriesEnabled) return fallback;
  const location = String(office || "").trim();
  if (!location) return fallback;
  const branch = (branchRecords || []).find(
    (item) => String(item?.location || "").trim().toLowerCase() === location.toLowerCase()
  );
  if (!branch) return fallback;
  const stored = getStoredBranchCountries(branch);
  return stored.length > 0 ? stored : fallback;
}
