const { readInvoices, writeInvoices } = require("../models/invoices");

function approvedPaidAmount(invoice) {
  const paid = Number(invoice?.paidAmount);
  return Number.isFinite(paid) && paid > 0 ? paid : 0;
}

function invoiceInvoicedAmount(invoice) {
  const amount = Number(invoice?.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

async function applyRefundToLedger(refundRequest, { refundNote = "" } = {}) {
  const refundAmount = Number(refundRequest?.amount);
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    return { ok: false, error: "Invalid refund amount." };
  }

  const invoices = await readInvoices();
  const studentId = String(refundRequest.studentId || "").trim();
  const invoiceId = String(refundRequest.invoiceId || "").trim();
  const currency = String(refundRequest.currency || "LKR").trim() || "LKR";

  let idx = -1;
  if (invoiceId) {
    idx = invoices.findIndex((inv) => String(inv.id || "") === invoiceId);
    if (idx === -1) return { ok: false, error: "Linked invoice not found." };
    if (String(invoices[idx].studentId || "") !== studentId) {
      return { ok: false, error: "Invoice does not belong to this student." };
    }
  } else {
    const candidates = invoices
      .filter((inv) => {
        if (String(inv.studentId || "") !== studentId) return false;
        if (String(inv.currency || "LKR").trim() !== currency) return false;
        return approvedPaidAmount(inv) >= refundAmount - 0.009;
      })
      .sort((a, b) => {
        const dateA = new Date(a.paidAmountRecordedAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.paidAmountRecordedAt || b.updatedAt || 0).getTime();
        return dateB - dateA;
      });
    if (!candidates.length) {
      return {
        ok: false,
        error: "No paid invoice found with sufficient balance for this refund. Link an invoice or reduce the amount.",
      };
    }
    idx = invoices.findIndex((inv) => inv.id === candidates[0].id);
  }

  const invoice = invoices[idx];
  if (String(invoice.currency || "LKR").trim() !== currency) {
    return { ok: false, error: "Refund currency must match the invoice currency." };
  }

  const previousPaid = approvedPaidAmount(invoice);
  if (refundAmount > previousPaid + 0.009) {
    return {
      ok: false,
      error: `Refund amount (${refundAmount}) exceeds paid amount (${previousPaid}) on the invoice.`,
    };
  }

  const invoiced = invoiceInvoicedAmount(invoice);
  const newPaidTotal = Math.max(0, previousPaid - refundAmount);
  const history = Array.isArray(invoice.paymentProofHistory) ? [...invoice.paymentProofHistory] : [];
  history.push({
    url: "",
    name: `Refund — ${String(refundRequest.id || "").trim() || "request"}`,
    uploadedAt: new Date().toISOString(),
    outcome: "refund",
    approvedAmount: refundAmount,
    refundRequestId: String(refundRequest.id || "").trim(),
    refundNote: String(refundNote || "").trim(),
  });

  let newStatus = String(invoice.status || "Pending").trim();
  if (newPaidTotal <= 0.009) {
    newStatus = invoiced > 0 ? "Pending" : newStatus;
  } else if (newPaidTotal >= invoiced - 0.009) {
    newStatus = "Paid";
  } else {
    newStatus = "Partially Paid";
  }

  const updated = {
    ...invoice,
    paidAmount: newPaidTotal,
    status: newStatus,
    paymentProofHistory: history,
    updatedAt: new Date().toISOString(),
  };

  invoices[idx] = updated;
  await writeInvoices(invoices);
  return { ok: true, invoice: updated, appliedInvoiceId: updated.id };
}

module.exports = {
  applyRefundToLedger,
};
