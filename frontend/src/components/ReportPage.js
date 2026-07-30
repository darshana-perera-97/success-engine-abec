import { jsx, jsxs } from "react/jsx-runtime";
import React from "react";
import { Filter, BarChart3, Users, FileCheck, MessageSquare, DollarSign, Plane, X, Download, Eye } from "lucide-react";
import { Button } from "./Button";
import { ReportStudentTable } from "./ReportStudentTable";
import { getReqStudents } from "../authApi";
import {
  REPORT_SECTIONS,
  computeReportMetrics,
  collectReportFilterOptions,
} from "../utils/reportMetrics";
import { downloadReportPdf, openReportPdfPreview, downloadReportSectionPdf } from "../utils/reportPdf";
const SECTION_ICONS = {
  leads: Users,
  offers: FileCheck,
  interviews: MessageSquare,
  cas: FileCheck,
  financial: DollarSign,
  visa: Plane,
};

const defaultFilters = {
  dateFrom: "",
  dateTo: "",
  counselor: "All",
  branch: "All",
  country: "All",
};

function countActiveFilters(filters) {
  let count = 0;
  if (filters.dateFrom) count += 1;
  if (filters.dateTo) count += 1;
  if (filters.counselor !== "All") count += 1;
  if (filters.branch !== "All") count += 1;
  if (filters.country !== "All") count += 1;
  return count;
}

function MetricTile({ label, count }) {
  return /* @__PURE__ */ jsxs("div", {
    className: "bg-slate-50 border border-gray-100 rounded-xl p-4 flex flex-col gap-1 flex-1 min-w-0 basis-0",
    children: [
      /* @__PURE__ */ jsx("span", {
        className: "text-2xl font-bold text-slate-900 tabular-nums",
        children: count.toLocaleString(),
      }),
      /* @__PURE__ */ jsx("span", {
        className: "text-xs font-medium text-slate-600 leading-snug",
        children: label,
      }),
    ],
  });
}

const ReportPage = ({
  students = [],
  employees = [],
  appointments = [],
  scopeLabel = null,
  scopeBranch = null,
  onSelectStudent = null,
}) => {
  const [filters, setFilters] = React.useState(defaultFilters);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [reqStudents, setReqStudents] = React.useState([]);
  const [reqLoading, setReqLoading] = React.useState(true);
  const [isExporting, setIsExporting] = React.useState(false);
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [exportingSectionId, setExportingSectionId] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setReqLoading(true);
      const params = scopeBranch ? { branch: scopeBranch } : {};
      const result = await getReqStudents(params);
      if (cancelled) return;
      setReqStudents(result.ok ? result.data || [] : []);
      setReqLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [scopeBranch]);

  const filterOptions = React.useMemo(
    () => collectReportFilterOptions(students, employees, reqStudents),
    [students, employees, reqStudents]
  );

  const { counts, lists, filteredStudents, filteredReqStudents } = React.useMemo(
    () => computeReportMetrics(students, appointments, reqStudents, filters, employees),
    [students, appointments, reqStudents, filters, employees]
  );

  const activeFilterCount = React.useMemo(() => countActiveFilters(filters), [filters]);

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => setFilters(defaultFilters);

  const pdfExportOptions = React.useMemo(() => {
    const counselorLabel =
      filters.counselor === "All"
        ? "All"
        : filterOptions.counselors.find((c) => c.id === filters.counselor)?.label || filters.counselor;
    return {
      counts,
      lists,
      filters: { ...filters, counselorLabel },
      scopeLabel,
      filteredStudentsCount: filteredStudents.length,
      filteredReqStudentsCount: filteredReqStudents.length,
    };
  }, [counts, lists, filters, filterOptions.counselors, scopeLabel, filteredStudents.length, filteredReqStudents.length]);

  const handlePreviewPdf = async () => {
    try {
      setIsPreviewing(true);
      await openReportPdfPreview(pdfExportOptions);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setIsExporting(true);
      await downloadReportPdf(pdfExportOptions);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadSectionPdf = async (section) => {
    try {
      setExportingSectionId(section.id);
      await downloadReportSectionPdf({
        ...pdfExportOptions,
        sectionId: section.id,
        sectionTitle: section.title,
      });
    } finally {
      setExportingSectionId("");
    }
  };

  React.useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filtersOpen]);

  return /* @__PURE__ */ jsxs("div", {
    className: "max-w-7xl mx-auto space-y-6 pb-10",
    children: [
      /* @__PURE__ */ jsxs("div", {
        className: "flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4",
        children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("div", {
              className: "flex items-center gap-2 mb-1",
              children: [
                /* @__PURE__ */ jsx(BarChart3, { size: 22, className: "text-indigo-600" }),
                /* @__PURE__ */ jsx("h1", {
                  className: "text-2xl font-bold text-slate-900",
                  children: "Report",
                }),
              ],
            }),
            /* @__PURE__ */ jsx("p", {
              className: "text-sm text-slate-500",
              children: scopeLabel
                ? `Allocated student metrics for ${scopeLabel}.`
                : "Allocated student metrics for your account.",
            }),
            !reqLoading && /* @__PURE__ */ jsxs("p", {
              className: "text-xs text-slate-400 mt-1",
              children: [
                filteredStudents.length,
                " pipeline students",
                filteredReqStudents.length > 0
                  ? ` · ${filteredReqStudents.length} requested leads`
                  : "",
              ],
            }),
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 shrink-0", children: [
            /* @__PURE__ */ jsxs(Button, {
              onClick: handlePreviewPdf,
              disabled: isPreviewing || isExporting || !!exportingSectionId,
              className: "bg-indigo-600 hover:bg-indigo-700 text-white",
              children: [
                /* @__PURE__ */ jsx(Eye, { size: 16, className: "mr-1.5" }),
                isPreviewing ? "Opening…" : "Preview full report",
              ],
            }),
            /* @__PURE__ */ jsxs(Button, {
              variant: "secondary",
              onClick: handleDownloadPdf,
              disabled: isExporting || isPreviewing || !!exportingSectionId,
              children: [
                /* @__PURE__ */ jsx(Download, { size: 16, className: "mr-1.5" }),
                isExporting ? "Exporting…" : "Download full report",
              ],
            }),
            /* @__PURE__ */ jsxs(Button, {
              variant: "secondary",
              onClick: () => setFiltersOpen(true),
              className: "relative",
              children: [
                /* @__PURE__ */ jsx(Filter, { size: 16, className: "mr-1.5" }),
                "Filters",
                activeFilterCount > 0 &&
                  /* @__PURE__ */ jsx("span", {
                    className: "absolute -top-1.5 -right-1.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center",
                    children: activeFilterCount,
                  }),
              ],
            }),
            activeFilterCount > 0 &&
              /* @__PURE__ */ jsx(Button, {
                variant: "ghost",
                onClick: resetFilters,
                className: "text-slate-500",
                children: "Clear filters",
              }),
          ] }),
        ],
      }),

      filtersOpen &&
        /* @__PURE__ */ jsx("div", {
          className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in",
          children: /* @__PURE__ */ jsxs("div", {
            className: "bg-white rounded-xl border border-gray-100 shadow-2xl p-6 w-full max-w-2xl scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto",
            children: [
              /* @__PURE__ */ jsxs("div", {
                className: "flex items-center justify-between mb-5",
                children: [
                  /* @__PURE__ */ jsx("h3", {
                    className: "font-bold text-lg text-slate-900",
                    children: "Report filters",
                  }),
                  /* @__PURE__ */ jsx("button", {
                    type: "button",
                    onClick: () => setFiltersOpen(false),
                    className: "text-slate-400 hover:text-slate-600 p-1",
                    children: /* @__PURE__ */ jsx(X, { size: 20 }),
                  }),
                ],
              }),
              /* @__PURE__ */ jsxs("div", {
                className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
                children: [
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("label", {
                      className: "text-xs font-semibold text-slate-500 uppercase block mb-1",
                      children: "Date from",
                    }),
                    /* @__PURE__ */ jsx("input", {
                      type: "date",
                      value: filters.dateFrom,
                      onChange: (e) => updateFilter("dateFrom", e.target.value),
                      className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-md",
                    }),
                  ] }),
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("label", {
                      className: "text-xs font-semibold text-slate-500 uppercase block mb-1",
                      children: "Date to",
                    }),
                    /* @__PURE__ */ jsx("input", {
                      type: "date",
                      value: filters.dateTo,
                      onChange: (e) => updateFilter("dateTo", e.target.value),
                      className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-md",
                    }),
                  ] }),
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("label", {
                      className: "text-xs font-semibold text-slate-500 uppercase block mb-1",
                      children: "Counselor",
                    }),
                    /* @__PURE__ */ jsxs("select", {
                      value: filters.counselor,
                      onChange: (e) => updateFilter("counselor", e.target.value),
                      className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-white",
                      children: [
                        /* @__PURE__ */ jsx("option", { value: "All", children: "All counselors" }),
                        ...filterOptions.counselors.map((c) =>
                          /* @__PURE__ */ jsx("option", { value: c.id, children: c.label }, c.id)
                        ),
                      ],
                    }),
                  ] }),
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("label", {
                      className: "text-xs font-semibold text-slate-500 uppercase block mb-1",
                      children: "Team / Branch",
                    }),
                    /* @__PURE__ */ jsxs("select", {
                      value: filters.branch,
                      onChange: (e) => updateFilter("branch", e.target.value),
                      className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-white",
                      children: [
                        /* @__PURE__ */ jsx("option", { value: "All", children: "All branches" }),
                        ...filterOptions.branches.map((b) =>
                          /* @__PURE__ */ jsx("option", { value: b, children: b }, b)
                        ),
                      ],
                    }),
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
                    /* @__PURE__ */ jsx("label", {
                      className: "text-xs font-semibold text-slate-500 uppercase block mb-1",
                      children: "Country",
                    }),
                    /* @__PURE__ */ jsxs("select", {
                      value: filters.country,
                      onChange: (e) => updateFilter("country", e.target.value),
                      className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-white",
                      children: [
                        /* @__PURE__ */ jsx("option", { value: "All", children: "All countries" }),
                        ...filterOptions.countries.map((c) =>
                          /* @__PURE__ */ jsx("option", { value: c, children: c }, c)
                        ),
                      ],
                    }),
                  ] }),
                ],
              }),
              /* @__PURE__ */ jsxs("div", {
                className: "flex justify-end gap-2 pt-5 mt-2 border-t border-gray-100",
                children: [
                  /* @__PURE__ */ jsx(Button, {
                    variant: "ghost",
                    onClick: resetFilters,
                    children: "Reset",
                  }),
                  /* @__PURE__ */ jsx(Button, {
                    onClick: () => setFiltersOpen(false),
                    children: "Apply",
                  }),
                ],
              }),
            ],
          }),
        }),

      REPORT_SECTIONS.map((section) => {
        const Icon = SECTION_ICONS[section.id] || BarChart3;
        return /* @__PURE__ */ jsxs("section", {
          key: section.id,
          className: "bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6",
          children: [
            /* @__PURE__ */ jsxs("div", {
              className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-100",
              children: [
                /* @__PURE__ */ jsxs("div", {
                  className: "flex items-center gap-2",
                  children: [
                    /* @__PURE__ */ jsx(Icon, { size: 18, className: "text-indigo-600" }),
                    /* @__PURE__ */ jsx("h2", {
                      className: "text-base font-bold text-slate-900",
                      children: section.title,
                    }),
                  ],
                }),
                /* @__PURE__ */ jsxs(Button, {
                  variant: "secondary",
                  size: "sm",
                  onClick: () => handleDownloadSectionPdf(section),
                  disabled: !!exportingSectionId || isExporting || isPreviewing,
                  children: [
                    /* @__PURE__ */ jsx(Download, { size: 14, className: "mr-1.5" }),
                    exportingSectionId === section.id ? "Exporting…" : "Download section",
                  ],
                }),
              ],
            }),
            /* @__PURE__ */ jsx("div", {
              className: "flex flex-row gap-3 w-full",
              children: section.metrics.map((metric) =>
                /* @__PURE__ */ jsx(MetricTile, {
                  label: metric.label,
                  count: counts[metric.id] ?? 0,
                }, metric.id)
              ),
            }),
            /* @__PURE__ */ jsx("div", {
              className: "space-y-8",
              children: section.metrics.map((metric) =>
                /* @__PURE__ */ jsxs("div", {
                  className: "space-y-3",
                  children: [
                    /* @__PURE__ */ jsxs("h3", {
                      className: "text-sm font-bold text-slate-800",
                      children: [
                        metric.label,
                        /* @__PURE__ */ jsxs("span", {
                          className: "ml-2 text-xs font-semibold text-slate-400 tabular-nums",
                          children: ["(", counts[metric.id] ?? 0, ")"],
                        }),
                      ],
                    }),
                    /* @__PURE__ */ jsx(ReportStudentTable, {
                      rows: lists[metric.id] || [],
                      employees,
                      onSelectStudent,
                      metricLabel: metric.label,
                    }),
                  ],
                }, `${section.id}-${metric.id}`)
              ),
            }),
          ],
        });
      }),
    ],
  });
};

export { ReportPage };
