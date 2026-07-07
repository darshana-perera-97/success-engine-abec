import { jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAccounts, searchStudents } from "../authApi";
import { Filter, ChevronDown, UserPlus, Globe2, Users2, ArrowDownUp, Clock, X } from "lucide-react";
import { branchesMatch, getCurrentStageSlaDisplay, normalizePipelineStatus, PIPELINE_STEPS, studentMatchesCounselorIdentitySet } from "../pipeline";
import { resolveCountryDocConfig } from "../countryDocConfigStore";
import { isCounselorEquivalentAccountRole, isCounselorEquivalentPortalRole, isStudentContactStaffAccountRole, canActAsPrimaryCounselorPortalRole } from "../roles";
import { buildStudentCounselorRemovalPatch, buildAddSecondaryCounselorPatch, getAssignedCounselorIds, wouldStudentHaveNoCounselorsAfterRemoval } from "../studentContactHelpers";
import { Button } from "./Button";
import { AddStudentModal } from "./AddStudentModal";
import { BranchWhatsappAccountSelect } from "./BranchWhatsappAccountSelect";
import { resolveStudentBranchLabel } from "../utils/branchWhatsappAccounts";

import { TableSkeletonRows } from "./LoadingPlaceholder";
import { dt } from "./DataTable";

import { SLA_CLOCK_INTERVAL_MS } from "../runtimeConfig";

const SEARCH_DEBOUNCE_MS = 400;

const STUDENT_LIST_SORT_KEY = "successEngine.studentList.sort";

function loadSortPrefs() {
  const defaults = { sortBy: "time", sortDirection: "asc" };
  try {
    const raw = localStorage.getItem(STUDENT_LIST_SORT_KEY);
    if (!raw) return defaults;
    const data = JSON.parse(raw);
    const sortBy = ["name", "time", "stage"].includes(data.sortBy) ? data.sortBy : defaults.sortBy;
    const sortDirection = data.sortDirection === "desc" ? "desc" : "asc";
    return { sortBy, sortDirection };
  } catch {
    return defaults;
  }
}

function saveSortPrefs(prefs) {
  try {
    localStorage.setItem(STUDENT_LIST_SORT_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function pipelineStageOrder(status) {
  const canonical = normalizePipelineStatus(status);
  const idx = PIPELINE_STEPS.indexOf(canonical);
  return idx === -1 ? PIPELINE_STEPS.length + 1 : idx;
}

function studentTimeMs(student) {
  const raw = student.updatedAt || student.createdAt || "";
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function StageSlaCell({ student, now }) {
  const display = useMemo(
    () => getCurrentStageSlaDisplay(student, { now, resolveCountryConfig: resolveCountryDocConfig }),
    [student, now]
  );
  if (!display) {
    return /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400", children: "—" });
  }
  const toneClass =
    display.visualTone === "red"
      ? "bg-red-50 text-red-800 border-red-200"
      : display.visualTone === "orange"
        ? "bg-orange-50 text-orange-900 border-orange-200"
        : "bg-green-50 text-green-800 border-green-200";
  return /* @__PURE__ */ jsxs(
    "span",
    {
      className: `inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded border tabular-nums whitespace-nowrap ${toneClass}`,
      title: `${display.stage} — target ${display.slaLabel} from stage entry. ${display.text}`,
      children: [
        /* @__PURE__ */ jsx(Clock, { size: 12, strokeWidth: 2, className: "flex-shrink-0 opacity-90" }),
        display.text
      ]
    }
  );
}

const StudentList = ({
  onSelectStudent,
  students = [],
  employees = [],
  onUpdateStudent,
  onAssignStudentCounselor,
  onAddSecondaryStudentCounselor,
  onNavigate,
  onAddStudent,
  userRole,
  currentUser,
  authenticatedUser,
  counselorIdentitySet = null,
  scopeBranch = null,
  branchWhatsappEnabled = false
}) => {
  const [filterText, setFilterText] = useState("");
  const [counselorFilter, setCounselorFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [accountCounselors, setAccountCounselors] = useState([]);
  const [assigningStudentId, setAssigningStudentId] = useState(null);
  const [managerTargetCounselorId, setManagerTargetCounselorId] = useState("");
  const [managerTargetWhatsappUserId, setManagerTargetWhatsappUserId] = useState("");
  const [managerAssignMode, setManagerAssignMode] = useState("reassign");
  const [counselorMetaReady, setCounselorMetaReady] = useState(false);
  const [sortPrefs, setSortPrefs] = useState(() => loadSortPrefs());
  const { sortBy, sortDirection } = sortPrefs;
  useEffect(() => {
    saveSortPrefs(sortPrefs);
  }, [sortPrefs]);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef(null);
  const [stageSlaClock, setStageSlaClock] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStageSlaClock((n) => n + 1), SLA_CLOCK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
  const stageSlaNow = useMemo(() => Date.now(), [stageSlaClock]);
  useEffect(() => {
    if (!sortMenuOpen) return;
    const onDoc = (e) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setSortMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setSortMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortMenuOpen]);
  const assigningStudent = useMemo(
    () => students.find((student) => student.id === assigningStudentId) || null,
    [students, assigningStudentId]
  );
  const linkedCounselorIds = useMemo(() => {
    if (!assigningStudent) return /* @__PURE__ */ new Set();
    return new Set(getAssignedCounselorIds(assigningStudent).map((id) => String(id || "").trim().toLowerCase()));
  }, [assigningStudent]);
  useEffect(() => {
    if (employees.length > 0) {
      const options = employees.filter((row) => {
        const role = String(row.role || "").toLowerCase();
        return isStudentContactStaffAccountRole(role);
      }).map((row) => ({
        id: row.id,
        name: row.username || row.email,
        email: row.email || "",
        branch: String(row.branch || row.office || "").trim()
      }));
      setAccountCounselors(options);
      setCounselorMetaReady(true);
      return;
    }
    const loadCounselorAccounts = async () => {
      try {
        const result = await getAccounts();
        if (!result.ok) return;
        const options = result.data.filter((row) => {
          const role = String(row.role || "").toLowerCase();
          return isStudentContactStaffAccountRole(role);
        }).map((row) => ({
          id: row.id,
          name: row.username || row.email,
          email: row.email || "",
          branch: String(row.branch || row.office || "").trim()
        }));
        setAccountCounselors(options);
      } finally {
        setCounselorMetaReady(true);
      }
    };
    loadCounselorAccounts();
  }, [employees]);
  const counselorOptions = useMemo(() => {
    let base = accountCounselors;
    if (String(userRole || "") === "Manager" && scopeBranch) {
      base = base.filter((item) => branchesMatch(item.branch, scopeBranch));
    }
    if (!canActAsPrimaryCounselorPortalRole(userRole) || !currentUser) {
      return base;
    }
    const exists = base.some(
      (item) =>
        item.id === currentUser.id ||
        String(item.email || "").toLowerCase() === String(currentUser.email || "").toLowerCase()
    );
    if (exists) return base;
    return [
      ...base,
      {
        id: currentUser.id || "SELF",
        name: currentUser.name || "Logged Counselor",
        email: currentUser.email || ""
      }
    ];
  }, [accountCounselors, userRole, scopeBranch, currentUser?.id, currentUser?.email, currentUser?.name]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(true);
  const [countryOptions, setCountryOptions] = useState([]);
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const debounceRef = useRef(null);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedFilter(filterText), SEARCH_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filterText]);

  const searchParams = useMemo(() => {
    const params = {};
    if (isCounselorEquivalentPortalRole(userRole)) {
      params.role = "Counselor";
      params.userId = authenticatedUser?.id || currentUser?.id || "";
    } else if (userRole === "Manager" || userRole === "Accountant") {
      params.role = userRole;
      params.userId = authenticatedUser?.id || currentUser?.id || "";
      if (scopeBranch) params.branch = scopeBranch;
    } else if (userRole === "Country Coordinator") {
      params.role = userRole;
      params.userId = authenticatedUser?.id || currentUser?.id || "";
      const country = String(authenticatedUser?.country || currentUser?.country || "").trim();
      if (country) params.userCountry = country;
    }
    if (debouncedFilter) params.q = debouncedFilter;
    if (counselorFilter && counselorFilter !== "All") params.counselor = counselorFilter;
    if (countryFilter && countryFilter !== "All") params.country = countryFilter;
    params.sortBy = sortBy;
    params.sortDirection = sortDirection;
    params.summary = true;
    return params;
  }, [userRole, authenticatedUser?.id, authenticatedUser?.country, currentUser?.id, currentUser?.country, scopeBranch, debouncedFilter, counselorFilter, countryFilter, sortBy, sortDirection]);

  const fetchStudents = useCallback(async (params) => {
    const id = ++fetchIdRef.current;
    setSearchLoading(true);
    const result = await searchStudents(params);
    if (id !== fetchIdRef.current) return;
    setSearchLoading(false);
    if (result.ok) {
      setSearchResults(result.data);
      setSearchTotal(result.total || result.data.length);
      if (result.countries) setCountryOptions(result.countries);
    }
  }, []);

  useEffect(() => {
    fetchStudents(searchParams);
  }, [searchParams, fetchStudents]);

  useEffect(() => {
    if (!students.length) return;
    const countries = Array.from(new Set(students.map((s) => String(s.country || "").trim()).filter(Boolean)));
    if (countries.length > 0) setCountryOptions((prev) => prev.length > 0 ? prev : countries);
  }, [students]);

  const sortedFilteredStudents = searchResults;

  const isUnassignedCounselor = (value) => {
    const normalized = String(value ?? "").trim().toLowerCase();
    return normalized === "" || normalized === "unassigned" || normalized === "none" || normalized === "null";
  };
  const canManageCounselors = userRole === "Admin" || userRole === "Manager" || userRole === "Team Lead" || userRole === "Country Coordinator";
  const handleAddStudent = async (newStudent) => {
    if (!onAddStudent) return { ok: false, error: "Add student is not configured." };
    return onAddStudent(newStudent);
  };
  const assignStudentToCounselor = (student, counselorId, branchWhatsappMessengerUserId = "") => {
    if (!counselorId) return;
    const counselor = counselorOptions.find((item) => String(item.id || "") === String(counselorId || ""));
    const counselorName = String(counselor?.name || "").trim();
    if (onAssignStudentCounselor) {
      onAssignStudentCounselor(student, counselorId, counselorName, branchWhatsappMessengerUserId);
      return;
    }
    if (!onUpdateStudent) return;
    onUpdateStudent({
      ...student,
      counselor: counselorId,
      counselorName: counselorName || student.counselorName || "",
      ...(branchWhatsappMessengerUserId
        ? { branchWhatsappMessengerUserId }
        : {}),
    });
  };
  const openCounselorManageMenu = (student) => {
    setAssigningStudentId(student.id);
    setManagerTargetCounselorId("");
    setManagerTargetWhatsappUserId(String(student?.branchWhatsappMessengerUserId || "").trim());
    setManagerAssignMode("reassign");
  };
  const confirmCounselorAssign = (student) => {
    if (!managerTargetCounselorId) return;
    if (branchWhatsappEnabled && !managerTargetWhatsappUserId) return;
    if (managerAssignMode === "secondary") {
      if (onAddSecondaryStudentCounselor) {
        onAddSecondaryStudentCounselor(student, managerTargetCounselorId);
      } else if (onUpdateStudent) {
        const patch = buildAddSecondaryCounselorPatch(student, managerTargetCounselorId);
        if (patch) onUpdateStudent({ ...student, ...patch });
      }
    } else {
      assignStudentToCounselor(student, managerTargetCounselorId, managerTargetWhatsappUserId);
    }
    setAssigningStudentId(null);
    setManagerTargetCounselorId("");
    setManagerTargetWhatsappUserId("");
    setManagerAssignMode("reassign");
  };
  const removeCounselorFromStudent = async (student) => {
    const counselorId = String(student?.counselor || "").trim();
    if (!counselorId || isUnassignedCounselor(counselorId)) return;
    if (wouldStudentHaveNoCounselorsAfterRemoval(student, counselorId)) {
      window.alert("Each student must keep at least one counselor. Assign another counselor before removing the last one.");
      return;
    }
    const counselor = counselorOptions.find((item) => String(item.id || "") === counselorId);
    const counselorName = counselor?.name || student.counselorName || counselorId;
    const patch = buildStudentCounselorRemovalPatch(student, counselorId, counselorOptions);
    if (!patch) return;
    const confirmed = window.confirm(`Remove ${counselorName} from ${student.name || "this student"}?`);
    if (!confirmed) return;
    if (!onUpdateStudent) return;
    const result = await onUpdateStudent({ ...student, ...patch });
    if (result?.ok === false) return;
    setAssigningStudentId(null);
    setManagerTargetCounselorId("");
    setManagerTargetWhatsappUserId("");
  };
  const getStatusColor = (status) => {
    switch (status) {
      case "Inquiry":
      case "New Inquiry":
        return "bg-slate-100 text-slate-700 border-gray-200";
      case "Registration":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "Application":
      case "Counseling":
      case "Uni Application":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "Interview training":
      case "Offer Received":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Documentation":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "Visa":
      case "Visa Pilot":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Enrolled":
        return "bg-teal-50 text-teal-800 border-teal-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };
  const counselorsById = useMemo(() => {
    const map = new Map();
    counselorOptions.forEach((counselor) => {
      const id = String(counselor.id || "").trim();
      if (!id) return;
      const existing = map.get(id);
      map.set(id, {
        id,
        name: counselor.name || existing?.name || counselor.email || id,
        avatar: existing?.avatar || "",
      });
    });
    return map;
  }, [counselorOptions]);
  const getCounselor = (id) => counselorsById.get(String(id || "").trim()) || null;
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6 animate-in fade-in duration-500", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap justify-between items-start gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold tracking-tight text-[#0F172A]", children: "Students" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mt-1", children: scopeBranch ? `Students assigned to ${scopeBranch}.` : "Browse and manage students in your pipeline." })
      ] }),
      /* @__PURE__ */ jsxs(Button, { onClick: () => setIsAddModalOpen(true), className: "bg-[#0F172A] hover:bg-slate-800 shrink-0", children: [
        /* @__PURE__ */ jsx(UserPlus, { size: 16, className: "mr-2" }),
        "Add Student"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2 items-center", children: [
        /* @__PURE__ */ jsxs("div", { className: "relative min-w-[190px]", children: [
          /* @__PURE__ */ jsxs("span", { className: "absolute -top-2 left-3 px-1.5 bg-white text-[10px] font-bold uppercase tracking-wider text-slate-500 rounded", children: [
            /* @__PURE__ */ jsx(Users2, { size: 10, className: "inline mr-1 -mt-0.5" }),
            "Counselor"
          ] }),
          /* @__PURE__ */ jsx(
            "select",
            {
              value: counselorFilter,
              onChange: (e) => setCounselorFilter(e.target.value),
              className: "w-full appearance-none pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-200",
              children: [
                /* @__PURE__ */ jsx("option", { value: "All", children: "All Counselors" }),
                /* @__PURE__ */ jsx("option", { value: "Unassigned", children: "Unassigned" }),
                ...counselorOptions.map((item) => /* @__PURE__ */ jsx("option", { value: item.id, children: item.name }, item.id))
              ]
            }
          ),
          /* @__PURE__ */ jsx(ChevronDown, { size: 14, className: "absolute right-3 top-3.5 text-slate-400 pointer-events-none" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "relative min-w-[170px]", children: [
          /* @__PURE__ */ jsxs("span", { className: "absolute -top-2 left-3 px-1.5 bg-white text-[10px] font-bold uppercase tracking-wider text-slate-500 rounded", children: [
            /* @__PURE__ */ jsx(Globe2, { size: 10, className: "inline mr-1 -mt-0.5" }),
            "Country"
          ] }),
          /* @__PURE__ */ jsx(
            "select",
            {
              value: countryFilter,
              onChange: (e) => setCountryFilter(e.target.value),
              className: "w-full appearance-none pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-200",
              children: [
                /* @__PURE__ */ jsx("option", { value: "All", children: "All Countries" }),
                ...countryOptions.map((country) => /* @__PURE__ */ jsx("option", { value: country, children: country }, country))
              ]
            }
          ),
          /* @__PURE__ */ jsx(ChevronDown, { size: 14, className: "absolute right-3 top-3.5 text-slate-400 pointer-events-none" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              placeholder: "Search...",
              value: filterText,
              onChange: (e) => setFilterText(e.target.value),
              className: "pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-slate-100 focus:border-slate-300 w-64 transition-all"
            }
          ),
          /* @__PURE__ */ jsx(Filter, { size: 14, className: "absolute right-2.5 top-3 text-gray-400" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 shrink-0", children: [
          /* @__PURE__ */ jsxs("div", { className: "relative shrink-0", ref: sortMenuRef, children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => setSortMenuOpen((open) => !open),
                className: `inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-slate-200 ${sortMenuOpen ? "ring-2 ring-slate-300 border-slate-300" : ""}`,
                "aria-expanded": sortMenuOpen,
                "aria-haspopup": "dialog",
                "aria-label": "Sort students",
                title: "Sort list",
                children: /* @__PURE__ */ jsx(ArrowDownUp, { size: 18, className: "text-slate-600" })
              }
            ),
            sortMenuOpen && /* @__PURE__ */ jsxs(
              "div",
              {
                className: "absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,17rem)] rounded-xl border border-slate-200 bg-white p-4 shadow-lg",
                role: "dialog",
                "aria-label": "Sort options",
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ jsx("p", { className: "text-xs font-bold uppercase tracking-wider text-slate-500 mb-3", children: "Sort list" }),
                  /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
                    /* @__PURE__ */ jsxs("div", { children: [
                      /* @__PURE__ */ jsx("label", { className: "block text-xs font-semibold text-slate-600 mb-1.5", htmlFor: "student-list-sort-by", children: "Sort by" }),
                      /* @__PURE__ */ jsxs("div", { className: "relative", children: [
                        /* @__PURE__ */ jsx(
                          "select",
                          {
                            id: "student-list-sort-by",
                            value: sortBy,
                            onChange: (e) => setSortPrefs((p) => ({ ...p, sortBy: e.target.value })),
                            className: "w-full appearance-none pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200",
                            children: [
                              /* @__PURE__ */ jsx("option", { value: "name", children: "Name" }),
                              /* @__PURE__ */ jsx("option", { value: "time", children: "Time (updated)" }),
                              /* @__PURE__ */ jsx("option", { value: "stage", children: "Stage" })
                            ]
                          }
                        ),
                        /* @__PURE__ */ jsx(ChevronDown, { size: 14, className: "absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" })
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxs("div", { children: [
                      /* @__PURE__ */ jsx("label", { className: "block text-xs font-semibold text-slate-600 mb-1.5", htmlFor: "student-list-sort-order", children: "Order" }),
                      /* @__PURE__ */ jsxs("div", { className: "relative", children: [
                        /* @__PURE__ */ jsx(
                          "select",
                          {
                            id: "student-list-sort-order",
                            value: sortDirection,
                            onChange: (e) => setSortPrefs((p) => ({ ...p, sortDirection: e.target.value })),
                            className: "w-full appearance-none pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200",
                            children: [
                              /* @__PURE__ */ jsx("option", { value: "asc", children: "Ascending" }),
                              /* @__PURE__ */ jsx("option", { value: "desc", children: "Descending" })
                            ]
                          }
                        ),
                        /* @__PURE__ */ jsx(ChevronDown, { size: 14, className: "absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" })
                      ] })
                    ] })
                  ] })
                ]
              }
            )
          ] })
        ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: dt.card, children: [
      /* @__PURE__ */ jsx("div", { className: dt.scroll, children: /* @__PURE__ */ jsxs("table", { className: dt.table, children: [
        /* @__PURE__ */ jsx("thead", { className: dt.head, children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: `${dt.th} w-[120px]`, children: "ID" }),
          /* @__PURE__ */ jsx("th", { className: dt.th, children: "Student Name" }),
          /* @__PURE__ */ jsx("th", { className: dt.th, children: "Country" }),
          /* @__PURE__ */ jsx("th", { className: dt.th, children: "Branch" }),
          /* @__PURE__ */ jsx("th", { className: dt.th, children: "Pipeline Stage" }),
          /* @__PURE__ */ jsx("th", { className: dt.th, children: "Counselor" }),
          /* @__PURE__ */ jsx("th", { className: dt.thRight, children: "Next Stage" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { className: dt.body, children: (counselorMetaReady && !searchLoading) ? sortedFilteredStudents.map((student) => /* @__PURE__ */ jsxs(
          "tr",
          {
            onClick: () => onSelectStudent(student),
            className: dt.rowInteractive,
            children: [
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3 font-mono text-xs text-slate-400", children: student.id }),
              /* @__PURE__ */ jsxs("td", { className: "px-6 py-3 font-medium text-slate-900", children: [
                student.name,
                student.priority === "High" && /* @__PURE__ */ jsx("span", { className: "ml-2 inline-block w-2 h-2 rounded-full bg-rose-500", title: "High Priority" })
              ] }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3 text-slate-600", children: student.country }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3 text-slate-500 text-xs", children: student.branch }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3", children: /* @__PURE__ */ jsx("span", { className: `inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(student.status)}`, children: student.status }) }),
              /* @__PURE__ */ jsxs("td", { className: "px-6 py-3 text-slate-600", children: [
                isUnassignedCounselor(student.counselor) ? /* @__PURE__ */ jsxs("div", { className: "relative inline-block", children: [
                  canManageCounselors ? /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: (e) => {
                        e.stopPropagation();
                        openCounselorManageMenu(student);
                      },
                      className: "text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full text-xs font-semibold hover:bg-amber-100",
                      children: "Unassigned"
                    }
                  ) : /* @__PURE__ */ jsx("span", { className: "text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full text-xs font-semibold", children: "Unassigned" })
                ] }) : /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  getCounselor(student.counselor)?.avatar ? /* @__PURE__ */ jsx("img", { src: getCounselor(student.counselor)?.avatar, alt: getCounselor(student.counselor)?.name, className: "w-5 h-5 rounded-full object-cover", referrerPolicy: "no-referrer" }) : /* @__PURE__ */ jsx("div", { className: "w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold", children: (getCounselor(student.counselor)?.name || student.counselor).charAt(0) }),
                  canManageCounselors ? /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: (e) => {
                        e.stopPropagation();
                        openCounselorManageMenu(student);
                      },
                      className: "text-left hover:text-indigo-700 hover:underline",
                      title: "Manage counselor",
                      children: getCounselor(student.counselor)?.name || student.counselor
                    }
                  ) : /* @__PURE__ */ jsx("span", { children: getCounselor(student.counselor)?.name || student.counselor })
                ] })
              ] }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3 text-right", children: /* @__PURE__ */ jsx(StageSlaCell, { student, now: stageSlaNow }) })
            ]
          },
          student.id
        )) : /* @__PURE__ */ jsx(TableSkeletonRows, { rows: 8, cols: 7 }) })
      ] }) }),
      /* @__PURE__ */ jsxs("div", { className: "px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-slate-500 flex justify-between items-center", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          "Showing ",
          (counselorMetaReady && !searchLoading) ? sortedFilteredStudents.length : "—",
          " of ",
          (counselorMetaReady && !searchLoading) ? searchTotal : "—",
          " students"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsx("button", { className: "disabled:opacity-50", disabled: true, children: "Previous" }),
          /* @__PURE__ */ jsx("button", { className: "disabled:opacity-50", children: "Next" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      AddStudentModal,
      {
        isOpen: isAddModalOpen,
        onClose: () => setIsAddModalOpen(false),
        onSubmit: handleAddStudent,
        onUpdateStudent,
        userRole,
        currentUser,
        counselorOptions,
        scopeBranch,
        branchWhatsappEnabled
      }
    ),
    assigningStudent ? /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[9999] overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm", onClick: () => setAssigningStudentId(null), children: /* @__PURE__ */ jsxs("div", { className: "w-full max-w-md bg-white rounded-xl border border-gray-100 shadow-2xl max-h-[90vh] overflow-y-auto my-auto", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs("div", { className: "p-5 border-b border-gray-100 bg-slate-50", children: [
        /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-slate-900", children: isUnassignedCounselor(assigningStudent.counselor) ? "Assign Counselor" : "Manage Counselor" }),
        /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
          "Student: ",
          assigningStudent.name
        ] }),
        !isUnassignedCounselor(assigningStudent.counselor) ? /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-600 mt-2", children: [
          "Current: ",
          getCounselor(assigningStudent.counselor)?.name || assigningStudent.counselorName || assigningStudent.counselor
        ] }) : null
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-5 space-y-4", children: [
        canManageCounselors ? /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          !isUnassignedCounselor(assigningStudent.counselor) ? /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-bold text-slate-500 uppercase", children: "Action" }),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1.5 text-xs text-slate-700", children: [
              /* @__PURE__ */ jsxs("label", { className: "inline-flex items-center gap-2", children: [
                /* @__PURE__ */ jsx("input", { type: "radio", name: "counselor-assign-mode", checked: managerAssignMode === "reassign", onChange: () => setManagerAssignMode("reassign") }),
                "Reassign primary counselor"
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "inline-flex items-center gap-2", children: [
                /* @__PURE__ */ jsx("input", { type: "radio", name: "counselor-assign-mode", checked: managerAssignMode === "secondary", onChange: () => setManagerAssignMode("secondary") }),
                "Add as secondary counselor"
              ] })
            ] }),
            managerAssignMode === "reassign" ? /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500", children: "The current primary counselor stays linked as a secondary counselor." }) : /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500", children: "Keeps the current primary counselor and adds another secondary counselor." })
          ] }) : null,
          /* @__PURE__ */ jsx("label", { className: "text-xs font-bold text-slate-500 uppercase", children: isUnassignedCounselor(assigningStudent.counselor) ? "Select Counselor" : managerAssignMode === "secondary" ? "Secondary counselor" : "Reassign to" }),
          /* @__PURE__ */ jsxs(
            "select",
            {
              value: managerTargetCounselorId,
              onChange: (e) => setManagerTargetCounselorId(e.target.value),
              className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:border-indigo-500",
              children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Select counselor" }),
                ...counselorOptions
                  .filter((item) => {
                    const itemId = String(item.id || "").trim();
                    if (!itemId) return false;
                    if (managerAssignMode === "secondary") {
                      return !linkedCounselorIds.has(itemId.toLowerCase());
                    }
                    return itemId !== String(assigningStudent.counselor || "");
                  })
                  .map((item) => /* @__PURE__ */ jsx("option", { value: item.id, children: item.name }, item.id))
              ]
            }
          )
        ] }) : null,
        branchWhatsappEnabled && managerAssignMode !== "secondary" ? /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-bold text-slate-500 uppercase", children: "Primary WhatsApp account" }),
          /* @__PURE__ */ jsx(
            BranchWhatsappAccountSelect,
            {
              branchLabel: resolveStudentBranchLabel(assigningStudent, scopeBranch),
              value: managerTargetWhatsappUserId,
              onChange: setManagerTargetWhatsappUserId,
              required: true
            }
          )
        ] }) : null,
        /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [
          /* @__PURE__ */ jsx(Button, { type: "button", variant: "ghost", onClick: () => setAssigningStudentId(null), children: "Cancel" }),
          !isUnassignedCounselor(assigningStudent.counselor) && canManageCounselors && !wouldStudentHaveNoCounselorsAfterRemoval(assigningStudent, assigningStudent.counselor) ? /* @__PURE__ */ jsxs(Button, { type: "button", variant: "ghost", className: "text-rose-600 hover:text-rose-700 hover:bg-rose-50", onClick: () => removeCounselorFromStudent(assigningStudent), children: [
            /* @__PURE__ */ jsx(X, { size: 14, className: "mr-1.5" }),
            "Remove"
          ] }) : null,
          canManageCounselors ? /* @__PURE__ */ jsx(Button, { type: "button", disabled: !managerTargetCounselorId || (branchWhatsappEnabled && managerAssignMode !== "secondary" && !managerTargetWhatsappUserId), onClick: () => confirmCounselorAssign(assigningStudent), children: isUnassignedCounselor(assigningStudent.counselor) ? "Assign" : managerAssignMode === "secondary" ? "Add secondary" : "Reassign" }) : null
        ] })
      ] })
    ] }) }) : null
  ] });
};
export {
  StudentList
};
