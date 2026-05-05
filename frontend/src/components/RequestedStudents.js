import { useCallback, useEffect, useState } from "react";
import { ClipboardList, RefreshCw, UserPlus, X, Eye } from "lucide-react";
import { getAccounts, getReqStudents } from "../authApi";
import { Button } from "./Button";

function formatSubmittedAt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return String(iso);
  }
}

function branchesMatch(a, b) {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}

function isCounselorAccount(row) {
  const role = String(row?.role || "").toLowerCase();
  return role === "counselor" || role === "consultor";
}

const PIPELINE_PRIORITIES = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" }
];

const DETAIL_FIELD_ORDER = [
  ["id", "Request ID"],
  ["submittedAt", "Submitted"],
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["nearestOffice", "Nearest office"],
  ["countryToVisit", "Country to visit"],
  ["city", "City"],
  ["currentEducationLevel", "Current education"],
  ["intendedProgram", "Intended program"],
  ["message", "Message"],
  ["source", "Source"]
];

function formatDetailValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function buildFullDetailRows(row) {
  if (!row || typeof row !== "object") return [];
  const orderedKeys = new Set(DETAIL_FIELD_ORDER.map(([k]) => k));
  const out = [];
  for (const [key, label] of DETAIL_FIELD_ORDER) {
    const raw = row[key];
    let display = formatDetailValue(raw);
    if (key === "submittedAt" && raw) {
      display = formatSubmittedAt(raw);
    }
    out.push({ label, value: display });
  }
  for (const key of Object.keys(row).sort((a, b) => a.localeCompare(b))) {
    if (orderedKeys.has(key)) continue;
    out.push({ label: key, value: formatDetailValue(row[key]) });
  }
  return out;
}

function counselorOptionsForRow(userRole, scopeBranch, requestRow, accounts) {
  const list = (accounts || []).filter(isCounselorAccount);
  const managerBranch = userRole === "Manager" ? String(scopeBranch || "").trim() : "";
  const officeFromLead = String(requestRow?.nearestOffice || "").trim();

  if (userRole === "Manager" && managerBranch) {
    return list.filter((c) => branchesMatch(c.branch, managerBranch));
  }
  if (userRole === "Admin" && officeFromLead) {
    return list.filter((c) => branchesMatch(c.branch, officeFromLead));
  }
  return list;
}

export function RequestedStudents({ userRole = "Admin", scopeBranch = null, onAddFromRequest }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pipelineRow, setPipelineRow] = useState(null);
  const [counselorId, setCounselorId] = useState("");
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [counselorRows, setCounselorRows] = useState([]);
  const [modalError, setModalError] = useState("");
  const [modalSaving, setModalSaving] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [pipelinePriority, setPipelinePriority] = useState("Medium");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await getReqStudents(scopeBranch ? { branch: scopeBranch } : {});
    if (!result.ok) {
      setError(result.error || "Failed to load.");
      setRows([]);
    } else {
      setRows(result.data || []);
    }
    setLoading(false);
  }, [scopeBranch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!pipelineRow || !onAddFromRequest) {
      setCounselorRows([]);
      setCounselorId("");
      setModalError("");
      return;
    }
    setPipelinePriority("Medium");
    let cancelled = false;
    (async () => {
      setAccountsLoading(true);
      setModalError("");
      setCounselorId("");
      const res = await getAccounts();
      if (cancelled) return;
      if (!res.ok) {
        setCounselorRows([]);
        setModalError(res.error || "Could not load counselors.");
        setAccountsLoading(false);
        return;
      }
      const filtered = counselorOptionsForRow(userRole, scopeBranch, pipelineRow, res.data);
      setCounselorRows(filtered);
      if (filtered.length === 1) {
        setCounselorId(String(filtered[0].id || ""));
      }
      setAccountsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pipelineRow, userRole, scopeBranch]);

  const closeModal = () => {
    setPipelineRow(null);
    setCounselorId("");
    setModalError("");
    setModalSaving(false);
    setPipelinePriority("Medium");
  };

  const handleAddToPipeline = async (e) => {
    e.preventDefault();
    if (!pipelineRow || !onAddFromRequest) return;
    if (!counselorId) {
      setModalError("Choose a counselor for this student.");
      return;
    }
    setModalSaving(true);
    setModalError("");
    const result = await onAddFromRequest(pipelineRow, { counselorId, priority: pipelinePriority });
    setModalSaving(false);
    if (!result?.ok) {
      setModalError(result?.error || "Could not create student.");
      return;
    }
    if (result.requestRowRemoved) {
      setRows((prev) => prev.filter((r) => r.id !== pipelineRow.id));
    }
    closeModal();
  };

  const filterDescription =
    userRole === "Manager" && scopeBranch
      ? `Counselors at ${scopeBranch}.`
      : userRole === "Admin" && pipelineRow?.nearestOffice
        ? `Counselors matching office: ${pipelineRow.nearestOffice}.`
        : userRole === "Admin"
          ? "All counselors (this lead has no nearest office on file)."
          : "Counselors for your branch.";

  const subtitle = scopeBranch
    ? `Submissions for offices matching your branch (${scopeBranch}).`
    : "All student interest form submissions across branches.";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm">
            <ClipboardList size={22} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Requested Students</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{subtitle}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="inline-flex items-center gap-2 self-start"
          onClick={() => load()}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            No form submissions yet{scopeBranch ? " for your branch." : "."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">Submitted</th>
                  <th className="whitespace-nowrap px-4 py-3">Name</th>
                  <th className="whitespace-nowrap px-4 py-3">Email</th>
                  <th className="whitespace-nowrap px-4 py-3">Phone</th>
                  <th className="whitespace-nowrap px-4 py-3">Country</th>
                  <th className="whitespace-nowrap px-4 py-3">Office</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatSubmittedAt(row.submittedAt)}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 font-medium text-slate-900" title={row.name || ""}>
                      {row.name || "—"}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-slate-600" title={row.email || ""}>
                      {row.email || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.phone || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.countryToVisit || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.nearestOffice || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="inline-flex items-center gap-1 text-slate-600"
                          onClick={() => setDetailRow(row)}
                        >
                          <Eye size={14} />
                          View more
                        </Button>
                        {onAddFromRequest ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="inline-flex items-center gap-1.5"
                            onClick={() => setPipelineRow(row)}
                          >
                            <UserPlus size={14} />
                            Add to pipeline
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailRow ? (
        <div
          className="fixed inset-0 z-[145] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/60 px-4 py-10 backdrop-blur-sm"
          onClick={() => setDetailRow(null)}
        >
          <div
            className="my-auto w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Full submission</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {detailRow.name || "Lead"} · {detailRow.email || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="max-h-[min(70vh,560px)] overflow-auto px-5 py-4">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-slate-100 bg-white text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-[40%] py-2 pr-4">Field</th>
                    <th className="py-2">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {buildFullDetailRows(detailRow).map((cell, idx) => (
                    <tr key={`${cell.label}-${idx}`} className="align-top">
                      <td className="py-2.5 pr-4 text-xs font-medium text-slate-500">{cell.label}</td>
                      <td className="py-2.5 text-slate-900 break-words whitespace-pre-wrap">{cell.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <Button type="button" variant="secondary" onClick={() => setDetailRow(null)}>
                Close
              </Button>
              {onAddFromRequest ? (
                <Button
                  type="button"
                  className="inline-flex items-center gap-1.5"
                  onClick={() => {
                    const r = detailRow;
                    setDetailRow(null);
                    setPipelineRow(r);
                  }}
                >
                  <UserPlus size={14} />
                  Add to pipeline
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {pipelineRow && onAddFromRequest ? (
        <div
          className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/60 px-4 py-10 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="my-auto w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Add to student pipeline</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Creates a student record (New Inquiry) and assigns a counselor. A login password is generated automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddToPipeline} className="space-y-4 px-5 py-4">
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                <p>
                  <span className="font-semibold text-slate-900">{pipelineRow.name || "—"}</span>
                  <span className="text-slate-400"> · </span>
                  {pipelineRow.email || "—"}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {pipelineRow.countryToVisit || "—"}
                  {pipelineRow.nearestOffice ? ` · Office: ${pipelineRow.nearestOffice}` : ""}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Priority level
                </label>
                <select
                  value={pipelinePriority}
                  onChange={(e) => setPipelinePriority(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                >
                  {PIPELINE_PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Used for this student in the pipeline and student lists.</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Assign counselor
                </label>
                <p className="mb-2 text-xs text-slate-500">{filterDescription}</p>
                {accountsLoading ? (
                  <p className="text-sm text-slate-500">Loading counselors…</p>
                ) : counselorRows.length === 0 ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    No counselors found for this branch. Add counselor accounts for this office or align branch names in
                    admin settings.
                  </p>
                ) : (
                  <select
                    required
                    value={counselorId}
                    onChange={(e) => setCounselorId(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  >
                    <option value="">Select counselor…</option>
                    {counselorRows.map((c) => (
                      <option key={c.id} value={c.id}>
                        {(c.username || c.email || c.id) + (c.branch ? ` — ${c.branch}` : "")}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {modalError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{modalError}</div>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="secondary" onClick={closeModal} disabled={modalSaving}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={modalSaving || accountsLoading || counselorRows.length === 0 || !counselorId}
                  isLoading={modalSaving}
                >
                  Add student
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
