import { AlertTriangle, X } from "lucide-react";
import { Button } from "./Button";
import { invoiceApprovedPaid } from "../invoicePaymentHelpers";

export function RefundRequestModal({
  student,
  open,
  amount = "",
  currency = "LKR",
  invoiceId = "",
  reason = "",
  saving = false,
  error = "",
  paidInvoices = [],
  onClose,
  onAmountChange,
  onCurrencyChange,
  onInvoiceIdChange,
  onReasonChange,
  onSubmit,
}) {
  if (!open || !student) return null;

  const studentName = String(student.name || student.id || "this student").trim();

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
          <h4 className="text-sm font-semibold text-slate-900">Request refund</h4>
          <button type="button" className="p-1 rounded-md text-slate-500 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-3">
            <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 space-y-1">
              <p>
                Request a refund for <span className="font-semibold">{studentName}</span>.
              </p>
              <p className="text-xs text-amber-800">
                An Admin, Manager, or Team Lead must approve before the accountant can process the payout and update the
                ledger.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-1">
              <span className="text-xs font-semibold text-slate-700">Amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => onAmountChange?.(e.target.value)}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                placeholder="0.00"
                disabled={saving}
              />
            </label>
            <label className="block col-span-1">
              <span className="text-xs font-semibold text-slate-700">Currency</span>
              <select
                value={currency}
                onChange={(e) => onCurrencyChange?.(e.target.value)}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                disabled={saving}
              >
                <option value="LKR">LKR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Link to invoice (optional)</span>
            <select
              value={invoiceId}
              onChange={(e) => onInvoiceIdChange?.(e.target.value)}
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              disabled={saving}
            >
              <option value="">Auto — apply to most recent paid invoice</option>
              {paidInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.id} — {inv.description || "Invoice"} ({inv.currency}{" "}
                  {invoiceApprovedPaid(inv).toLocaleString()} paid)
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Reason</span>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange?.(e.target.value)}
              rows={4}
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 resize-y"
              placeholder="e.g. student withdrew, duplicate payment, service not delivered…"
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
            className="bg-rose-600 hover:bg-rose-700 text-white"
            onClick={onSubmit}
            disabled={saving || !String(reason || "").trim() || !String(amount || "").trim()}
          >
            {saving ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </div>
    </div>
  );
}
