const crypto = require("crypto");
const { MEETING_REMINDER_MIN_MS, MEETING_REMINDER_MAX_MS } = require("../config");
const { readUsers } = require("../models/users");
const { readStudemts } = require("../models/students");
const { readActivities, writeActivities } = require("../models/activities");
const { readAppointments, writeAppointments } = require("../models/appointments");
const { appendPortalChatMessage } = require("../models/chats");
const { deliverCounselorMessageToStudentWhatsapp, resolveCounselor } = require("./whatsapp");
const {
  buildMeetingReminderWhatsappMessage,
  buildInvoicePaymentDecisionWhatsappMessage,
  buildCounselorInvoiceDecisionPortalMessage,
} = require("./whatsappMessages");
const { isSupportedWhatsappMediaMime } = require("./uploads");
const { logEvent } = require("../lib/logger");

function aggregateWhatsappDeliveryResults(results) {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) {
    return { attempted: false, status: "skipped", reason: "Not attempted.", sentAt: new Date().toISOString() };
  }
  const attempted = list.some((r) => r.attempted);
  const sent = list.some((r) => r.status === "sent");
  const failed = list.filter((r) => r.status === "failed");
  const skipped = list.every((r) => r.status === "skipped");
  return {
    attempted,
    status: sent ? "sent" : failed.length ? "failed" : skipped ? "skipped" : "skipped",
    reason: failed.map((r) => r.reason).filter(Boolean).join(" ") || list[list.length - 1]?.reason || "",
    sentAt: new Date().toISOString(),
    parts: list,
  };
}

async function deliverInvoicePackageToStudentWhatsapp({
  senderId,
  receiverId,
  messageText,
  receiptAttachment,
  invoiceFileAttachment,
}) {
  const results = [];
  const text = String(messageText || "").trim();
  if (text) {
    results.push(
      await deliverCounselorMessageToStudentWhatsapp({
        senderId,
        receiverId,
        content: text,
        attachment: null,
      })
    );
  }
  if (receiptAttachment?.url) {
    results.push(
      await deliverCounselorMessageToStudentWhatsapp({
        senderId,
        receiverId,
        content: "",
        attachment: receiptAttachment,
      })
    );
  }
  const fileUrl = String(invoiceFileAttachment?.url || "");
  const receiptUrl = String(receiptAttachment?.url || "");
  if (
    fileUrl &&
    isSupportedWhatsappMediaMime(invoiceFileAttachment.mime) &&
    fileUrl !== receiptUrl
  ) {
    results.push(
      await deliverCounselorMessageToStudentWhatsapp({
        senderId,
        receiverId,
        content: "",
        attachment: invoiceFileAttachment,
      })
    );
  }
  return aggregateWhatsappDeliveryResults(results);
}

/** Counselor, inquiry counselor, and anyone in counselorHistory for this student. */
function collectManagingCounselorIdsForStudent(student) {
  const ids = new Set();
  const add = (raw) => {
    const v = String(raw || "").trim();
    if (v && v.toLowerCase() !== "unassigned") ids.add(v);
  };
  if (!student || typeof student !== "object") return [];
  add(student.counselor);
  add(student.inquiryCounselorId);
  const history = Array.isArray(student.counselorHistory) ? student.counselorHistory : [];
  history.forEach(add);
  return Array.from(ids);
}

function pickInvoiceWhatsappSenderId(student, counselorIds) {
  const inquiry = String(student?.inquiryCounselorId || "").trim();
  const primary = String(student?.counselor || "").trim();
  if (inquiry && inquiry.toLowerCase() !== "unassigned") return inquiry;
  if (primary && primary.toLowerCase() !== "unassigned") return primary;
  return counselorIds[0] || "";
}

async function resolvePortalMessageSenderId(actorId, fallbackCounselorId) {
  const actor = String(actorId || "").trim();
  if (actor) {
    const users = await readUsers();
    if (users.some((u) => String(u.id || "").trim() === actor)) return actor;
  }
  return String(fallbackCounselorId || "").trim();
}

async function deliverInvoiceDecisionWhatsappToStudent({ student, counselorIds, message }) {
  const studentId = String(student?.id || "").trim();
  if (!studentId || !String(message || "").trim()) {
    return { attempted: false, status: "skipped", reason: "Missing student or message." };
  }
  const ordered = [...counselorIds];
  const primary = pickInvoiceWhatsappSenderId(student, counselorIds);
  if (primary) {
    const idx = ordered.indexOf(primary);
    if (idx > 0) {
      ordered.splice(idx, 1);
      ordered.unshift(primary);
    } else if (idx < 0) {
      ordered.unshift(primary);
    }
  }
  const parts = [];
  for (const senderId of ordered) {
    const sender = await resolveCounselor(senderId);
    if (!sender) continue;
    const result = await deliverCounselorMessageToStudentWhatsapp({
      senderId,
      receiverId: studentId,
      content: message,
    });
    parts.push({ senderId, ...result });
    if (result.status === "sent") {
      return { ...aggregateWhatsappDeliveryResults(parts), senderId };
    }
  }
  if (!parts.length) {
    return {
      attempted: false,
      status: "skipped",
      reason: "No counselor WhatsApp account available for this student.",
    };
  }
  return { ...aggregateWhatsappDeliveryResults(parts), senderId: parts[0]?.senderId || "" };
}

async function appendFinanceActivityForInvoiceDecision({
  actorRole,
  actorId,
  student,
  invoice,
  decision,
}) {
  const studentName = String(student?.name || "").trim();
  const invoiceId = String(invoice?.id || "").trim();
  const amountLabel = `${invoice?.currency || "LKR"} ${Number(invoice?.amount || 0)}`;
  const action =
    decision === "approved" ? "approved invoice payment" : "rejected invoice payment evidence";
  const activities = await readActivities();
  const activity = {
    id: `act-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    user: String(actorRole || "System").trim() || "System",
    role: String(actorRole || "System").trim() || "System",
    action,
    target: `${invoiceId} (${amountLabel}) — ${studentName || invoice.studentId || "student"}`,
    type: decision === "approved" ? "approval" : "rejection",
    timestamp: "Just now",
    createdAt: new Date().toISOString(),
    actorName: String(actorRole || "System").trim() || "System",
    counselorName: "",
    studentName,
    studentId: String(student?.id || invoice?.studentId || "").trim(),
    invoiceId,
    actorId: String(actorId || "").trim(),
  };
  await writeActivities([activity, ...activities]);
  return activity;
}

async function notifyInvoicePaymentDecision({
  req,
  invoice,
  student,
  decision,
  actorRole,
  actorId,
}) {
  const studentName = String(student?.name || "").trim();
  const managingCounselorIds = student ? collectManagingCounselorIdsForStudent(student) : [];
  const whatsappSenderId = student ? pickInvoiceWhatsappSenderId(student, managingCounselorIds) : "";
  const portalSenderId = await resolvePortalMessageSenderId(actorId, whatsappSenderId);

  const studentMessage = student
    ? buildInvoicePaymentDecisionWhatsappMessage({
        studentName,
        invoiceId: invoice.id,
        currency: invoice.currency,
        amount: invoice.amount,
        description: invoice.description,
        decision,
        rejectionReason: String(invoice.paymentRejectionReason || "").trim(),
      })
    : "";

  const counselorMessage = student
    ? buildCounselorInvoiceDecisionPortalMessage({
        studentName,
        invoiceId: invoice.id,
        currency: invoice.currency,
        amount: invoice.amount,
        description: invoice.description,
        decision,
        actorRole,
        rejectionReason: String(invoice.paymentRejectionReason || "").trim(),
      })
    : "";

  let invoiceWhatsappNotification = null;
  let studentPortalChat = null;
  const counselorPortalChats = [];
  let activity = null;

  if (!student) {
    invoiceWhatsappNotification = {
      invoiceId: invoice.id,
      decision,
      whatsapp: { attempted: false, status: "skipped", reason: "Student record not found." },
    };
    return {
      invoiceWhatsappNotification,
      studentPortalChat,
      counselorPortalChats,
      activity,
      managingCounselorIds,
    };
  }

  if (studentMessage && managingCounselorIds.length) {
    const whatsapp = await deliverInvoiceDecisionWhatsappToStudent({
      student,
      counselorIds: managingCounselorIds,
      message: studentMessage,
    });
    invoiceWhatsappNotification = {
      invoiceId: invoice.id,
      decision,
      whatsapp,
    };
  } else if (studentMessage) {
    invoiceWhatsappNotification = {
      invoiceId: invoice.id,
      decision,
      whatsapp: {
        attempted: false,
        status: "skipped",
        reason: "Student has no assigned counselor for WhatsApp.",
      },
    };
  }

  if (studentMessage && portalSenderId) {
    studentPortalChat = await appendPortalChatMessage({
      senderId: portalSenderId,
      receiverId: String(student.id || ""),
      content: studentMessage,
    });
  }

  if (counselorMessage && portalSenderId) {
    for (const counselorId of managingCounselorIds) {
      try {
        const chat = await appendPortalChatMessage({
          senderId: portalSenderId,
          receiverId: counselorId,
          content: counselorMessage,
        });
        counselorPortalChats.push({
          counselorId,
          ok: Boolean(chat),
          chatId: chat?.id || null,
        });
      } catch (error) {
        counselorPortalChats.push({
          counselorId,
          ok: false,
          error: String(error?.message || "Failed to notify counselor."),
        });
      }
    }
  }

  activity = await appendFinanceActivityForInvoiceDecision({
    actorRole,
    actorId,
    student,
    invoice,
    decision,
  });

  return {
    invoiceWhatsappNotification,
    studentPortalChat: studentPortalChat ? { chatId: studentPortalChat.id } : null,
    counselorPortalChats,
    activity: activity ? { id: activity.id } : null,
    managingCounselorIds,
  };
}

function appointmentStartMs(appointment) {
  const date = String(appointment?.date || "").trim();
  const time = String(appointment?.time || "").trim();
  if (!date || !time) return NaN;
  return new Date(`${date}T${time}:00+05:30`).getTime();
}

function isWithinMeetingReminderWindow(appointment, nowMs = Date.now()) {
  if (String(appointment?.status || "") !== "Scheduled") return false;
  const startMs = appointmentStartMs(appointment);
  if (!Number.isFinite(startMs)) return false;
  const msUntil = startMs - nowMs;
  if (msUntil < 0) return false;
  return msUntil >= MEETING_REMINDER_MIN_MS && msUntil <= MEETING_REMINDER_MAX_MS;
}

async function processMeetingReminders() {
  const appointments = await readAppointments();
  const now = Date.now();
  let changed = false;
  const nextAppointments = [];
  for (const apt of appointments) {
    let next = apt;
    if (isWithinMeetingReminderWindow(apt, now) && !apt.studentMeetingReminderWhatsappDelivery?.sentAt) {
      try {
        const students = await readStudemts();
        const student = students.find((item) => String(item.id || "") === String(apt.studentId || ""));
        const result = await deliverCounselorMessageToStudentWhatsapp({
          senderId: String(apt.counselorId || "").trim(),
          receiverId: String(apt.studentId || "").trim(),
          content: buildMeetingReminderWhatsappMessage({
            studentName: student?.name || "",
            title: apt.title || "Session",
            date: apt.date || "",
            time: apt.time || "",
            meetingPlatform: apt.meetingPlatform || "",
            meetingLink: apt.meetingLink || "",
          }),
        });
        next = {
          ...next,
          studentMeetingReminderWhatsappDelivery: {
            attempted: Boolean(result?.attempted),
            status: result?.status || "skipped",
            reason: result?.reason || "",
            sentAt: new Date().toISOString(),
          },
        };
        changed = true;
        logEvent("appointment", "meeting reminder sent to student via whatsapp", {
          appointmentId: apt.id,
          counselorId: apt.counselorId,
          studentId: apt.studentId,
          status: next.studentMeetingReminderWhatsappDelivery.status,
        });
      } catch (error) {
        next = {
          ...next,
          studentMeetingReminderWhatsappDelivery: {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send WhatsApp meeting reminder."),
            sentAt: new Date().toISOString(),
          },
        };
        changed = true;
        console.error("Meeting reminder WhatsApp send failed:", error);
      }
    }
    nextAppointments.push(next);
  }
  if (changed) {
    await writeAppointments(nextAppointments);
  }
}

module.exports = {
  aggregateWhatsappDeliveryResults,
  deliverInvoicePackageToStudentWhatsapp,
  collectManagingCounselorIdsForStudent,
  pickInvoiceWhatsappSenderId,
  resolvePortalMessageSenderId,
  deliverInvoiceDecisionWhatsappToStudent,
  appendFinanceActivityForInvoiceDecision,
  notifyInvoicePaymentDecision,
  processMeetingReminders,
  appointmentStartMs,
  isWithinMeetingReminderWindow,
};
