import { useEffect, useState } from "react";
import {
  getCachedCountryDocConfig,
  refreshCountryDocConfig,
  resolveCountryDocConfig,
  subscribeCountryDocConfig,
} from "../countryDocConfigStore";

/**
 * Per-country pipeline stages and document lists (from doc-mapping API cache).
 * @param {string} country
 */
export function useCountryDocConfig(country) {
  const countryKey = String(country || "").trim();
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeCountryDocConfig(() => setTick((n) => n + 1)), []);

  useEffect(() => {
    if (!countryKey) return;
    if (!getCachedCountryDocConfig(countryKey)) {
      refreshCountryDocConfig(countryKey);
    }
  }, [countryKey, tick]);

  const cached = countryKey ? getCachedCountryDocConfig(countryKey) : null;
  const config = resolveCountryDocConfig(countryKey);

  return {
    config,
    loading: Boolean(countryKey) && !cached,
  };
}

export { invalidateCountryDocConfigCache } from "../countryDocConfigStore";
