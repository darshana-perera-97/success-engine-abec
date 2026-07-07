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

async function isBranchWhatsappEnabled() {
  const systemData = await readSystemData();
  return systemData.branchWhatsappEnabled === true;
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

function pickStoredBranchMessenger(branch, users, managers) {
  const messengerUserId = String(branch?.whatsappMessengerUserId || "").trim();
  if (!messengerUserId) return null;
  const messenger = users.find((user) => String(user.id || "") === messengerUserId);
  if (!messenger || !isBranchWhatsappManagerRole(messenger.role)) return null;
  if (!managers.some((manager) => String(manager.id || "") === messengerUserId)) return null;
  return messenger;
}

function buildBranchWhatsappAccountRow(manager, primaryUserId) {
  const userId = String(manager?.id || "").trim();
  const state = userId ? whatsappSessions.get(userId) : null;
  const status = String(state?.status || "disconnected");
  const connected = isWhatsappSessionConnected(userId);
  return {
    userId,
    name: String(manager?.username || manager?.email || "").trim(),
    status,
    connected,
    whatsappName: connected ? String(state?.whatsappName || "").trim() : "",
    whatsappNumber: connected ? String(state?.whatsappNumber || "").trim() : "",
    connectedAt: connected ? String(state?.connectedAt || "").trim() : "",
    isPrimary: Boolean(primaryUserId && userId === primaryUserId),
  };
}

async function listBranchWhatsappAccounts(branch, users = null) {
  if (!branch?.id) return [];
  const allUsers = users || (await readUsers());
  const managers = await findBranchManagers(branch, allUsers);
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
  const storedMessenger = pickStoredBranchMessenger(branch, users, managers);

  if (storedMessenger) {
    const storedId = String(storedMessenger.id || "").trim();
    if (storedId && isWhatsappSessionConnected(storedId)) {
      return storedMessenger;
    }
  }

  for (const manager of managers) {
    const managerId = String(manager.id || "").trim();
    if (managerId && isWhatsappSessionConnected(managerId)) {
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

/** Branch-linked WhatsApp sender for a student when branch mode is enabled. */
async function resolveStudentBranchWhatsappSenderId(student) {
  if (!(await isBranchWhatsappEnabled()) || !student) return null;
  const studentBranch = await resolveBranchForStudent(student);
  if (!studentBranch) return null;

  const assignedId = String(student.branchWhatsappMessengerUserId || "").trim();
  if (assignedId && isWhatsappSessionConnected(assignedId)) {
    if (await isBranchWhatsappAccountForStudentBranch(student, assignedId)) {
      return assignedId;
    }
  }

  const messenger = await findBranchWhatsappMessengerUser(studentBranch);
  return messenger?.id ? String(messenger.id).trim() : null;
}

async function validateStudentBranchWhatsappMessengerUserId(student, userId) {
  if (!(await isBranchWhatsappEnabled())) return null;
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return null;

  const studentBranch = await resolveBranchForStudent(student);
  if (!studentBranch) {
    return "Student branch is required to assign a branch WhatsApp account.";
  }

  const users = await readUsers();
  const user = users.find((row) => String(row.id || "") === cleanUserId);
  if (!user || !isBranchWhatsappManagerRole(user.role)) {
    return "Selected WhatsApp account must belong to a Manager or Team Lead.";
  }

  const userBranch = await resolveBranchForUser(user);
  if (!userBranch || String(userBranch.id || "") !== String(studentBranch.id || "")) {
    return "Selected WhatsApp account does not belong to this student's branch.";
  }

  return null;
}

async function resolveEffectiveWhatsappSenderId(actorUserId, student = null) {
  const actor = await resolveUserRecord(actorUserId);
  if (!actor) return null;
  if (!(await isBranchWhatsappEnabled())) {
    return String(actor.id || "").trim() || null;
  }

  // Branch mode: all student WhatsApp goes through the student's branch account.
  if (student) {
    const branchSenderId = await resolveStudentBranchWhatsappSenderId(student);
    if (branchSenderId) return branchSenderId;
    const studentBranch = await resolveBranchForStudent(student);
    if (!studentBranch) return null;
    const actorBranch = await resolveBranchForUser(actor);
    const actorId = String(actor.id || "").trim();
    if (
      actorBranch &&
      String(actorBranch.id || "") === String(studentBranch.id || "") &&
      isBranchWhatsappManagerRole(actor.role) &&
      isWhatsappSessionConnected(actorId)
    ) {
      return actorId || null;
    }
    return null;
  }

  if (String(actor.id || "") === ADMIN_WHATSAPP_USER_ID || String(actor.role || "") === "Admin") {
    return String(actor.id || "").trim() || null;
  }
  const branch = await resolveBranchForUser(actor);
  if (!branch) {
    return isBranchWhatsappManagerRole(actor.role) && isWhatsappSessionConnected(String(actor.id || "").trim())
      ? String(actor.id || "").trim() || null
      : null;
  }
  const messenger = await findBranchWhatsappMessengerUser(branch);
  if (messenger?.id) return String(messenger.id);
  if (isBranchWhatsappManagerRole(actor.role) && isWhatsappSessionConnected(String(actor.id || "").trim())) {
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
      canManage: true,
      statusUserId: String(viewer.id || ""),
      messengerUserId: String(viewer.id || ""),
      branchLabel: "",
      messengerName: "",
    };
  }
  const branch = await resolveBranchForUser(viewer);
  const branchLabel = String(branch?.location || viewer.branch || "").trim();
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
  const statusUserId = isManager ? viewerId : messengerUserId;
  const messengerName = String(primaryAccount?.name || "").trim();
  return {
    mode: "branch",
    branchWhatsappEnabled: true,
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
  isBranchWhatsappEnabled,
  resolveUserRecord,
  resolveBranchForUser,
  resolveBranchForStudent,
  resolveStudentBranchWhatsappSenderId,
  listBranchWhatsappAccounts,
  findBranchWhatsappMessengerUser,
  setBranchWhatsappMessenger,
  clearBranchWhatsappMessenger,
  validateStudentBranchWhatsappMessengerUserId,
  resolveEffectiveWhatsappSenderId,
  resolveWhatsappIntegrationContext,
  sanitizeWhatsappStatusForViewer,
  assertCanManageWhatsappConnection,
  onWhatsappSessionReady,
  onWhatsappSessionDisconnected,
  syncBranchWhatsappMessengersFromSessions,
};
