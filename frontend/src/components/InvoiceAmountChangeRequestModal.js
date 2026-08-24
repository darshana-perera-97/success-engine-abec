import { AlertTriangle, X } from "lucide-react";
import { Button } from "./Button";
import { invoiceApprovedPaid, invoiceInvoicedAmount } from "../invoicePaymentHelpers";

export function InvoiceAmountChangeRequestModal({
  student,
  invoice,
  open,
  amount = "",
  reason = "",
  saving = false,
  error = "",
  onClose,
  onAmountChange,
  onReasonChange,
  onSubmit,
}) {
  if (!open || !student || !invoice) return null;

  const studentName = String(student.name || student.id || "this student").trim();
  const currency = String(invoice.currency || "LKR").trim() || "LKR";
  const currentAmount = invoiceInvoicedAmount(invoice);
  const paidAmount = invoiceApprovedPaid(invoice);
  const minAmount = paidAmount > 0.009 ? paidAmount : 0.01;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80">
          <h4 className="text-sm font-semibold text-slate-900">Edit invoice amount</h4>
          <button type="button" className="p-1 rounded-md text-slate-500 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-3">
            <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 space-y-1">
              <p>
                Request a new amount for invoice{" "}
                <span className="font-semibold font-mono">{invoice.id}</span> for{" "}
                <span className="font-semibold">{studentName}</span>.
              </p>
              <p className="text-xs text-amber-800">
                An Admin, Manager, or Team Lead must approve this in Team Requests before the ledger is updated.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm space-y-1">
            <p>
              <span className="text-slate-500">Invoice:</span>{" "}
              <span className="font-medium text-slate-900">{invoice.description || invoice.id}</span>
            </p>
            <p>
              <span className="text-slate-500">Current amount:</span>{" "}
              <span className="font-semibold tabular-nums text-slate-900">
                {currency} {currentAmount.toLocaleString()}
              </span>
            </p>
            {paidAmount > 0.009 ? (
              <p>
                <span className="text-slate-500">Paid so far:</span>{" "}
                <span className="font-semibold tabular-nums text-emerald-700">
                  {currency} {paidAmount.toLocaleString()}
                </span>
              </p>
            ) : null}
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">New amount ({currency})</span>
            <input
              type="number"
              min={minAmount}
              step="0.01"
              value={amount}
              onChange={(e) => onAmountChange?.(e.target.value)}
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              placeholder="0.00"
              disabled={saving}
            />
            {paidAmount > 0.009 ? (
              <p className="text-[11px] text-slate-500 mt-1">
                New amount cannot be less than the amount already paid.
              </p>
            ) : null}
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Reason</span>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange?.(e.target.value)}
              rows={4}
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 resize-y"
              placeholder="Why should this invoice amount change?"
              disabled={saving}
            />
          </label>
          <p className="text-[11px] text-slate-500">Track approval status under My Requests.</p>
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={saving || !String(reason || "").trim() || !String(amount || "").trim()}
          >
            {saving ? "Submitting…" : "Submit for approval"}
          </Button>
        </div>
      </div>
    </div>
  );
}
