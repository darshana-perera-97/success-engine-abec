import { jsx, jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { dt, DataTablePagination } from "./DataTable";
import { buildReportRowsResetKey, DEFAULT_PAGE_SIZE, useClientPagination } from "../hooks/usePagination";
import { toAbsoluteAssetUrl } from "../apiConfig";
import { offerStatusBadgeClass } from "../utils/universityOfferLetters";

function isUnassignedCounselor(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "" || normalized === "unassigned" || normalized === "none" || normalized === "null";
}

function formatReceivedDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  try {
    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return raw;
  }
}

function resolveTableStudent(row) {
  if (row.kind === "student") return row.student;
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    branch: row.branch,
    counselor: "Unassigned",
    counselorName: "",
  };
}

const ReportOffersTable = ({
  rows = [],
  employees = [],
  onSelectStudent = null,
  metricLabel = "",
}) => {
  const rowsResetKey = useMemo(() => buildReportRowsResetKey(rows), [rows]);

  const {
    pageItems: pageRows,
    setPage,
    pageSize,
    setPageSize,
    totalRows,
    currentPage,
  } = useClientPagination(rows, rowsResetKey, {
    initialPageSize: DEFAULT_PAGE_SIZE,
    persistPageSize: false,
  });

  const counselorsById = useMemo(() => {
    const map = new Map();
    for (const emp of employees || []) {
      const id = String(emp?.id || "").trim();
      if (!id) continue;
      map.set(id, {
        id,
        name: String(emp?.name || emp?.username || emp?.email || id).trim(),
        avatar: toAbsoluteAssetUrl(emp?.avatar || ""),
      });
    }
    return map;
  }, [employees]);

  const getCounselor = (id) => counselorsById.get(String(id || "").trim()) || null;

  return /* @__PURE__ */ jsxs("div", { className: dt.card, children: [
    /* @__PURE__ */ jsx("div", { className: dt.scroll, children: /* @__PURE__ */ jsxs("table", { className: dt.table, children: [
      /* @__PURE__ */ jsx("thead", { className: dt.head, children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: dt.th, children: "Student Name" }),
        /* @__PURE__ */ jsx("th", { className: dt.th, children: "Country" }),
        /* @__PURE__ */ jsx("th", { className: dt.th, children: "Branch" }),
        /* @__PURE__ */ jsx("th", { className: dt.th, children: "Offer letter" }),
        /* @__PURE__ */ jsx("th", { className: dt.th, children: "Status" }),
        /* @__PURE__ */ jsx("th", { className: `${dt.th} whitespace-nowrap`, children: "Received" }),
        /* @__PURE__ */ jsx("th", { className: dt.th, children: "Counselor" }),
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { className: dt.body, children: totalRows ? pageRows.map((row) => {
        const student = resolveTableStudent(row);
        const clickable = typeof onSelectStudent === "function";
        const offerStatus = String(row.offerStatus || "—").trim() || "—";
        return /* @__PURE__ */ jsxs(
          "tr",
          {
            onClick: clickable ? () => onSelectStudent(student) : undefined,
            className: clickable ? dt.rowInteractive : dt.row,
            children: [
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3 font-medium text-slate-900", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
                student.id ? /* @__PURE__ */ jsx("span", {
                  className: "inline-flex shrink-0 items-center px-2 py-0.5 text-[10px] font-semibold rounded border border-slate-200 bg-slate-50 text-slate-600 tabular-nums",
                  title: "Student ID",
                  children: student.id,
                }) : null,
                /* @__PURE__ */ jsxs("span", { className: "min-w-0", children: [
                  student.name,
                  student.priority === "High" && /* @__PURE__ */ jsx("span", { className: "ml-2 inline-block w-2 h-2 rounded-full bg-rose-500", title: "High Priority" }),
                ] }),
              ] }) }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3 text-slate-600", children: student.country || "—" }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3 text-slate-500 text-xs", children: student.branch || "—" }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3 text-slate-700 text-sm max-w-[220px]", children: /* @__PURE__ */ jsx("span", {
                className: "block truncate",
                title: row.offerName || "—",
                children: row.offerName || "—",
              }) }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3", children: /* @__PURE__ */ jsx("span", {
                className: `inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${offerStatusBadgeClass(offerStatus)}`,
                children: offerStatus,
              }) }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3 text-slate-500 text-xs whitespace-nowrap", children: formatReceivedDate(row.receivedAt) }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3 text-slate-600", children: isUnassignedCounselor(student.counselor) ? /* @__PURE__ */ jsx("span", { className: "text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full text-xs font-semibold", children: "Unassigned" }) : /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                getCounselor(student.counselor)?.avatar ? /* @__PURE__ */ jsx("img", { src: getCounselor(student.counselor)?.avatar, alt: getCounselor(student.counselor)?.name, className: "w-5 h-5 rounded-full object-cover", referrerPolicy: "no-referrer" }) : /* @__PURE__ */ jsx("div", { className: "w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold", children: (getCounselor(student.counselor)?.name || student.counselorName || student.counselor || "?").charAt(0) }),
                /* @__PURE__ */ jsx("span", { children: getCounselor(student.counselor)?.name || student.counselorName || student.counselor }),
              ] }) }),
            ],
          },
          row.key
        );
      }) : /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 7, className: dt.emptyRow, children: "No students match this metric." }) }) }),
    ] }) }),
    /* @__PURE__ */ jsx(DataTablePagination, {
      page: currentPage,
      pageSize,
      totalRows,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
      rowLabel: "students",
      suffix: metricLabel || "",
    }),
  ] });
};

export { ReportOffersTable };
