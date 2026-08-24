const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const {
  readInvoiceAmountChangeRequests,
  appendInvoiceAmountChangeRequest,
  decideInvoiceAmountChangeRequest,
} = require("../models/invoiceAmountChangeRequests");
const { readStudemts, publicInvoiceRecord } = require("../models/students");
const { readInvoices, writeInvoices } = require("../models/invoices");

const APPROVER_ROLES = new Set(["Admin", "Manager", "Team Lead"]);
const BLOCKED_REQUESTER_ROLES = new Set(["student"]);

function approvedPaidAmount(invoice) {
  const paid = Number(invoice?.paidAmount);
  return Number.isFinite(paid) && paid > 0 ? paid : 0;
}

function invoiceInvoicedAmount(invoice) {
  const amount = Number(invoice?.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function isBlockedRequesterRole(role) {
  return BLOCKED_REQUESTER_ROLES.has(String(role || "").trim().toLowerCase());
}

function invoiceAllowsAmountChange(invoice) {
  if (!invoice || invoice.isWaveOff === true) return { ok: false, error: "Wave-off invoices cannot have their amount changed." };
  const status = String(invoice.status || "").trim();
  if (status === "Wave-off Pending" || status === "Waived" || status === "Wave-off Rejected") {
    return { ok: false, error: "Wave-off invoices cannot have their amount changed." };
  }
  if (status === "Verifying") {
    return { ok: false, error: "Wait until payment evidence is reviewed before changing the invoice amount." };
  }
  return { ok: true };
}

function nextInvoiceStatusAfterAmountChange(invoice, newAmount) {
  const paid = approvedPaidAmount(invoice);
  const status = String(invoice.status || "").trim();
  if (newAmount <= paid + 0.009) return "Paid";
  if (paid > 0.009) return "Partially Paid";
  if (status === "Overdue") return "Overdue";
  return "Pending";
}

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/invoice-amount-change-requests") {
    try {
      const requestedBy = String(url.searchParams.get("requestedBy") || "").trim();
      const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
      const pendingOnly = url.searchParams.get("pendingOnly") === "1" || url.searchParams.get("pendingOnly") === "true";
      const studentId = String(url.searchParams.get("studentId") || "").trim();
      const invoiceId = String(url.searchParams.get("invoiceId") || "").trim();

      let list = await readInvoiceAmountChangeRequests();
      if (requestedBy) {
        list = list.filter((row) => row.requestedByUserId === requestedBy);
      }
      if (studentId) {
        list = list.filter((row) => row.studentId === studentId);
      }
      if (invoiceId) {
        list = list.filter((row) => row.invoiceId === invoiceId);
      }
      if (pendingOnly) {
        list = list.filter((row) => row.status === "pending");
      } else if (status) {
        list = list.filter((row) => row.status === status);
      }

      list.sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
      sendJson(res, 200, { ok: true, data: list });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load invoice amount change requests." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/invoice-amount-change-requests") {
    try {
      const body = await parseBody(req);
      const invoiceId = String(body.invoiceId || "").trim();
      const requestedAmount = Number(body.requestedAmount);
      const reason = String(body.reason || "").trim();
      const requestedByUserId = String(body.requestedByUserId || "").trim();
      const requestedByName = String(body.requestedByName || "").trim();
      const requestedByRole = String(body.requestedByRole || "").trim();

      if (isBlockedRequesterRole(requestedByRole)) {
        sendJson(res, 403, { ok: false, error: "Students cannot request invoice amount changes." });
        return true;
      }
      if (!invoiceId) {
        sendJson(res, 400, { ok: false, error: "Invoice id is required." });
        return true;
      }
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        sendJson(res, 400, { ok: false, error: "A valid requested amount is required." });
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

      const invoices = await readInvoices();
      const invoice = invoices.find((inv) => String(inv.id || "") === invoiceId);
      if (!invoice) {
        sendJson(res, 404, { ok: false, error: "Invoice not found." });
        return true;
      }

      const allowed = invoiceAllowsAmountChange(invoice);
      if (!allowed.ok) {
        sendJson(res, 400, allowed);
        return true;
      }

      const currentAmount = invoiceInvoicedAmount(invoice);
      if (Math.abs(currentAmount - requestedAmount) < 0.009) {
        sendJson(res, 400, { ok: false, error: "Requested amount matches the current invoice amount." });
        return true;
      }

      const paid = approvedPaidAmount(invoice);
      if (requestedAmount + 0.009 < paid) {
        sendJson(res, 400, {
          ok: false,
          error: `Requested amount cannot be less than the amount already paid (${paid}).`,
        });
        return true;
      }

      const studentId = String(invoice.studentId || body.studentId || "").trim();
      const studemts = await readStudemts();
      const student = studemts.find((s) => String(s.id || "") === studentId);

      const result = await appendInvoiceAmountChangeRequest({
        invoiceId,
        studentId,
        studentName: String(student?.name || invoice.studentName || body.studentName || "").trim(),
        description: String(invoice.description || "").trim(),
        currency: String(invoice.currency || "LKR").trim() || "LKR",
        currentAmount,
        requestedAmount,
        reason,
        requestedByUserId,
        requestedByName,
        requestedByRole,
      });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }

      logEvent("invoice-amount-change-request", "created", {
        id: result.data.id,
        invoiceId,
        studentId,
        requestedAmount,
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
    url.pathname.startsWith("/api/invoice-amount-change-requests/") &&
    url.pathname.endsWith("/decide")
  ) {
    try {
      const pathParts = url.pathname.replace("/api/invoice-amount-change-requests/", "").split("/");
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
          error: "Only Admin, Manager, or Team Lead can review invoice amount change requests.",
        });
        return true;
      }
      if (!reviewerUserId) {
        sendJson(res, 400, { ok: false, error: "Reviewer id is required." });
        return true;
      }

      const pendingList = await readInvoiceAmountChangeRequests();
      const pending = pendingList.find((row) => row.id === requestId);
      if (!pending) {
        sendJson(res, 404, { ok: false, error: "Request not found." });
        return true;
      }
      if (pending.status !== "pending") {
        sendJson(res, 400, { ok: false, error: "This request has already been reviewed." });
        return true;
      }

      let invoiceToApply = null;
      if (decision === "approved") {
        const invoices = await readInvoices();
        const idx = invoices.findIndex((inv) => String(inv.id || "") === pending.invoiceId);
        if (idx === -1) {
          sendJson(res, 404, { ok: false, error: "Invoice not found for approved amount change." });
          return true;
        }
        const currentInvoice = invoices[idx];
        const allowed = invoiceAllowsAmountChange(currentInvoice);
        if (!allowed.ok) {
          sendJson(res, 400, allowed);
          return true;
        }
        const paid = approvedPaidAmount(currentInvoice);
        if (pending.requestedAmount + 0.009 < paid) {
          sendJson(res, 400, {
            ok: false,
            error: `Requested amount cannot be less than the amount already paid (${paid}).`,
          });
          return true;
        }
        invoiceToApply = { invoices, idx, currentInvoice };
      } else if (decision !== "rejected") {
        sendJson(res, 400, { ok: false, error: "Decision must be approved or rejected." });
        return true;
      }

      const result = await decideInvoiceAmountChangeRequest(requestId, decision, {
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

      let updatedInvoice = null;
      if (decision === "approved" && invoiceToApply) {
        const nowIso = new Date().toISOString();
        const merged = {
          ...invoiceToApply.currentInvoice,
          amount: pending.requestedAmount,
          status: nextInvoiceStatusAfterAmountChange(invoiceToApply.currentInvoice, pending.requestedAmount),
          amountChangedAt: nowIso,
          amountChangedByUserId: reviewerUserId,
          amountChangedByName: reviewerName,
          amountChangedByRole: reviewerRole,
          amountChangeRequestId: pending.id,
          updatedAt: nowIso,
        };
        const nextInvoices = [...invoiceToApply.invoices];
        nextInvoices[invoiceToApply.idx] = merged;
        await writeInvoices(nextInvoices);
        updatedInvoice = merged;
      }

      logEvent("invoice-amount-change-request", decision, {
        id: result.data.id,
        invoiceId: result.data.invoiceId,
        studentId: result.data.studentId,
        reviewedByUserId: reviewerUserId,
      });
      sendJson(res, 200, {
        ok: true,
        data: result.data,
        invoice: updatedInvoice ? publicInvoiceRecord(req, updatedInvoice) : null,
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
