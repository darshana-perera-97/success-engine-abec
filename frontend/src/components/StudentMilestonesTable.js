import { jsx, jsxs } from "react/jsx-runtime";
import React from "react";
import { Download, Filter, User, X } from "lucide-react";
import { Button } from "./Button";
import { dt } from "./DataTable";
import { offerStatusBadgeClass } from "../utils/universityOfferLetters";
import {
  MILESTONE_TYPES,
  buildStudentMilestoneRecords,
  collectMilestoneFilterOptions,
  filterMilestoneRecords,
  formatMilestoneDisplayDate,
} from "../utils/studentMilestoneRecords";
import { downloadMilestoneReportPdf } from "../utils/milestoneReportPdf";

function milestoneTypeBadgeClass(type) {
  if (type === "Offer Letter") return "bg-indigo-50 text-indigo-700 border-indigo-200";
  if (type === "Granted Visa") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (type === "COE") return "bg-sky-50 text-sky-700 border-sky-200";
  if (type === "CAS") return "bg-violet-50 text-violet-700 border-violet-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function statusBadgeClass(status, milestoneType) {
  if (milestoneType === "Offer Letter") return offerStatusBadgeClass(status);
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "verified") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (normalized === "pending") return "bg-amber-50 text-amber-700 border-amber-200";
  if (normalized === "rejected") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

const defaultFilters = {
  search: "",
  milestoneType: "All",
  branch: "All",
  country: "All",
  counselor: "All",
  status: "All",
  intakeMonth: "All",
  intakeYear: "All",
  dateFrom: "",
  dateTo: "",
};

function countActiveFilters(filters) {
  let count = 0;
  if (String(filters.search || "").trim()) count += 1;
  if (filters.milestoneType !== "All") count += 1;
  if (filters.branch !== "All") count += 1;
  if (filters.country !== "All") count += 1;
  if (filters.counselor !== "All") count += 1;
  if (filters.status !== "All") count += 1;
  if (filters.intakeMonth !== "All") count += 1;
  if (filters.intakeYear !== "All") count += 1;
  if (filters.dateFrom) count += 1;
  if (filters.dateTo) count += 1;
  return count;
}

const StudentMilestonesTable = ({
  students = [],
  employees = [],
  onSelectStudent,
  scopeLabel = null,
  className = "",
}) => {
  const allRows = React.useMemo(
    () => buildStudentMilestoneRecords(students, employees),
    [students, employees]
  );
  const filterOptions = React.useMemo(() => collectMilestoneFilterOptions(allRows), [allRows]);
  const [filters, setFilters] = React.useState(defaultFilters);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const activeFilterCount = React.useMemo(() => countActiveFilters(filters), [filters]);

  React.useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filtersOpen]);

  const filteredRows = React.useMemo(
    () => filterMilestoneRecords(allRows, filters),
    [allRows, filters]
  );

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
  };

  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      await downloadMilestoneReportPdf({
        rows: filteredRows,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        scopeLabel,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return /* @__PURE__ */ jsxs("div", {
    className: `bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col w-full ${className}`.trim(),
    children: [
      /* @__PURE__ */ jsxs("div", {
        className: "flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5",
        children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h3", {
              className: "font-bold text-slate-900",
              children: "Student milestones",
            }),
            scopeLabel
              ? /* @__PURE__ */ jsxs("p", {
                  className: "text-xs text-slate-500 mt-1",
                  children: [
                    "Offer letters, granted visas, COE, and CAS for students in ",
                    /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-600", children: scopeLabel }),
                    " (",
                    filteredRows.length,
                    " of ",
                    allRows.length,
                    ").",
                  ],
                })
              : /* @__PURE__ */ jsxs("p", {
                  className: "text-xs text-slate-500 mt-1",
                  children: [
                    "Offer letters, granted visas, COE, and CAS across all branches (",
                    filteredRows.length,
                    " of ",
                    allRows.length,
                    ").",
                  ],
                }),
          ] }),
          /* @__PURE__ */ jsxs("div", {
            className: "flex flex-wrap items-center gap-2 shrink-0 self-start",
            children: [
              /* @__PURE__ */ jsxs(Button, {
                type: "button",
                variant: "outline",
                size: "sm",
                onClick: () => setFiltersOpen(true),
                children: /* @__PURE__ */ jsxs("span", {
                  className: "inline-flex items-center gap-1.5",
                  children: [
                    /* @__PURE__ */ jsx(Filter, { size: 14 }),
                    "Filters",
                    activeFilterCount > 0
                      ? /* @__PURE__ */ jsx("span", {
                          className:
                            "inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold",
                          children: activeFilterCount,
                        })
                      : null,
                  ],
                }),
              }),
              /* @__PURE__ */ jsx(Button, {
                type: "button",
                variant: "outline",
                size: "sm",
                disabled: isExporting,
                onClick: handleExportPdf,
                children: /* @__PURE__ */ jsxs("span", {
                  className: "inline-flex items-center gap-1.5",
                  children: [
                    /* @__PURE__ */ jsx(Download, { size: 14 }),
                    isExporting ? "Exporting…" : "Download PDF",
                  ],
                }),
              }),
            ],
          }),
        ],
      }),
      activeFilterCount > 0
        ? /* @__PURE__ */ jsxs("div", {
            className: "flex flex-wrap items-center gap-2 mb-4 text-[11px] text-slate-500",
            children: [
              /* @__PURE__ */ jsxs("span", { children: [activeFilterCount, " filter", activeFilterCount === 1 ? "" : "s", " active"] }),
              /* @__PURE__ */ jsx("button", {
                type: "button",
                className: "text-indigo-600 hover:text-indigo-800 font-medium",
                onClick: resetFilters,
                children: "Clear all",
              }),
            ],
          })
        : null,
      filtersOpen
        ? /* @__PURE__ */ jsx("div", {
            className:
              "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200",
            onClick: () => setFiltersOpen(false),
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
                          children: "Filter milestones",
                        }),
                        /* @__PURE__ */ jsx("p", {
                          className: "text-xs text-slate-500 mt-0.5",
                          children: "Narrow offer letters, visas, COE, and CAS by student, branch, date, and more.",
                        }),
                      ],
                    }),
                    /* @__PURE__ */ jsx("button", {
                      type: "button",
                      className:
                        "p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors",
                      "aria-label": "Close filters",
                      onClick: () => setFiltersOpen(false),
                      children: /* @__PURE__ */ jsx(X, { size: 18 }),
                    }),
                  ],
                }),
                /* @__PURE__ */ jsxs("div", {
                  className: "grid grid-cols-1 sm:grid-cols-2 gap-3 p-5",
                  children: [
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", {
              className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
              children: "Search",
            }),
            /* @__PURE__ */ jsx("input", {
              type: "search",
              value: filters.search,
              onChange: (e) => updateFilter("search", e.target.value),
              placeholder: "Student name or ID",
              className:
                "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
            }),
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", {
              className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
              children: "Milestone",
            }),
            /* @__PURE__ */ jsxs("select", {
              value: filters.milestoneType,
              onChange: (e) => updateFilter("milestoneType", e.target.value),
              className:
                "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
              children: [
                /* @__PURE__ */ jsx("option", { value: "All", children: "All milestones" }),
                ...MILESTONE_TYPES.map((type) =>
                  /* @__PURE__ */ jsx("option", { value: type, children: type }, type)
                ),
              ],
            }),
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", {
              className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
              children: "Branch",
            }),
            /* @__PURE__ */ jsxs("select", {
              value: filters.branch,
              onChange: (e) => updateFilter("branch", e.target.value),
              className:
                "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
              children: [
                /* @__PURE__ */ jsx("option", { value: "All", children: "All branches" }),
                ...filterOptions.branches.map((branch) =>
                  /* @__PURE__ */ jsx("option", { value: branch, children: branch }, branch)
                ),
              ],
            }),
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", {
              className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
              children: "Country",
            }),
            /* @__PURE__ */ jsxs("select", {
              value: filters.country,
              onChange: (e) => updateFilter("country", e.target.value),
              className:
                "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
              children: [
                /* @__PURE__ */ jsx("option", { value: "All", children: "All countries" }),
                ...filterOptions.countries.map((country) =>
                  /* @__PURE__ */ jsx("option", { value: country, children: country }, country)
                ),
              ],
            }),
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", {
              className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
              children: "Counselor",
            }),
            /* @__PURE__ */ jsxs("select", {
              value: filters.counselor,
              onChange: (e) => updateFilter("counselor", e.target.value),
              className:
                "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
              children: [
                /* @__PURE__ */ jsx("option", { value: "All", children: "All counselors" }),
                ...filterOptions.counselors.map((counselor) =>
                  /* @__PURE__ */ jsx("option", { value: counselor, children: counselor }, counselor)
                ),
              ],
            }),
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", {
              className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
              children: "Status",
            }),
            /* @__PURE__ */ jsxs("select", {
              value: filters.status,
              onChange: (e) => updateFilter("status", e.target.value),
              className:
                "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
              children: [
                /* @__PURE__ */ jsx("option", { value: "All", children: "All statuses" }),
                ...filterOptions.statuses.map((status) =>
                  /* @__PURE__ */ jsx("option", { value: status, children: status }, status)
                ),
              ],
            }),
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", {
              className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
              children: "Intake month",
            }),
            /* @__PURE__ */ jsxs("select", {
              value: filters.intakeMonth,
              onChange: (e) => updateFilter("intakeMonth", e.target.value),
              className:
                "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
              children: [
                /* @__PURE__ */ jsx("option", { value: "All", children: "All months" }),
                ...filterOptions.intakeMonths.map((month) =>
                  /* @__PURE__ */ jsx("option", { value: month, children: month }, month)
                ),
              ],
            }),
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", {
              className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
              children: "Intake year",
            }),
            /* @__PURE__ */ jsxs("select", {
              value: filters.intakeYear,
              onChange: (e) => updateFilter("intakeYear", e.target.value),
              className:
                "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
              children: [
                /* @__PURE__ */ jsx("option", { value: "All", children: "All years" }),
                ...filterOptions.intakeYears.map((year) =>
                  /* @__PURE__ */ jsx("option", { value: year, children: year }, year)
                ),
              ],
            }),
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", {
              className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
              children: "From date",
            }),
            /* @__PURE__ */ jsx("input", {
              type: "date",
              value: filters.dateFrom,
              onChange: (e) => updateFilter("dateFrom", e.target.value),
              className:
                "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
            }),
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", {
              className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
              children: "To date",
            }),
            /* @__PURE__ */ jsx("input", {
              type: "date",
              value: filters.dateTo,
              onChange: (e) => updateFilter("dateTo", e.target.value),
              className:
                "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
            }),
          ] }),
                  ],
                }),
                /* @__PURE__ */ jsxs("div", {
                  className: "px-5 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-4 mx-5",
                  children: [
                    /* @__PURE__ */ jsx("p", {
                      className: "text-[11px] text-slate-500",
                      children:
                        filters.dateFrom || filters.dateTo
                          ? "PDF export uses the filtered rows and selected date range."
                          : "Set a date range to narrow milestones by upload or verification date.",
                    }),
                    /* @__PURE__ */ jsxs("div", {
                      className: "flex items-center gap-2 shrink-0",
                      children: [
                        /* @__PURE__ */ jsx(Button, {
                          type: "button",
                          variant: "ghost",
                          size: "sm",
                          onClick: resetFilters,
                          children: "Reset",
                        }),
                        /* @__PURE__ */ jsx(Button, {
                          type: "button",
                          size: "sm",
                          onClick: () => setFiltersOpen(false),
                          children: "Done",
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          })
        : null,
      filteredRows.length === 0
        ? /* @__PURE__ */ jsx("p", {
            className: "text-sm text-slate-400 text-center py-10",
            children: allRows.length === 0
              ? "No offer letters, visas, COE, or CAS records yet."
              : "No records match the current filters.",
          })
        : /* @__PURE__ */ jsx("div", {
            className: `${dt.scrollY} max-h-[520px] rounded-lg border border-slate-200`,
            children: /* @__PURE__ */ jsxs("table", {
              className: dt.table,
              children: [
                /* @__PURE__ */ jsx("thead", {
                  className: dt.headSticky,
                  children: /* @__PURE__ */ jsxs("tr", {
                    children: [
                      /* @__PURE__ */ jsx("th", { className: dt.thCompact, children: "Date" }),
                      /* @__PURE__ */ jsx("th", { className: dt.thCompact, children: "Student" }),
                      /* @__PURE__ */ jsx("th", { className: dt.thCompact, children: "Milestone" }),
                      /* @__PURE__ */ jsx("th", { className: dt.thCompact, children: "Status" }),
                      /* @__PURE__ */ jsx("th", { className: dt.thCompact, children: "Branch" }),
                      /* @__PURE__ */ jsx("th", { className: dt.thCompact, children: "Country" }),
                      /* @__PURE__ */ jsx("th", { className: dt.thCompact, children: "Counselor" }),
                      /* @__PURE__ */ jsx("th", { className: dt.thCompactRight, children: "Profile" }),
                    ],
                  }),
                }),
                /* @__PURE__ */ jsx("tbody", {
                  className: dt.body,
                  children: filteredRows.map((row) =>
                    /* @__PURE__ */ jsxs(
                      "tr",
                      {
                        className: dt.row,
                        children: [
                          /* @__PURE__ */ jsx("td", {
                            className: "px-3 py-3 text-slate-600 whitespace-nowrap",
                            children: formatMilestoneDisplayDate(row.eventDateMs),
                          }),
                          /* @__PURE__ */ jsx("td", {
                            className: "px-3 py-3 font-medium text-slate-900",
                            children: row.studentName,
                          }),
                          /* @__PURE__ */ jsx("td", {
                            className: "px-3 py-3",
                            children: /* @__PURE__ */ jsx("span", {
                              className: `inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${milestoneTypeBadgeClass(row.milestoneType)}`,
                              children: row.milestoneType,
                            }),
                          }),
                          /* @__PURE__ */ jsx("td", {
                            className: "px-3 py-3",
                            children: /* @__PURE__ */ jsx("span", {
                              className: `inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadgeClass(row.status, row.milestoneType)}`,
                              children: row.status,
                            }),
                          }),
                          /* @__PURE__ */ jsx("td", {
                            className: "px-3 py-3 text-slate-600",
                            children: row.branch,
                          }),
                          /* @__PURE__ */ jsx("td", {
                            className: "px-3 py-3 text-slate-600",
                            children: row.country,
                          }),
                          /* @__PURE__ */ jsx("td", {
                            className: "px-3 py-3 text-slate-600",
                            children: row.counselorLabel,
                          }),
                          /* @__PURE__ */ jsx("td", {
                            className: "px-3 py-3 text-right",
                            children:
                              typeof onSelectStudent === "function" &&
                              /* @__PURE__ */ jsx(Button, {
                                type: "button",
                                size: "sm",
                                variant: "outline",
                                className: "h-8 w-8 min-w-[2rem] p-0 shrink-0 ml-auto",
                                title: "Student profile",
                                "aria-label": `Open student profile for ${row.studentName}`,
                                onClick: () => onSelectStudent(row.student, { profileTab: "pipeline" }),
                                children: /* @__PURE__ */ jsx(User, { size: 16, "aria-hidden": true }),
                              }),
                          }),
                        ],
                      },
                      row.key
                    )
                  ),
                }),
              ],
            }),
          }),
    ],
  });
};

export { StudentMilestonesTable };
