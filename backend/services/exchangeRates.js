const {
  FALLBACK_EXCHANGE_RATES_LKR,
  EXCHANGE_RATES_API_TTL_MS,
  EXCHANGE_RATES_FETCH_TIMEOUT_MS,
} = require("../config");
const { logEvent } = require("../lib/logger");

let exchangeRatesApiCache = { payload: null, fetchedAt: 0 };

async function loadExchangeRatesFromApi() {
  const now = Date.now();
  if (exchangeRatesApiCache.payload && now - exchangeRatesApiCache.fetchedAt < EXCHANGE_RATES_API_TTL_MS) {
    return { ...exchangeRatesApiCache.payload, live: true };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXCHANGE_RATES_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`exchange_rates_http_${res.status}`);
    }
    const body = await res.json();
    if (body.result !== "success" || !body.rates || typeof body.rates.LKR !== "number") {
      throw new Error("exchange_rates_bad_payload");
    }
    const usdTable = body.rates;
    const lkrPerUsd = usdTable.LKR;
    const codes = ["USD", "GBP", "CAD", "AUD", "EUR", "NZD"];
    const rates = { LKR: 1 };
    for (const code of codes) {
      const foreignPerUsd = usdTable[code];
      if (typeof foreignPerUsd === "number" && foreignPerUsd > 0) {
        rates[code] = lkrPerUsd / foreignPerUsd;
      }
    }
    const payload = {
      rates,
      updatedAt: body.time_last_update_utc || new Date().toISOString(),
      live: true,
    };
    exchangeRatesApiCache = { payload, fetchedAt: now };
    return payload;
  } catch (err) {
    clearTimeout(timer);
    logEvent("exchange_rates", "fetch failed", { reason: String(err?.message || err) });
    if (exchangeRatesApiCache.payload) {
      return { ...exchangeRatesApiCache.payload, live: true };
    }
    return {
      rates: FALLBACK_EXCHANGE_RATES_LKR,
      updatedAt: "Static rates (API unavailable)",
      live: false,
    };
  }
}

module.exports = {
  loadExchangeRatesFromApi,
};
