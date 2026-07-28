import { getBranchWhatsappConnectivity, getWhatsappStatus } from "../authApi";

export function isWhatsappSessionStatusConnected(status) {
  const value = String(status || "").trim();
  return value === "connected" || value === "authenticated";
}

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

export function filterConnectedAccountGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => ({
      ...group,
      accounts: (group.accounts || []).filter((row) => row.connected),
    }))
    .filter((group) => group.accounts.length > 0);
}

export async function loadAllBranchWhatsappAccountGroups() {
  const result = await getBranchWhatsappConnectivity("");
  if (!result.ok || !result.data?.enabled) return [];
  const rows = Array.isArray(result.data.branches) ? result.data.branches : [];
  return filterConnectedAccountGroups(
    rows.map((row) => ({
      branch: String(row?.name || "").trim(),
      accounts: Array.isArray(row?.accounts) ? row.accounts : [],
    }))
  );
}

export function pickDefaultAccountIdFromGroups(groups, preferredBranch = "") {
  const list = Array.isArray(groups) ? groups : [];
  const key = String(preferredBranch || "").trim().toLowerCase();
  const ordered = [];
  if (key) {
    const match = list.find((group) => String(group?.branch || "").trim().toLowerCase() === key);
    if (match) ordered.push(match);
  }
  for (const group of list) {
    if (!ordered.includes(group)) ordered.push(group);
  }
  for (const group of ordered) {
    const connected = (group.accounts || []).filter((row) => row.connected);
    const primary = connected.find((row) => row.isPrimary) || connected[0];
    const id = String(primary?.userId || "").trim();
    if (id) return id;
  }
  return "";
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

export function resolveStudentBranchWhatsappAccount(accounts, student) {
  const rows = Array.isArray(accounts) ? accounts : [];
  const assignedId = String(student?.branchWhatsappMessengerUserId || "").trim();
  if (assignedId) {
    const match = rows.find((row) => String(row?.userId || "") === assignedId);
    if (match) return match;
    return { userId: assignedId, connected: false, name: "", whatsappNumber: "" };
  }
  const connected = rows.filter((row) => row.connected);
  return connected.find((row) => row.isPrimary) || connected[0] || rows[0] || null;
}

/** Primary WhatsApp messenger user id for a student (assigned id or branch default). */
export function resolvePrimaryWhatsappMessengerUserId(student, accounts = null) {
  const assignedId = String(student?.branchWhatsappMessengerUserId || "").trim();
  if (assignedId) return assignedId;
  if (Array.isArray(accounts)) {
    const account = resolveStudentBranchWhatsappAccount(accounts, student);
    return String(account?.userId || "").trim();
  }
  return "";
}

/**
 * Returns whether the student's Primary WhatsApp contact is connected and ready to send.
 */
export async function getStudentPrimaryWhatsappSendReadiness(student) {
  if (!student) {
    return { ready: true, messengerUserId: "", account: null };
  }
  const branchLabel = resolveStudentBranchLabel(student);
  const accounts = branchLabel ? await loadBranchWhatsappAccounts(branchLabel) : [];
  const account = resolveStudentBranchWhatsappAccount(accounts, student);
  const messengerUserId = resolvePrimaryWhatsappMessengerUserId(student, accounts);
  if (!messengerUserId) {
    return {
      ready: false,
      messengerUserId: "",
      account: account || null,
      reason: "No Primary WhatsApp contact is set for this student. Assign one on the student profile.",
    };
  }
  const statusResult = await getWhatsappStatus(messengerUserId);
  const connected =
    statusResult.ok && isWhatsappSessionStatusConnected(statusResult.data?.status);
  if (connected) {
    return {
      ready: true,
      messengerUserId,
      account: account || { userId: messengerUserId, connected: true },
    };
  }
  return {
    ready: false,
    messengerUserId,
    account: account || { userId: messengerUserId, connected: false },
    reason:
      "The Primary WhatsApp contact for this student is not connected. Connect that WhatsApp account or assign a different Primary WhatsApp contact.",
  };
}

/** True when WhatsApp was skipped/failed because the student's primary line is offline. */
export function isStudentWhatsappNotConnectedDelivery(delivery) {
  if (!delivery || typeof delivery !== "object") return false;
  const status = String(delivery.status || "").trim().toLowerCase();
  if (status !== "skipped" && status !== "failed") return false;
  const reason = String(delivery.reason || "").trim().toLowerCase();
  if (!reason) {
    return status === "skipped" && delivery.attempted !== true;
  }
  return (
    reason.includes("not connected") ||
    reason.includes("primary whatsapp") ||
    reason.includes("no whatsapp account") ||
    reason.includes("no primary whatsapp")
  );
}

export function shouldNotifyStudentWhatsappDelivery(delivery) {
  return !isStudentWhatsappNotConnectedDelivery(delivery);
}

export function formatWhatsappContactCardTitle(account) {
  const whatsappName = String(account?.whatsappName || "").trim();
  if (whatsappName) return whatsappName;
  const staffName = String(account?.name || "").trim();
  if (staffName) return staffName;
  if (account?.connected) return "Connected account";
  return "No WhatsApp account";
}
