import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
const EXCHANGE_RATES = {
  "USD": 312.5,
  "GBP": 395.2,
  "CAD": 228.4,
  "AUD": 205.15,
  "EUR": 338.1,
  "LKR": 1
};
const RATE_UPDATED_AT = "March 29, 2026";
function formatLKR(amount, fromCurrency = "USD") {
  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) return "LKR 0";
  const lkrAmount = numericAmount * (EXCHANGE_RATES[fromCurrency] || EXCHANGE_RATES["USD"]);
  if (lkrAmount >= 135e5) {
    return `LKR ${(lkrAmount / 1e6).toFixed(2)}M`;
  }
  return `LKR ${lkrAmount.toLocaleString(void 0, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
}
function formatRawLKR(lkrAmount) {
  if (lkrAmount >= 135e5) {
    return `LKR ${(lkrAmount / 1e6).toFixed(2)}M`;
  }
  return `LKR ${lkrAmount.toLocaleString(void 0, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
}
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
export {
  EXCHANGE_RATES,
  RATE_UPDATED_AT,
  cn,
  formatLKR,
  formatRawLKR
};
