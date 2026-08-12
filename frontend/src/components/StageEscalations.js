import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock, Building2, UserCircle, ChevronRight, Filter, X } from "lucide-react";
import { Button } from "./Button";
import { dt, DataTablePagination } from "./DataTable";
import { useClientPagination } from "../hooks/usePagination";

function formatOverdue(ms) {
  const m = Math.max(0, ms);
  const hours = Math.floor(m / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h`;
  const mins = Math.floor(m / (60 * 1000));
  return `${mins}m`;
}

const defaultEscalationFilters = {
  search: "",
  stage: "All",
  branch: "All",
  counselor: "All"
};

function countActiveEscalationFilters(filters, { showBranch, showCounselor }) {
  let count = 0;
  if (String(filters.search || "").trim()) count += 1;
  if (filters.stage !== "All") count += 1;
  if (showBranch && filters.branch !== "All") count += 1;
  if (showCounselor && filters.counselor !== "All") count += 1;
  return count;
}

function filterEscalationsByPanel(escalations, filters, { showBranch, showCounselor }) {
  const search = String(filters.search || "").trim().toLowerCase();
  return (escalations || []).filter((row) => {
    if (search) {
      const name = String(row.studentName || "").toLowerCase();
      const id = String(row.studentId || "").toLowerCase();
      if (!name.includes(search) && !id.includes(search)) return false;
    }
    if (filters.stage !== "All" && String(row.stage || "").trim() !== filters.stage) return false;
    if (showBranch && filters.branch !== "All" && String(row.branch || "").trim() !== filters.branch) return false;
    if (showCounselor && filters.counselor !== "All" && String(row.counselorId || "").trim() !== filters.counselor) {
      return false;
    }
    return true;
  });
}

const StageEscalations = ({
  escalations = [],
  employees = [],
  variant = "admin",
  onOpenStudent,
  embedded = false
}) => {
  const [escalationFilters, setEscalationFilters] = useState(defaultEscalationFilters);
  const [escalationFiltersOpen, setEscalationFiltersOpen] = useState(false);
  const showBranchFilter = variant === "admin";
  const showCounselorFilter = variant === "admin" || variant === "manager";
  const showEscalationFilters = true;
  const activeEscalationFilterCount = useMemo(
    () => countActiveEscalationFilters(escalationFilters, { showBranch: showBranchFilter, showCounselor: showCounselorFilter }),
    [escalationFilters, showBranchFilter, showCounselorFilter]
  );
  const employeeLookup = useMemo(
    () =>
      (employees || []).reduce((acc, employee) => {
        acc[String(employee?.id || "").trim()] = employee;
        return acc;
      }, {}),
    [employees]
  );
  const getCounselorLabel = (counselorId) => {
    const key = String(counselorId || "").trim();
    if (!key) return "Unknown";
    const employee = employeeLookup[key];
    if (employee) {
      return String(employee.name || employee.username || employee.email || key).trim() || key;
    }
    return key;
  };
  const escalationFilterOptions = useMemo(() => {
    const stages = new Set();
    const branches = new Set();
    const counselorMap = new Map();
    for (const row of escalations || []) {
      const stage = String(row.stage || "").trim();
      if (stage) stages.add(stage);
      const branch = String(row.branch || "").trim();
      if (branch) branches.add(branch);
      const counselorId = String(row.counselorId || "").trim();
      if (counselorId) counselorMap.set(counselorId, getCounselorLabel(counselorId));
    }
    return {
      stages: [...stages].sort((a, b) => a.localeCompare(b)),
      branches: [...branches].sort((a, b) => a.localeCompare(b)),
      counselors: [...counselorMap.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label))
    };
  }, [escalations, employeeLookup]);
  const filteredEscalations = useMemo(
    () =>
      filterEscalationsByPanel(escalations, escalationFilters, {
        showBranch: showBranchFilter,
        showCounselor: showCounselorFilter
      }),
    [escalations, escalationFilters, showBranchFilter, showCounselorFilter]
  );
  const escalationPaginationResetKey = useMemo(
    () =>
      JSON.stringify({
        filters: escalationFilters,
        count: filteredEscalations.length
      }),
    [escalationFilters, filteredEscalations.length]
  );
  const {
    pageItems: pageEscalations,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalRows,
  } = useClientPagination(filteredEscalations, escalationPaginationResetKey);
  const updateEscalationFilter = (key, value) => {
    setEscalationFilters((prev) => ({ ...prev, [key]: value }));
  };
  const resetEscalationFilters = () => {
    setEscalationFilters(defaultEscalationFilters);
  };
  useEffect(() => {
    if (!escalationFiltersOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setEscalationFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [escalationFiltersOpen]);

  const emptyCopy =
    filteredEscalations.length === 0 && escalations.length > 0 && activeEscalationFilterCount > 0
      ? "No escalations match the current filters."
      : variant === "counselor"
        ? "No stage SLA breaches for your assigned students."
        : variant === "manager"
          ? "No overdue stages for your branch."
          : "No overdue pipeline stages across branches.";
  return /* @__PURE__ */ jsxs("div", {
    className: embedded ? "space-y-3" : "space-y-4 animate-in fade-in duration-500",
    children: [
      /* @__PURE__ */ jsxs("div", {
        className: "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3",
        children: [
          /* @__PURE__ */ jsxs("div", {
            children: embedded
              ? [
                  /* @__PURE__ */ jsx("h3", {
                    className: "text-sm font-bold text-slate-800 uppercase tracking-wide",
                    children: "Pipeline stage SLA"
                  }),
                  /* @__PURE__ */ jsx("p", {
                    className: "text-xs text-slate-500 mt-0.5",
                    children: "Students past the time limit for their current stage."
                  })
                ]
              : [
                  /* @__PURE__ */ jsx("h2", {
                    className: "text-xl font-semibold tracking-tight text-[#0F172A]",
                    children: "Stage SLA escalations"
                  }),
                  /* @__PURE__ */ jsx("p", {
                    className: "text-sm text-slate-500 mt-1 max-w-2xl",
                    children:
                      "Students who have exceeded the time limit for their current pipeline stage. Inquiry (1h), Registration (no SLA), Application (24h), Interview training (72h), Documentation (7d), Visa (30d), Enrolled (no SLA)."
                  })
                ]
          }),
          /* @__PURE__ */ jsxs("div", {
            className: "flex flex-wrap items-center gap-2 shrink-0",
            children: [
              showEscalationFilters &&
                /* @__PURE__ */ jsxs(Button, {
                  type: "button",
                  variant: "outline",
                  size: "sm",
                  onClick: () => setEscalationFiltersOpen(true),
                  children: /* @__PURE__ */ jsxs("span", {
                    className: "inline-flex items-center gap-1.5",
                    children: [
                      /* @__PURE__ */ jsx(Filter, { size: 14 }),
                      "Filters",
                      activeEscalationFilterCount > 0
                        ? /* @__PURE__ */ jsx("span", {
                            className:
                              "inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold",
                            children: activeEscalationFilterCount
                          })
                        : null
                    ]
                  })
                }),
              /* @__PURE__ */ jsxs("div", {
                className:
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-100 text-rose-800 text-xs font-semibold",
                children: [
                  /* @__PURE__ */ jsx(AlertTriangle, { size: 14 }),
                  filteredEscalations.length,
                  activeEscalationFilterCount > 0 && filteredEscalations.length !== escalations.length
                    ? /* @__PURE__ */ jsxs("span", {
                        className: "font-normal text-rose-600",
                        children: ["of ", escalations.length]
                      })
                    : null,
                  " overdue"
                ]
              })
            ]
          })
        ]
      }),
      /* @__PURE__ */ jsxs("div", {
        className: dt.card,
        children: [
        /* @__PURE__ */ jsx("div", {
          className: dt.scroll,
          children: /* @__PURE__ */ jsxs("table", {
            className: dt.table,
            children: [
              /* @__PURE__ */ jsx("thead", {
                className: dt.head,
                children: /* @__PURE__ */ jsxs("tr", {
                  children: [
                    /* @__PURE__ */ jsx("th", { className: "px-4 py-3 whitespace-nowrap", children: "Student" }),
                    /* @__PURE__ */ jsx("th", { className: "px-4 py-3 whitespace-nowrap hidden md:table-cell", children: "Branch" }),
                    /* @__PURE__ */ jsx("th", { className: "px-4 py-3 whitespace-nowrap", children: "Stage" }),
                    /* @__PURE__ */ jsx("th", { className: "px-4 py-3 whitespace-nowrap hidden lg:table-cell", children: "SLA" }),
                    /* @__PURE__ */ jsx("th", { className: "px-4 py-3 whitespace-nowrap", children: "Overdue by" }),
                    (variant === "admin" || variant === "manager") &&
                      /* @__PURE__ */ jsx("th", {
                        className: "px-4 py-3 whitespace-nowrap hidden xl:table-cell",
                        children: "Counselor"
                      }),
                    /* @__PURE__ */ jsx("th", { className: "px-4 py-3 w-10", children: "" })
                  ]
                })
              }),
              /* @__PURE__ */ jsx("tbody", {
                className: dt.body,
                children:
                  filteredEscalations.length === 0
                    ? /* @__PURE__ */ jsx("tr", {
                        children: /* @__PURE__ */ jsx("td", {
                          colSpan: variant === "admin" || variant === "manager" ? 7 : 6,
                          className: "px-4 py-12 text-center text-slate-500 text-sm",
                          children: emptyCopy
                        })
                      })
                    : pageEscalations.map((row) => {
                        const assignedCounselor = (employees || []).find(
                          (employee) => String(employee.id || "").trim() === String(row.counselorId || "").trim()
                        );
                        const counselorLabel = assignedCounselor
                          ? assignedCounselor.name || assignedCounselor.username || assignedCounselor.email || row.counselorId
                          : row.counselorId || "—";
                        return /* @__PURE__ */ jsxs(
                          "tr",
                          {
                            className: dt.rowInteractive,
                            children: [
                              /* @__PURE__ */ jsx("td", {
                                className: "px-4 py-3",
                                children: /* @__PURE__ */ jsxs("div", {
                                  children: [
                                    typeof onOpenStudent === "function"
                                      ? /* @__PURE__ */ jsx("button", {
                                          type: "button",
                                          onClick: () => onOpenStudent(row.studentId),
                                          className:
                                            "font-medium text-indigo-600 hover:text-indigo-800 hover:underline underline-offset-2 text-left",
                                          title: `Open ${row.studentName || row.studentId}`,
                                          children: row.studentName || row.studentId || "—"
                                        })
                                      : /* @__PURE__ */ jsx("p", {
                                          className: "font-medium text-slate-900",
                                          children: row.studentName || row.studentId || "—"
                                        }),
                                    row.studentId && row.studentName && row.studentName !== row.studentId
                                      ? /* @__PURE__ */ jsx("p", {
                                          className: "text-[11px] text-slate-400 font-mono mt-0.5",
                                          children: row.studentId
                                        })
                                      : null
                                  ]
                                })
                              }),
                              /* @__PURE__ */ jsx("td", {
                                className: "px-4 py-3 hidden md:table-cell",
                                children: /* @__PURE__ */ jsxs("span", {
                                  className: "inline-flex items-center gap-1 text-slate-600",
                                  children: [
                                    /* @__PURE__ */ jsx(Building2, { size: 12, className: "text-slate-400" }),
                                    row.branch || "—"
                                  ]
                                })
                              }),
                              /* @__PURE__ */ jsx("td", {
                                className: "px-4 py-3",
                                children: /* @__PURE__ */ jsxs("div", {
                                  children: [
                                    /* @__PURE__ */ jsx("span", {
                                      className:
                                        "inline-flex px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-100",
                                      children: row.stage
                                    }),
                                    /* @__PURE__ */ jsx("p", {
                                      className: "text-[11px] text-slate-500 mt-1 max-w-[220px]",
                                      children: row.owners
                                    })
                                  ]
                                })
                              }),
                              /* @__PURE__ */ jsx("td", {
                                className: "px-4 py-3 hidden lg:table-cell text-slate-600",
                                children: row.slaLabel
                              }),
                              /* @__PURE__ */ jsx("td", {
                                className: "px-4 py-3",
                                children: /* @__PURE__ */ jsxs("span", {
                                  className:
                                    "inline-flex items-center gap-1 font-semibold text-rose-700",
                                  children: [
                                    /* @__PURE__ */ jsx(Clock, { size: 14 }),
                                    formatOverdue(row.overdueMs)
                                  ]
                                })
                              }),
                              (variant === "admin" || variant === "manager") &&
                                /* @__PURE__ */ jsx("td", {
                                  className: "px-4 py-3 hidden xl:table-cell text-slate-600 text-xs",
                                  children: counselorLabel
                                }),
                              /* @__PURE__ */ jsx("td", {
                                className: "px-4 py-3 text-right",
                                children:
                                  typeof onOpenStudent === "function"
                                    ? /* @__PURE__ */ jsx("button", {
                                        type: "button",
                                        onClick: () => onOpenStudent(row.studentId),
                                        className:
                                          "inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800",
                                        children: [
                                          /* @__PURE__ */ jsx(UserCircle, { size: 14 }),
                                          /* @__PURE__ */ jsx(ChevronRight, { size: 14 })
                                        ]
                                      })
                                    : null
                              })
                            ]
                          },
                          `${row.studentId}-${row.stage}`
                        );
                      })
              })
            ]
          })
        }),
        /* @__PURE__ */ jsx(DataTablePagination, {
          page,
          pageSize,
          totalRows,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
          rowLabel: "escalations",
        }),
        ]
      }),
      showEscalationFilters && escalationFiltersOpen
        ? /* @__PURE__ */ jsx("div", {
            className:
              "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200",
            onClick: () => setEscalationFiltersOpen(false),
            children: /* @__PURE__ */ jsxs("div", {
              className:
                "bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto",
              onClick: (e) => e.stopPropagation(),
              children: [
                /* @__PURE__ */ jsxs("div", {
                  className: "flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100",
                  children: [
                    /* @__PURE__ */ jsxs("div", {
                      children: [
                        /* @__PURE__ */ jsx("h4", {
                          className: "text-base font-semibold text-slate-900",
                          children: "Filter stage SLA escalations"
                        }),
                        /* @__PURE__ */ jsx("p", {
                          className: "text-xs text-slate-500 mt-0.5",
                          children: "Narrow overdue stages by student, pipeline stage, branch, or counselor."
                        })
                      ]
                    }),
                    /* @__PURE__ */ jsx("button", {
                      type: "button",
                      className:
                        "p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors",
                      "aria-label": "Close filters",
                      onClick: () => setEscalationFiltersOpen(false),
                      children: /* @__PURE__ */ jsx(X, { size: 18 })
                    })
                  ]
                }),
                /* @__PURE__ */ jsxs("div", {
                  className: "grid grid-cols-1 sm:grid-cols-2 gap-3 p-5",
                  children: [
                    /* @__PURE__ */ jsxs("label", { className: "block sm:col-span-2", children: [
                      /* @__PURE__ */ jsx("span", {
                        className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
                        children: "Search"
                      }),
                      /* @__PURE__ */ jsx("input", {
                        type: "search",
                        value: escalationFilters.search,
                        onChange: (e) => updateEscalationFilter("search", e.target.value),
                        placeholder: "Student name or ID",
                        className:
                          "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      })
                    ] }),
                    /* @__PURE__ */ jsxs("label", { className: "block", children: [
                      /* @__PURE__ */ jsx("span", {
                        className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
                        children: "Stage"
                      }),
                      /* @__PURE__ */ jsxs("select", {
                        value: escalationFilters.stage,
                        onChange: (e) => updateEscalationFilter("stage", e.target.value),
                        className:
                          "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                        children: [
                          /* @__PURE__ */ jsx("option", { value: "All", children: "All stages" }),
                          ...escalationFilterOptions.stages.map((stage) =>
                            /* @__PURE__ */ jsx("option", { value: stage, children: stage }, stage)
                          )
                        ]
                      })
                    ] }),
                    showBranchFilter &&
                      /* @__PURE__ */ jsxs("label", { className: "block", children: [
                        /* @__PURE__ */ jsx("span", {
                          className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
                          children: "Branch"
                        }),
                        /* @__PURE__ */ jsxs("select", {
                          value: escalationFilters.branch,
                          onChange: (e) => updateEscalationFilter("branch", e.target.value),
                          className:
                            "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                          children: [
                            /* @__PURE__ */ jsx("option", { value: "All", children: "All branches" }),
                            ...escalationFilterOptions.branches.map((branch) =>
                              /* @__PURE__ */ jsx("option", { value: branch, children: branch }, branch)
                            )
                          ]
                        })
                      ] }),
                    showCounselorFilter &&
                      /* @__PURE__ */ jsxs("label", { className: "block", children: [
                        /* @__PURE__ */ jsx("span", {
                          className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
                          children: "Counselor"
                        }),
                        /* @__PURE__ */ jsxs("select", {
                          value: escalationFilters.counselor,
                          onChange: (e) => updateEscalationFilter("counselor", e.target.value),
                          className:
                            "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                          children: [
                            /* @__PURE__ */ jsx("option", { value: "All", children: "All counselors" }),
                            ...escalationFilterOptions.counselors.map((counselor) =>
                              /* @__PURE__ */ jsx("option", { value: counselor.id, children: counselor.label }, counselor.id)
                            )
                          ]
                        })
                      ] })
                  ]
                }),
                /* @__PURE__ */ jsxs("div", {
                  className:
                    "px-5 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-4 mx-5",
                  children: [
                    /* @__PURE__ */ jsx("p", {
                      className: "text-[11px] text-slate-500",
                      children:
                        escalations.length > 0
                          ? `Showing ${filteredEscalations.length} of ${escalations.length} escalations.`
                          : "No stage SLA escalations in the current view."
                    }),
                    /* @__PURE__ */ jsxs("div", {
                      className: "flex items-center gap-2 shrink-0",
                      children: [
                        /* @__PURE__ */ jsx(Button, {
                          type: "button",
                          variant: "ghost",
                          size: "sm",
                          onClick: resetEscalationFilters,
                          children: "Reset"
                        }),
                        /* @__PURE__ */ jsx(Button, {
                          type: "button",
                          size: "sm",
                          onClick: () => setEscalationFiltersOpen(false),
                          children: "Done"
                        })
                      ]
                    })
                  ]
                })
              ]
            })
          })
        : null
    ]
  });
};

export { StageEscalations };
