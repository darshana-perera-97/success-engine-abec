const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const {
  readBranchWhatsappMessengerChangeRequests,
  appendBranchWhatsappMessengerChangeRequest,
  decideBranchWhatsappMessengerChangeRequest,
} = require("../models/branchWhatsappMessengerChangeRequests");
const { readStudemts, writeStudemts } = require("../models/students");
const { readBranches } = require("../models/branches");
const {
  isBranchWhatsappEnabled,
  listBranchWhatsappAccounts,
  validateStudentBranchWhatsappMessengerUserId,
  setBranchWhatsappMessenger,
  isBranchWhatsappAccountForStudentBranch,
} = require("../services/branchWhatsapp");

const APPROVER_ROLES = new Set(["Admin", "Manager", "Team Lead"]);

function findStudentBranchRecord(branches, student) {
  const branchLabel = String(student?.branch || "").trim().toLowerCase();
  if (!branchLabel) return null;
  return (
    branches.find((row) => String(row?.location || "").trim().toLowerCase() === branchLabel) || null
  );
}

async function resolveMessengerAccountSnapshot(student, messengerUserId) {
  const userId = String(messengerUserId || "").trim();
  if (!userId) {
    return {
      messengerUserId: "",
      messengerName: "",
      whatsappName: "",
      whatsappNumber: "",
    };
  }
  const branches = await readBranches();
  const branch = findStudentBranchRecord(branches, student);
  if (!branch) {
    return {
      messengerUserId: userId,
      messengerName: "",
      whatsappName: "",
      whatsappNumber: "",
    };
  }
  const accounts = await listBranchWhatsappAccounts(branch);
  const account = accounts.find((row) => String(row?.userId || "") === userId) || null;
  return {
    messengerUserId: userId,
    messengerName: String(account?.name || "").trim(),
    whatsappName: String(account?.whatsappName || "").trim(),
    whatsappNumber: String(account?.whatsappNumber || "").trim(),
  };
}

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/branch-whatsapp-messenger-change-requests") {
    try {
      const requestedBy = String(url.searchParams.get("requestedBy") || "").trim();
      const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
      const pendingOnly =
        url.searchParams.get("pendingOnly") === "1" || url.searchParams.get("pendingOnly") === "true";
      const studentId = String(url.searchParams.get("studentId") || "").trim();

      let list = await readBranchWhatsappMessengerChangeRequests();
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
      sendJson(res, 500, { ok: false, error: "Failed to load WhatsApp contact change requests." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/branch-whatsapp-messenger-change-requests") {
    try {
      if (!(await isBranchWhatsappEnabled())) {
        sendJson(res, 400, { ok: false, error: "Branch WhatsApp is not enabled." });
        return true;
      }

      const body = await parseBody(req);
      const studentId = String(body.studentId || "").trim();
      const requestedMessengerUserId = String(body.requestedMessengerUserId || "").trim();
      const reason = String(body.reason || "").trim();
      const requestedByUserId = String(body.requestedByUserId || "").trim();
      const requestedByName = String(body.requestedByName || "").trim();
      const requestedByRole = String(body.requestedByRole || "").trim();

      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student id is required." });
        return true;
      }
      if (!requestedMessengerUserId) {
        sendJson(res, 400, { ok: false, error: "Requested WhatsApp account is required." });
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

      const validationError = await validateStudentBranchWhatsappMessengerUserId(
        student,
        requestedMessengerUserId
      );
      if (validationError) {
        sendJson(res, 400, { ok: false, error: validationError });
        return true;
      }

      const currentMessengerUserId = String(student.branchWhatsappMessengerUserId || "").trim();
      if (currentMessengerUserId && currentMessengerUserId === requestedMessengerUserId) {
        sendJson(res, 400, {
          ok: false,
          error: "Requested WhatsApp account matches the student's current contact account.",
        });
        return true;
      }

      const currentSnapshot = await resolveMessengerAccountSnapshot(student, currentMessengerUserId);
      const requestedSnapshot = await resolveMessengerAccountSnapshot(student, requestedMessengerUserId);

      const result = await appendBranchWhatsappMessengerChangeRequest({
        studentId,
        studentName: String(student.name || body.studentName || "").trim(),
        currentMessengerUserId: currentSnapshot.messengerUserId,
        currentMessengerName: currentSnapshot.messengerName,
        currentWhatsappName: currentSnapshot.whatsappName,
        currentWhatsappNumber: currentSnapshot.whatsappNumber,
        requestedMessengerUserId: requestedSnapshot.messengerUserId,
        requestedMessengerName: requestedSnapshot.messengerName,
        requestedWhatsappName: requestedSnapshot.whatsappName,
        requestedWhatsappNumber: requestedSnapshot.whatsappNumber,
        reason,
        requestedByUserId,
        requestedByName,
        requestedByRole,
      });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }

      logEvent("branch-whatsapp-messenger-change-request", "created", {
        id: result.data.id,
        studentId,
        requestedMessengerUserId,
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
    url.pathname.startsWith("/api/branch-whatsapp-messenger-change-requests/") &&
    url.pathname.endsWith("/decide")
  ) {
    try {
      const pathParts = url.pathname
        .replace("/api/branch-whatsapp-messenger-change-requests/", "")
        .split("/");
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
          error: "Only Admin, Manager, or Team Lead can review WhatsApp contact change requests.",
        });
        return true;
      }
      if (!reviewerUserId) {
        sendJson(res, 400, { ok: false, error: "Reviewer id is required." });
        return true;
      }

      const result = await decideBranchWhatsappMessengerChangeRequest(requestId, decision, {
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
          sendJson(res, 404, { ok: false, error: "Student not found for approved WhatsApp contact change." });
          return true;
        }
        const student = studemts[idx];
        const validationError = await validateStudentBranchWhatsappMessengerUserId(
          student,
          result.data.requestedMessengerUserId
        );
        if (validationError) {
          sendJson(res, 400, { ok: false, error: validationError });
          return true;
        }
        const nowIso = new Date().toISOString();
        studemts[idx] = {
          ...studemts[idx],
          branchWhatsappMessengerUserId: result.data.requestedMessengerUserId,
          updatedAt: nowIso,
        };
        await writeStudemts(studemts);
        updatedStudent = studemts[idx];

        const branches = await readBranches();
        const studentBranch = findStudentBranchRecord(branches, updatedStudent);
        if (
          studentBranch &&
          (await isBranchWhatsappAccountForStudentBranch(updatedStudent, result.data.requestedMessengerUserId))
        ) {
          await setBranchWhatsappMessenger(studentBranch.id, result.data.requestedMessengerUserId);
        }

        logEvent("branch-whatsapp-messenger-change-request", "approved", {
          id: result.data.id,
          studentId: result.data.studentId,
          messengerUserId: result.data.requestedMessengerUserId,
          reviewedByUserId: reviewerUserId,
        });
      } else {
        logEvent("branch-whatsapp-messenger-change-request", "rejected", {
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
