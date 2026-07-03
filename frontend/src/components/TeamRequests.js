import { useCallback, useEffect, useState } from "react";
import { Eye, FileText, RefreshCw } from "lucide-react";
import {
  decideCountryChangeRequest,
  decideStudentDetailChangeRequest,
  decideInvoiceWaveOff,
  decideStudentRemovalRequest,
  decideIntakeChangeRequest,
  decideRefundRequest,
  getCountryChangeRequests,
  getStudentDetailChangeRequests,
  getInvoiceWaveOffRequests,
  getStudentRemovalRequests,
  getIntakeChangeRequests,
  getRefundRequests,
} from "../authApi";
import { Button } from "./Button";
import {
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableRow,
  DataTableScroll,
  DataTableTable,
  DataTableTd,
  DataTableTh,
  dt,
} from "./DataTable";
import { InlineLoading } from "./LoadingPlaceholder";
import { RequestDetailModal } from "./RequestDetailModal";
import {
  formatRequestChangeSummary,
  formatRequestTypeLabel,
  formatSubmittedAt,
  mergeRequestRows,
  requestStatusBadgeClass,
  requestStatusLabel,
} from "../utils/studentDetailChangeRequests";

function canReviewTeamRequests(role) {
  return role === "Admin" || role === "Manager" || role === "Team Lead";
}

export function TeamRequests({
  userRole = "Admin",
  currentUser = null,
  onSelectStudent,
  onUpdateStudent,
  onUpdateInvoice,
  onAddActivity,
  onNotify,
  onStudentMovedToRequests,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("pending");
  const [busyId, setBusyId] = useState("");
  const [detailRow, setDetailRow] = useState(null);

  const canReview = canReviewTeamRequests(userRole);
  const reviewerId = String(currentUser?.id || "").trim();
  const reviewerName = String(currentUser?.username || currentUser?.name || currentUser?.email || "Staff").trim();

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = filter === "pending" ? { pendingOnly: true } : {};
    const [countryResult, detailResult, waveOffResult, removalResult, intakeResult, refundResult] = await Promise.all([
      getCountryChangeRequests(params),
      getStudentDetailChangeRequests(params),
      getInvoiceWaveOffRequests(params),
      getStudentRemovalRequests(params),
      getIntakeChangeRequests(params),
      getRefundRequests(params),
    ]);
    if (!countryResult.ok && !detailResult.ok && !waveOffResult.ok && !removalResult.ok && !intakeResult.ok && !refundResult.ok) {
      setError(countryResult.error || detailResult.error || waveOffResult.error || removalResult.error || intakeResult.error || refundResult.error || "Failed to load team requests.");
      setRows([]);
    } else {
      setRows(
        mergeRequestRows(
          countryResult.ok ? countryResult.data : [],
          detailResult.ok ? detailResult.data : [],
          waveOffResult.ok ? waveOffResult.data : [],
          removalResult.ok ? removalResult.data : [],
          intakeResult.ok ? intakeResult.data : [],
          refundResult.ok ? refundResult.data : []
        )
      );
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const handleDecide = async (row, decision, reviewNote = "") => {
    if (!canReview || !row?.id) return;
    const busyKey = `${row.requestType}-${row.id}`;
    setBusyId(busyKey);
    const reviewerPayload = {
      decision,
      reviewedByUserId: reviewerId,
      reviewedByName: reviewerName,
      reviewedByRole: userRole,
      reviewNote,
    };
    const result =
      row.requestType === "student-details"
        ? await decideStudentDetailChangeRequest(row.id, reviewerPayload)
        : row.requestType === "student-removal"
          ? await decideStudentRemovalRequest(row.id, reviewerPayload)
        : row.requestType === "intake-change"
          ? await decideIntakeChangeRequest(row.id, reviewerPayload)
        : row.requestType === "invoice-wave-off"
          ? await decideInvoiceWaveOff(row.invoiceId || row.id, reviewerPayload)
        : row.requestType === "refund"
          ? await decideRefundRequest(row.id, reviewerPayload)
          : await decideCountryChangeRequest(row.id, reviewerPayload);
    setBusyId("");
    if (!result.ok) {
      onNotify?.("Review failed", result.error || "Could not update request.", "error");
      return;
    }
    if (decision === "approved" && result.student && onUpdateStudent) {
      await onUpdateStudent(result.student);
    }
    if (decision === "approved" && row.requestType === "student-removal") {
      const removedId = String(result.removedStudent?.studentId || row.studentId || "").trim();
      if (removedId) onStudentMovedToRequests?.(removedId);
    }
    if (row.requestType === "invoice-wave-off" && result.data && onUpdateInvoice) {
      await onUpdateInvoice(result.data);
    }
    const changeSummary = formatRequestChangeSummary(row);
    const actionLabel =
      row.requestType === "student-details"
        ? "student detail change"
        : row.requestType === "student-removal"
          ? "student removal"
        : row.requestType === "intake-change"
          ? "intake change"
        : row.requestType === "invoice-wave-off"
          ? "invoice wave-off"
        : row.requestType === "refund"
          ? "refund"
          : "country change";
    onAddActivity?.({
      user: userRole,
      role: userRole,
      action: decision === "approved" ? `approved ${actionLabel}` : `rejected ${actionLabel}`,
      target: `${row.studentName || row.studentId}: ${changeSummary}`,
      type: decision === "approved" ? "approval" : "rejection",
      studentName: row.studentName,
      studentId: row.studentId,
    });
    onNotify?.(
      decision === "approved" ? "Request approved" : "Request rejected",
      decision === "approved"
        ? row.requestType === "invoice-wave-off"
          ? `Wave-off for ${row.studentName || "student"} has been approved.`
          : row.requestType === "student-removal"
            ? `${row.studentName || "Student"} has been removed from the system.`
          : row.requestType === "refund"
            ? `Refund for ${row.studentName || "student"} has been approved for accountant processing.`
          : `Changes for ${row.studentName || "student"} have been applied.`
        : row.requestType === "invoice-wave-off"
          ? `Wave-off request for ${row.studentName || "student"} was rejected.`
          : `Change request for ${row.studentName || "student"} was rejected.`,
      decision === "approved" ? "success" : "info"
    );
    setDetailRow(null);
    loadRows();
  };

  if (!canReview) {
    return (
      <div className="px-6 py-16 text-center text-slate-400 text-sm">
        You do not have permission to review team requests.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm">
            <FileText size={22} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Team Requests</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Review and approve country, intake, student detail, removal, refund, and invoice wave-off requests from your team.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md font-medium ${filter === "pending" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setFilter("pending")}
            >
              Pending
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md font-medium ${filter === "all" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={loadRows} disabled={loading}>
            <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <DataTable>
        {loading ? (
          <div className={dt.loadingWrap}>
            <InlineLoading label="Loading team requests…" />
          </div>
        ) : error ? (
          <div className={`${dt.loadingWrap} text-center text-sm text-rose-600`}>{error}</div>
        ) : rows.length === 0 ? (
          <div className={`${dt.emptyWrap} ${dt.emptyText}`}>
            {filter === "pending" ? "No pending change requests." : "No change requests yet."}
          </div>
        ) : (
          <DataTableScroll>
            <DataTableTable>
              <DataTableHead>
                <tr>
                  <DataTableTh>Student</DataTableTh>
                  <DataTableTh>Type</DataTableTh>
                  <DataTableTh>Status</DataTableTh>
                  <DataTableTh>Submitted</DataTableTh>
                  <DataTableTh align="right">Actions</DataTableTh>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {rows.map((row) => {
                  const busyKey = `${row.requestType}-${row.id}`;
                  return (
                    <DataTableRow key={busyKey}>
                      <DataTableTd
                        variant="primary"
                        className="max-w-[180px] truncate"
                        title={row.studentName || row.studentId || ""}
                      >
                        {row.studentName || row.studentId || "—"}
                      </DataTableTd>
                      <DataTableTd className="whitespace-nowrap">{formatRequestTypeLabel(row)}</DataTableTd>
                      <DataTableTd className="whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${requestStatusBadgeClass(row.status)}`}>
                          {requestStatusLabel(row.status)}
                        </span>
                      </DataTableTd>
                      <DataTableTd className="whitespace-nowrap text-slate-500">{formatSubmittedAt(row.requestedAt)}</DataTableTd>
                      <DataTableTd variant="actions">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="inline-flex items-center gap-1 text-slate-600"
                          onClick={() => setDetailRow(row)}
                        >
                          <Eye size={14} />
                          View
                        </Button>
                      </DataTableTd>
                    </DataTableRow>
                  );
                })}
              </DataTableBody>
            </DataTableTable>
          </DataTableScroll>
        )}
      </DataTable>

      {detailRow ? (
        <RequestDetailModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
          showRequestedBy
          onSelectStudent={onSelectStudent}
          canReview={detailRow.status === "pending"}
          isBusy={busyId === `${detailRow.requestType}-${detailRow.id}`}
          onApprove={() => handleDecide(detailRow, "approved")}
          onReject={(note) => handleDecide(detailRow, "rejected", note)}
        />
      ) : null}
    </div>
  );
}
