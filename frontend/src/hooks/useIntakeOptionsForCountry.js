import { useEffect, useState } from "react";
import { getDocMappingIntakeOptions } from "../authApi";
import { resolveCountryDocConfig } from "../countryDocConfigStore";
import { defaultIntakeOptions, normalizeIntakeOptions } from "../utils/intakeFields";

export function useIntakeOptionsForCountry(country) {
  const [options, setOptions] = useState(defaultIntakeOptions);

  useEffect(() => {
    const key = String(country || "").trim();
    if (!key) {
      setOptions(defaultIntakeOptions());
      return undefined;
    }

    const cached = resolveCountryDocConfig(key);
    if (cached?.intakeOptions) {
      setOptions(normalizeIntakeOptions(cached.intakeOptions));
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const result = await getDocMappingIntakeOptions(key);
      if (cancelled) return;
      if (result.ok && result.data) {
        setOptions(normalizeIntakeOptions(result.data));
      } else {
        setOptions(defaultIntakeOptions());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [country]);

  return options;
}
