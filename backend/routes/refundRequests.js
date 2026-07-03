const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const {
  readRefundRequests,
  appendRefundRequest,
  decideRefundRequest,
  markRefundRequestRefunded,
} = require("../models/refundRequests");
const { readStudemts } = require("../models/students");
const { readInvoices } = require("../models/invoices");
const { applyRefundToLedger } = require("../services/refundLedger");

const APPROVER_ROLES = new Set(["Admin", "Manager", "Team Lead"]);
const REFUND_EXECUTOR_ROLES = new Set(["Accountant", "Admin"]);

function approvedPaidAmount(invoice) {
  const paid = Number(invoice?.paidAmount);
  return Number.isFinite(paid) && paid > 0 ? paid : 0;
}

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/refund-requests") {
    try {
      const requestedBy = String(url.searchParams.get("requestedBy") || "").trim();
      const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
      const pendingOnly = url.searchParams.get("pendingOnly") === "1" || url.searchParams.get("pendingOnly") === "true";
      const studentId = String(url.searchParams.get("studentId") || "").trim();
      const approvedOnly =
        url.searchParams.get("approvedOnly") === "1" || url.searchParams.get("approvedOnly") === "true";
      const accountantQueue =
        url.searchParams.get("accountantQueue") === "1" || url.searchParams.get("accountantQueue") === "true";

      let list = await readRefundRequests();
      if (requestedBy) {
        list = list.filter((row) => row.requestedByUserId === requestedBy);
      }
      if (studentId) {
        list = list.filter((row) => row.studentId === studentId);
      }
      if (accountantQueue) {
        list = list.filter((row) => row.status === "approved" || row.status === "refunded");
      } else if (approvedOnly) {
        list = list.filter((row) => row.status === "approved");
      } else if (pendingOnly) {
        list = list.filter((row) => row.status === "pending");
      } else if (status) {
        list = list.filter((row) => row.status === status);
      }

      list.sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
      sendJson(res, 200, { ok: true, data: list });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load refund requests." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/refund-requests") {
    try {
      const body = await parseBody(req);
      const studentId = String(body.studentId || "").trim();
      const amount = Number(body.amount);
      const currency = String(body.currency || "LKR").trim() || "LKR";
      const invoiceId = String(body.invoiceId || "").trim();
      const reason = String(body.reason || "").trim();
      const requestedByUserId = String(body.requestedByUserId || "").trim();
      const requestedByName = String(body.requestedByName || "").trim();
      const requestedByRole = String(body.requestedByRole || "").trim();

      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student id is required." });
        return true;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        sendJson(res, 400, { ok: false, error: "A valid refund amount is required." });
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

      if (invoiceId) {
        const invoices = await readInvoices();
        const invoice = invoices.find((inv) => String(inv.id || "") === invoiceId);
        if (!invoice) {
          sendJson(res, 404, { ok: false, error: "Linked invoice not found." });
          return true;
        }
        if (String(invoice.studentId || "") !== studentId) {
          sendJson(res, 400, { ok: false, error: "Invoice does not belong to this student." });
          return true;
        }
        if (String(invoice.currency || "LKR").trim() !== currency) {
          sendJson(res, 400, { ok: false, error: "Refund currency must match the invoice currency." });
          return true;
        }
        if (approvedPaidAmount(invoice) < amount - 0.009) {
          sendJson(res, 400, {
            ok: false,
            error: `Refund amount cannot exceed the paid amount (${approvedPaidAmount(invoice)}) on the selected invoice.`,
          });
          return true;
        }
      }

      const result = await appendRefundRequest({
        studentId,
        studentName: String(student.name || body.studentName || "").trim(),
        amount,
        currency,
        invoiceId,
        reason,
        requestedByUserId,
        requestedByName,
        requestedByRole,
      });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }

      logEvent("refund-request", "created", {
        id: result.data.id,
        studentId,
        amount,
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
    url.pathname.startsWith("/api/refund-requests/") &&
    url.pathname.endsWith("/decide")
  ) {
    try {
      const pathParts = url.pathname.replace("/api/refund-requests/", "").split("/");
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
          error: "Only Admin, Manager, or Team Lead can review refund requests.",
        });
        return true;
      }
      if (!reviewerUserId) {
        sendJson(res, 400, { ok: false, error: "Reviewer id is required." });
        return true;
      }

      const result = await decideRefundRequest(requestId, decision, {
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

      logEvent("refund-request", decision, {
        id: result.data.id,
        studentId: result.data.studentId,
        reviewedByUserId: reviewerUserId,
      });
      sendJson(res, 200, { ok: true, data: result.data });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (
    req.method === "POST" &&
    url.pathname.startsWith("/api/refund-requests/") &&
    url.pathname.endsWith("/mark-refunded")
  ) {
    try {
      const pathParts = url.pathname.replace("/api/refund-requests/", "").split("/");
      const requestId = decodeURIComponent(pathParts[0] || "").trim();
      const body = await parseBody(req);
      const actorRole = String(body.actorRole || "").trim();
      const actorUserId = String(body.actorUserId || "").trim();
      const actorName = String(body.actorName || "").trim();
      const refundNote = String(body.refundNote || "").trim();

      if (!REFUND_EXECUTOR_ROLES.has(actorRole)) {
        sendJson(res, 403, {
          ok: false,
          error: "Only Accountant or Admin can mark refunds as paid.",
        });
        return true;
      }
      if (!actorUserId) {
        sendJson(res, 400, { ok: false, error: "Actor id is required." });
        return true;
      }

      const existing = (await readRefundRequests()).find((row) => row.id === requestId);
      if (!existing) {
        sendJson(res, 404, { ok: false, error: "Request not found." });
        return true;
      }
      if (existing.status !== "approved") {
        sendJson(res, 400, {
          ok: false,
          error: "Only approved refund requests can be marked as refunded.",
        });
        return true;
      }

      const ledgerResult = await applyRefundToLedger(existing, { refundNote });
      if (!ledgerResult.ok) {
        sendJson(res, 400, ledgerResult);
        return true;
      }

      const result = await markRefundRequestRefunded(
        requestId,
        { userId: actorUserId, name: actorName },
        refundNote
      );
      if (!result.ok) {
        const status = result.error === "Request not found." ? 404 : 400;
        sendJson(res, status, result);
        return true;
      }

      logEvent("refund-request", "refunded", {
        id: result.data.id,
        studentId: result.data.studentId,
        invoiceId: ledgerResult.appliedInvoiceId,
        refundedByUserId: actorUserId,
      });
      sendJson(res, 200, { ok: true, data: result.data, invoice: ledgerResult.invoice });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
