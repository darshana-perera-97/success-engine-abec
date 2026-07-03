import { AlertTriangle, X } from "lucide-react";
import { Button } from "./Button";

export function RemoveStudentRequestModal({
  student,
  open,
  stage = 1,
  reason = "",
  saving = false,
  error = "",
  onClose,
  onContinue,
  onBack,
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
          <h4 className="text-sm font-semibold text-slate-900">
            {stage === 1 ? "Request student removal" : "Reason for removal"}
          </h4>
          <button type="button" className="p-1 rounded-md text-slate-500 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {stage === 1 ? (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-3">
                <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900 space-y-2">
                  <p>
                    You are about to request removal of{" "}
                    <span className="font-semibold">{studentName}</span> from the system.
                  </p>
                  <p className="text-xs text-amber-800">
                    On submit, all student files will be downloaded (same as Export). An Admin, Manager, or Team Lead
                    must approve before the student record and stored files are permanently deleted.
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Student ID: <span className="font-medium text-slate-700">{student.id || "—"}</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Explain why <span className="font-medium text-slate-900">{studentName}</span> should be removed.
              </p>
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Reason</span>
                <textarea
                  value={reason}
                  onChange={(e) => onReasonChange?.(e.target.value)}
                  rows={4}
                  className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 resize-y"
                  placeholder="e.g. duplicate record, student withdrew, data entered in error…"
                  disabled={saving}
                />
              </label>
              <p className="text-[11px] text-slate-500">
                Your export will start when you submit. Track approval status under My Requests.
              </p>
            </>
          )}
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
          {stage === 1 ? (
            <>
              <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white"
                onClick={onContinue}
                disabled={saving}
              >
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={onBack} disabled={saving}>
                Back
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white"
                onClick={onSubmit}
                disabled={saving || !String(reason || "").trim()}
              >
                {saving ? "Submitting…" : "Submit request"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
