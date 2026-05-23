/** Reminder fires when the meeting is 14–16 minutes away (15 min target, 60s poll tolerance). */
export const MEETING_REMINDER_MIN_MS = 14 * 60 * 1000;
export const MEETING_REMINDER_MAX_MS = 16 * 60 * 1000;

export function appointmentStartMs(appointment) {
  const date = String(appointment?.date || "").trim();
  const time = String(appointment?.time || "").trim();
  if (!date || !time) return NaN;
  return new Date(`${date}T${time}:00+05:30`).getTime();
}

export function isWithinMeetingReminderWindow(appointment, nowMs = Date.now()) {
  if (String(appointment?.status || "") !== "Scheduled") return false;
  const startMs = appointmentStartMs(appointment);
  if (!Number.isFinite(startMs)) return false;
  const msUntil = startMs - nowMs;
  if (msUntil < 0) return false;
  return msUntil >= MEETING_REMINDER_MIN_MS && msUntil <= MEETING_REMINDER_MAX_MS;
}

export function findCounselorMeetingReminder(appointments, counselorId) {
  const id = String(counselorId || "").trim();
  if (!id || !Array.isArray(appointments)) return null;
  for (const apt of appointments) {
    if (String(apt.counselorId || "") !== id) continue;
    if (apt.counselorMeetingReminderAcknowledgedAt) continue;
    if (isWithinMeetingReminderWindow(apt)) return apt;
  }
  return null;
}

export function formatMeetingReminderWhen(appointment) {
  const startMs = appointmentStartMs(appointment);
  if (!Number.isFinite(startMs)) {
    const date = String(appointment?.date || "").trim();
    const time = String(appointment?.time || "").trim();
    return [date, time].filter(Boolean).join(" at ") || "soon";
  }
  return new Date(startMs).toLocaleString("en-LK", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  });
}
