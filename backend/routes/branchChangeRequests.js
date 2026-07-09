const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const {
  readBranchChangeRequests,
  appendBranchChangeRequest,
  decideBranchChangeRequest,
} = require("../models/branchChangeRequests");
const { readStudemts, writeStudemts } = require("../models/students");
const { readUsers } = require("../models/users");
const { branchesMatchBackend } = require("../services/pipeline");
const { isStudentContactStaffRole } = require("../services/roles");

const APPROVER_ROLES = new Set(["Admin", "Manager", "Team Lead"]);

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/branch-change-requests") {
    try {
      const requestedBy = String(url.searchParams.get("requestedBy") || "").trim();
      const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
      const pendingOnly = url.searchParams.get("pendingOnly") === "1" || url.searchParams.get("pendingOnly") === "true";
      const studentId = String(url.searchParams.get("studentId") || "").trim();

      let list = await readBranchChangeRequests();
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
      sendJson(res, 500, { ok: false, error: "Failed to load branch change requests." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/branch-change-requests") {
    try {
      const body = await parseBody(req);
      const studentId = String(body.studentId || "").trim();
      const requestedBranch = String(body.requestedBranch || "").trim();
      const reason = String(body.reason || "").trim();
      const requestedByUserId = String(body.requestedByUserId || "").trim();
      const requestedByName = String(body.requestedByName || "").trim();
      const requestedByRole = String(body.requestedByRole || "").trim();

      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student id is required." });
        return true;
      }
      if (!requestedBranch) {
        sendJson(res, 400, { ok: false, error: "Requested branch is required." });
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

      const currentBranch = String(student.branch || "").trim();
      if (currentBranch && currentBranch.toLowerCase() === requestedBranch.toLowerCase()) {
        sendJson(res, 400, { ok: false, error: "Requested branch matches the student's current branch." });
        return true;
      }

      const result = await appendBranchChangeRequest({
        studentId,
        studentName: String(student.name || body.studentName || "").trim(),
        currentBranch,
        requestedBranch,
        reason,
        requestedByUserId,
        requestedByName,
        requestedByRole,
      });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }

      logEvent("branch-change-request", "created", {
        id: result.data.id,
        studentId,
        requestedBranch,
        requestedByUserId,
      });
      sendJson(res, 201, { ok: true, data: result.data });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/branch-change-requests/") && url.pathname.endsWith("/decide")) {
    try {
      const pathParts = url.pathname.replace("/api/branch-change-requests/", "").split("/");
      const requestId = decodeURIComponent(pathParts[0] || "").trim();
      const body = await parseBody(req);
      const decision = String(body.decision || "").trim().toLowerCase();
      const reviewerRole = String(body.reviewedByRole || "").trim();
      const reviewerUserId = String(body.reviewedByUserId || "").trim();
      const reviewerName = String(body.reviewedByName || "").trim();
      const reviewNote = String(body.reviewNote || "").trim();
      const approvedCounselorId = String(body.approvedCounselorId || "").trim();

      if (!APPROVER_ROLES.has(reviewerRole)) {
        sendJson(res, 403, { ok: false, error: "Only Admin, Manager, or Team Lead can review branch change requests." });
        return true;
      }
      if (!reviewerUserId) {
        sendJson(res, 400, { ok: false, error: "Reviewer id is required." });
        return true;
      }

      // When approving, a counselor in the new branch must be selected to handle
      // the student. Validate before committing the decision so we never approve
      // a request with an invalid/missing handover counselor.
      let approvedCounselor = null;
      if (decision === "approved") {
        if (!approvedCounselorId) {
          sendJson(res, 400, { ok: false, error: "Select a counselor in the new branch to handle this student." });
          return true;
        }
        const pending = (await readBranchChangeRequests()).find((row) => row.id === requestId);
        if (!pending) {
          sendJson(res, 404, { ok: false, error: "Request not found." });
          return true;
        }
        if (pending.status !== "pending") {
          sendJson(res, 400, { ok: false, error: "This request has already been reviewed." });
          return true;
        }
        const requestedBranch = String(pending.requestedBranch || "").trim();
        const users = await readUsers();
        approvedCounselor = users.find((u) => String(u.id || "").trim() === approvedCounselorId) || null;
        if (!approvedCounselor || !isStudentContactStaffRole(approvedCounselor.role)) {
          sendJson(res, 400, { ok: false, error: "Selected counselor is not a valid staff member." });
          return true;
        }
        if (requestedBranch && !branchesMatchBackend(approvedCounselor.branch, requestedBranch)) {
          sendJson(res, 400, { ok: false, error: "Selected counselor does not belong to the requested branch." });
          return true;
        }
      }

      const approvedCounselorName =
        String(body.approvedCounselorName || "").trim() ||
        String(approvedCounselor?.username || approvedCounselor?.name || approvedCounselor?.email || "").trim();

      const result = await decideBranchChangeRequest(requestId, decision, {
        userId: reviewerUserId,
        name: reviewerName,
        role: reviewerRole,
        reviewNote,
        approvedCounselorId,
        approvedCounselorName,
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
          sendJson(res, 404, { ok: false, error: "Student not found for approved branch change." });
          return true;
        }
        const nowIso = new Date().toISOString();
        const previous = studemts[idx];
        const previousCounselorId = String(previous.counselor || "").trim();
        const nextCounselorId = String(result.data.approvedCounselorId || "").trim();
        const nextCounselorName = String(result.data.approvedCounselorName || "").trim();
        const counselorHistory = Array.isArray(previous.counselorHistory)
          ? [...previous.counselorHistory]
          : [];
        if (
          previousCounselorId &&
          previousCounselorId !== nextCounselorId &&
          !counselorHistory.includes(previousCounselorId)
        ) {
          counselorHistory.push(previousCounselorId);
        }
        studemts[idx] = {
          ...previous,
          branch: result.data.requestedBranch,
          ...(nextCounselorId
            ? {
                counselor: nextCounselorId,
                counselorName: nextCounselorName,
                counselorHistory,
              }
            : {}),
          updatedAt: nowIso,
        };
        await writeStudemts(studemts);
        updatedStudent = studemts[idx];
        logEvent("branch-change-request", "approved", {
          id: result.data.id,
          studentId: result.data.studentId,
          branch: result.data.requestedBranch,
          counselor: nextCounselorId,
          reviewedByUserId: reviewerUserId,
        });
      } else {
        logEvent("branch-change-request", "rejected", {
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
