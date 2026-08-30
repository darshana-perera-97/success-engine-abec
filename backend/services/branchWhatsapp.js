const { readSystemData } = require("../models/systemData");
const { readUsers } = require("../models/users");
const { whatsappSessions } = require("../config");
const { isWhatsappIntegratedStaffRole } = require("./roles");
const {
  readBranches,
  writeBranches,
  findBranchById,
  findBranchByLocation,
  officesMatch,
} = require("../models/branches");

const ADMIN_WHATSAPP_USER_ID = "ADM001";

const BRANCH_WHATSAPP_MANAGER_ROLES = new Set(["Manager", "Team Lead"]);
const BRANCH_WHATSAPP_CONNECTED_STATUSES = new Set(["connected", "authenticated"]);
const BRANCH_WHATSAPP_AVAILABLE_STATUSES = new Set([
  "connected",
  "authenticated",
  "reconnecting",
  "connecting",
]);

function isBranchWhatsappManagerRole(role) {
  return BRANCH_WHATSAPP_MANAGER_ROLES.has(String(role || "").trim());
}

function isWhatsappSessionConnected(userId) {
  const id = String(userId || "").trim();
  if (!id) return false;
  const state = whatsappSessions.get(id);
  if (!state) return false;
  return BRANCH_WHATSAPP_CONNECTED_STATUSES.has(String(state.status || ""));
}

/** True when the session is live or expected to come back (so outbound send can wait). */
function isWhatsappSessionAvailable(userId) {
  const id = String(userId || "").trim();
  if (!id) return false;
  const state = whatsappSessions.get(id);
  if (!state) return false;
  return BRANCH_WHATSAPP_AVAILABLE_STATUSES.has(String(state.status || ""));
}

async function isBranchWhatsappEnabled() {
  const systemData = await readSystemData();
  return systemData.branchWhatsappEnabled === true;
}

async function isBranchWhatsappSharedEnabled() {
  const systemData = await readSystemData();
  return systemData.branchWhatsappEnabled === true && systemData.branchWhatsappSharedEnabled === true;
}

async function resolveUserRecord(userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  if (id === ADMIN_WHATSAPP_USER_ID) {
    return { id: ADMIN_WHATSAPP_USER_ID, role: "Admin", branch: "" };
  }
  const users = await readUsers();
  return users.find((user) => String(user.id || "") === id) || null;
}

async function resolveBranchFromLabel(label) {
  const clean = String(label || "").trim();
  if (!clean) return null;
  const byId = await findBranchById(clean);
  if (byId) return byId;
  const byLocation = await findBranchByLocation(clean);
  if (byLocation) return byLocation;
  const branches = await readBranches();
  return branches.find((row) => officesMatch(row?.location, clean)) || null;
}

async function resolveBranchForUser(user) {
  if (!user) return null;
  return resolveBranchFromLabel(user.branch);
}

async function findBranchManagers(branch, users = null) {
  if (!branch?.id) return [];
  const allUsers = users || (await readUsers());
  const managers = [];
  for (const user of allUsers) {
    if (!isBranchWhatsappManagerRole(user.role)) continue;
    const userBranch = await resolveBranchForUser(user);
    if (userBranch && String(userBranch.id || "") === String(branch.id || "")) {
      managers.push(user);
    }
  }
  return managers;
}

function pickStoredBranchMessenger(branch, users, managers, { allowFormerManagers = false } = {}) {
  const messengerUserId = String(branch?.whatsappMessengerUserId || "").trim();
  if (!messengerUserId) return null;
  const messenger = users.find((user) => String(user.id || "") === messengerUserId);
  if (!messenger) return null;
  if (allowFormerManagers) return messenger;
  if (!isBranchWhatsappManagerRole(messenger.role)) return null;
  if (!managers.some((manager) => String(manager.id || "") === messengerUserId)) return null;
  return messenger;
}

function buildBranchWhatsappAccountRow(manager, primaryUserId, { shared = false } = {}) {
  const userId = String(manager?.id || "").trim();
  const state = userId ? whatsappSessions.get(userId) : null;
  const status = String(state?.status || "disconnected");
  const connected = isWhatsappSessionConnected(userId);
  const staffName = String(manager?.username || manager?.email || "").trim();
  return {
    userId,
    name: shared ? "Branch WhatsApp" : staffName,
    linkedByName: shared ? staffName : "",
    status,
    connected,
    whatsappName: connected ? String(state?.whatsappName || "").trim() : "",
    whatsappNumber: connected ? String(state?.whatsappNumber || "").trim() : "",
    connectedAt: connected ? String(state?.connectedAt || "").trim() : "",
    isPrimary: Boolean(primaryUserId && userId === primaryUserId),
    shared,
    error: connected ? "" : String(state?.error || "").trim(),
  };
}

async function resolveCanonicalBranchMessengerUserId(branch, users = null, actorUserId = "") {
  if (!branch?.id) return "";
  const allUsers = users || (await readUsers());
  const managers = await findBranchManagers(branch, allUsers);
  const stored = pickStoredBranchMessenger(branch, allUsers, managers, { allowFormerManagers: true });
  if (stored?.id) return String(stored.id).trim();

  for (const manager of managers) {
    const id = String(manager.id || "").trim();
    if (!id) continue;
    const state = whatsappSessions.get(id);
    const status = String(state?.status || "");
    if (status && status !== "disconnected") return id;
  }

  const actorId = String(actorUserId || "").trim();
  if (actorId && managers.some((manager) => String(manager.id || "") === actorId)) {
    return actorId;
  }

  const first = managers.find((manager) => String(manager.id || "").trim());
  return first ? String(first.id).trim() : "";
}

async function ensureSharedBranchMessenger(branch, actorUserId = "") {
  if (!branch?.id) return "";
  const canonicalId = await resolveCanonicalBranchMessengerUserId(branch, null, actorUserId);
  if (!canonicalId) return "";
  const storedId = String(branch?.whatsappMessengerUserId || "").trim();
  if (storedId !== canonicalId) {
    await setBranchWhatsappMessenger(branch.id, canonicalId);
  }
  return canonicalId;
}

const BRANCH_WHATSAPP_STATUS_PRIORITY = [
  "connected",
  "authenticated",
  "awaiting_qr_scan",
  "reconnecting",
  "connecting",
  "error",
  "auth_failed",
  "disconnected",
];

function summarizeBranchWhatsappStatus(accounts) {
  const rows = Array.isArray(accounts) ? accounts : [];
  const connected = rows.filter((row) => row.connected);
  if (connected.length > 0) {
    const primaryAccount =
      connected.find((row) => row.isPrimary) || connected[0] || null;
    return {
      status: String(primaryAccount?.status || "connected"),
      primaryAccount,
      connectedCount: connected.length,
    };
  }
  for (const statusKey of BRANCH_WHATSAPP_STATUS_PRIORITY) {
    if (statusKey === "connected" || statusKey === "authenticated") continue;
    const match = rows.find((row) => String(row?.status || "") === statusKey);
    if (match) {
      return { status: statusKey, primaryAccount: match, connectedCount: 0 };
    }
  }
  const primaryAccount =
    rows.find((row) => row.isPrimary) || rows[0] || null;
  return {
    status: String(primaryAccount?.status || "disconnected"),
    primaryAccount,
    connectedCount: 0,
  };
}

async function listBranchWhatsappAccounts(branch, users = null) {
  if (!branch?.id) return [];
  const allUsers = users || (await readUsers());
  const managers = await findBranchManagers(branch, allUsers);
  const shared = await isBranchWhatsappSharedEnabled();
  if (shared) {
    const canonicalId = await resolveCanonicalBranchMessengerUserId(branch, allUsers);
    if (!canonicalId) return [];
    const messenger =
      allUsers.find((user) => String(user.id || "") === canonicalId) ||
      { id: canonicalId, username: "Branch WhatsApp", role: "Manager" };
    return [buildBranchWhatsappAccountRow(messenger, canonicalId, { shared: true })];
  }
  const primaryUserId = String(branch?.whatsappMessengerUserId || "").trim();
  const accounts = managers.map((manager) => buildBranchWhatsappAccountRow(manager, primaryUserId));
  accounts.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    return String(a.name || a.userId).localeCompare(String(b.name || b.userId));
  });
  return accounts;
}

async function findBranchWhatsappMessengerUser(branch) {
  if (!branch?.id) return null;
  const users = await readUsers();
  const managers = await findBranchManagers(branch, users);
  const shared = await isBranchWhatsappSharedEnabled();
  const storedMessenger = pickStoredBranchMessenger(branch, users, managers, {
    allowFormerManagers: shared,
  });

  if (storedMessenger) {
    const storedId = String(storedMessenger.id || "").trim();
    if (storedId && isWhatsappSessionAvailable(storedId)) {
      return storedMessenger;
    }
  }

  for (const manager of managers) {
    const managerId = String(manager.id || "").trim();
    if (managerId && isWhatsappSessionAvailable(managerId)) {
      return manager;
    }
  }

  return storedMessenger;
}

async function isBranchWhatsappAccountForStudentBranch(student, userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId || !student) return false;
  const studentBranch = await resolveBranchForStudent(student);
  if (!studentBranch) return false;
  const users = await readUsers();
  const user = users.find((row) => String(row.id || "") === cleanUserId);
  if (!user || !isBranchWhatsappManagerRole(user.role)) return false;
  const userBranch = await resolveBranchForUser(user);
  return Boolean(
    userBranch && String(userBranch.id || "") === String(studentBranch.id || "")
  );
}

async function setBranchWhatsappMessenger(branchId, userId) {
  const cleanBranchId = String(branchId || "").trim();
  const cleanUserId = String(userId || "").trim();
  if (!cleanBranchId || !cleanUserId) return null;
  const branches = await readBranches();
  const index = branches.findIndex((branch) => String(branch?.id || "") === cleanBranchId);
  if (index === -1) return null;
  const next = branches.map((branch, idx) =>
    idx === index ? { ...branch, whatsappMessengerUserId: cleanUserId } : branch
  );
  await writeBranches(next);
  return next[index];
}

async function clearBranchWhatsappMessenger(branchId, userId) {
  const cleanBranchId = String(branchId || "").trim();
  const cleanUserId = String(userId || "").trim();
  if (!cleanBranchId) return null;
  const branches = await readBranches();
  const index = branches.findIndex((branch) => String(branch?.id || "") === cleanBranchId);
  if (index === -1) return null;
  const current = branches[index];
  if (cleanUserId && String(current?.whatsappMessengerUserId || "") !== cleanUserId) {
    return current;
  }
  const next = branches.map((branch, idx) => {
    if (idx !== index) return branch;
    const { whatsappMessengerUserId, ...rest } = branch;
    return rest;
  });
  await writeBranches(next);
  return next[index];
}

async function resolveBranchForStudent(student) {
  if (!student) return null;
  const label = String(student.branch || student.nearestOffice || "").trim();
  return resolveBranchFromLabel(label);
}

/** User id of the Primary WhatsApp contact for a student (connected or not). */
function resolveStudentPrimaryWhatsappMessengerUserId(student) {
  if (!student) return "";
  return String(student.branchWhatsappMessengerUserId || "").trim();
}

async function studentPrimaryWhatsappUnavailableReason(student) {
  const branch = await resolveBranchForStudent(student);
  if (!branch) {
    return "Student branch is not set or does not match a configured branch office.";
  }
  if (await isBranchWhatsappSharedEnabled()) {
    return "The branch WhatsApp account for this student's team is not connected. Connect it under Integrations.";
  }
  const assignedId = resolveStudentPrimaryWhatsappMessengerUserId(student);
  if (assignedId) {
    return "The Primary WhatsApp contact for this student is not connected. Connect that account or assign a different Primary WhatsApp contact.";
  }
  return "No Primary WhatsApp contact is connected for this student. Connect a branch WhatsApp account or assign one on the student profile.";
}

async function applySharedBranchWhatsappMessenger(student) {
  if (!student || !(await isBranchWhatsappSharedEnabled())) return student;
  const branch = await resolveBranchForStudent(student);
  if (!branch) return student;
  const canonicalId = await resolveCanonicalBranchMessengerUserId(branch);
  if (canonicalId) {
    student.branchWhatsappMessengerUserId = canonicalId;
  }
  return student;
}

/** Branch-linked WhatsApp sender for a student when branch mode is enabled. */
async function resolveStudentBranchWhatsappSenderId(student) {
  if (!(await isBranchWhatsappEnabled()) || !student) return null;

  const studentBranch = await resolveBranchForStudent(student);
  if (await isBranchWhatsappSharedEnabled()) {
    if (!studentBranch) return null;
    const messenger = await findBranchWhatsappMessengerUser(studentBranch);
    const messengerId = messenger?.id ? String(messenger.id).trim() : "";
    return messengerId && isWhatsappSessionAvailable(messengerId) ? messengerId : null;
  }

  const assignedId = resolveStudentPrimaryWhatsappMessengerUserId(student);
  if (assignedId) {
    return isWhatsappSessionAvailable(assignedId) ? assignedId : null;
  }

  if (!studentBranch) return null;

  const messenger = await findBranchWhatsappMessengerUser(studentBranch);
  const messengerId = messenger?.id ? String(messenger.id).trim() : "";
  return messengerId && isWhatsappSessionAvailable(messengerId) ? messengerId : null;
}

async function validateStudentBranchWhatsappMessengerUserId(student, userId) {
  if (!(await isBranchWhatsappEnabled())) return null;
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return null;

  if (await isBranchWhatsappSharedEnabled()) {
    const studentBranch = await resolveBranchForStudent(student);
    if (!studentBranch) {
      return "Student branch is required before assigning the branch WhatsApp account.";
    }
    const canonicalId = await resolveCanonicalBranchMessengerUserId(studentBranch);
    if (canonicalId && cleanUserId !== canonicalId) {
      return "This branch uses a single shared WhatsApp account. Student messages must use that branch account.";
    }
    if (!(await isBranchWhatsappAccountForStudentBranch(student, cleanUserId))) {
      return "Selected WhatsApp account must belong to the student's branch.";
    }
    return null;
  }

  const users = await readUsers();
  const user = users.find((row) => String(row.id || "") === cleanUserId);
  if (!user || !isBranchWhatsappManagerRole(user.role)) {
    return "Selected WhatsApp account must belong to a Manager or Team Lead.";
  }

  // Any connected Manager/Team Lead WhatsApp account may be assigned to a
  // student, regardless of which branch the account belongs to.
  return null;
}

async function resolveEffectiveWhatsappSenderId(actorUserId, student = null) {
  const actor = await resolveUserRecord(actorUserId);
  if (!actor) return null;
  const actorId = String(actor.id || "").trim();
  if (!actorId) return null;
  if (!(await isBranchWhatsappEnabled())) {
    return actorId;
  }

  // Prefer the caller when that account is live so Admin/staff chat can send
  // even if the branch messenger is down. Callers that want branch-first
  // should pass the branch messenger id themselves.
  if (student) {
    if (isWhatsappSessionAvailable(actorId)) return actorId;
    return resolveStudentBranchWhatsappSenderId(student);
  }

  if (String(actor.id || "") === ADMIN_WHATSAPP_USER_ID || String(actor.role || "") === "Admin") {
    return String(actor.id || "").trim() || null;
  }
  const branch = await resolveBranchForUser(actor);
  if (!branch) {
    return isBranchWhatsappManagerRole(actor.role) && isWhatsappSessionAvailable(String(actor.id || "").trim())
      ? String(actor.id || "").trim() || null
      : null;
  }
  const messenger = await findBranchWhatsappMessengerUser(branch);
  if (messenger?.id) return String(messenger.id);
  if (isBranchWhatsappManagerRole(actor.role) && isWhatsappSessionAvailable(String(actor.id || "").trim())) {
    return String(actor.id || "").trim() || null;
  }
  return null;
}

async function resolveWhatsappIntegrationContext(viewerUserId) {
  const viewer = await resolveUserRecord(viewerUserId);
  if (!viewer) {
    return {
      mode: "personal",
      branchWhatsappEnabled: false,
      sharedAccount: false,
      canManage: false,
      statusUserId: "",
      messengerUserId: "",
      branchLabel: "",
      messengerName: "",
    };
  }
  const branchWhatsappEnabled = await isBranchWhatsappEnabled();
  if (!branchWhatsappEnabled) {
    return {
      mode: "personal",
      branchWhatsappEnabled: false,
      sharedAccount: false,
      canManage: true,
      statusUserId: String(viewer.id || ""),
      messengerUserId: String(viewer.id || ""),
      branchLabel: String(viewer.branch || "").trim(),
      messengerName: "",
    };
  }
  if (String(viewer.id || "") === ADMIN_WHATSAPP_USER_ID || String(viewer.role || "") === "Admin") {
    return {
      mode: "personal",
      branchWhatsappEnabled: true,
      sharedAccount: await isBranchWhatsappSharedEnabled(),
      canManage: true,
      statusUserId: String(viewer.id || ""),
      messengerUserId: String(viewer.id || ""),
      branchLabel: "",
      messengerName: "",
    };
  }
  let branch = await resolveBranchForUser(viewer);
  const branchLabel = String(branch?.location || viewer.branch || "").trim();
  const sharedAccount = await isBranchWhatsappSharedEnabled();
  if (sharedAccount && branch?.id && isBranchWhatsappManagerRole(viewer.role)) {
    const canonicalId = await ensureSharedBranchMessenger(branch, viewer.id);
    if (canonicalId) {
      branch = { ...branch, whatsappMessengerUserId: canonicalId };
    }
  }
  const accounts = branch ? await listBranchWhatsappAccounts(branch) : [];
  const connectedAccounts = accounts.filter((row) => row.connected);
  const primaryAccount =
    connectedAccounts.find((row) => row.isPrimary) ||
    connectedAccounts[0] ||
    accounts.find((row) => row.isPrimary) ||
    accounts[0] ||
    null;
  const messengerUserId = String(primaryAccount?.userId || "").trim();
  const viewerId = String(viewer.id || "").trim();
  const isManager = isBranchWhatsappManagerRole(viewer.role);
  const canManage = isManager;
  const statusUserId = sharedAccount
    ? messengerUserId || viewerId
    : isManager
      ? viewerId
      : messengerUserId;
  const messengerName = String(primaryAccount?.name || "").trim();
  return {
    mode: "branch",
    branchWhatsappEnabled: true,
    sharedAccount,
    canManage,
    statusUserId,
    messengerUserId,
    branchLabel,
    messengerName,
    branchAccountCount: accounts.length,
    connectedBranchAccountCount: connectedAccounts.length,
  };
}

function sanitizeWhatsappStatusForViewer(state, context) {
  const snapshot = state && typeof state === "object" ? { ...state } : {};
  if (!context?.branchWhatsappEnabled || context?.canManage) {
    return snapshot;
  }
  snapshot.qrCodeDataUrl = "";
  if (snapshot.status === "awaiting_qr_scan") {
    snapshot.status = "connecting";
  }
  return snapshot;
}

async function assertCanManageWhatsappConnection(actorUserId) {
  const context = await resolveWhatsappIntegrationContext(actorUserId);
  if (context.branchWhatsappEnabled) {
    const actor = await resolveUserRecord(actorUserId);
    if (actor && isWhatsappIntegratedStaffRole(actor.role) && !isBranchWhatsappManagerRole(actor.role)) {
      return {
        ok: false,
        error: "Counselors cannot connect WhatsApp when branch WhatsApp is enabled.",
        context,
      };
    }
  }
  if (!context.canManage) {
    return {
      ok: false,
      error: "You are not allowed to manage WhatsApp for this branch.",
      context,
    };
  }
  if (context.mode !== "branch") {
    return { ok: true, context };
  }
  const actor = await resolveUserRecord(actorUserId);
  if (!actor || !isBranchWhatsappManagerRole(actor.role)) {
    return {
      ok: false,
      error: "Only a Manager or Team Lead can connect WhatsApp for a branch.",
      context,
    };
  }
  const branch = await resolveBranchForUser(actor);
  if (!branch && !String(actor.branch || "").trim()) {
    return { ok: false, error: "No branch is assigned to your account.", context };
  }
  return { ok: true, context, branch };
}

async function onWhatsappSessionReady(userId) {
  if (!(await isBranchWhatsappEnabled())) return;
  const user = await resolveUserRecord(userId);
  if (!user || !isBranchWhatsappManagerRole(user.role)) return;
  const branch = await resolveBranchForUser(user);
  if (!branch?.id) return;
  const storedId = String(branch?.whatsappMessengerUserId || "").trim();
  if (!storedId) {
    await setBranchWhatsappMessenger(branch.id, userId);
  }
}

async function onWhatsappSessionDisconnected(userId) {
  if (!(await isBranchWhatsappEnabled())) return;
  if (await isBranchWhatsappSharedEnabled()) return;
  const user = await resolveUserRecord(userId);
  if (!user || !isBranchWhatsappManagerRole(user.role)) return;
  const branch = await resolveBranchForUser(user);
  if (!branch?.id) return;
  await clearBranchWhatsappMessenger(branch.id, userId);
}

async function syncBranchWhatsappMessengersFromSessions() {
  if (!(await isBranchWhatsappEnabled())) return;
  const branches = await readBranches();
  const users = await readUsers();
  for (const branch of branches) {
    const storedId = String(branch.whatsappMessengerUserId || "").trim();
    if (storedId) continue;
    const managers = await findBranchManagers(branch, users);
    const connectedManagers = managers.filter((manager) =>
      isWhatsappSessionConnected(String(manager.id || "").trim())
    );
    if (connectedManagers.length < 1) continue;
    const connectedId = String(connectedManagers[0].id || "").trim();
    if (connectedId) {
      await setBranchWhatsappMessenger(branch.id, connectedId);
    }
  }
}

module.exports = {
  isBranchWhatsappManagerRole,
  isWhatsappSessionConnected,
  isWhatsappSessionAvailable,
  isBranchWhatsappEnabled,
  isBranchWhatsappSharedEnabled,
  resolveUserRecord,
  resolveBranchForUser,
  resolveBranchForStudent,
  resolveStudentPrimaryWhatsappMessengerUserId,
  studentPrimaryWhatsappUnavailableReason,
  applySharedBranchWhatsappMessenger,
  resolveCanonicalBranchMessengerUserId,
  ensureSharedBranchMessenger,
  resolveStudentBranchWhatsappSenderId,
  listBranchWhatsappAccounts,
  findBranchWhatsappMessengerUser,
  setBranchWhatsappMessenger,
  clearBranchWhatsappMessenger,
  isBranchWhatsappAccountForStudentBranch,
  validateStudentBranchWhatsappMessengerUserId,
  resolveEffectiveWhatsappSenderId,
  resolveWhatsappIntegrationContext,
  sanitizeWhatsappStatusForViewer,
  assertCanManageWhatsappConnection,
  onWhatsappSessionReady,
  onWhatsappSessionDisconnected,
  syncBranchWhatsappMessengersFromSessions,
  summarizeBranchWhatsappStatus,
};
