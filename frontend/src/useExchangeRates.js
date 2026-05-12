import { useState, useEffect } from "react";
import { API_BASE } from "./apiConfig";
import { EXCHANGE_RATES, RATE_UPDATED_AT } from "./utils";

const CLIENT_TTL_MS = 55 * 60 * 1000;

let memory = {
  rates: null,
  updatedAt: null,
  live: false,
  expiresAt: 0,
  inflight: null,
};

async function loadExchangeRatesOnce() {
  const now = Date.now();
  if (memory.rates && now < memory.expiresAt) {
    return { rates: memory.rates, updatedAt: memory.updatedAt, live: memory.live };
  }
  if (memory.inflight) {
    return memory.inflight;
  }
  memory.inflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/exchange-rates`);
      const json = await res.json();
      if (json.ok && json.data && json.data.rates && typeof json.data.rates === "object") {
        const merged = { ...EXCHANGE_RATES, ...json.data.rates };
        memory.rates = merged;
        memory.updatedAt = json.data.updatedAt || RATE_UPDATED_AT;
        memory.live = json.data.live !== false;
        memory.expiresAt = Date.now() + CLIENT_TTL_MS;
        return { rates: merged, updatedAt: memory.updatedAt, live: memory.live };
      }
    } catch {
      /* use fallback below */
    }
    memory.rates = { ...EXCHANGE_RATES };
    memory.updatedAt = RATE_UPDATED_AT;
    memory.live = false;
    memory.expiresAt = Date.now() + 5 * 60 * 1000;
    return { rates: memory.rates, updatedAt: memory.updatedAt, live: false };
  })().finally(() => {
    memory.inflight = null;
  });
  return memory.inflight;
}

export function useExchangeRates() {
  const [state, setState] = useState({
    rates: EXCHANGE_RATES,
    updatedAt: RATE_UPDATED_AT,
    live: false,
    loading: true,
  });
  useEffect(() => {
    let cancelled = false;
    loadExchangeRatesOnce().then((r) => {
      if (!cancelled) {
        setState({ ...r, loading: false });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
