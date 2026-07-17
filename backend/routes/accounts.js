const crypto = require("crypto");
const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const {
  ALLOWED_ROLES,
  ADMIN_EMAIL,
  DEFAULT_MALE_AVATAR_PATH,
} = require("../config");
const { readUsers, writeUsers, sanitizeAccount, splitAdminRecord } = require("../models/users");
const { readStudemts, writeStudemts, publicAssetUrl } = require("../models/students");
const { readBranches } = require("../models/branches");
const { readCountries } = require("../models/countries");
const {
  normalizeEmail,
  normalizeStoredRole,
  isCounselorRole,
  isStaffWelcomeEmailRole,
  staffWelcomeEmailCopy,
} = require("../services/roles");
const { isTeamLeadAssignableAccountRole } = require("../services/roleDisplay");
const {
  getSmtpConfigError,
  sendCounselorWelcomeEmail,
  buildStudentPortalLoginUrl,
} = require("../services/email");
const { startWhatsappSession } = require("../services/whatsapp");
const { storeImageDataUrl } = require("../services/uploads");
const { ADMIN_DISPLAY_NAME } = require("../config");

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/accounts") {
    try {
      const users = await readUsers();
      const { adminRecord, others } = splitAdminRecord(users);
      const adminAccount = {
        id: "ADM001",
        username: ADMIN_DISPLAY_NAME,
        name: ADMIN_DISPLAY_NAME,
        email: ADMIN_EMAIL || "admin@gmail.com",
        role: "Admin",
        avatar: (adminRecord && adminRecord.avatar) || DEFAULT_MALE_AVATAR_PATH,
      };
      const safeUsers = others.map(sanitizeAccount).map((u) => ({ ...u, avatar: publicAssetUrl(req, u.avatar) }));
      sendJson(res, 200, {
        ok: true,
        data: [{ ...adminAccount, avatar: publicAssetUrl(req, adminAccount.avatar) }, ...safeUsers],
      });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load accounts." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts") {
    try {
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const role = normalizeStoredRole(String(body.role || "").trim());
      const branch = String(body.branch || "").trim();
      const teamLeadId = String(body.teamLeadId || "").trim();
      const teamLeadName = String(body.teamLeadName || "").trim();
      const teamLeadEmail = normalizeEmail(body.teamLeadEmail);
      const avatarDataUrl = String(body.avatar || "");
      const country = String(body.country || "").trim();
      const phone = String(body.phone || "").trim();

      if (!username || !email || !password || !role) {
        sendJson(res, 400, { ok: false, error: "Username, email, password, and role are required." });
        return true;
      }

      if (role !== "Admin" && !branch) {
        sendJson(res, 400, { ok: false, error: "Branch is required for this role." });
        return true;
      }

      if (!ALLOWED_ROLES.has(role)) {
        sendJson(res, 400, { ok: false, error: "Invalid role." });
        return true;
      }

      if (role === "Country Coordinator") {
        if (!country) {
          sendJson(res, 400, { ok: false, error: "Country is required for Country Coordinator accounts." });
          return true;
        }
        const countriesList = await readCountries();
        const allowedCountry = countriesList.some((c) => String(c).trim().toLowerCase() === country.toLowerCase());
        if (!allowedCountry) {
          sendJson(res, 400, { ok: false, error: "Please select a country from the saved list (Settings)." });
          return true;
        }
      }

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        sendJson(res, 400, { ok: false, error: "Enter a valid email." });
        return true;
      }

      const users = await readUsers();
      const studemts = await readStudemts();
      if (email === ADMIN_EMAIL || users.some((u) => normalizeEmail(u.email) === email)) {
        sendJson(res, 409, { ok: false, error: "Account email already exists." });
        return true;
      }
      if (studemts.some((s) => normalizeEmail(s.email) === email)) {
        sendJson(res, 409, { ok: false, error: "Email is already used by a student profile." });
        return true;
      }
      let linkedTeamLead = null;
      if (isCounselorRole(role) && teamLeadId) {
        linkedTeamLead = users.find(
          (u) => String(u.id || "") === teamLeadId && isTeamLeadAssignableAccountRole(u.role)
        );
        if (!linkedTeamLead) {
          sendJson(res, 400, { ok: false, error: "Selected Team Lead is invalid." });
          return true;
        }
      }

      if (role !== "Admin") {
        const savedBranches = await readBranches();
        const branchExists = savedBranches.some(
          (b) => String(b.location || "").toLowerCase() === branch.toLowerCase()
        );
        if (!branchExists) {
          sendJson(res, 400, { ok: false, error: "Please select a valid saved branch." });
          return true;
        }
      }

      let avatarPath = DEFAULT_MALE_AVATAR_PATH;
      if (avatarDataUrl) {
        const storedAvatarPath = await storeImageDataUrl(avatarDataUrl, "user-avatar");
        if (!storedAvatarPath) {
          sendJson(res, 400, { ok: false, error: "Unsupported avatar image format." });
          return true;
        }
        avatarPath = storedAvatarPath;
      }

      const account = {
        id: `USR-${crypto.randomUUID().slice(0, 8)}`,
        username,
        email,
        password,
        role,
        branch: role === "Admin" ? "" : branch,
        country: role === "Country Coordinator" ? country : "",
        phone,
        teamLeadId: isCounselorRole(role) && linkedTeamLead ? teamLeadId : "",
        teamLeadName: isCounselorRole(role) && linkedTeamLead ? teamLeadName || String(linkedTeamLead?.username || "").trim() : "",
        teamLeadEmail: isCounselorRole(role) && linkedTeamLead ? teamLeadEmail || normalizeEmail(linkedTeamLead?.email) : "",
        avatar: avatarPath,
        createdAt: new Date().toISOString(),
      };

      const updated = [...users, account];
      await writeUsers(updated);

      let emailDelivery = null;
      if (isCounselorRole(role) || isStaffWelcomeEmailRole(role)) {
        emailDelivery = { attempted: false, status: "skipped", reason: "" };
        try {
          const smtpError = getSmtpConfigError();
          if (smtpError) {
            emailDelivery = { attempted: false, status: "skipped", reason: smtpError };
          } else {
            const loginUrl = buildStudentPortalLoginUrl(req, body.portalOrigin);
            const emailCopy = isStaffWelcomeEmailRole(role) ? staffWelcomeEmailCopy(role) : null;
            await sendCounselorWelcomeEmail({
              to: email,
              counselorName: username,
              username,
              loginUrl,
              emailAddress: email,
              password,
              branch: account.branch,
              emailCopy,
            });
            emailDelivery = { attempted: true, status: "sent", reason: "" };
          }
        } catch (error) {
          console.error("Portal welcome email failed:", error);
          emailDelivery = {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send email."),
          };
        }
      }

      sendJson(res, 201, {
        ok: true,
        data: { ...sanitizeAccount(account), avatar: publicAssetUrl(req, account.avatar) },
        ...(emailDelivery ? { emailDelivery } : {}),
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/accounts/") && url.pathname.endsWith("/role")) {
    try {
      const accountId = decodeURIComponent(
        url.pathname.replace("/api/accounts/", "").replace("/role", "").trim()
      ).replace(/\/+$/, "");
      if (!accountId) {
        sendJson(res, 400, { ok: false, error: "Account ID is required." });
        return true;
      }
      if (accountId === "ADM001") {
        sendJson(res, 400, {
          ok: false,
          error: "The primary admin access level is managed in backend configuration and cannot be changed here.",
        });
        return true;
      }
      const body = await parseBody(req);
      const role = normalizeStoredRole(String(body.role || "").trim());
      const branch = String(body.branch || "").trim();
      const country = String(body.country || "").trim();

      if (!role) {
        sendJson(res, 400, { ok: false, error: "Role is required." });
        return true;
      }
      if (!ALLOWED_ROLES.has(role)) {
        sendJson(res, 400, { ok: false, error: "Invalid role." });
        return true;
      }
      if (role !== "Admin" && !branch) {
        sendJson(res, 400, { ok: false, error: "Branch is required for this role." });
        return true;
      }
      if (role === "Country Coordinator") {
        if (!country) {
          sendJson(res, 400, { ok: false, error: "Country is required for Country Coordinator accounts." });
          return true;
        }
        const countriesList = await readCountries();
        const allowedCountry = countriesList.some((c) => String(c).trim().toLowerCase() === country.toLowerCase());
        if (!allowedCountry) {
          sendJson(res, 400, { ok: false, error: "Please select a country from the saved list (Settings)." });
          return true;
        }
      }

      const users = await readUsers();
      const targetIndex = users.findIndex((u) => String(u.id || "") === accountId);
      if (targetIndex === -1) {
        sendJson(res, 404, { ok: false, error: "Account not found." });
        return true;
      }
      const target = users[targetIndex];
      if (normalizeEmail(target.email) === ADMIN_EMAIL) {
        sendJson(res, 400, {
          ok: false,
          error: "The primary admin access level cannot be changed from this screen.",
        });
        return true;
      }

      if (role !== "Admin") {
        const savedBranches = await readBranches();
        const branchExists = savedBranches.some(
          (b) => String(b.location || "").toLowerCase() === branch.toLowerCase()
        );
        if (!branchExists) {
          sendJson(res, 400, { ok: false, error: "Please select a valid saved branch." });
          return true;
        }
      }

      const keepTeamLead = isCounselorRole(role) && isCounselorRole(target.role);
      const updatedAccount = {
        ...target,
        role,
        branch: role === "Admin" ? "" : branch,
        country: role === "Country Coordinator" ? country : "",
        teamLeadId: keepTeamLead ? target.teamLeadId || "" : "",
        teamLeadName: keepTeamLead ? target.teamLeadName || "" : "",
        teamLeadEmail: keepTeamLead ? target.teamLeadEmail || "" : "",
        updatedAt: new Date().toISOString(),
      };
      const updatedUsers = [...users];
      updatedUsers[targetIndex] = updatedAccount;
      await writeUsers(updatedUsers);
      logEvent("auth", "admin changed account role", {
        accountId: updatedAccount.id,
        email: updatedAccount.email,
        previousRole: target.role,
        role: updatedAccount.role,
      });
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(updatedAccount), avatar: publicAssetUrl(req, updatedAccount.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/accounts/") && url.pathname.endsWith("/team-lead")) {
    try {
      const accountId = decodeURIComponent(url.pathname.replace("/api/accounts/", "").replace("/team-lead", "").trim()).replace(/\/+$/, "");
      if (!accountId) {
        sendJson(res, 400, { ok: false, error: "Account ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const teamLeadId = String(body.teamLeadId || "").trim();
      if (!teamLeadId) {
        sendJson(res, 400, { ok: false, error: "Team Lead is required." });
        return true;
      }

      const users = await readUsers();
      const counselorIndex = users.findIndex((u) => String(u.id || "") === accountId);
      if (counselorIndex === -1) {
        sendJson(res, 404, { ok: false, error: "Counselor account not found." });
        return true;
      }
      const counselor = users[counselorIndex];
      if (!isCounselorRole(counselor.role)) {
        sendJson(res, 400, { ok: false, error: "Team Lead can only be assigned to counselor accounts." });
        return true;
      }

      const teamLead = users.find(
        (u) => String(u.id || "") === teamLeadId && isTeamLeadAssignableAccountRole(u.role)
      );
      if (!teamLead) {
        sendJson(res, 400, { ok: false, error: "Selected Team Lead is invalid." });
        return true;
      }

      const updatedCounselor = {
        ...counselor,
        teamLeadId: teamLead.id,
        teamLeadName: String(teamLead.username || "").trim(),
        teamLeadEmail: normalizeEmail(teamLead.email),
        updatedAt: new Date().toISOString(),
      };
      const updatedUsers = [...users];
      updatedUsers[counselorIndex] = updatedCounselor;
      await writeUsers(updatedUsers);
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(updatedCounselor), avatar: publicAssetUrl(req, updatedCounselor.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/accounts/") && url.pathname.endsWith("/profile")) {
    try {
      const accountId = decodeURIComponent(
        url.pathname.replace("/api/accounts/", "").replace("/profile", "").trim()
      ).replace(/\/+$/, "");
      if (!accountId) {
        sendJson(res, 400, { ok: false, error: "Account ID is required." });
        return true;
      }
      if (accountId === "ADM001") {
        sendJson(res, 400, {
          ok: false,
          error: "The primary admin login is managed in backend configuration and cannot be edited here.",
        });
        return true;
      }
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const email = normalizeEmail(body.email);
      if (!username) {
        sendJson(res, 400, { ok: false, error: "Username is required." });
        return true;
      }
      if (!email) {
        sendJson(res, 400, { ok: false, error: "Email is required." });
        return true;
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        sendJson(res, 400, { ok: false, error: "Enter a valid email." });
        return true;
      }

      const users = await readUsers();
      const studemts = await readStudemts();
      const targetIndex = users.findIndex((u) => String(u.id || "") === accountId);
      if (targetIndex === -1) {
        sendJson(res, 404, { ok: false, error: "Account not found." });
        return true;
      }
      const target = users[targetIndex];
      if (normalizeEmail(target.email) === ADMIN_EMAIL) {
        sendJson(res, 400, {
          ok: false,
          error: "The primary admin login cannot be edited from this screen.",
        });
        return true;
      }

      const duplicateUser = users.find(
        (u, idx) => idx !== targetIndex && normalizeEmail(u.email) === email
      );
      if (duplicateUser || email === ADMIN_EMAIL) {
        sendJson(res, 409, { ok: false, error: "Account email already exists." });
        return true;
      }
      if (studemts.some((s) => normalizeEmail(s.email) === email)) {
        sendJson(res, 409, { ok: false, error: "Email is already used by a student profile." });
        return true;
      }

      const updatedAccount = {
        ...target,
        username,
        email,
        updatedAt: new Date().toISOString(),
      };
      const updatedUsers = users.map((u, idx) => {
        if (idx === targetIndex) return updatedAccount;
        if (isCounselorRole(u.role) && String(u.teamLeadId || "") === accountId) {
          return {
            ...u,
            teamLeadName: username,
            teamLeadEmail: email,
            updatedAt: new Date().toISOString(),
          };
        }
        return u;
      });
      await writeUsers(updatedUsers);
      logEvent("auth", "admin updated account profile", {
        accountId: updatedAccount.id,
        previousEmail: target.email,
        email: updatedAccount.email,
        previousUsername: target.username,
        username: updatedAccount.username,
      });
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(updatedAccount), avatar: publicAssetUrl(req, updatedAccount.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/accounts/") && url.pathname.endsWith("/reset-password")) {
    try {
      const accountId = decodeURIComponent(
        url.pathname.replace("/api/accounts/", "").replace("/reset-password", "").trim()
      ).replace(/\/+$/, "");
      if (!accountId) {
        sendJson(res, 400, { ok: false, error: "Account ID is required." });
        return true;
      }
      if (accountId === "ADM001") {
        sendJson(res, 400, {
          ok: false,
          error: "The primary admin password is managed in backend .env and cannot be reset here.",
        });
        return true;
      }
      const body = await parseBody(req);
      const newPassword = String(body.newPassword || "").trim();
      if (newPassword.length < 6) {
        sendJson(res, 400, { ok: false, error: "New password must be at least 6 characters." });
        return true;
      }
      const users = await readUsers();
      const targetIndex = users.findIndex((u) => String(u.id || "") === accountId);
      if (targetIndex === -1) {
        sendJson(res, 404, { ok: false, error: "Account not found." });
        return true;
      }
      const target = users[targetIndex];
      if (String(target.role || "") === "Admin" || normalizeEmail(target.email) === ADMIN_EMAIL) {
        sendJson(res, 400, {
          ok: false,
          error: "Admin accounts cannot have their password reset from this screen.",
        });
        return true;
      }
      const updatedAccount = {
        ...target,
        password: newPassword,
        forcePasswordChange: true,
        passwordChangedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updatedUsers = [...users];
      updatedUsers[targetIndex] = updatedAccount;
      await writeUsers(updatedUsers);
      logEvent("auth", "admin reset account password", {
        accountId: updatedAccount.id,
        email: updatedAccount.email,
        role: updatedAccount.role,
      });
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(updatedAccount), avatar: publicAssetUrl(req, updatedAccount.avatar) },
      });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to reset password." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts/admin/avatar") {
    try {
      const body = await parseBody(req);
      const avatar = String(body.avatar || "");
      if (!avatar.startsWith("data:image/")) {
        sendJson(res, 400, { ok: false, error: "Invalid image payload." });
        return true;
      }
      if (avatar.length > 4_000_000) {
        sendJson(res, 400, { ok: false, error: "Image is too large." });
        return true;
      }

      const users = await readUsers();
      const storedAvatarPath = await storeImageDataUrl(avatar, "admin-avatar");
      if (!storedAvatarPath) {
        sendJson(res, 400, { ok: false, error: "Unsupported image format." });
        return true;
      }
      const { adminRecord, others } = splitAdminRecord(users);
      const adminAccount = {
        id: "ADM001",
        username: "admin",
        email: ADMIN_EMAIL || "admin@gmail.com",
        role: "Admin",
        avatar: storedAvatarPath,
        updatedAt: new Date().toISOString(),
      };
      const nextUsers = [...others, { ...(adminRecord || {}), ...adminAccount }];
      await writeUsers(nextUsers);
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(adminAccount), avatar: publicAssetUrl(req, adminAccount.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts/avatar") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const avatar = String(body.avatar || "");
      if (!email) {
        sendJson(res, 400, { ok: false, error: "Email is required." });
        return true;
      }
      if (!avatar.startsWith("data:image/")) {
        sendJson(res, 400, { ok: false, error: "Invalid image payload." });
        return true;
      }
      if (avatar.length > 4_000_000) {
        sendJson(res, 400, { ok: false, error: "Image is too large." });
        return true;
      }
      const storedAvatarPath = await storeImageDataUrl(avatar, "user-avatar");
      if (!storedAvatarPath) {
        sendJson(res, 400, { ok: false, error: "Unsupported image format." });
        return true;
      }
      const users = await readUsers();
      const isAdminEmail = email === ADMIN_EMAIL;
      if (isAdminEmail) {
        const { adminRecord, others } = splitAdminRecord(users);
        const adminAccount = {
          id: "ADM001",
          username: "admin",
          email: ADMIN_EMAIL || "admin@gmail.com",
          role: "Admin",
          avatar: storedAvatarPath,
          updatedAt: new Date().toISOString(),
        };
        const nextUsers = [...others, { ...(adminRecord || {}), ...adminAccount }];
        await writeUsers(nextUsers);
        sendJson(res, 200, {
          ok: true,
          data: { ...sanitizeAccount(adminAccount), avatar: publicAssetUrl(req, adminAccount.avatar) },
        });
        return true;
      }
      const accountIndex = users.findIndex((u) => normalizeEmail(u.email) === email);
      if (accountIndex === -1) {
        sendJson(res, 404, { ok: false, error: "Account not found." });
        return true;
      }
      const updatedAccount = {
        ...users[accountIndex],
        avatar: storedAvatarPath,
        updatedAt: new Date().toISOString(),
      };
      const updatedUsers = [...users];
      updatedUsers[accountIndex] = updatedAccount;
      await writeUsers(updatedUsers);
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(updatedAccount), avatar: publicAssetUrl(req, updatedAccount.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts/profile-contact") {
    try {
      const body = await parseBody(req);
      const currentEmail = normalizeEmail(body.currentEmail);
      const nextEmail = normalizeEmail(body.email);
      const nextPhone = String(body.phone || "").trim();
      if (!currentEmail) {
        sendJson(res, 400, { ok: false, error: "Current email is required." });
        return true;
      }
      if (!nextEmail) {
        sendJson(res, 400, { ok: false, error: "Email is required." });
        return true;
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(nextEmail)) {
        sendJson(res, 400, { ok: false, error: "Enter a valid email." });
        return true;
      }
      const users = await readUsers();
      const accountIndex = users.findIndex((u) => normalizeEmail(u.email) === currentEmail);
      if (accountIndex === -1) {
        sendJson(res, 404, { ok: false, error: "Account not found." });
        return true;
      }
      const duplicate = users.find(
        (u, idx) => idx !== accountIndex && normalizeEmail(u.email) === nextEmail
      );
      if (duplicate) {
        sendJson(res, 409, { ok: false, error: "Account email already exists." });
        return true;
      }
      const merged = {
        ...users[accountIndex],
        email: nextEmail,
        phone: nextPhone,
        updatedAt: new Date().toISOString(),
      };
      const updatedUsers = [...users];
      updatedUsers[accountIndex] = merged;
      await writeUsers(updatedUsers);
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(merged), avatar: publicAssetUrl(req, merged.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
