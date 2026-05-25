const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_DISPLAY_NAME,
  DEFAULT_MALE_AVATAR_PATH,
  forgotPasswordOtps,
  FORGOT_PASSWORD_OTP_TTL_MS,
} = require("../config");
const { readUsers } = require("../models/users");
const { readStudemts, writeStudemts, publicAssetUrl } = require("../models/students");
const { sanitizeAccount, findResettableUserByEmail, writeUsers } = require("../models/users");
const {
  normalizeEmail,
  normalizeLoginRole,
  normalizeStoredRole,
} = require("../services/roles");
const {
  getSmtpConfigError,
  createOtpCode,
  sendForgotPasswordOtpEmail,
} = require("../services/email");

async function handle(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");

      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        sendJson(res, 500, {
          ok: false,
          error: "Server is not configured with admin credentials.",
        });
        return true;
      }

      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        sendJson(res, 200, {
          ok: true,
          user: {
            id: "ADM001",
            username: ADMIN_DISPLAY_NAME,
            name: ADMIN_DISPLAY_NAME,
            email: ADMIN_EMAIL,
            role: "Admin",
          },
        });
        return true;
      }

      const users = await readUsers();
      const matchedUser = users.find((u) => normalizeEmail(u.email) === email && String(u.password || "") === password);
      if (matchedUser) {
        sendJson(res, 200, {
          ok: true,
          user: {
            id: matchedUser.id,
            username: matchedUser.username || "",
            email: matchedUser.email,
            role: normalizeLoginRole(matchedUser.role),
            branch: matchedUser.branch || null,
            country: matchedUser.country || null,
          },
        });
        return true;
      }

      const studemts = await readStudemts();
      const matchedStudent = studemts.find(
        (s) => normalizeEmail(s.email) === email && String(s.password || "") === password
      );
      if (matchedStudent) {
        sendJson(res, 200, {
          ok: true,
          user: {
            id: matchedStudent.id,
            username: matchedStudent.name || "",
            email: matchedStudent.email,
            role: "Student",
            branch: matchedStudent.branch || null,
            mustChangePassword: matchedStudent.forcePasswordChange === true,
          },
        });
        return true;
      }

      sendJson(res, 401, { ok: false, error: "Invalid email or password." });
    } catch (e) {
      const message = String(e?.message || "");
      if (message === "Invalid JSON") {
        sendJson(res, 400, { ok: false, error: "Invalid request body. Send JSON with email and password." });
        return true;
      }
      logEvent("auth", "Login handler error", { message: message || String(e) });
      sendJson(res, 500, { ok: false, error: "Login failed due to a server error. Check backend data files." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/forgot-password/request") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      if (!email) {
        sendJson(res, 400, { ok: false, error: "Email is required." });
        return true;
      }
      if (email === ADMIN_EMAIL) {
        sendJson(res, 400, {
          ok: false,
          error: "Admin password reset is not supported here because admin credentials are managed in backend .env.",
        });
        return true;
      }

      const smtpError = getSmtpConfigError();
      if (smtpError) {
        sendJson(res, 500, { ok: false, error: smtpError });
        return true;
      }

      const matched = await findResettableUserByEmail(email);
      if (!matched) {
        sendJson(res, 200, { ok: true, message: "If the account exists, an OTP has been sent." });
        return true;
      }

      const otpCode = createOtpCode();
      forgotPasswordOtps.set(email, {
        otpCode,
        expiresAt: Date.now() + FORGOT_PASSWORD_OTP_TTL_MS,
      });
      await sendForgotPasswordOtpEmail({ email, otpCode });

      sendJson(res, 200, { ok: true, message: "OTP has been sent to your registered email." });
    } catch (error) {
      console.error("Forgot-password OTP send failed:", error);
      sendJson(res, 500, { ok: false, error: "Failed to send OTP email." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/forgot-password/verify") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const otp = String(body.otp || "").trim();
      const newPassword = String(body.newPassword || "").trim();
      if (!email || !otp || !newPassword) {
        sendJson(res, 400, { ok: false, error: "Email, OTP, and new password are required." });
        return true;
      }
      if (newPassword.length < 6) {
        sendJson(res, 400, { ok: false, error: "New password must be at least 6 characters." });
        return true;
      }
      if (email === ADMIN_EMAIL) {
        sendJson(res, 400, {
          ok: false,
          error: "Admin password reset is not supported here because admin credentials are managed in backend .env.",
        });
        return true;
      }

      const storedOtp = forgotPasswordOtps.get(email);
      if (!storedOtp || storedOtp.expiresAt < Date.now() || storedOtp.otpCode !== otp) {
        sendJson(res, 400, { ok: false, error: "Invalid or expired OTP." });
        return true;
      }

      const matched = await findResettableUserByEmail(email);
      if (!matched) {
        forgotPasswordOtps.delete(email);
        sendJson(res, 404, { ok: false, error: "Account not found." });
        return true;
      }

      const updatedList = [...matched.list];
      updatedList[matched.index] = {
        ...updatedList[matched.index],
        password: newPassword,
        updatedAt: new Date().toISOString(),
        forcePasswordChange: false,
        passwordChangedAt: new Date().toISOString(),
      };
      if (matched.kind === "user") {
        await writeUsers(updatedList);
      } else {
        await writeStudemts(updatedList);
      }
      forgotPasswordOtps.delete(email);
      sendJson(res, 200, { ok: true, message: "Password reset successful." });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to reset password." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/student/change-default-password") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "").trim();
      if (!email || !currentPassword || !newPassword) {
        sendJson(res, 400, { ok: false, error: "Email, current password, and new password are required." });
        return true;
      }
      if (newPassword.length < 6) {
        sendJson(res, 400, { ok: false, error: "New password must be at least 6 characters." });
        return true;
      }
      if (newPassword === currentPassword) {
        sendJson(res, 400, { ok: false, error: "New password must be different from current password." });
        return true;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => normalizeEmail(s.email) === email);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student account not found." });
        return true;
      }
      if (String(studemts[idx].password || "") !== currentPassword) {
        sendJson(res, 401, { ok: false, error: "Current password is incorrect." });
        return true;
      }
      const updated = [...studemts];
      updated[idx] = {
        ...updated[idx],
        password: newPassword,
        forcePasswordChange: false,
        passwordChangedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await writeStudemts(updated);
      sendJson(res, 200, { ok: true, message: "Password updated successfully." });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
