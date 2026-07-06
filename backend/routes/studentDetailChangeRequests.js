const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const {
  collectChangedDetailFields,
  readStudentDetailChangeRequests,
  appendStudentDetailChangeRequest,
  decideStudentDetailChangeRequest,
} = require("../models/studentDetailChangeRequests");
const { readStudemts, writeStudemts } = require("../models/students");
const { normalizeStudentPhone, normalizeWhatsappNumber } = require("../services/whatsapp");

const APPROVER_ROLES = new Set(["Admin", "Manager", "Team Lead"]);

function applyApprovedDetailChanges(student, request) {
  const changedFields = collectChangedDetailFields(request);
  const nowIso = new Date().toISOString();
  const updated = { ...student, updatedAt: nowIso };

  if (changedFields.includes("name")) {
    updated.name = request.requestedName;
  }
  if (changedFields.includes("email")) {
    updated.email = request.requestedEmail;
  }
  if (changedFields.includes("phone")) {
    updated.phone = request.requestedPhone;
  }
  if (changedFields.includes("whatsappNumber")) {
    updated.whatsappNumber = request.requestedWhatsappNumber;
  }
  if (changedFields.includes("currentEducationLevel")) {
    updated.currentEducationLevel = request.requestedEducationLevel;
  }

  return updated;
}

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/student-detail-change-requests") {
    try {
      const requestedBy = String(url.searchParams.get("requestedBy") || "").trim();
      const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
      const pendingOnly = url.searchParams.get("pendingOnly") === "1" || url.searchParams.get("pendingOnly") === "true";
      const studentId = String(url.searchParams.get("studentId") || "").trim();

      let list = await readStudentDetailChangeRequests();
      if (requestedBy) {
        list = list.filter((row) => row.requestedByUserId === requestedBy);
      }
      if (studentId) {
        list = list.filter((row) => row.studentId === studentId);
      }
      if (pendingOnly) {
        list = list.filter((row) => row.status === "pending");
      } else if (status) {
        list = list.filter((row) => row.status === status);
      }

      list.sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
      sendJson(res, 200, { ok: true, data: list });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load student detail change requests." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/student-detail-change-requests") {
    try {
      const body = await parseBody(req);
      const studentId = String(body.studentId || "").trim();
      const reason = String(body.reason || "").trim();
      const requestedByUserId = String(body.requestedByUserId || "").trim();
      const requestedByName = String(body.requestedByName || "").trim();
      const requestedByRole = String(body.requestedByRole || "").trim();

      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student id is required." });
        return true;
      }
      if (!reason) {
        sendJson(res, 400, { ok: false, error: "Reason is required." });
        return true;
      }
      if (!requestedByUserId) {
        sendJson(res, 400, { ok: false, error: "Requester id is required." });
        return true;
      }

      const studemts = await readStudemts();
      const student = studemts.find((s) => String(s.id || "") === studentId);
      if (!student) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return true;
      }

      const currentName = String(student.name || "").trim();
      const currentEmail = String(student.email || "").trim();
      const currentPhone = String(student.phone || "").trim();
      const currentWhatsappNumber = String(student.whatsappNumber || student.phone || "").trim();
      const currentEducationLevel = String(student.currentEducationLevel || "").trim();

      const requestedName = String(body.requestedName ?? currentName).trim();
      const requestedEmail = String(body.requestedEmail ?? currentEmail).trim();
      const requestedPhoneRaw = String(body.requestedPhone ?? currentPhone).trim();
      let requestedWhatsappNumber = String(body.requestedWhatsappNumber ?? currentWhatsappNumber).trim();
      const requestedEducationLevel = String(body.requestedEducationLevel ?? currentEducationLevel).trim();

      if (!requestedName) {
        sendJson(res, 400, { ok: false, error: "Student name is required." });
        return true;
      }
      if (!requestedEmail) {
        sendJson(res, 400, { ok: false, error: "Email is required." });
        return true;
      }
      if (!requestedPhoneRaw) {
        sendJson(res, 400, { ok: false, error: "Phone is required." });
        return true;
      }
      const requestedPhone = normalizeStudentPhone(requestedPhoneRaw);
      if (!requestedPhone) {
        sendJson(res, 400, {
          ok: false,
          error: "Enter a valid phone number (e.g. +94771234567, 0771234567, 771234567, or +14155552671).",
        });
        return true;
      }
      if (!requestedEducationLevel) {
        sendJson(res, 400, { ok: false, error: "Education level is required." });
        return true;
      }

      if (requestedWhatsappNumber) {
        requestedWhatsappNumber = normalizeWhatsappNumber(requestedWhatsappNumber) || "";
      } else {
        requestedWhatsappNumber = normalizeWhatsappNumber(requestedPhone) || requestedPhone;
      }
      if (!requestedWhatsappNumber) {
        sendJson(res, 400, {
          ok: false,
          error: "Enter a valid WhatsApp number (e.g. +94771234567, 0771234567, or +14155552671).",
        });
        return true;
      }

      const result = await appendStudentDetailChangeRequest({
        studentId,
        studentName: currentName || requestedName,
        currentName,
        requestedName,
        currentEmail,
        requestedEmail,
        currentPhone,
        requestedPhone,
        currentWhatsappNumber,
        requestedWhatsappNumber,
        currentEducationLevel,
        requestedEducationLevel,
        reason,
        requestedByUserId,
        requestedByName,
        requestedByRole,
      });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }

      logEvent("student-detail-change-request", "created", {
        id: result.data.id,
        studentId,
        requestedByUserId,
      });
      sendJson(res, 201, { ok: true, data: result.data });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (
    req.method === "POST" &&
    url.pathname.startsWith("/api/student-detail-change-requests/") &&
    url.pathname.endsWith("/decide")
  ) {
    try {
      const pathParts = url.pathname.replace("/api/student-detail-change-requests/", "").split("/");
      const requestId = decodeURIComponent(pathParts[0] || "").trim();
      const body = await parseBody(req);
      const decision = String(body.decision || "").trim().toLowerCase();
      const reviewerRole = String(body.reviewedByRole || "").trim();
      const reviewerUserId = String(body.reviewedByUserId || "").trim();
      const reviewerName = String(body.reviewedByName || "").trim();
      const reviewNote = String(body.reviewNote || "").trim();

      if (!APPROVER_ROLES.has(reviewerRole)) {
        sendJson(res, 403, {
          ok: false,
          error: "Only Admin, Manager, or Team Lead can review student detail change requests.",
        });
        return true;
      }
      if (!reviewerUserId) {
        sendJson(res, 400, { ok: false, error: "Reviewer id is required." });
        return true;
      }

      const result = await decideStudentDetailChangeRequest(requestId, decision, {
        userId: reviewerUserId,
        name: reviewerName,
        role: reviewerRole,
        reviewNote,
      });
      if (!result.ok) {
        const status = result.error === "Request not found." ? 404 : 400;
        sendJson(res, status, result);
        return true;
      }

      let updatedStudent = null;
      if (decision === "approved") {
        const studemts = await readStudemts();
        const idx = studemts.findIndex((s) => String(s.id || "") === result.data.studentId);
        if (idx === -1) {
          sendJson(res, 404, { ok: false, error: "Student not found for approved detail change." });
          return true;
        }
        studemts[idx] = applyApprovedDetailChanges(studemts[idx], result.data);
        await writeStudemts(studemts);
        updatedStudent = studemts[idx];
        logEvent("student-detail-change-request", "approved", {
          id: result.data.id,
          studentId: result.data.studentId,
          reviewedByUserId: reviewerUserId,
        });
      } else {
        logEvent("student-detail-change-request", "rejected", {
          id: result.data.id,
          studentId: result.data.studentId,
          reviewedByUserId: reviewerUserId,
        });
      }

      sendJson(res, 200, { ok: true, data: result.data, student: updatedStudent });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
