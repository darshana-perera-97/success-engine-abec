const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const {
  intakeValuesMatch,
  validateIntakeFields,
} = require("../lib/intakeUtils");
const {
  readIntakeChangeRequests,
  appendIntakeChangeRequest,
  decideIntakeChangeRequest,
} = require("../models/intakeChangeRequests");
const { readStudemts, writeStudemts } = require("../models/students");

const APPROVER_ROLES = new Set(["Admin", "Manager", "Team Lead"]);

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/intake-change-requests") {
    try {
      const requestedBy = String(url.searchParams.get("requestedBy") || "").trim();
      const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
      const pendingOnly = url.searchParams.get("pendingOnly") === "1" || url.searchParams.get("pendingOnly") === "true";
      const studentId = String(url.searchParams.get("studentId") || "").trim();

      let list = await readIntakeChangeRequests();
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
      sendJson(res, 500, { ok: false, error: "Failed to load intake change requests." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/intake-change-requests") {
    try {
      const body = await parseBody(req);
      const studentId = String(body.studentId || "").trim();
      const requestedIntakeMonth = String(body.requestedIntakeMonth || "").trim();
      const requestedIntakeYear = String(body.requestedIntakeYear || "").trim();
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

      const intakeValidation = validateIntakeFields(requestedIntakeMonth, requestedIntakeYear, { required: true });
      if (!intakeValidation.ok) {
        sendJson(res, 400, intakeValidation);
        return true;
      }

      const studemts = await readStudemts();
      const student = studemts.find((s) => String(s.id || "") === studentId);
      if (!student) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return true;
      }

      const currentIntakeMonth = String(student.intakeMonth || "").trim() || null;
      const currentIntakeYear = String(student.intakeYear || "").trim() || null;
      if (
        intakeValuesMatch(
          currentIntakeMonth,
          currentIntakeYear,
          intakeValidation.intakeMonth,
          intakeValidation.intakeYear
        )
      ) {
        sendJson(res, 400, { ok: false, error: "Requested intake matches the student's current intake." });
        return true;
      }

      const result = await appendIntakeChangeRequest({
        studentId,
        studentName: String(student.name || body.studentName || "").trim(),
        currentIntakeMonth,
        currentIntakeYear,
        requestedIntakeMonth: intakeValidation.intakeMonth,
        requestedIntakeYear: intakeValidation.intakeYear,
        reason,
        requestedByUserId,
        requestedByName,
        requestedByRole,
      });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }

      logEvent("intake-change-request", "created", {
        id: result.data.id,
        studentId,
        requestedIntakeMonth: intakeValidation.intakeMonth,
        requestedIntakeYear: intakeValidation.intakeYear,
        requestedByUserId,
      });
      sendJson(res, 201, { ok: true, data: result.data });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/intake-change-requests/") && url.pathname.endsWith("/decide")) {
    try {
      const pathParts = url.pathname.replace("/api/intake-change-requests/", "").split("/");
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
          error: "Only Admin, Manager, or Team Lead can review intake change requests.",
        });
        return true;
      }
      if (!reviewerUserId) {
        sendJson(res, 400, { ok: false, error: "Reviewer id is required." });
        return true;
      }

      const result = await decideIntakeChangeRequest(requestId, decision, {
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
          sendJson(res, 404, { ok: false, error: "Student not found for approved intake change." });
          return true;
        }
        const nowIso = new Date().toISOString();
        studemts[idx] = {
          ...studemts[idx],
          intakeMonth: result.data.requestedIntakeMonth,
          intakeYear: result.data.requestedIntakeYear,
          updatedAt: nowIso,
        };
        await writeStudemts(studemts);
        updatedStudent = studemts[idx];
        logEvent("intake-change-request", "approved", {
          id: result.data.id,
          studentId: result.data.studentId,
          intakeMonth: result.data.requestedIntakeMonth,
          intakeYear: result.data.requestedIntakeYear,
          reviewedByUserId: reviewerUserId,
        });
      } else {
        logEvent("intake-change-request", "rejected", {
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
