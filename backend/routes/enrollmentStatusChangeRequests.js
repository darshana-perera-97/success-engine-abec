const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const {
  REQUESTABLE_ENROLLMENT_STATUSES,
  normalizeEnrollmentStatus,
} = require("../lib/enrollmentStatus");
const {
  readEnrollmentStatusChangeRequests,
  appendEnrollmentStatusChangeRequest,
  decideEnrollmentStatusChangeRequest,
} = require("../models/enrollmentStatusChangeRequests");
const { readStudemts, writeStudemts } = require("../models/students");

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/enrollment-status-change-requests") {
    try {
      const requestedBy = String(url.searchParams.get("requestedBy") || "").trim();
      const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
      const pendingOnly = url.searchParams.get("pendingOnly") === "1" || url.searchParams.get("pendingOnly") === "true";
      const studentId = String(url.searchParams.get("studentId") || "").trim();

      let list = await readEnrollmentStatusChangeRequests();
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
      sendJson(res, 500, { ok: false, error: "Failed to load status change requests." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/enrollment-status-change-requests") {
    try {
      const body = await parseBody(req);
      const studentId = String(body.studentId || "").trim();
      const requestedStatus = normalizeEnrollmentStatus(body.requestedStatus, "");
      const reason = String(body.reason || "").trim();
      const requestedByUserId = String(body.requestedByUserId || "").trim();
      const requestedByName = String(body.requestedByName || "").trim();
      const requestedByRole = String(body.requestedByRole || "").trim();

      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student id is required." });
        return true;
      }
      if (!REQUESTABLE_ENROLLMENT_STATUSES.includes(requestedStatus)) {
        sendJson(res, 400, { ok: false, error: "Status can only be changed to Active or Dropped." });
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

      const currentStatus = normalizeEnrollmentStatus(student.enrollmentStatus);
      if (currentStatus === requestedStatus) {
        sendJson(res, 400, { ok: false, error: "Requested status matches the student's current status." });
        return true;
      }

      const result = await appendEnrollmentStatusChangeRequest({
        studentId,
        studentName: String(student.name || body.studentName || "").trim(),
        currentStatus,
        requestedStatus,
        reason,
        requestedByUserId,
        requestedByName,
        requestedByRole,
      });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }

      logEvent("enrollment-status-change-request", "created", {
        id: result.data.id,
        studentId,
        requestedStatus,
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
    url.pathname.startsWith("/api/enrollment-status-change-requests/") &&
    url.pathname.endsWith("/decide")
  ) {
    try {
      const pathParts = url.pathname.replace("/api/enrollment-status-change-requests/", "").split("/");
      const requestId = decodeURIComponent(pathParts[0] || "").trim();
      const body = await parseBody(req);
      const decision = String(body.decision || "").trim().toLowerCase();
      const reviewerRole = String(body.reviewedByRole || "").trim();
      const reviewerUserId = String(body.reviewedByUserId || "").trim();
      const reviewerName = String(body.reviewedByName || "").trim();
      const reviewNote = String(body.reviewNote || "").trim();

      if (reviewerRole !== "Admin") {
        sendJson(res, 403, { ok: false, error: "Only an Admin can review status change requests." });
        return true;
      }
      if (!reviewerUserId) {
        sendJson(res, 400, { ok: false, error: "Reviewer id is required." });
        return true;
      }

      const result = await decideEnrollmentStatusChangeRequest(requestId, decision, {
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
          sendJson(res, 404, { ok: false, error: "Student not found for approved status change." });
          return true;
        }
        const nowIso = new Date().toISOString();
        const nextStatus = normalizeEnrollmentStatus(result.data.requestedStatus, "");
        if (!REQUESTABLE_ENROLLMENT_STATUSES.includes(nextStatus)) {
          sendJson(res, 400, { ok: false, error: "Status can only be changed to Active or Dropped." });
          return true;
        }
        studemts[idx] = {
          ...studemts[idx],
          enrollmentStatus: nextStatus,
          enrollmentStatusReason: result.data.reason,
          enrollmentStatusUpdatedAt: nowIso,
          updatedAt: nowIso,
        };
        await writeStudemts(studemts);
        updatedStudent = studemts[idx];
        logEvent("enrollment-status-change-request", "approved", {
          id: result.data.id,
          studentId: result.data.studentId,
          enrollmentStatus: nextStatus,
          reviewedByUserId: reviewerUserId,
        });
      } else {
        logEvent("enrollment-status-change-request", "rejected", {
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
