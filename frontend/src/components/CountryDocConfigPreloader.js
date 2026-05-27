import { useEffect } from "react";
import { preloadAllCountryDocConfigs } from "../countryDocConfigStore";

/** Loads all country doc-mapping configs once when the app mounts. */
export function CountryDocConfigPreloader() {
  useEffect(() => {
    preloadAllCountryDocConfigs();
  }, []);
  return null;
}
