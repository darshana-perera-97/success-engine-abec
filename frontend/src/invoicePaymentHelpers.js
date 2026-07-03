export function invoiceInvoicedAmount(inv) {
  const amount = Number(inv?.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function invoiceApprovedPaid(inv) {
  const paid = Number(inv?.paidAmount);
  return Number.isFinite(paid) && paid > 0 ? paid : 0;
}

export function invoiceBalanceDue(inv) {
  return Math.max(0, invoiceInvoicedAmount(inv) - invoiceApprovedPaid(inv));
}

export function isInvoiceFullyPaid(inv) {
  const status = String(inv?.status || "").trim();
  if (status === "Paid" || status === "Waived") return true;
  if (status === "Wave-off Rejected") return true;
  return invoiceBalanceDue(inv) <= 0.009;
}

export function invoiceHasOpenBalance(inv) {
  return !isInvoiceFullyPaid(inv);
}

export function evidenceDisplayAmount(evidence, inv) {
  const approved = Number(evidence?.approvedAmount);
  if (Number.isFinite(approved) && approved > 0) return approved;
  const claimed = Number(evidence?.claimedAmount);
  if (Number.isFinite(claimed) && claimed > 0) return claimed;
  if (evidence?.isCurrent) {
    const currentClaimed = Number(inv?.paymentProofClaimedAmount);
    if (Number.isFinite(currentClaimed) && currentClaimed > 0) return currentClaimed;
  }
  const balanceAtUpload = Number(evidence?.balanceDueAtUpload ?? inv?.paymentProofBalanceDue);
  if (Number.isFinite(balanceAtUpload) && balanceAtUpload > 0) return balanceAtUpload;
  return invoiceInvoicedAmount(inv);
}

export function evidencePaymentKind(evidence, inv) {
  const amt = evidenceDisplayAmount(evidence, inv);
  if (!Number.isFinite(amt) || amt <= 0) return "unknown";
  const balanceAtUpload = Number(evidence?.balanceDueAtUpload ?? inv?.paymentProofBalanceDue);
  const paidBefore = Number(evidence?.paidBeforeUpload ?? inv?.paymentProofPaidBefore);
  const hadPriorPayments = Number.isFinite(paidBefore) && paidBefore > 0.009;
  if (Number.isFinite(balanceAtUpload) && balanceAtUpload > 0) {
    if (amt >= balanceAtUpload - 0.009) return hadPriorPayments ? "balance" : "full";
    return "partial";
  }
  const invoiced = invoiceInvoicedAmount(inv);
  if (hadPriorPayments) {
    return amt >= invoiceBalanceDue(inv) - 0.009 ? "balance" : "partial";
  }
  return amt >= invoiced - 0.009 ? "full" : "partial";
}

export function evidencePaymentKindLabel(kind) {
  switch (kind) {
    case "full":
      return "Full payment";
    case "partial":
      return "Partial payment";
    case "balance":
      return "Balance payment";
    default:
      return "";
  }
}

export function evidencePaymentKindClass(kind) {
  switch (kind) {
    case "full":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "partial":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "balance":
      return "bg-sky-50 text-sky-700 border-sky-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

export function isFullPaymentReceiptAmount(amount, balanceDue) {
  const amt = Number(amount);
  const balance = Number(balanceDue);
  return Number.isFinite(amt) && Number.isFinite(balance) && balance > 0 && amt >= balance - 0.009;
}
