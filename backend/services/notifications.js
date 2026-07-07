const crypto = require("crypto");
const { MEETING_REMINDER_MIN_MS, MEETING_REMINDER_MAX_MS } = require("../config");
const { readUsers } = require("../models/users");
const { readStudemts, writeStudemts } = require("../models/students");
const { readActivities, writeActivities } = require("../models/activities");
const { readAppointments, writeAppointments } = require("../models/appointments");
const { appendPortalChatMessage } = require("../models/chats");
const {
  deliverCounselorMessageToStudentWhatsapp,
  persistOutgoingStudentChatMessage,
  ADMIN_WHATSAPP_USER_ID,
} = require("./whatsapp");
const {
  findBranchWhatsappMessengerUser,
  resolveBranchForStudent,
  isBranchWhatsappEnabled,
} = require("./branchWhatsapp");
const {
  buildMeetingReminderWhatsappMessage,
  buildInquiryCallScheduledWhatsappMessage,
  buildInquiryCallReminderWhatsappMessage,
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

function addStudentWhatsappSenderCandidate(candidates, seen, rawId) {
  const id = String(rawId || "").trim();
  if (!id || id.toLowerCase() === "unassigned" || seen.has(id)) return;
  seen.add(id);
  candidates.push(id);
}

/** Counselor, inquiry counselor, counselor history, branch messenger, then admin. */
async function collectStudentWhatsappSenderCandidates(student, preferredSenderIds = []) {
  const candidates = [];
  const seen = new Set();
  const preferred = Array.isArray(preferredSenderIds) ? preferredSenderIds : [preferredSenderIds];
  for (const id of preferred) addStudentWhatsappSenderCandidate(candidates, seen, id);
  if (student && typeof student === "object") {
    addStudentWhatsappSenderCandidate(candidates, seen, student.inquiryCounselorId);
    addStudentWhatsappSenderCandidate(candidates, seen, student.counselor);
    const history = Array.isArray(student.counselorHistory) ? student.counselorHistory : [];
    for (const id of history) addStudentWhatsappSenderCandidate(candidates, seen, id);
  }
  if (student && (await isBranchWhatsappEnabled())) {
    const branch = await resolveBranchForStudent(student);
    if (branch) {
      const messenger = await findBranchWhatsappMessengerUser(branch);
      addStudentWhatsappSenderCandidate(candidates, seen, messenger?.id);
    }
  }
  addStudentWhatsappSenderCandidate(candidates, seen, ADMIN_WHATSAPP_USER_ID);
  return candidates;
}

/**
 * Try multiple WhatsApp senders (counselor → branch messenger → admin) until one succeeds.
 * Also mirrors the message in portal chat when delivery succeeds or all senders fail.
 */
async function deliverStudentNotificationWhatsapp({
  student = null,
  studentId = "",
  content = "",
  attachment = null,
  preferredSenderIds = [],
  persistToChat = true,
}) {
  const receiverId = String(studentId || student?.id || "").trim();
  const messageText = String(content || "").trim();
  const hasAttachment = Boolean(attachment && typeof attachment === "object" && attachment.url);
  if (!receiverId) {
    return { attempted: false, status: "skipped", reason: "Student receiver id is missing." };
  }
  if (!messageText && !hasAttachment) {
    return { attempted: false, status: "skipped", reason: "Message text or attachment is required." };
  }

  const candidates = await collectStudentWhatsappSenderCandidates(student, preferredSenderIds);
  if (!candidates.length) {
    return { attempted: false, status: "skipped", reason: "No WhatsApp sender available for this student." };
  }

  const parts = [];
  let winningSenderId = "";
  for (const senderId of candidates) {
    const result = await deliverCounselorMessageToStudentWhatsapp({
      senderId,
      receiverId,
      content: messageText,
      attachment,
      persistToChat: false,
    });
    parts.push({ senderId, ...result });
    if (result.status === "sent") {
      winningSenderId = senderId;
      break;
    }
  }

  const aggregated = aggregateWhatsappDeliveryResults(parts);
  const chatContent =
    messageText || (hasAttachment ? `Sent an attachment (${attachment.name || "file"}).` : "");
  if (persistToChat && chatContent) {
    const chatSenderId = winningSenderId || candidates[0];
    const winningPart = parts.find((part) => part.senderId === winningSenderId);
    await persistOutgoingStudentChatMessage({
      senderId: chatSenderId,
      receiverId,
      content: chatContent,
      attachment: hasAttachment ? attachment : null,
      whatsappDelivery: winningPart || aggregated,
    });
  }

  if (winningSenderId) {
    return { ...aggregated, senderId: winningSenderId };
  }
  return aggregated;
}

async function deliverInvoicePackageToStudentWhatsapp({
  student = null,
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
      await deliverStudentNotificationWhatsapp({
        student,
        studentId: receiverId,
        content: text,
        attachment: null,
        preferredSenderIds: [senderId],
        persistToChat: false,
      })
    );
  }
  if (receiptAttachment?.url) {
    results.push(
      await deliverStudentNotificationWhatsapp({
        student,
        studentId: receiverId,
        content: "",
        attachment: receiptAttachment,
        preferredSenderIds: [senderId],
        persistToChat: false,
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
      await deliverStudentNotificationWhatsapp({
        student,
        studentId: receiverId,
        content: "",
        attachment: invoiceFileAttachment,
        preferredSenderIds: [senderId],
        persistToChat: false,
      })
    );
  }
  const aggregated = aggregateWhatsappDeliveryResults(results);
  if (text && aggregated.status === "sent") {
    await persistOutgoingStudentChatMessage({
      senderId: results.find((part) => part.senderId)?.senderId || String(senderId || "").trim(),
      receiverId: String(receiverId || "").trim(),
      content: text,
      attachment: null,
      whatsappDelivery: aggregated,
    });
  }
  return aggregated;
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
  const primary = pickInvoiceWhatsappSenderId(student, counselorIds);
  const preferredSenderIds = primary
    ? [primary, ...counselorIds.filter((id) => id !== primary)]
    : counselorIds;
  return deliverStudentNotificationWhatsapp({
    student,
    studentId,
    content: message,
    preferredSenderIds,
    persistToChat: true,
  });
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

  if (studentMessage) {
    const whatsapp = await deliverStudentNotificationWhatsapp({
      student,
      studentId: String(student.id || ""),
      content: studentMessage,
      preferredSenderIds: managingCounselorIds,
      persistToChat: true,
    });
    invoiceWhatsappNotification = {
      invoiceId: invoice.id,
      decision,
      whatsapp,
    };
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

async function processMeetingReminders() {
  const appointments = await readAppointments();
  const now = Date.now();
  let changed = false;
  const nextAppointments = [];
  const students = await readStudemts();
  for (const apt of appointments) {
    let next = apt;
    if (isWithinMeetingReminderWindow(apt, now) && !apt.studentMeetingReminderWhatsappDelivery?.sentAt) {
      try {
        const student = students.find((item) => String(item.id || "") === String(apt.studentId || ""));
        const result = await deliverStudentNotificationWhatsapp({
          student,
          studentId: String(apt.studentId || "").trim(),
          content: buildMeetingReminderWhatsappMessage({
            studentName: student?.name || "",
            title: apt.title || "Session",
            date: apt.date || "",
            time: apt.time || "",
            meetingPlatform: apt.meetingPlatform || "",
            meetingLink: apt.meetingLink || "",
          }),
          preferredSenderIds: [String(apt.counselorId || "").trim()],
          persistToChat: true,
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

function parseInquiryScheduledCallMs(student) {
  const raw = String(student?.inquiryScheduledCallAt || "").trim();
  if (!raw) return NaN;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function formatInquiryScheduledCallLabelForWhatsapp(iso) {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString("en-LK", {
    timeZone: "Asia/Colombo",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function pickInquiryCallWhatsappSenderId(student) {
  const inquiry = String(student?.inquiryCounselorId || "").trim();
  const primary = String(student?.counselor || "").trim();
  if (inquiry && inquiry.toLowerCase() !== "unassigned") return inquiry;
  if (primary && primary.toLowerCase() !== "unassigned") return primary;
  return "";
}

function isWithinInquiryCallReminderWindow(scheduledMs, nowMs = Date.now()) {
  if (!Number.isFinite(scheduledMs)) return false;
  const msUntil = scheduledMs - nowMs;
  if (msUntil < 0) return false;
  return msUntil >= MEETING_REMINDER_MIN_MS && msUntil <= MEETING_REMINDER_MAX_MS;
}

async function notifyInquiryCallScheduled({ student, studentId, previousScheduledAt }) {
  const scheduledAt = String(student?.inquiryScheduledCallAt || "").trim();
  if (!scheduledAt) {
    return { attempted: false, status: "skipped", reason: "No scheduled call time." };
  }
  const previous = String(previousScheduledAt || "").trim();
  const isReschedule = Boolean(previous && previous !== scheduledAt);
  const scheduledLabel = formatInquiryScheduledCallLabelForWhatsapp(scheduledAt);
  const message = buildInquiryCallScheduledWhatsappMessage({
    studentName: String(student?.name || "").trim(),
    scheduledLabel,
    isReschedule,
  });
  try {
    const result = await deliverStudentNotificationWhatsapp({
      student,
      studentId: String(studentId || student?.id || "").trim(),
      content: message,
      preferredSenderIds: [pickInquiryCallWhatsappSenderId(student)],
      persistToChat: true,
    });
    logEvent("student", "inquiry call schedule sent to student via whatsapp", {
      studentId: String(studentId || student?.id || "").trim(),
      counselorId: result?.senderId || pickInquiryCallWhatsappSenderId(student),
      status: result?.status || "unknown",
      isReschedule,
    });
    return {
      attempted: Boolean(result?.attempted),
      status: String(result?.status || "skipped"),
      reason: String(result?.reason || ""),
    };
  } catch (error) {
    return {
      attempted: true,
      status: "failed",
      reason: String(error?.message || "Failed to send WhatsApp inquiry call schedule."),
    };
  }
}

async function processInquiryScheduledCallReminders() {
  const studemts = await readStudemts();
  const now = Date.now();
  let changed = false;
  const nextStudents = [];
  for (const student of studemts) {
    let next = student;
    const scheduledAt = String(student?.inquiryScheduledCallAt || "").trim();
    const schedMs = parseInquiryScheduledCallMs(student);
    if (!scheduledAt || !Number.isFinite(schedMs) || schedMs <= now) {
      nextStudents.push(next);
      continue;
    }
    const reminderDelivery = student?.inquiryScheduledCallReminderWhatsappDelivery;
    const reminderForAt = String(reminderDelivery?.scheduledAt || "").trim();
    const alreadySentForThisSchedule = Boolean(reminderDelivery?.sentAt && reminderForAt === scheduledAt);
    if (isWithinInquiryCallReminderWindow(schedMs, now) && !alreadySentForThisSchedule) {
      const studentId = String(student?.id || "").trim();
      try {
        const scheduledLabel = formatInquiryScheduledCallLabelForWhatsapp(scheduledAt);
        const result = await deliverStudentNotificationWhatsapp({
          student,
          studentId,
          content: buildInquiryCallReminderWhatsappMessage({
            studentName: String(student?.name || "").trim(),
            scheduledLabel,
          }),
          preferredSenderIds: [pickInquiryCallWhatsappSenderId(student)],
          persistToChat: true,
        });
        next = {
          ...next,
          inquiryScheduledCallReminderWhatsappDelivery: {
            attempted: Boolean(result?.attempted),
            status: String(result?.status || "skipped"),
            reason: String(result?.reason || ""),
            scheduledAt,
            sentAt: new Date().toISOString(),
          },
        };
        changed = true;
        logEvent("student", "inquiry call reminder sent to student via whatsapp", {
          studentId,
          counselorId: result?.senderId || pickInquiryCallWhatsappSenderId(student),
          status: next.inquiryScheduledCallReminderWhatsappDelivery.status,
        });
      } catch (error) {
        next = {
          ...next,
          inquiryScheduledCallReminderWhatsappDelivery: {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send WhatsApp inquiry call reminder."),
            scheduledAt,
            sentAt: new Date().toISOString(),
          },
        };
        changed = true;
        console.error("Inquiry call reminder WhatsApp send failed:", error);
      }
    }
    nextStudents.push(next);
  }
  if (changed) {
    await writeStudemts(nextStudents);
  }
}

module.exports = {
  aggregateWhatsappDeliveryResults,
  collectStudentWhatsappSenderCandidates,
  deliverStudentNotificationWhatsapp,
  deliverInvoicePackageToStudentWhatsapp,
  collectManagingCounselorIdsForStudent,
  pickInvoiceWhatsappSenderId,
  resolvePortalMessageSenderId,
  deliverInvoiceDecisionWhatsappToStudent,
  appendFinanceActivityForInvoiceDecision,
  notifyInvoicePaymentDecision,
  processMeetingReminders,
  processInquiryScheduledCallReminders,
  notifyInquiryCallScheduled,
  appointmentStartMs,
  isWithinMeetingReminderWindow,
  parseInquiryScheduledCallMs,
  isWithinInquiryCallReminderWindow,
};
