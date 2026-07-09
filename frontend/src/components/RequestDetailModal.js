import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "./Button";
import {
  buildRequestDetailRows,
  formatRequestChangeSummary,
  formatRequestTypeLabel,
  requestStatusBadgeClass,
  requestStatusLabel,
} from "../utils/studentDetailChangeRequests";

export function RequestDetailModal({
  row,
  onClose,
  showRequestedBy = false,
  onSelectStudent,
  canReview = false,
  onApprove,
  onReject,
  isBusy = false,
  counselorOptions = [],
  requireCounselorSelection = false,
}) {
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [selectedCounselorId, setSelectedCounselorId] = useState("");

  if (!row) return null;

  const isPending = row.status === "pending";
  const detailRows = buildRequestDetailRows(row, { showRequestedBy });
  const showReviewActions = canReview && isPending && (onApprove || onReject);
  const needsCounselor = requireCounselorSelection && showReviewActions;
  const noCounselorsAvailable = needsCounselor && counselorOptions.length === 0;
  const approveDisabled = isBusy || (needsCounselor && !selectedCounselorId);

  const handleClose = () => {
    setRejectMode(false);
    setRejectNote("");
    setSelectedCounselorId("");
    onClose?.();
  };

  const handleApproveConfirm = () => {
    if (needsCounselor) {
      if (!selectedCounselorId) return;
      const picked = counselorOptions.find(
        (c) => String(c.id || "") === String(selectedCounselorId)
      );
      onApprove?.({
        approvedCounselorId: selectedCounselorId,
        approvedCounselorName: picked?.name || "",
      });
      return;
    }
    onApprove?.();
  };

  const handleRejectConfirm = () => {
    onReject?.(rejectNote.trim());
    setRejectMode(false);
    setRejectNote("");
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/60 px-4 py-10 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="my-auto w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 pr-4">
            <h2 className="text-lg font-semibold text-slate-900">{formatRequestTypeLabel(row)}</h2>
            <p className="mt-1 truncate text-xs text-slate-500">
              {row.studentName || row.studentId || "Student"} · {requestStatusLabel(row.status)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[min(65vh,480px)] overflow-auto px-5 py-4">
          <dl className="space-y-3 text-sm">
            {detailRows.map((cell, idx) => {
              if (cell.isSection) {
                return (
                  <dt key={`section-${idx}`} className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {cell.label}
                  </dt>
                );
              }

              const isStudentLink = cell.studentId && onSelectStudent;
              const isStatus = cell.status;

              return (
                <div
                  key={`${cell.label}-${idx}`}
                  className={`grid gap-1 sm:grid-cols-[120px_1fr] sm:gap-4 ${cell.indent ? "pl-3 sm:pl-0" : ""}`}
                >
                  <dt className="text-xs font-medium text-slate-500">{cell.label}</dt>
                  <dd className="min-w-0 text-slate-900">
                    {isStatus ? (
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${requestStatusBadgeClass(cell.status)}`}
                      >
                        {cell.value}
                      </span>
                    ) : isStudentLink ? (
                      <button
                        type="button"
                        className="font-medium text-indigo-600 hover:text-indigo-800 text-left [overflow-wrap:anywhere]"
                        onClick={() => onSelectStudent({ id: cell.studentId, name: cell.studentName })}
                      >
                        {cell.value}
                      </button>
                    ) : cell.multiline ? (
                      <p
                        className={`whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg border px-3 py-2.5 text-sm ${
                          cell.highlight
                            ? "border-rose-100 bg-rose-50/80 text-rose-800"
                            : "border-slate-100 bg-slate-50/80 text-slate-800"
                        }`}
                      >
                        {cell.value}
                      </p>
                    ) : (
                      <span className="[overflow-wrap:anywhere]">{cell.value}</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>

          {needsCounselor && !rejectMode ? (
            <div className="mt-4 space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">
                  Assign counselor in {row.requestedBranch || "the new branch"}
                </span>
                <select
                  value={selectedCounselorId}
                  onChange={(e) => setSelectedCounselorId(e.target.value)}
                  disabled={isBusy || noCounselorsAvailable}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">
                    {noCounselorsAvailable ? "No counselors available in this branch" : "Select a counselor…"}
                  </option>
                  {counselorOptions.map((counselor) => (
                    <option key={counselor.id} value={counselor.id}>
                      {counselor.name}
                      {counselor.role ? ` · ${counselor.role}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-[11px] text-slate-500">
                Approving moves the student to this branch and hands them over to the selected counselor.
              </p>
            </div>
          ) : null}

          {rejectMode ? (
            <div className="mt-4 space-y-2 rounded-lg border border-rose-100 bg-rose-50/50 p-3">
              <p className="text-sm text-slate-700">
                Rejecting change for{" "}
                <span className="font-medium text-slate-900">{row.studentName || "student"}</span>{" "}
                ({formatRequestChangeSummary(row)}).
              </p>
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Note (optional)</span>
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  rows={3}
                  className="mt-1 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="Reason for rejection…"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {rejectMode ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setRejectMode(false)} disabled={isBusy}>
                Back
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 text-white hover:bg-rose-700"
                disabled={isBusy}
                onClick={handleRejectConfirm}
              >
                Confirm reject
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={handleClose}>
                Close
              </Button>
              {showReviewActions ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    disabled={approveDisabled}
                    onClick={handleApproveConfirm}
                  >
                    <Check size={14} className="mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose-200 text-rose-700 hover:bg-rose-50"
                    disabled={isBusy}
                    onClick={() => setRejectMode(true)}
                  >
                    <X size={14} className="mr-1" />
                    Reject
                  </Button>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
