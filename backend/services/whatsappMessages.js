const { COMPANY_NAME } = require("../config");

const PAYMENT_NOT_REFUNDABLE_NOTICE = "Payment is not refundable.";

function buildStudentAccountDetailsWhatsappMessage({ studentName, emailAddress, password, loginUrl }) {
  const lines = [
    `${COMPANY_NAME} — your student portal login`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "Your account is ready. Sign in using:",
    `Email: ${emailAddress || ""}`,
    `Password: ${password || ""}`,
    loginUrl ? `Portal: ${loginUrl}` : "",
    "",
    "Please change your password after first sign-in.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildAppointmentLinkWhatsappMessage({ studentName, title, date, time, meetingLink, meetingPlatform }) {
  const platform = String(meetingPlatform || "").trim();
  const link = String(meetingLink || "").trim();
  const lines = [
    `${COMPANY_NAME} — Meeting Details`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "Your meeting has been scheduled/updated:",
    `Title: ${title || "Session"}`,
    `Date: ${date || ""}`,
    `Time: ${time || ""}`,
    platform ? `Platform: ${platform}` : "",
    link ? `Meeting Link: ${link}` : "",
    "",
    "Please join on time.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildCounselorAssignmentWhatsappMessage({ studentName, counselorName, counselorEmail, counselorPhone, counselorBranch }) {
  const lines = [
    `${COMPANY_NAME} — New Counselor Assigned`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "A new counselor has been assigned to assist you with your application process.",
    "",
    "Counselor details:",
    `Name: ${counselorName || ""}`,
    counselorEmail ? `Email: ${counselorEmail}` : "",
    counselorPhone ? `Phone: ${counselorPhone}` : "",
    counselorBranch ? `Branch: ${counselorBranch}` : "",
    "",
    "Feel free to reach out to your counselor for any questions or support.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildMeetingReminderWhatsappMessage({ studentName, title, date, time, meetingLink, meetingPlatform }) {
  const platform = String(meetingPlatform || "").trim();
  const link = String(meetingLink || "").trim();
  const lines = [
    `${COMPANY_NAME} — Meeting Reminder`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "Your meeting starts in about 15 minutes:",
    `Title: ${title || "Session"}`,
    `Date: ${date || ""}`,
    `Time: ${time || ""}`,
    platform ? `Platform: ${platform}` : "",
    link ? `Meeting Link: ${link}` : "",
    "",
    "Please be ready to join on time.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildInquiryCallScheduledWhatsappMessage({ studentName, scheduledLabel, isReschedule = false }) {
  const action = isReschedule ? "rescheduled" : "scheduled";
  const lines = [
    `${COMPANY_NAME} — Inquiry Call ${isReschedule ? "Rescheduled" : "Scheduled"}`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    `Your inquiry call with your counselor has been ${action}.`,
    scheduledLabel ? `Date & time: ${scheduledLabel}` : "",
    "",
    "Please be available at the scheduled time. Your counselor will call you.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildInquiryCallReminderWhatsappMessage({ studentName, scheduledLabel }) {
  const lines = [
    `${COMPANY_NAME} — Inquiry Call Reminder`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "Your inquiry call with your counselor starts in about 15 minutes.",
    scheduledLabel ? `Scheduled for: ${scheduledLabel}` : "",
    "",
    "Please be ready — your counselor will call you shortly.",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatPaymentAccountForMessage(paymentAccount) {
  if (!paymentAccount || typeof paymentAccount !== "object") return [];
  const lines = ["Payment details:"];
  if (paymentAccount.label) lines.push(`Account: ${paymentAccount.label}`);
  if (paymentAccount.bankName) lines.push(`Bank: ${paymentAccount.bankName}`);
  if (paymentAccount.accountName) lines.push(`Account name: ${paymentAccount.accountName}`);
  if (paymentAccount.accountNumber) lines.push(`Account number: ${paymentAccount.accountNumber}`);
  if (paymentAccount.branch) lines.push(`Branch: ${paymentAccount.branch}`);
  if (paymentAccount.currency) lines.push(`Currency: ${paymentAccount.currency}`);
  if (paymentAccount.notes) lines.push(`Notes: ${paymentAccount.notes}`);
  return lines;
}

function buildInvoiceWhatsappMessage({
  studentName,
  invoiceId,
  currency,
  amount,
  description,
  issueDate,
  dueDate,
  paymentAccount,
  attachmentLink,
  attachmentFileUrl,
  attachmentFileName,
  generatedReceiptUrl,
}) {
  const lines = [
    `${COMPANY_NAME} - Invoice Generated`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "A new invoice has been generated for your application.",
    `Invoice ID: ${invoiceId || ""}`,
    `Amount: ${currency || "LKR"} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    issueDate ? `Issue Date: ${issueDate}` : "",
    `Due Date: ${dueDate || ""}`,
    description ? `Description: ${description}` : "",
    "",
    ...formatPaymentAccountForMessage(paymentAccount),
    paymentAccount ? "" : null,
    attachmentLink ? `Reference link: ${attachmentLink}` : "",
    attachmentFileUrl
      ? `Attached document${attachmentFileName ? ` (${attachmentFileName})` : ""}: ${attachmentFileUrl}`
      : "",
    generatedReceiptUrl ? `Invoice image: ${generatedReceiptUrl}` : "",
    "",
    PAYMENT_NOT_REFUNDABLE_NOTICE,
    "",
    "Please complete the payment before the due date. You can also view full details in your student portal under Finance.",
  ].filter((line) => line !== null && line !== undefined && String(line).trim() !== "");
  return lines.join("\n");
}

function buildInvoicePaymentDecisionWhatsappMessage({
  studentName,
  invoiceId,
  currency,
  amount,
  description,
  decision,
  rejectionReason,
}) {
  const amountLabel = `${currency || "LKR"} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const invoiceLabel = invoiceId ? `Invoice ${invoiceId}` : "your invoice";
  if (decision === "approved") {
    const lines = [
      `${COMPANY_NAME} — Invoice payment update`,
      "",
      `Hi ${studentName || "Student"},`,
      "",
      "Good news: your payment evidence has been approved.",
      invoiceLabel,
      `Amount: ${amountLabel}`,
      description ? `Description: ${description}` : "",
      "",
      "Your invoice is now marked as paid. Log in to your student portal to review your finance records.",
    ].filter(Boolean);
    return lines.join("\n");
  }
  const lines = [
    `${COMPANY_NAME} — Invoice payment update`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "Your payment evidence could not be approved and needs to be re-uploaded.",
    invoiceLabel,
    `Amount: ${amountLabel}`,
    description ? `Description: ${description}` : "",
    rejectionReason ? `Reason: ${rejectionReason}` : "",
    "",
    "Please sign in to the student portal, review the feedback, and upload corrected payment evidence.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildDocumentUploadWhatsappMessage({ studentName, docName, docType, fileName }) {
  const typeLabel = String(docType || docName || "Document").trim();
  const friendlyDoc =
    docName && docName !== docType ? `${String(docName).trim()} (${typeLabel})` : typeLabel;
  const lines = [
    `${COMPANY_NAME} — Document shared`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "Your counselor has uploaded a document for you.",
    `Document: ${friendlyDoc}`,
    fileName ? `File: ${String(fileName).trim()}` : "",
    "",
    "Log in to your student portal to review your documents.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildDocumentDecisionWhatsappMessage({ studentName, docName, docType, decision, rejectionReason }) {
  const friendlyDoc = docType ? `${docName} (${docType})` : docName;
  if (decision === "verified") {
    const lines = [
      `${COMPANY_NAME} — Document update`,
      "",
      `Hi ${studentName || "Student"},`,
      "",
      "Good news: your document has been approved (verified).",
      `Document: ${friendlyDoc}`,
      "",
      "Log in to your student portal to review your checklist.",
    ];
    return lines.join("\n");
  }
  const lines = [
    `${COMPANY_NAME} — Document update`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "Your document could not be approved and needs to be re-uploaded.",
    `Document: ${friendlyDoc}`,
    rejectionReason ? `Reason: ${rejectionReason}` : "",
    "",
    "Please sign in to the student portal, review the feedback, and upload a corrected file.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildUniversityOfferWhatsappMessage({ studentName, fileName, offerStatus, letterCount = 1 }) {
  const friendlyFile = String(fileName || "University offer letter").trim();
  const countNote =
    letterCount > 1 ? ` (${letterCount} offer letters uploaded — this message refers to "${friendlyFile}".)` : "";
  if (offerStatus === "Unconditional" || offerStatus === "Approved") {
    const lines = [
      `${COMPANY_NAME} — University offer update`,
      "",
      `Hi ${studentName || "Student"},`,
      "",
      "Congratulations! Your university application has received an unconditional offer.",
      `Offer letter: ${friendlyFile}${countNote}`,
      "",
      "Your counselor has shared the offer letter with you. Log in to your student portal to review all details.",
    ];
    return lines.join("\n");
  }
  if (offerStatus === "Conditional") {
    const lines = [
      `${COMPANY_NAME} — University offer update`,
      "",
      `Hi ${studentName || "Student"},`,
      "",
      "Your university application has received a conditional offer.",
      `Offer letter: ${friendlyFile}${countNote}`,
      "",
      "Please review the conditions in the attached letter and contact your counselor if you have questions.",
    ];
    return lines.join("\n");
  }
  const lines = [
    `${COMPANY_NAME} — University offer update`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "We need to inform you that your university application was not successful at this time.",
    `Reference: ${friendlyFile}${countNote}`,
    "",
    "Your counselor will discuss next steps with you. Please sign in to the student portal or reply on WhatsApp.",
  ];
  return lines.join("\n");
}

function buildStudentDetailChangeDecisionWhatsappMessage({
  studentName,
  decision,
  reviewNote,
  changedFields = [],
}) {
  const fieldsLabel =
    changedFields.length > 0 ? changedFields.map((f) => String(f || "").trim()).filter(Boolean).join(", ") : "";
  if (decision === "approved") {
    const lines = [
      `${COMPANY_NAME} — Profile update approved`,
      "",
      `Hi ${studentName || "Student"},`,
      "",
      "Your request to update your student profile details has been approved.",
      fieldsLabel ? `Updated: ${fieldsLabel}` : "",
      "",
      "Sign in to your student portal to review your profile.",
    ].filter(Boolean);
    return lines.join("\n");
  }
  const lines = [
    `${COMPANY_NAME} — Profile update declined`,
    "",
    `Hi ${studentName || "Student"},`,
    "",
    "Your request to update your student profile details could not be approved.",
    fieldsLabel ? `Requested changes: ${fieldsLabel}` : "",
    reviewNote ? `Note: ${reviewNote}` : "",
    "",
    "Please sign in to the student portal or contact your counselor if you have questions.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildCounselorInvoiceDecisionPortalMessage({
  studentName,
  invoiceId,
  currency,
  amount,
  description,
  decision,
  actorRole,
  rejectionReason,
}) {
  const amountLabel = `${currency || "LKR"} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const invoiceLabel = invoiceId ? `Invoice ${invoiceId}` : "An invoice";
  const who = actorRole ? String(actorRole).trim() : "Finance";
  if (decision === "approved") {
    return [
      `${COMPANY_NAME} — Payment approved`,
      `${invoiceLabel} for ${studentName || "a student"} was approved by ${who}.`,
      `Amount: ${amountLabel}`,
      description ? `Description: ${description}` : "",
      "The student has been notified.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `${COMPANY_NAME} — Payment evidence rejected`,
    `${invoiceLabel} for ${studentName || "a student"} was rejected by ${who}.`,
    `Amount: ${amountLabel}`,
    description ? `Description: ${description}` : "",
    rejectionReason ? `Reason for student: ${rejectionReason}` : "",
    "The student has been notified to re-upload evidence.",
  ]
    .filter(Boolean)
    .join("\n");
}

module.exports = {
  buildStudentAccountDetailsWhatsappMessage,
  buildAppointmentLinkWhatsappMessage,
  buildCounselorAssignmentWhatsappMessage,
  buildMeetingReminderWhatsappMessage,
  buildInquiryCallScheduledWhatsappMessage,
  buildInquiryCallReminderWhatsappMessage,
  buildInvoiceWhatsappMessage,
  formatPaymentAccountForMessage,
  buildInvoicePaymentDecisionWhatsappMessage,
  buildDocumentDecisionWhatsappMessage,
  buildDocumentUploadWhatsappMessage,
  buildUniversityOfferWhatsappMessage,
  buildStudentDetailChangeDecisionWhatsappMessage,
  buildCounselorInvoiceDecisionPortalMessage,
};
