import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { dt } from "./DataTable";
import { toAbsoluteAssetUrl } from "../apiConfig";

const DEFAULT_PAGE_SIZE = 10;

function getStatusColor(status) {
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
    case "Requested Lead":
      return "bg-amber-50 text-amber-800 border-amber-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function isUnassignedCounselor(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "" || normalized === "unassigned" || normalized === "none" || normalized === "null";
}

function resolveTableStudent(row) {
  if (row.kind === "student") return row.student;
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    branch: row.branch,
    status: "Requested Lead",
    counselor: "Unassigned",
    counselorName: "",
    kind: "lead",
    submittedAt: row.entry?.submittedAt,
  };
}

const ReportStudentTable = ({
  rows = [],
  employees = [],
  onSelectStudent = null,
  metricLabel = "",
  pageSize = DEFAULT_PAGE_SIZE,
}) => {
  const [page, setPage] = useState(1);

  const rowsResetKey = useMemo(
    () => rows.map((row) => row.key).join("|"),
    [rows]
  );

  useEffect(() => {
    setPage(1);
  }, [rowsResetKey]);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize) || 1);
  const currentPage = Math.min(page, totalPages);
  const startIndex = totalRows ? (currentPage - 1) * pageSize : 0;
  const endIndex = totalRows ? Math.min(startIndex + pageSize, totalRows) : 0;
  const pageRows = useMemo(
    () => rows.slice(startIndex, endIndex),
    [rows, startIndex, endIndex]
  );

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
        /* @__PURE__ */ jsx("th", { className: dt.th, children: "Pipeline Stage" }),
        /* @__PURE__ */ jsx("th", { className: dt.th, children: "Counselor" }),
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { className: dt.body, children: totalRows ? pageRows.map((row) => {
        const student = resolveTableStudent(row);
        const isLead = row.kind === "lead";
        const clickable = !isLead && typeof onSelectStudent === "function";
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
                  isLead && /* @__PURE__ */ jsx("span", { className: "ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-100 rounded", children: "Lead" }),
                ] }),
              ] }) }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3 text-slate-600", children: student.country || "—" }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3 text-slate-500 text-xs", children: student.branch || "—" }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3", children: /* @__PURE__ */ jsx("span", { className: `inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(student.status)}`, children: student.status || "—" }) }),
              /* @__PURE__ */ jsx("td", { className: "px-6 py-3 text-slate-600", children: isUnassignedCounselor(student.counselor) ? /* @__PURE__ */ jsx("span", { className: "text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full text-xs font-semibold", children: "Unassigned" }) : /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                getCounselor(student.counselor)?.avatar ? /* @__PURE__ */ jsx("img", { src: getCounselor(student.counselor)?.avatar, alt: getCounselor(student.counselor)?.name, className: "w-5 h-5 rounded-full object-cover", referrerPolicy: "no-referrer" }) : /* @__PURE__ */ jsx("div", { className: "w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold", children: (getCounselor(student.counselor)?.name || student.counselorName || student.counselor || "?").charAt(0) }),
                /* @__PURE__ */ jsx("span", { children: getCounselor(student.counselor)?.name || student.counselorName || student.counselor }),
              ] }) }),
            ],
          },
          row.key
        );
      }) : /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 5, className: dt.emptyRow, children: "No students match this metric." }) }) }),
    ] }) }),
    /* @__PURE__ */ jsxs("div", {
      className: "px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2",
      children: [
        /* @__PURE__ */ jsxs("span", { children: [
          totalRows
            ? `Showing ${startIndex + 1}–${endIndex} of ${totalRows} student${totalRows === 1 ? "" : "s"}`
            : "Showing 0 students",
          metricLabel ? ` · ${metricLabel}` : "",
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap justify-end", children: [
          /* @__PURE__ */ jsx("span", {
            className: "text-slate-400 tabular-nums",
            children: totalRows ? `Page ${currentPage} of ${totalPages}` : "Page 1 of 1",
          }),
          /* @__PURE__ */ jsx("button", {
            type: "button",
            className: "px-2.5 py-1 rounded border border-gray-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed",
            disabled: currentPage <= 1 || totalRows === 0,
            onClick: () => setPage((prev) => Math.max(1, prev - 1)),
            children: "Previous",
          }),
          /* @__PURE__ */ jsx("button", {
            type: "button",
            className: "px-2.5 py-1 rounded border border-gray-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed",
            disabled: currentPage >= totalPages || totalRows === 0,
            onClick: () => setPage((prev) => Math.min(totalPages, prev + 1)),
            children: "Next",
          }),
        ] }),
      ],
    }),
  ] });
};

export { ReportStudentTable };
