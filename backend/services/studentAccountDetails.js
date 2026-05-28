const { readUsers } = require("../models/users");
const { normalizeEmail } = require("./roles");
const {
  getSmtpConfigError,
  sendStudentWelcomeEmail,
  buildStudentPortalLoginUrl,
} = require("./email");
const {
  deliverCounselorMessageToStudentWhatsapp,
  buildStudentAccountDetailsWhatsappMessage,
} = require("./whatsapp");

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
      reason: String(error?.message || "Failed to send email."),
    };
  }

  try {
    const inquiryCounselorId = String(student.inquiryCounselorId || "").trim();
    const counselorId = inquiryCounselorId || String(student.counselor || "").trim();
    if (!counselorId || counselorId === "Unassigned") {
      delivery.whatsapp = {
        attempted: false,
        status: "skipped",
        reason: "Student has no assigned counselor.",
      };
    } else {
      const message = buildStudentAccountDetailsWhatsappMessage({
        studentName: studentName || emailAddress,
        emailAddress,
        password,
        loginUrl,
      });
      const result = await deliverCounselorMessageToStudentWhatsapp({
        senderId: counselorId,
        receiverId: studentId,
        content: message,
      });
      if (result && result.attempted) {
        delivery.whatsapp = {
          attempted: true,
          status: result.status || "failed",
          reason: result.reason || "",
        };
      } else {
        delivery.whatsapp = {
          attempted: false,
          status: "skipped",
          reason: result?.reason || "Not attempted.",
        };
      }
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
