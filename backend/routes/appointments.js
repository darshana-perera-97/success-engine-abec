const crypto = require("crypto");
const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const { readMeetingSettings, writeMeetingSettings, normalizeMeetingSettings } = require("../models/meetingSettings");
const { readBookings, writeBookings } = require("../models/bookings");
const { readAppointments, writeAppointments } = require("../models/appointments");
const { readStudemts } = require("../models/students");
const { deliverCounselorMessageToStudentWhatsapp } = require("../services/whatsapp");
const { buildAppointmentLinkWhatsappMessage } = require("../services/whatsappMessages");

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/meeting-settings") {
    try {
      const settings = await readMeetingSettings();
      sendJson(res, 200, { ok: true, data: settings });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load meeting settings." });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname === "/api/meeting-settings") {
    try {
      const body = await parseBody(req);
      const normalized = normalizeMeetingSettings(body);
      if (normalized.meetingDurationMinutes !== 30) {
        sendJson(res, 400, { ok: false, error: "Meeting duration must be 30 minutes." });
        return true;
      }
      for (let day = 0; day <= 6; day++) {
        const schedule = normalized.daySchedules[day];
        if (!schedule) {
          sendJson(res, 400, { ok: false, error: "All 7 days must have a schedule." });
          return true;
        }
        if (schedule.endHour <= schedule.startHour) {
          sendJson(res, 400, { ok: false, error: `End time must be after start time for day ${day}.` });
          return true;
        }
      }
      await writeMeetingSettings(normalized);
      sendJson(res, 200, { ok: true, data: normalized });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/bookings") {
    try {
      const counselorId = String(url.searchParams.get("counselorId") || "").trim();
      const date = String(url.searchParams.get("date") || "").trim();
      const bookings = await readBookings();
      const filtered = bookings.filter((booking) => {
        if (counselorId && String(booking.counselorId || "") !== counselorId) return false;
        if (date && String(booking.date || "") !== date) return false;
        return true;
      });
      sendJson(res, 200, { ok: true, data: filtered });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load bookings." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    try {
      const body = await parseBody(req);
      const counselorId = String(body.counselorId || "").trim();
      const date = String(body.date || "").trim();
      const startTime = String(body.startTime || "").trim();
      const endTime = String(body.endTime || "").trim();
      const reason = String(body.reason || "").trim() || "Busy";
      if (!counselorId || !date || !startTime || !endTime) {
        sendJson(res, 400, { ok: false, error: "counselorId, date, startTime, and endTime are required." });
        return true;
      }
      const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
        sendJson(res, 400, { ok: false, error: "Time format must be HH:MM." });
        return true;
      }
      if (endTime <= startTime) {
        sendJson(res, 400, { ok: false, error: "End time must be after start time." });
        return true;
      }
      const bookings = await readBookings();
      const booking = {
        id: `BLK-${crypto.randomUUID().slice(0, 8)}`,
        type: "busy",
        counselorId,
        date,
        startTime,
        endTime,
        reason,
        createdAt: new Date().toISOString(),
      };
      await writeBookings([...bookings, booking]);
      sendJson(res, 201, { ok: true, data: booking });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/bookings/")) {
    try {
      const bookingId = decodeURIComponent(url.pathname.replace("/api/bookings/", "").trim()).replace(/\/+$/, "");
      if (!bookingId) {
        sendJson(res, 400, { ok: false, error: "Booking ID is required." });
        return true;
      }
      const bookings = await readBookings();
      const existing = bookings.find((item) => String(item.id || "") === bookingId);
      if (!existing) {
        sendJson(res, 404, { ok: false, error: "Booking not found." });
        return true;
      }
      const updatedBookings = bookings.filter((item) => String(item.id || "") !== bookingId);
      await writeBookings(updatedBookings);
      sendJson(res, 200, { ok: true, data: existing });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/appointments") {
    try {
      const appointments = await readAppointments();
      sendJson(res, 200, { ok: true, data: appointments });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load appointments." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/appointments") {
    try {
      const body = await parseBody(req);
      const counselorId = String(body.counselorId || "").trim();
      const studentId = String(body.studentId || "").trim();
      const title = String(body.title || "").trim();
      const date = String(body.date || "").trim();
      const time = String(body.time || "").trim();
      const type = String(body.type || "").trim() || "Counseling";
      const status = String(body.status || "").trim() || "Scheduled";
      const duration = Number(body.duration) || 30;
      if (!counselorId || !studentId || !title || !date || !time) {
        sendJson(res, 400, { ok: false, error: "counselorId, studentId, title, date, and time are required." });
        return true;
      }
      const appointment = {
        id: `APT-${crypto.randomUUID().slice(0, 8)}`,
        counselorId,
        studentId,
        title,
        date,
        time,
        duration,
        type,
        status,
        meetingPlatform: String(body.meetingPlatform || "").trim(),
        meetingLink: String(body.meetingLink || ""),
        createdAt: new Date().toISOString(),
      };
      const appointments = await readAppointments();
      const upcomingScheduledForStudent = appointments.filter((item) => {
        if (String(item.studentId || "") !== studentId) return false;
        if (String(item.status || "") !== "Scheduled") return false;
        const itemDateTime = new Date(`${item.date}T${item.time}`).getTime();
        return Number.isFinite(itemDateTime) && itemDateTime > Date.now();
      }).length;
      if (upcomingScheduledForStudent >= 3) {
        sendJson(res, 400, { ok: false, error: "Students can only have up to 3 upcoming meetings." });
        return true;
      }
      const meetingLinkOnCreate = String(appointment.meetingLink || "").trim();
      const meetingPlatformOnCreate = String(appointment.meetingPlatform || "").trim();
      if (meetingLinkOnCreate || meetingPlatformOnCreate) {
        try {
          const students = await readStudemts();
          const student = students.find((item) => String(item.id || "") === String(appointment.studentId || ""));
          const result = await deliverCounselorMessageToStudentWhatsapp({
            senderId: String(appointment.counselorId || "").trim(),
            receiverId: String(appointment.studentId || "").trim(),
            content: buildAppointmentLinkWhatsappMessage({
              studentName: student?.name || "",
              title: appointment.title || "Session",
              date: appointment.date || "",
              time: appointment.time || "",
              meetingPlatform: meetingPlatformOnCreate,
              meetingLink: meetingLinkOnCreate,
            }),
          });
          appointment.meetingLinkWhatsappDelivery = {
            attempted: Boolean(result?.attempted),
            status: result?.status || "skipped",
            reason: result?.reason || "",
            sentAt: new Date().toISOString(),
          };
          logEvent("appointment", "meeting details sent to student via whatsapp", {
            appointmentId: appointment.id,
            counselorId: appointment.counselorId,
            studentId: appointment.studentId,
            status: appointment.meetingLinkWhatsappDelivery.status,
          });
        } catch (error) {
          appointment.meetingLinkWhatsappDelivery = {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send WhatsApp meeting details."),
            sentAt: new Date().toISOString(),
          };
          console.error("Meeting details WhatsApp send failed (create):", error);
        }
      }
      await writeAppointments([...appointments, appointment]);
      sendJson(res, 201, { ok: true, data: appointment });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/appointments/")) {
    try {
      const appointmentId = decodeURIComponent(url.pathname.replace("/api/appointments/", "").trim()).replace(/\/+$/, "");
      if (!appointmentId) {
        sendJson(res, 400, { ok: false, error: "Appointment ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const appointments = await readAppointments();
      const idx = appointments.findIndex((item) => String(item.id || "") === appointmentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Appointment not found." });
        return true;
      }
      const updatedAppointment = {
        ...appointments[idx],
        ...body,
        id: appointments[idx].id,
        updatedAt: new Date().toISOString(),
      };
      const previousAppointment = appointments[idx];
      const prevLink = String(previousAppointment?.meetingLink || "").trim();
      const nextLink = String(updatedAppointment?.meetingLink || "").trim();
      if (nextLink && nextLink !== prevLink) {
        try {
          const students = await readStudemts();
          const student = students.find((item) => String(item.id || "") === String(updatedAppointment.studentId || ""));
          const result = await deliverCounselorMessageToStudentWhatsapp({
            senderId: String(updatedAppointment.counselorId || "").trim(),
            receiverId: String(updatedAppointment.studentId || "").trim(),
            content: buildAppointmentLinkWhatsappMessage({
              studentName: student?.name || "",
              title: updatedAppointment.title || "Session",
              date: updatedAppointment.date || "",
              time: updatedAppointment.time || "",
              meetingPlatform: updatedAppointment.meetingPlatform || "",
              meetingLink: nextLink,
            }),
          });
          updatedAppointment.meetingLinkWhatsappDelivery = {
            attempted: Boolean(result?.attempted),
            status: result?.status || "skipped",
            reason: result?.reason || "",
            sentAt: new Date().toISOString(),
          };
          logEvent("appointment", "meeting link sent to student via whatsapp", {
            appointmentId,
            counselorId: updatedAppointment.counselorId,
            studentId: updatedAppointment.studentId,
            status: updatedAppointment.meetingLinkWhatsappDelivery.status,
          });
        } catch (error) {
          updatedAppointment.meetingLinkWhatsappDelivery = {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send WhatsApp meeting link."),
            sentAt: new Date().toISOString(),
          };
          console.error("Meeting link WhatsApp send failed:", error);
        }
      }
      const updatedAppointments = [...appointments];
      updatedAppointments[idx] = updatedAppointment;
      await writeAppointments(updatedAppointments);
      sendJson(res, 200, { ok: true, data: updatedAppointment });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
