const nodemailer = require("nodemailer");
const {
  COMPANY_NAME,
  COMPANY_NAME_NBSP,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  APP_PUBLIC_URL,
  STUDENT_SIGN_IN_PATH,
} = require("../config");
const { logEvent } = require("../lib/logger");

function escapeHtmlEmail(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getSmtpConfigError() {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    return "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS in backend .env.";
  }
  return "";
}

function buildForgotPasswordEmailHtml({ otpCode }) {
  const safe = escapeHtmlEmail(otpCode);
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Password reset</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Your ${COMPANY_NAME} verification code is ${safe}. Valid for 10 minutes.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;">
          <tr>
            <td bgcolor="#4f46e5" style="background-color:#4f46e5;background:linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#7c3aed 100%);border-radius:12px 12px 0 0;height:4px;line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;overflow:hidden;box-shadow:0 22px 50px rgba(15,23,42,0.06);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:40px 40px 28px;text-align:center;">
                    <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#6366f1;">
                      ${COMPANY_NAME}
                    </p>
                    <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:600;color:#0f172a;letter-spacing:-0.02em;">
                      Secure password reset
                    </h1>
                    <p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#64748b;">
                      Use this one-time code to verify it's you and create a new password. This code expires in&nbsp;<strong style="color:#334155;font-weight:600;">10 minutes</strong>.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 32px;text-align:center;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" bgcolor="#f8fafc" style="margin:0 auto;background-color:#f8fafc;background:linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%);border:1px solid #e2e8f0;border-radius:12px;">
                      <tr>
                        <td style="padding:22px 36px;font-family:'SF Mono',ui-monospace,Menlo,Monaco,'Cascadia Mono',Consolas,monospace;font-size:34px;line-height:1;font-weight:700;letter-spacing:0.42em;color:#312e81;text-align:center;">
                          ${safe}
                        </td>
                      </tr>
                    </table>
                    <p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;">
                      For your security, never share this code. ${COMPANY_NAME_NBSP} will never ask you for it by phone or chat.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 36px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #f1f5f9;">
                      <tr>
                        <td style="padding-top:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.6;color:#64748b;">
                          <strong style="color:#475569;display:block;margin-bottom:6px;font-size:13px;font-weight:600;">Didn't request this?</strong>
                          You can safely ignore this message. Your password won't change until you enter this code on the reset page.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 8px 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;color:#94a3b8;">
              This email was sent automatically for account security.&nbsp;<br/>
              © ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendForgotPasswordOtpEmail({ email, otpCode }) {
  const textBody =
    [
      `${COMPANY_NAME} — password reset`,
      "",
      `Your verification code is: ${otpCode}`,
      "",
      "This code expires in 10 minutes. Do not share it with anyone.",
      "",
      "If you didn't request this, you can ignore this email.",
      "",
      `© ${new Date().getFullYear()} ${COMPANY_NAME}`,
    ].join("\n");

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  const message = {
    from: SMTP_FROM,
    to: email,
    subject: `Your ${COMPANY_NAME} verification code`,
    text: textBody,
    html: buildForgotPasswordEmailHtml({ otpCode }),
  };
  try {
    await transporter.sendMail(message);
    logEvent("email", "forgot-password otp sent", { to: email });
  } catch (error) {
    // Some SMTP providers reject custom FROM if it doesn't match authenticated mailbox.
    // Retry once with SMTP_USER as sender to satisfy sender verification checks.
    const shouldRetryWithAuthSender =
      error &&
      (error.code === "EENVELOPE" || error.responseCode === 550) &&
      String(SMTP_USER || "").trim();
    if (!shouldRetryWithAuthSender) throw error;
    await transporter.sendMail({
      ...message,
      from: SMTP_USER,
      replyTo: SMTP_FROM || SMTP_USER,
    });
    logEvent("email", "forgot-password otp sent (fallback sender)", { to: email, from: SMTP_USER });
  }
}

function buildStudentWelcomeEmailHtml({ studentName, loginUrl, emailAddress, password, counselorName }) {
  const safeName = escapeHtmlEmail(studentName);
  const safeEmail = escapeHtmlEmail(emailAddress);
  const safePass = escapeHtmlEmail(password);
  const safeCounselor = escapeHtmlEmail(counselorName);
  const safeLogin = escapeHtmlEmail(loginUrl);
  const counselorBlock =
    counselorName && counselorName.trim() !== "Not assigned yet"
      ? `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.55;color:#334155;"><strong style="color:#0f172a;">Assigned counselor</strong><br/><span style="font-size:15px;color:#4338ca;font-weight:600;">${safeCounselor}</span></p>`
      : `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.55;color:#64748b;">Your counselor will be confirmed shortly—you can still sign in below.</p>`;
  const ctaBlock = loginUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;"><tr><td bgcolor="#4f46e5" style="border-radius:10px;background-color:#4f46e5;background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);"><a href="${safeLogin}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Open student portal</a></td></tr></table><p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;"><a href="${safeLogin}" style="color:#6366f1;text-decoration:none;">${safeLogin}</a></p>`
    : `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.6;color:#64748b;">Use the student portal URL provided by your branch. (Set <strong style="font-weight:600;color:#475569;">APP_PUBLIC_URL</strong> on the server to include a clickable link automatically.)</p>`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>Student portal access</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Your ${COMPANY_NAME} student portal login is ready. Sign in with ${safeEmail}.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;">
          <tr>
            <td bgcolor="#4f46e5" style="background-color:#4f46e5;background:linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#7c3aed 100%);border-radius:12px 12px 0 0;height:4px;line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;overflow:hidden;box-shadow:0 22px 50px rgba(15,23,42,0.06);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:40px 40px 24px;text-align:center;">
                    <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#6366f1;">${COMPANY_NAME}</p>
                    <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:600;color:#0f172a;letter-spacing:-0.02em;">Welcome to your student portal</h1>
                    <p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#64748b;">
                      Hi <strong style="color:#334155;">${safeName}</strong>, your account is ready. Use the credentials below to sign in and track your journey with us.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                      <tr>
                        <td style="padding:24px 28px;">
                          <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#64748b;">Sign-in details</p>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#64748b;width:120px;">Email</td>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:13px;font-weight:600;color:#312e81;word-break:break-all;">${safeEmail}</td>
                            </tr>
                            <tr>
                              <td style="padding:10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#64748b;">Password</td>
                              <td style="padding:10px 0;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:13px;font-weight:600;color:#312e81;word-break:break-all;">${safePass}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 28px;text-align:center;">
                    ${ctaBlock}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 28px;text-align:center;border-top:1px solid #f1f5f9;">
                    ${counselorBlock}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 36px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #f1f5f9;">
                      <tr>
                        <td style="padding-top:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.65;color:#64748b;">
                          <strong style="color:#475569;display:block;margin-bottom:6px;font-size:13px;font-weight:600;">Security</strong>
                          For your protection, please change your password after your first sign-in (<strong>Forgot password</strong> is available if needed). Do not forward this message or share your password.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 8px 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;color:#94a3b8;">
              This email was generated when your profile was added to ${COMPANY_NAME_NBSP}.<br/>
              © ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendStudentWelcomeEmail({ to, studentName, loginUrl, emailAddress, password, counselorName }) {
  const textLines = [
    `${COMPANY_NAME} — student portal access`,
    "",
    `Hi ${studentName},`,
    "",
    "Your account is ready. Sign in using:",
    `- Email: ${emailAddress}`,
    `- Password: ${password}`,
    loginUrl ? `- Portal: ${loginUrl}` : `- Portal: (use the URL provided by your branch)`,
    "",
    counselorName && counselorName.trim() !== "Not assigned yet" ? `Assigned counselor: ${counselorName}` : "Counselor: to be confirmed shortly.",
    "",
    "Change your password after first sign-in. Do not share this email.",
    "",
    `© ${new Date().getFullYear()} ${COMPANY_NAME}`,
  ];
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  const message = {
    from: SMTP_FROM,
    to,
    subject: `Welcome to ${COMPANY_NAME} — your student portal login`,
    text: textLines.join("\n"),
    html: buildStudentWelcomeEmailHtml({
      studentName,
      loginUrl,
      emailAddress,
      password,
      counselorName,
    }),
  };
  try {
    await transporter.sendMail(message);
    logEvent("email", "student welcome email sent", { to });
  } catch (error) {
    const shouldRetryWithAuthSender =
      error &&
      (error.code === "EENVELOPE" || error.responseCode === 550) &&
      String(SMTP_USER || "").trim();
    if (!shouldRetryWithAuthSender) throw error;
    await transporter.sendMail({
      ...message,
      from: SMTP_USER,
      replyTo: SMTP_FROM || SMTP_USER,
    });
    logEvent("email", "student welcome email sent (fallback sender)", { to, from: SMTP_USER });
  }
}

function buildCounselorWelcomeEmailHtml({ counselorName, username, loginUrl, emailAddress, password, branch, emailCopy = null }) {
  const safeName = escapeHtmlEmail(counselorName);
  const safeUsername = escapeHtmlEmail(username);
  const safeEmail = escapeHtmlEmail(emailAddress);
  const safePass = escapeHtmlEmail(password);
  const safeBranch = escapeHtmlEmail(branch);
  const safeLogin = escapeHtmlEmail(loginUrl);
  const safeRolePhrase = escapeHtmlEmail(emailCopy?.rolePhrase || "counselor");
  const safePageTitle = escapeHtmlEmail(emailCopy?.pageTitle || "Counselor portal access");
  const safeHeadline = escapeHtmlEmail(emailCopy?.headline || "Welcome to your counselor account");
  const branchBlock = branch
    ? `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#64748b;width:120px;">Branch</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:600;color:#312e81;">${safeBranch}</td></tr>`
    : "";
  const ctaBlock = loginUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;"><tr><td bgcolor="#4f46e5" style="border-radius:10px;background-color:#4f46e5;background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);"><a href="${safeLogin}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Open portal</a></td></tr></table><p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;"><a href="${safeLogin}" style="color:#6366f1;text-decoration:none;">${safeLogin}</a></p>`
    : `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.6;color:#64748b;">Use the portal URL provided by your branch. (Set <strong style="font-weight:600;color:#475569;">APP_PUBLIC_URL</strong> on the server to include a clickable link automatically.)</p>`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>${safePageTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Your ${COMPANY_NAME} ${safeRolePhrase} account is ready. Sign in with ${safeEmail}.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;">
          <tr>
            <td bgcolor="#4f46e5" style="background-color:#4f46e5;background:linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#7c3aed 100%);border-radius:12px 12px 0 0;height:4px;line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;overflow:hidden;box-shadow:0 22px 50px rgba(15,23,42,0.06);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:40px 40px 24px;text-align:center;">
                    <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#6366f1;">${COMPANY_NAME}</p>
                    <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:600;color:#0f172a;letter-spacing:-0.02em;">${safeHeadline}</h1>
                    <p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#64748b;">
                      Hi <strong style="color:#334155;">${safeName}</strong>, your account has been created. Use the credentials below to sign in to the portal.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                      <tr>
                        <td style="padding:24px 28px;">
                          <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#64748b;">Sign-in details</p>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#64748b;width:120px;">Username</td>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:13px;font-weight:600;color:#312e81;word-break:break-all;">${safeUsername}</td>
                            </tr>
                            <tr>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#64748b;">Email</td>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:13px;font-weight:600;color:#312e81;word-break:break-all;">${safeEmail}</td>
                            </tr>
                            <tr>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#64748b;">Password</td>
                              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:13px;font-weight:600;color:#312e81;word-break:break-all;">${safePass}</td>
                            </tr>
                            ${branchBlock}
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 28px;text-align:center;">
                    ${ctaBlock}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 36px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #f1f5f9;">
                      <tr>
                        <td style="padding-top:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.65;color:#64748b;">
                          <strong style="color:#475569;display:block;margin-bottom:6px;font-size:13px;font-weight:600;">Security</strong>
                          For your protection, please change your password after your first sign-in (<strong>Forgot password</strong> is available if needed). Do not forward this message or share your password.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 8px 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;color:#94a3b8;">
              This email was generated when your ${safeRolePhrase} account was created on ${COMPANY_NAME_NBSP}.<br/>
              © ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendCounselorWelcomeEmail({ to, counselorName, username, loginUrl, emailAddress, password, branch, emailCopy = null }) {
  const textLines = [
    emailCopy?.tagline || `${COMPANY_NAME} — counselor portal access`,
    "",
    `Hi ${counselorName || username || (emailCopy ? "there" : "Counselor")},`,
    "",
    "Your account is ready. Sign in using:",
    `- Username: ${username}`,
    `- Email: ${emailAddress}`,
    `- Password: ${password}`,
    loginUrl ? `- Portal: ${loginUrl}` : `- Portal: (use the URL provided by your branch)`,
    branch ? `- Branch: ${branch}` : "",
    "",
    "Change your password after first sign-in. Do not share this email.",
    "",
    `© ${new Date().getFullYear()} ${COMPANY_NAME}`,
  ].filter(Boolean);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  const message = {
    from: SMTP_FROM,
    to,
    subject: emailCopy?.subject || `Welcome to ${COMPANY_NAME} — your counselor account`,
    text: textLines.join("\n"),
    html: buildCounselorWelcomeEmailHtml({
      counselorName: counselorName || username,
      username,
      loginUrl,
      emailAddress,
      password,
      branch,
      emailCopy,
    }),
  };
  const welcomeLogLabel = emailCopy ? "staff welcome email sent" : "counselor welcome email sent";
  try {
    await transporter.sendMail(message);
    logEvent("email", welcomeLogLabel, { to });
  } catch (error) {
    const shouldRetryWithAuthSender =
      error &&
      (error.code === "EENVELOPE" || error.responseCode === 550) &&
      String(SMTP_USER || "").trim();
    if (!shouldRetryWithAuthSender) throw error;
    await transporter.sendMail({
      ...message,
      from: SMTP_USER,
      replyTo: SMTP_FROM || SMTP_USER,
    });
    logEvent("email", `${welcomeLogLabel} (fallback sender)`, { to, from: SMTP_USER });
  }
}

function normalizePublicBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (!parsed.hostname) return "";
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function resolveRequestPublicBaseUrl(req) {
  if (!req || !req.headers) return "";
  const headers = req.headers || {};

  const origin = normalizePublicBaseUrl(Array.isArray(headers.origin) ? headers.origin[0] : headers.origin);
  if (origin) return origin;

  const referer = String(Array.isArray(headers.referer) ? headers.referer[0] : headers.referer || "").trim();
  const fromReferer = normalizePublicBaseUrl(referer);
  if (fromReferer) return fromReferer;

  const forwardedProtoRaw = headers["x-forwarded-proto"];
  const forwardedHostRaw = headers["x-forwarded-host"];
  const hostRaw = headers.host;
  const proto = String(Array.isArray(forwardedProtoRaw) ? forwardedProtoRaw[0] : forwardedProtoRaw || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const host = String(Array.isArray(forwardedHostRaw) ? forwardedHostRaw[0] : forwardedHostRaw || hostRaw || "")
    .split(",")[0]
    .trim();
  if (!host) return "";
  const protocol = proto === "https" || proto === "http" ? proto : "http";
  return `${protocol}://${host}`;
}

function buildStudentPortalLoginUrl(req, portalOriginOverride = "") {
  const base = (
    APP_PUBLIC_URL ||
    normalizePublicBaseUrl(portalOriginOverride) ||
    resolveRequestPublicBaseUrl(req) ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
  if (!base) return "";
  const loginPath = STUDENT_SIGN_IN_PATH.startsWith("/") ? STUDENT_SIGN_IN_PATH : `/${STUDENT_SIGN_IN_PATH}`;
  return `${base}${loginPath}`;
}

module.exports = {
  escapeHtmlEmail,
  createOtpCode,
  getSmtpConfigError,
  buildForgotPasswordEmailHtml,
  sendForgotPasswordOtpEmail,
  buildStudentWelcomeEmailHtml,
  sendStudentWelcomeEmail,
  buildCounselorWelcomeEmailHtml,
  sendCounselorWelcomeEmail,
  normalizePublicBaseUrl,
  resolveRequestPublicBaseUrl,
  buildStudentPortalLoginUrl,
};
