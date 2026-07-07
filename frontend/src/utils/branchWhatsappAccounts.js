import { getBranchWhatsappConnectivity } from "../authApi";

export function resolveStudentBranchLabel(student, scopeBranch = "") {
  const scoped = String(scopeBranch || "").trim();
  if (scoped) return scoped;
  return String(student?.branch || student?.nearestOffice || "").trim();
}

export function formatBranchWhatsappAccountLabel(account) {
  const name = String(account?.name || account?.userId || "Account").trim();
  const number = String(account?.whatsappNumber || "").trim();
  const suffix = account?.isPrimary ? " — branch default" : "";
  if (account?.connected && number) return `${name} — ${number}${suffix}`;
  if (account?.connected) return `${name} (connected)${suffix}`;
  return `${name} (not connected)${suffix}`;
}

export async function loadBranchWhatsappAccounts(branchLabel) {
  const branch = String(branchLabel || "").trim();
  if (!branch) return [];
  const result = await getBranchWhatsappConnectivity(branch);
  if (!result.ok || !result.data?.enabled) return [];
  const rows = Array.isArray(result.data.branches) ? result.data.branches : [];
  const key = branch.toLowerCase();
  const row =
    rows.find((item) => String(item?.name || "").trim().toLowerCase() === key) ||
    rows[0] ||
    null;
  return Array.isArray(row?.accounts) ? row.accounts : [];
}

export function pickDefaultBranchWhatsappAccountId(accounts, currentValue = "") {
  const current = String(currentValue || "").trim();
  if (current && accounts.some((row) => String(row?.userId || "") === current)) {
    return current;
  }
  const connected = accounts.filter((row) => row.connected);
  const primary = connected.find((row) => row.isPrimary) || connected[0] || accounts[0];
  return String(primary?.userId || "").trim();
}
