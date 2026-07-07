const { readUsers } = require("../models/users");
const { normalizeEmail } = require("./roles");
const {
  getSmtpConfigError,
  sendStudentWelcomeEmail,
  buildStudentPortalLoginUrl,
} = require("./email");
const { isBranchWhatsappEnabled } = require("./branchWhatsapp");
const { deliverStudentNotificationWhatsapp } = require("./notifications");
const { buildStudentAccountDetailsWhatsappMessage } = require("./whatsappMessages");

function friendlyEmailDeliveryReason(error) {
  const msg = String(error?.message || error || "").trim();
  if (!msg) return "Failed to send email.";
  if (/535|incorrect authentication/i.test(msg)) {
    return "Email server rejected SMTP login. Check SMTP_USER and SMTP_PASS in server settings.";
  }
  if (/econnrefused|enotfound|etimedout/i.test(msg)) {
    return "Could not reach the email server. Check SMTP_HOST and SMTP_PORT.";
  }
  return msg;
}

async function formatWhatsappDeliveryReason(result) {
  const reason = String(result?.reason || "").trim();
  if (!reason) return "";
  if (reason === "WhatsApp is not connected.") {
    if (await isBranchWhatsappEnabled()) {
      return "Branch WhatsApp is not connected. Ask the branch Manager or Team Lead to connect it under Integrations.";
    }
    return "Assigned counselor's WhatsApp is not connected. Connect it under Integrations.";
  }
  if (reason.includes("No WhatsApp account is connected for this student's branch.")) {
    return "No branch WhatsApp is connected. Ask the branch Manager or Team Lead to connect it under Integrations.";
  }
  if (reason.includes("Student branch is not set or does not match")) {
    return "Set the student's branch to a configured office, then try again.";
  }
  return reason;
}

/**
 * Send student portal login via email and WhatsApp (counselor's connected WhatsApp).
 * @returns {{ email: object, whatsapp: object }}
 */
async function sendStudentPortalAccountDetails({ req, student, studentId }) {
  const emailAddress = normalizeEmail(student.email);
  const password = String(student.password || "");
  const studentName = String(student.name || "").trim();
  const loginUrl = buildStudentPortalLoginUrl(req);

  const delivery = {
    email: { attempted: false, status: "skipped", reason: "" },
    whatsapp: { attempted: false, status: "skipped", reason: "" },
  };

  try {
    const smtpError = getSmtpConfigError();
    if (smtpError) {
      delivery.email = { attempted: false, status: "skipped", reason: smtpError };
    } else if (!emailAddress || !password) {
      delivery.email = {
        attempted: false,
        status: "skipped",
        reason: "Missing student email or password.",
      };
    } else {
      const users = await readUsers();
      const counselorId = String(student.inquiryCounselorId || student.counselor || "").trim();
      const counselorUser = users.find((u) => String(u.id || "") === counselorId);
      const counselorNameForEmail =
        String(student.counselorName || "").trim() ||
        (counselorUser
          ? String(counselorUser.username || "").trim() || normalizeEmail(counselorUser.email)
          : "") ||
        "Not assigned yet";
      await sendStudentWelcomeEmail({
        to: emailAddress,
        studentName: studentName || emailAddress,
        loginUrl,
        emailAddress,
        password,
        counselorName: counselorNameForEmail,
      });
      delivery.email = { attempted: true, status: "sent", reason: "" };
    }
  } catch (error) {
    console.error("Student account details email failed:", error);
    delivery.email = {
      attempted: true,
      status: "failed",
      reason: friendlyEmailDeliveryReason(error),
    };
  }

  try {
    const inquiryCounselorId = String(student.inquiryCounselorId || "").trim();
    const counselorId = inquiryCounselorId || String(student.counselor || "").trim();
    const message = buildStudentAccountDetailsWhatsappMessage({
      studentName: studentName || emailAddress,
      emailAddress,
      password,
      loginUrl,
    });
    const result = await deliverStudentNotificationWhatsapp({
      student,
      studentId,
      content: message,
      preferredSenderIds: [counselorId],
      persistToChat: true,
    });
    if (result && result.attempted) {
      delivery.whatsapp = {
        attempted: true,
        status: result.status || "failed",
        reason:
          result.status === "sent"
            ? ""
            : await formatWhatsappDeliveryReason(result),
      };
    } else {
      delivery.whatsapp = {
        attempted: false,
        status: "skipped",
        reason: (await formatWhatsappDeliveryReason(result)) || "Not attempted.",
      };
    }
  } catch (error) {
    console.error("Student account details WhatsApp failed:", error);
    delivery.whatsapp = {
      attempted: true,
      status: "failed",
      reason: String(error?.message || "Failed to send WhatsApp message."),
    };
  }

  return delivery;
}

module.exports = { sendStudentPortalAccountDetails };
