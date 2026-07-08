import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Eye, FileUp, Info, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import { bulkImportReqStudents, deleteReqStudent, getAccounts, getBranches, getCountries, getReqStudents } from "../authApi";
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
import { MultiSelect } from "./MultiSelect";
import { isStudentContactStaffAccountRole } from "../roles";
import { resolveCountriesForOffice } from "../utils/branchCountries";
import { parseReqStudentsImportFile } from "../utils/reqStudentsImport";
import { formatRequestedStudentSource } from "../utils/requestedStudentSource";
import { formatIntakeLabel } from "../utils/intakeFields";
import { BranchWhatsappAccountSelect } from "./BranchWhatsappAccountSelect";
import { resolveStudentBranchLabel } from "../utils/branchWhatsappAccounts";

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

function findBranchByOfficeLoose(branchRecords, office) {
  const key = String(office || "").trim().toLowerCase();
  if (!key) return null;
  return (
    (branchRecords || []).find((branch) => {
      const location = String(branch?.location || "").trim().toLowerCase();
      if (!location) return false;
      return branchesMatch(location, key);
    }) || null
  );
}

function isCounselorAccount(row) {
  return isStudentContactStaffAccountRole(row?.role);
}

function isManagerOrTeamLeadRole(role) {
  return role === "Manager" || role === "Team Lead";
}

function canImportMetaLeads(role) {
  return role === "Admin" || role === "Manager";
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
  ["whatsappNumber", "WhatsApp"],
  ["nearestOffice", "Preferred branch"],
  ["countryToVisit", "Country to visit"],
  ["city", "City"],
  ["livingStatus", "Living status"],
  ["visaRejectionAnyCountry", "Visa rejection (any country)"],
  ["currentEducationLevel", "Current education"],
  ["intendedProgram", "Intended program"],
  ["intakeMonth", "Intake month"],
  ["intakeYear", "Intake year"],
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
    if (key === "source") {
      display = formatRequestedStudentSource(row);
    }
    out.push({ label, value: display });
  }
  for (const key of Object.keys(row).sort((a, b) => a.localeCompare(b))) {
    if (orderedKeys.has(key)) continue;
    out.push({ label: key, value: formatDetailValue(row[key]) });
  }
  return out;
}

function counselorOptionsForRow(_userRole, _scopeBranch, _requestRow, accounts) {
  return (accounts || [])
    .filter(isCounselorAccount)
    .sort((a, b) => {
      const left = String(a.username || a.email || a.id || "").toLowerCase();
      const right = String(b.username || b.email || b.id || "").toLowerCase();
      return left.localeCompare(right);
    });
}

function counselorRowsToMultiSelectOptions(rows) {
  return (rows || []).map((c) => ({
    value: String(c.id || ""),
    label: c.username || c.email || c.id || "Counselor",
    subLabel: c.branch ? String(c.branch) : undefined
  }));
}

export function RequestedStudents({
  userRole = "Admin",
  scopeBranch = null,
  branchCountriesLimited = false,
  branchWhatsappEnabled = false,
  onAddFromRequest
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pipelineRow, setPipelineRow] = useState(null);
  const [primaryCounselorId, setPrimaryCounselorId] = useState("");
  const [branchWhatsappMessengerUserId, setBranchWhatsappMessengerUserId] = useState("");
  const [viewAccessCounselorIds, setViewAccessCounselorIds] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [counselorRows, setCounselorRows] = useState([]);
  const [modalError, setModalError] = useState("");
  const [modalSaving, setModalSaving] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [pipelinePriority, setPipelinePriority] = useState("Medium");
  const counselorFetchSeq = useRef(0);
  const importInputRef = useRef(null);
  const onAddFromRequestRef = useRef(onAddFromRequest);
  onAddFromRequestRef.current = onAddFromRequest;

  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState("");
  const [importSaving, setImportSaving] = useState(false);
  const [importParseLoading, setImportParseLoading] = useState(false);
  const [importFormatLabel, setImportFormatLabel] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [branchCountriesEnabled, setBranchCountriesEnabled] = useState(false);
  const [branchRecords, setBranchRecords] = useState([]);
  const [globalCountries, setGlobalCountries] = useState([]);
  const [branchMetaLoading, setBranchMetaLoading] = useState(false);

  const applyManagerBranchFilter = isManagerOrTeamLeadRole(userRole) && scopeBranch;

  const displayRows = useMemo(() => {
    if (!applyManagerBranchFilter) return rows;
    if (branchCountriesLimited) {
      if (!branchRecords.length) return rows;
      const countries = resolveCountriesForOffice(branchRecords, scopeBranch, globalCountries, {
        branchCountriesEnabled: true
      });
      return rows.filter((entry) => {
        const country = String(entry.countryToVisit || "").trim();
        if (!country) return true;
        const key = country.toLowerCase();
        return countries.some((name) => String(name).trim().toLowerCase() === key);
      });
    }
    return rows.filter((entry) => {
      const office = String(entry.nearestOffice || "").trim();
      if (!office) return true;
      return branchesMatch(scopeBranch, office);
    });
  }, [rows, applyManagerBranchFilter, branchCountriesLimited, scopeBranch, branchRecords, globalCountries]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await getReqStudents(applyManagerBranchFilter ? { branch: scopeBranch } : {});
    if (!result.ok) {
      setError(result.error || "Failed to load.");
      setRows([]);
      setBranchCountriesEnabled(false);
    } else {
      setRows(result.data || []);
      setBranchCountriesEnabled(result.branchCountriesEnabled === true);
    }
    setLoading(false);
  }, [applyManagerBranchFilter, scopeBranch, branchCountriesLimited]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isManagerOrTeamLeadRole(userRole) || !branchCountriesLimited) {
      setBranchRecords([]);
      setGlobalCountries([]);
      setBranchMetaLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setBranchMetaLoading(true);
      const [branchesRes, countriesRes] = await Promise.all([getBranches(), getCountries()]);
      if (cancelled) return;
      setBranchRecords(branchesRes.ok ? branchesRes.data || [] : []);
      setGlobalCountries(countriesRes.ok ? countriesRes.data || [] : []);
      setBranchMetaLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userRole, branchCountriesLimited]);

  const branchLimitEntries = useMemo(() => {
    if (!isManagerOrTeamLeadRole(userRole) || !branchCountriesLimited || !branchRecords.length) return [];
    const resolveOpts = { branchCountriesEnabled: true };
    if (scopeBranch) {
      const branch = findBranchByOfficeLoose(branchRecords, scopeBranch);
      const name = String(branch?.location || scopeBranch).trim();
      if (!name) return [];
      return [
        {
          name,
          countries: resolveCountriesForOffice(branchRecords, scopeBranch, globalCountries, resolveOpts)
        }
      ];
    }
    return branchRecords
      .map((branch) => {
        const name = String(branch?.location || branch?.id || "").trim();
        if (!name) return null;
        return {
          name,
          countries: resolveCountriesForOffice(branchRecords, name, globalCountries, resolveOpts)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [userRole, branchCountriesLimited, scopeBranch, branchRecords, globalCountries]);

  const loadPipelineCounselors = useCallback(
    async ({ preserveCounselorSelection = false } = {}) => {
      if (!pipelineRow) return;
      const seq = ++counselorFetchSeq.current;
      setAccountsLoading(true);
      setModalError("");
      if (!preserveCounselorSelection) {
        setPrimaryCounselorId("");
        setViewAccessCounselorIds([]);
      }
      try {
        const res = await getAccounts();
        if (seq !== counselorFetchSeq.current) return;
        if (!res.ok) {
          setCounselorRows([]);
          setModalError(res.error || "Could not load counselors.");
          return;
        }
        const filtered = counselorOptionsForRow(userRole, scopeBranch, pipelineRow, res.data);
        setCounselorRows(filtered);
        if (preserveCounselorSelection) {
          setPrimaryCounselorId((prev) => {
            const ok = filtered.some((c) => String(c.id) === String(prev));
            if (ok) return prev;
            if (filtered.length === 1) return String(filtered[0].id || "");
            return "";
          });
          setViewAccessCounselorIds((prev) =>
            prev.filter((id) => filtered.some((c) => String(c.id) === String(id)))
          );
        } else if (filtered.length === 1) {
          setPrimaryCounselorId(String(filtered[0].id || ""));
        }
      } finally {
        if (seq === counselorFetchSeq.current) setAccountsLoading(false);
      }
    },
    [pipelineRow, userRole, scopeBranch]
  );

  useEffect(() => {
    if (!pipelineRow || !onAddFromRequestRef.current) {
      setCounselorRows([]);
      setPrimaryCounselorId("");
      setViewAccessCounselorIds([]);
      setModalError("");
      return;
    }
    setPipelinePriority("Medium");
    loadPipelineCounselors({ preserveCounselorSelection: false });
  }, [pipelineRow, userRole, scopeBranch, loadPipelineCounselors]);

  const closeModal = () => {
    setPipelineRow(null);
    setPrimaryCounselorId("");
    setBranchWhatsappMessengerUserId("");
    setViewAccessCounselorIds([]);
    setModalError("");
    setModalSaving(false);
    setPipelinePriority("Medium");
  };

  const counselorMultiSelectOptions = useMemo(
    () => counselorRowsToMultiSelectOptions(counselorRows),
    [counselorRows]
  );

  const viewAccessOptions = useMemo(
    () =>
      counselorMultiSelectOptions.filter(
        (opt) => String(opt.value) !== String(primaryCounselorId || "")
      ),
    [counselorMultiSelectOptions, primaryCounselorId]
  );

  const selectedViewAccessCounselors = useMemo(
    () =>
      viewAccessCounselorIds.map((id) => {
        const match = counselorMultiSelectOptions.find((opt) => String(opt.value) === String(id));
        return match || { value: String(id), label: String(id), subLabel: undefined };
      }),
    [viewAccessCounselorIds, counselorMultiSelectOptions]
  );

  useEffect(() => {
    if (!primaryCounselorId) return;
    setViewAccessCounselorIds((prev) =>
      prev.filter((id) => String(id) !== String(primaryCounselorId))
    );
  }, [primaryCounselorId]);

  const closeImportPreview = () => {
    setImportPreviewOpen(false);
    setImportRows([]);
    setImportFileName("");
    setImportFormatLabel("");
    setImportError("");
    setImportSaving(false);
    setImportParseLoading(false);
  };

  const handleImportFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportParseLoading(true);
    setImportError("");

    const branchesRes = await getBranches();
    const branchLocations = branchesRes.ok
      ? (branchesRes.data || []).map((b) => String(b?.location || "").trim()).filter(Boolean)
      : [];

    const parsed = await parseReqStudentsImportFile(file, { branchLocations });
    if (!parsed.ok) {
      setImportParseLoading(false);
      setError(parsed.error || "Could not read the file.");
      return;
    }

    setImportRows(parsed.data || []);
    setImportFileName(parsed.fileName || file.name);
    setImportFormatLabel(parsed.formatLabel || "Spreadsheet");
    setImportPreviewOpen(true);
    setImportParseLoading(false);
  };

  const handleRemoveImportRow = (importKey) => {
    setImportRows((prev) => prev.filter((row) => row.importKey !== importKey));
  };

  const handleConfirmImport = async () => {
    if (!importRows.length) {
      setImportError("No leads left to import.");
      return;
    }
    setImportSaving(true);
    setImportError("");
    const payload = importRows.map((row) => ({
      metaLeadId: row.metaLeadId || null,
      submittedAt: row.submittedAt,
      name: row.name,
      email: row.email,
      phone: row.phone,
      countryToVisit: row.countryToVisit,
      city: row.city,
      nearestOffice: row.nearestOffice,
      livingStatus: row.livingStatus,
      visaRejectionAnyCountry: row.visaRejectionAnyCountry,
      currentEducationLevel: row.currentEducationLevel,
      intendedProgram: row.intendedProgram,
      intakeMonth: row.intakeMonth || null,
      intakeYear: row.intakeYear || null,
      message: row.message,
      source: row.source,
      platform: row.platform,
      campaignName: row.campaignName,
      formName: row.formName
    }));
    const result = await bulkImportReqStudents(payload);
    setImportSaving(false);
    if (!result.ok) {
      setImportError(result.error || "Import failed.");
      return;
    }
    const added = Array.isArray(result.data) ? result.data : [];
    if (added.length) {
      setRows((prev) => {
        const existingIds = new Set(prev.map((row) => String(row.id || "")));
        const merged = [...added.filter((row) => !existingIds.has(String(row.id || ""))), ...prev];
        return merged.sort(
          (a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime()
        );
      });
    }
    closeImportPreview();
    if (result.skipped?.length) {
      setError(`${added.length} lead(s) imported. ${result.skipped.length} duplicate(s) skipped.`);
    }
  };

  const handleRemoveRequestedStudent = async (row) => {
    const id = String(row?.id || "").trim();
    if (!id) return;
    const confirmed = window.confirm(`Remove ${row.name || "this lead"} from Requested Students?`);
    if (!confirmed) return;
    setRemovingId(id);
    const result = await deleteReqStudent(id);
    setRemovingId("");
    if (!result.ok) {
      setError(result.error || "Could not remove lead.");
      return;
    }
    setRows((prev) => prev.filter((entry) => String(entry.id || "") !== id));
  };

  const handleAddToPipeline = async (e) => {
    e.preventDefault();
    if (!pipelineRow || !onAddFromRequest) return;
    const counselorId = String(primaryCounselorId || "").trim();
    if (!counselorId) {
      setModalError("Choose a primary counselor for this student.");
      return;
    }
    if (branchWhatsappEnabled && !String(branchWhatsappMessengerUserId || "").trim()) {
      setModalError("Choose a primary WhatsApp account for this student.");
      return;
    }
    const viewAccess = Array.from(
      new Set(viewAccessCounselorIds.map((id) => String(id || "").trim()).filter(Boolean))
    ).filter((id) => id !== counselorId);
    setModalSaving(true);
    setModalError("");
    const result = await onAddFromRequest(pipelineRow, {
      counselorId,
      viewAccessCounselorIds: viewAccess,
      priority: pipelinePriority,
      branchWhatsappMessengerUserId: branchWhatsappEnabled ? branchWhatsappMessengerUserId : "",
    });
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

  const filterDescription = "All counselors in the organization.";

  const subtitle = !applyManagerBranchFilter
    ? "All student interest form submissions across branches."
    : branchCountriesLimited
      ? `Submissions with destination countries assigned to your branch (${scopeBranch}).`
      : `Submissions for offices matching your branch (${scopeBranch}).`;

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
        <div className="flex flex-wrap items-center gap-2 self-start">
          {canImportMetaLeads(userRole) ? (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={handleImportFileChange}
              />
              <Button
                type="button"
                variant="secondary"
                className="inline-flex items-center gap-2"
                onClick={() => importInputRef.current?.click()}
                disabled={importParseLoading}
                isLoading={importParseLoading}
              >
                <FileUp size={16} />
                Import leads
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="inline-flex items-center gap-2"
            onClick={() => load()}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {isManagerOrTeamLeadRole(userRole) &&
      (branchCountriesLimited || applyManagerBranchFilter) ? (
        <div className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
          <Info size={18} className="mt-0.5 shrink-0 text-indigo-600" aria-hidden />
          <p className="min-w-0 flex-1 leading-relaxed text-indigo-900/90">
            <span className="font-semibold text-indigo-900">Limit countries by branch</span>
            <span className="text-indigo-400"> · </span>
            {branchCountriesLimited ? (
              branchMetaLoading ? (
                <span className="text-indigo-800/80">Loading branch countries…</span>
              ) : branchLimitEntries.length ? (
                <>
                  <span className="font-medium text-indigo-900">On</span>
                  <span className="text-indigo-400"> · </span>
                  {branchLimitEntries.map((entry, index) => (
                    <span key={entry.name}>
                      {index > 0 ? <span className="text-indigo-400"> | </span> : null}
                      <span className="font-medium text-indigo-900">{entry.name}</span>
                      <span className="text-indigo-400">: </span>
                      <span>
                        {entry.countries.length ? entry.countries.join(", ") : "global defaults apply"}
                      </span>
                    </span>
                  ))}
                  {applyManagerBranchFilter ? (
                    <>
                      <span className="text-indigo-400"> · </span>
                      <span>Showing destination countries assigned to {scopeBranch} only.</span>
                    </>
                  ) : null}
                </>
              ) : (
                <span>
                  <span className="font-medium text-indigo-900">On</span>
                  <span className="text-indigo-400"> · </span>
                  Destination countries are limited per office on inquiry forms.
                </span>
              )
            ) : (
              <>
                <span className="font-medium text-indigo-900">Off</span>
                <span className="text-indigo-400"> · </span>
                <span className="font-medium text-indigo-900">{scopeBranch}</span>
                <span className="text-indigo-400"> · </span>
                <span>Showing submissions where nearest office matches your branch.</span>
              </>
            )}
          </p>
        </div>
      ) : null}

      <DataTable>
        {loading ? (
          <InlineLoading label="Loading requests…" className="py-16" />
        ) : displayRows.length === 0 ? (
          <div className={`${dt.emptyWrap} text-sm text-slate-500`}>
            No form submissions yet
            {applyManagerBranchFilter
              ? branchCountriesLimited
                ? " with a destination country assigned to your branch."
                : " for your branch."
              : "."}
          </div>
        ) : (
          <DataTableScroll>
            <DataTableTable>
              <DataTableHead>
                <tr>
                  <DataTableTh>Name</DataTableTh>
                  <DataTableTh>Country</DataTableTh>
                  <DataTableTh>Phone</DataTableTh>
                  <DataTableTh>Office</DataTableTh>
                  <DataTableTh>Source</DataTableTh>
                  <DataTableTh align="right">Actions</DataTableTh>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {displayRows.map((row) => (
                  <DataTableRow key={row.id}>
                    <DataTableTd variant="primary" className="max-w-[160px] truncate" title={row.name || ""}>
                      {row.name || "—"}
                    </DataTableTd>
                    <DataTableTd className="whitespace-nowrap" title={row.countryToVisit || ""}>
                      {row.countryToVisit || "—"}
                    </DataTableTd>
                    <DataTableTd className="whitespace-nowrap">{row.phone || "—"}</DataTableTd>
                    <DataTableTd className="whitespace-nowrap">{row.nearestOffice || "—"}</DataTableTd>
                    <DataTableTd
                      className="max-w-[180px] truncate"
                      title={formatRequestedStudentSource(row)}
                    >
                      {formatRequestedStudentSource(row)}
                    </DataTableTd>
                    <DataTableTd variant="actions">
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
                            Add to system
                          </Button>
                        ) : null}
                        {userRole === "Admin" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700"
                            onClick={() => handleRemoveRequestedStudent(row)}
                            disabled={removingId === row.id}
                            isLoading={removingId === row.id}
                          >
                            <Trash2 size={14} />
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </DataTableTd>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTableTable>
          </DataTableScroll>
        )}
      </DataTable>

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
              <table className={dt.table}>
                <thead className={dt.headSticky}>
                  <tr>
                    <th className={`${dt.thCompact} w-[40%]`}>Field</th>
                    <th className={dt.thCompact}>Value</th>
                  </tr>
                </thead>
                <tbody className={dt.body}>
                  {buildFullDetailRows(detailRow).map((cell, idx) => (
                    <tr key={`${cell.label}-${idx}`} className="align-top">
                      <td className={`${dt.tdCompact} text-xs font-medium text-slate-500`}>{cell.label}</td>
                      <td className={`${dt.tdCompact} text-slate-900 break-words whitespace-pre-wrap`}>{cell.value}</td>
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
                  Add to system
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {importPreviewOpen ? (
        <div
          className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/60 px-4 py-10 backdrop-blur-sm"
          onClick={closeImportPreview}
        >
          <div
            className="my-auto w-full max-w-5xl rounded-xl border border-slate-200 bg-white shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Import leads</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {importFileName ? `${importFileName} · ` : ""}
                  {importFormatLabel ? `${importFormatLabel} · ` : ""}
                  {importRows.length} lead{importRows.length === 1 ? "" : "s"} ready to add to Requested Students.
                </p>
              </div>
              <button
                type="button"
                onClick={closeImportPreview}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[min(60vh,520px)] overflow-auto px-5 py-4">
              {importRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No leads left in this import.</p>
              ) : (
                <table className={dt.tableCompact}>
                  <thead className={dt.headSticky}>
                    <tr>
                      <th className={dt.thCompact}>Name</th>
                      <th className={dt.thCompact}>Phone</th>
                      <th className={dt.thCompact}>Office</th>
                      <th className={dt.thCompact}>Country</th>
                      <th className={dt.thCompact}>Education</th>
                      <th className={dt.thCompact}>Intake</th>
                      <th className={dt.thCompactRight}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className={dt.body}>
                    {importRows.map((row) => (
                      <tr key={row.importKey} className={`align-top ${dt.row}`}>
                        <td className={`${dt.tdCompact} font-medium text-slate-900`}>{row.name || "—"}</td>
                        <td className={`${dt.tdCompact} whitespace-nowrap`}>{row.phone || "—"}</td>
                        <td className={dt.tdCompact}>{row.nearestOffice || "—"}</td>
                        <td className={dt.tdCompact}>{row.countryToVisit || "—"}</td>
                        <td className={dt.tdCompact}>{row.currentEducationLevel || "—"}</td>
                        <td className={dt.tdCompact}>{formatIntakeLabel(row.intakeMonth, row.intakeYear) || "—"}</td>
                        <td className={dt.tdActions}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700"
                            onClick={() => handleRemoveImportRow(row.importKey)}
                          >
                            <Trash2 size={14} />
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {importError ? (
              <div className="mx-5 mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {importError}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <Button type="button" variant="secondary" onClick={closeImportPreview} disabled={importSaving}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={importSaving || importRows.length === 0}
                isLoading={importSaving}
                onClick={handleConfirmImport}
              >
                Add {importRows.length} to Requested Students
              </Button>
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
            className="my-auto w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Add to system</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Creates a student record (Inquiry), assigns a primary counselor, and optionally grants view access to others. A login password is generated automatically.
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
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Assign counselor (primary)
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="inline-flex shrink-0 items-center gap-1.5 text-slate-600"
                    onClick={() => loadPipelineCounselors({ preserveCounselorSelection: true })}
                    disabled={modalSaving}
                    aria-label="Reload counselor list"
                  >
                    <RefreshCw size={14} className={accountsLoading ? "animate-spin" : ""} />
                    Reload
                  </Button>
                </div>
                <p className="mb-2 text-xs text-slate-500">{filterDescription}</p>
                {accountsLoading && counselorRows.length === 0 ? (
                  <p className="text-sm text-slate-500">Loading counselors…</p>
                ) : counselorRows.length === 0 ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    No counselor accounts found. Add counselor accounts in team management first.
                  </p>
                ) : (
                  <select
                    required
                    disabled={accountsLoading}
                    value={primaryCounselorId}
                    onChange={(e) => setPrimaryCounselorId(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
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

              {branchWhatsappEnabled ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Primary WhatsApp account
                  </label>
                  <p className="mb-2 text-xs text-slate-500">
                    Choose which connected WhatsApp number will message this student.
                  </p>
                  <BranchWhatsappAccountSelect
                    branchLabel={resolveStudentBranchLabel(pipelineRow, scopeBranch)}
                    value={branchWhatsappMessengerUserId}
                    onChange={setBranchWhatsappMessengerUserId}
                    allowAnyAccount
                    required
                    disabled={modalSaving}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  View access
                </label>
                <p className="mb-2 text-xs text-slate-500">
                  Optional — additional counselors who can view this student in their portal (not primary).
                </p>
                {selectedViewAccessCounselors.length > 0 ? (
                  <ul className="mb-3 flex flex-wrap gap-2">
                    {selectedViewAccessCounselors.map((counselor) => (
                      <li
                        key={counselor.value}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700"
                      >
                        <span className="font-medium text-slate-900">{counselor.label}</span>
                        {counselor.subLabel ? (
                          <span className="text-slate-500">· {counselor.subLabel}</span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            setViewAccessCounselorIds((prev) =>
                              prev.filter((id) => String(id) !== String(counselor.value))
                            )
                          }
                          className="ml-0.5 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                          aria-label={`Remove ${counselor.label} from view access`}
                        >
                          <X size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-3 text-xs text-slate-400 italic">No counselors selected for view access yet.</p>
                )}
                {accountsLoading && counselorRows.length === 0 ? (
                  <p className="text-sm text-slate-500">Loading counselors…</p>
                ) : counselorRows.length === 0 ? null : (
                  <MultiSelect
                    label=""
                    options={viewAccessOptions}
                    value={viewAccessCounselorIds}
                    onChange={setViewAccessCounselorIds}
                    placeholder="Search counselors for view access…"
                  />
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
                  disabled={modalSaving || accountsLoading || counselorRows.length === 0 || !primaryCounselorId || (branchWhatsappEnabled && !branchWhatsappMessengerUserId)}
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
