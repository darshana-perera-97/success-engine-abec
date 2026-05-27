import { getCountries, getDocMapping, getAllDocMapping } from "./authApi";
import { buildCountryDocConfig, buildFallbackCountryDocConfig } from "./docMappingConfig";

const cache = new Map();
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function getCachedCountryDocConfig(country) {
  const key = String(country || "").trim();
  if (!key) return null;
  return cache.get(key) || null;
}

export function setCachedCountryDocConfig(country, config) {
  const key = String(country || "").trim();
  if (!key || !config) return;
  cache.set(key, config);
  notify();
}

export function subscribeCountryDocConfig(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refreshCountryDocConfig(country) {
  const key = String(country || "").trim();
  if (!key) return false;
  const result = await getDocMapping(key);
  if (!result.ok) return false;
  setCachedCountryDocConfig(key, buildCountryDocConfig(result.data));
  return true;
}

export async function preloadAllCountryDocConfigs() {
  const bulk = await getAllDocMapping();
  if (bulk.ok) {
    for (const [country, raw] of Object.entries(bulk.data || {})) {
      setCachedCountryDocConfig(country, buildCountryDocConfig(raw));
    }
    return true;
  }

  const countriesResult = await getCountries();
  if (!countriesResult.ok) return false;
  const names = (countriesResult.data || [])
    .map((c) => (typeof c === "string" ? c : c?.name))
    .filter(Boolean);
  await Promise.all(names.map((name) => refreshCountryDocConfig(name)));
  return names.length > 0;
}

export function invalidateCountryDocConfigCache(country) {
  if (country) {
    const key = String(country).trim();
    cache.delete(key);
    notify();
    return refreshCountryDocConfig(key);
  }
  cache.clear();
  notify();
  return preloadAllCountryDocConfigs();
}

export function resolveCountryDocConfig(country) {
  const key = String(country || "").trim();
  if (!key) return null;
  return getCachedCountryDocConfig(key) || buildFallbackCountryDocConfig(key);
}
