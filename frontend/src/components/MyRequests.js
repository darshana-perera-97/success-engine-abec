import { useCallback, useEffect, useState } from "react";
import { Eye, FileText, RefreshCw } from "lucide-react";
import { getCountryChangeRequests, getStudentDetailChangeRequests, getInvoiceWaveOffRequests, getStudentRemovalRequests, getIntakeChangeRequests, getRefundRequests } from "../authApi";
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
  formatRequestTypeLabel,
  formatSubmittedAt,
  mergeRequestRows,
  requestStatusBadgeClass,
  requestStatusLabel,
} from "../utils/studentDetailChangeRequests";

export function MyRequests({
  currentUser = null,
  onSelectStudent,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailRow, setDetailRow] = useState(null);

  const requesterId = String(currentUser?.id || "").trim();

  const loadRows = useCallback(async () => {
    if (!requesterId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [countryResult, detailResult, waveOffResult, removalResult, intakeResult, refundResult] = await Promise.all([
      getCountryChangeRequests({ requestedBy: requesterId }),
      getStudentDetailChangeRequests({ requestedBy: requesterId }),
      getInvoiceWaveOffRequests({ requestedBy: requesterId }),
      getStudentRemovalRequests({ requestedBy: requesterId }),
      getIntakeChangeRequests({ requestedBy: requesterId }),
      getRefundRequests({ requestedBy: requesterId }),
    ]);
    if (!countryResult.ok && !detailResult.ok && !waveOffResult.ok && !removalResult.ok && !intakeResult.ok && !refundResult.ok) {
      setError(countryResult.error || detailResult.error || waveOffResult.error || removalResult.error || intakeResult.error || refundResult.error || "Failed to load requests.");
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
  }, [requesterId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm">
            <FileText size={22} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">My Requests</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Country, intake, student detail, removal, refund, and invoice wave-off requests you have submitted.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={loadRows} disabled={loading} className="shrink-0">
          <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <DataTable>
        {loading ? (
          <div className={dt.loadingWrap}>
            <InlineLoading label="Loading your requests…" />
          </div>
        ) : error ? (
          <div className={`${dt.loadingWrap} text-center text-sm text-rose-600`}>{error}</div>
        ) : rows.length === 0 ? (
          <div className={`${dt.emptyWrap} ${dt.emptyText}`}>
            No requests yet. Submit a change from a student profile (Edit details, Change country, or Remove).
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
                {rows.map((row) => (
                  <DataTableRow key={`${row.requestType}-${row.id}`}>
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
                ))}
              </DataTableBody>
            </DataTableTable>
          </DataTableScroll>
        )}
      </DataTable>

      {detailRow ? (
        <RequestDetailModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
          onSelectStudent={onSelectStudent}
        />
      ) : null}
    </div>
  );
}
