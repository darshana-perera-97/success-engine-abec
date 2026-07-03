import { X } from "lucide-react";
import { Button } from "./Button";
import { formatRequestChangeSummary, formatRequestTypeLabel, getStudentDetailChangeRows } from "../utils/studentDetailChangeRequests";

export function RequestReasonModal({ row, onClose, showReviewNote = false }) {
  if (!row) return null;

  const isDetailChange = row.requestType === "student-details";
  const isStudentRemoval = row.requestType === "student-removal";
  const detailChanges = isDetailChange ? getStudentDetailChangeRows(row) : [];

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
          <h4 className="text-sm font-semibold text-slate-900">Request reason</h4>
          <button type="button" className="p-1 rounded-md text-slate-500 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-sm text-slate-600 space-y-1">
            <p>
              <span className="text-slate-500">Type:</span>{" "}
              <span className="font-medium text-slate-900">{formatRequestTypeLabel(row)}</span>
            </p>
            <p>
              <span className="text-slate-500">Student:</span>{" "}
              <span className="font-medium text-slate-900">{row.studentName || row.studentId || "—"}</span>
            </p>
            {isDetailChange ? (
              <div className="space-y-1 pt-1">
                <p className="text-slate-500">Changes:</p>
                {detailChanges.map((item) => (
                  <p key={item.field} className="text-slate-700 text-xs">
                    <span className="font-medium">{item.label}:</span> {item.current} → {item.requested}
                  </p>
                ))}
              </div>
            ) : isStudentRemoval ? (
              <p>
                <span className="text-slate-500">Action:</span>{" "}
                <span className="text-slate-700">{formatRequestChangeSummary(row)}</span>
              </p>
            ) : (
              <p>
                <span className="text-slate-500">Change:</span>{" "}
                <span className="text-slate-700">{formatRequestChangeSummary(row)}</span>
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-1">Reason</p>
            <p className="text-sm text-slate-800 whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg border border-gray-100 bg-slate-50/80 px-3 py-2.5">
              {row.reason || "—"}
            </p>
          </div>
          {showReviewNote && row.reviewNote ? (
            <div>
              <p className="text-xs font-semibold text-rose-700 mb-1">Rejection note</p>
              <p className="text-sm text-rose-800 whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg border border-rose-100 bg-rose-50/80 px-3 py-2.5">
                {row.reviewNote}
              </p>
            </div>
          ) : null}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
