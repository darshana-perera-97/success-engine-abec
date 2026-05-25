const fs = require("fs/promises");
const crypto = require("crypto");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { PAYMENT_ACCOUNTS_FILE } = require("../config");

function normalizePaymentAccount(raw) {
  if (!raw || typeof raw !== "object") return null;
  const label = String(raw.label || "").trim();
  const bankName = String(raw.bankName || "").trim();
  const accountName = String(raw.accountName || "").trim();
  const accountNumber = String(raw.accountNumber || "").trim();
  if (!label || !bankName || !accountName || !accountNumber) return null;
  return {
    id: String(raw.id || `PAY-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`),
    label,
    bankName,
    accountName,
    accountNumber,
    branch: String(raw.branch || "").trim(),
    currency: String(raw.currency || "LKR").trim().toUpperCase() || "LKR",
    notes: String(raw.notes || "").trim(),
  };
}

async function readPaymentAccounts() {
  try {
    const raw = await fs.readFile(PAYMENT_ACCOUNTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, PAYMENT_ACCOUNTS_FILE);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizePaymentAccount).filter(Boolean);
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writePaymentAccounts(accounts) {
  const normalized = (accounts || []).map(normalizePaymentAccount).filter(Boolean);
  return withFileLock(PAYMENT_ACCOUNTS_FILE, () =>
    atomicWriteFile(PAYMENT_ACCOUNTS_FILE, JSON.stringify(normalized, null, 2))
  );
}

module.exports = {
  readPaymentAccounts,
  writePaymentAccounts,
  normalizePaymentAccount,
};
