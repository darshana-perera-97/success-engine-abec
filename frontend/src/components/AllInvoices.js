import { jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DollarSign, ExternalLink } from "lucide-react";
import { formatLKR } from "../utils";
import { toAbsoluteAssetUrl } from "../apiConfig";
import { getFilteredInvoices } from "../authApi";
import { dt } from "./DataTable";

const TABS = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "pending", label: "Pending" },
  { id: "verifying", label: "Verifying" },
  { id: "overdue", label: "Over due" }
];

const COLUMNS = [
  { key: "id", label: "Invoice #", className: "min-w-[150px]" },
  { key: "student", label: "Student", className: "min-w-[140px]" },
  { key: "description", label: "Description", className: "min-w-[160px]" },
  { key: "amount", label: "Amount", className: "min-w-[100px]" },
  { key: "issued", label: "Issued", className: "min-w-[100px]" },
  { key: "due", label: "Due", className: "min-w-[100px]" },
  { key: "status", label: "Status", className: "min-w-[90px]" },
  { key: "receipt", label: "", className: "min-w-[40px] text-right" }
];

const SEARCH_DEBOUNCE_MS = 400;

function statusBadgeClass(status) {
  switch (String(status || "").trim()) {
    case "Paid":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Verifying":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "Overdue":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

const AllInvoices = ({
  students = [],
  onSelectStudent
}) => {
  const [activeTab, setActiveTab] = useState("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({ all: 0, paid: 0, pending: 0, verifying: 0, overdue: 0 });
  const fetchIdRef = useRef(0);
  const debounceRef = useRef(null);

  const studentById = useMemo(() => {
    const map = new Map();
    (students || []).forEach((s) => {
      const id = String(s.id || "").trim();
      if (id) map.set(id, s);
    });
    return map;
  }, [students]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const fetchData = useCallback(async (tab, q) => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    const result = await getFilteredInvoices(tab, q);
    if (id !== fetchIdRef.current) return;
    setLoading(false);
    if (result.ok) {
      setRows(result.data);
      if (result.counts) setCounts(result.counts);
    }
  }, []);

  useEffect(() => {
    fetchData(activeTab, debouncedQuery);
  }, [activeTab, debouncedQuery, fetchData]);

  return jsxs("div", { className: "space-y-6 animate-in fade-in duration-500 pb-10", children: [
    jsxs("div", { className: "space-y-1", children: [
      jsxs("h2", {
        className: "text-xl font-bold text-slate-900 flex items-center gap-2",
        children: [
          jsx(DollarSign, { size: 22, className: "text-slate-500" }),
          "All Invoices"
        ]
      }),
      jsx("p", {
        className: "text-sm text-slate-500 max-w-2xl",
        children: "Browse and search all invoices across students."
      })
    ] }),
    jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center gap-4", children: [
      jsx("div", { className: "flex flex-wrap bg-slate-100 p-1 rounded-lg gap-1", children: TABS.map((tab) =>
        jsxs(
          "button",
          {
            type: "button",
            onClick: () => setActiveTab(tab.id),
            className: `px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === tab.id ? "bg-white text-indigo-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`,
            children: [tab.label, " (", counts[tab.id] ?? 0, ")"]
          },
          tab.id
        )
      ) }),
      jsx("input", {
        type: "search",
        placeholder: "Search by student, invoice #, description…",
        value: query,
        onChange: (e) => setQuery(e.target.value),
        className: "flex-1 min-w-[200px] px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
      })
    ] }),
    jsxs("div", {
      className: dt.card,
      children: [
        jsx("div", { className: dt.toolbar, children: jsxs("p", { className: "text-xs font-semibold text-slate-600", children: [
          rows.length,
          " invoice",
          rows.length === 1 ? "" : "s",
          " · ",
          TABS.find((t) => t.id === activeTab)?.label || "All"
        ] }) }),
        jsx("div", { className: dt.scroll, children: jsxs("table", {
          className: dt.table,
          children: [
            jsx("thead", {
              className: dt.head,
              children: jsx("tr", {
                children: COLUMNS.map((col) =>
                  jsx(
                    "th",
                    {
                      scope: "col",
                      className: `px-4 py-3 whitespace-nowrap ${col.className || ""}`,
                      children: col.label
                    },
                    col.key
                  )
                )
              })
            }),
            jsx("tbody", {
              className: dt.body,
              children: loading
                ? jsx("tr", {
                    children: jsx("td", {
                      colSpan: COLUMNS.length,
                      className: "px-4 py-12 text-center text-sm text-slate-500",
                      children: "Loading…"
                    })
                  })
                : rows.length === 0
                ? jsx("tr", {
                    children: jsx("td", {
                      colSpan: COLUMNS.length,
                      className: "px-4 py-12 text-center text-sm text-slate-500",
                      children: "No invoices found."
                    })
                  })
                : rows.map((inv) => {
                    const sid = String(inv.studentId || "").trim();
                    const student = studentById.get(sid);
                    const studentName = String(student?.name || "").trim() || sid || "—";
                    const amountLabel = formatLKR(
                      typeof inv.amount === "string" ? parseFloat(inv.amount) : inv.amount,
                      inv.currency || "LKR"
                    );
                    const receiptUrl = inv.generatedReceiptUrl
                      ? toAbsoluteAssetUrl(inv.generatedReceiptUrl) || inv.generatedReceiptUrl
                      : "";
                    const hasReceipt = !!receiptUrl && String(inv.status || "").trim() === "Paid";

                    return jsxs(
                      "tr",
                      {
                        className: "hover:bg-slate-50/80 align-middle",
                        children: [
                          jsx("td", { className: "px-4 py-3 font-mono text-xs text-slate-800", children: inv.id || "—" }),
                          jsx("td", {
                            className: `px-4 py-3 font-medium text-slate-900 ${onSelectStudent && student ? "cursor-pointer hover:text-indigo-600" : ""}`,
                            onClick: () => onSelectStudent && student ? onSelectStudent(student) : undefined,
                            children: studentName
                          }),
                          jsx("td", {
                            className: "px-4 py-3 text-slate-600 max-w-[220px] truncate",
                            title: inv.description || "",
                            children: inv.description || "—"
                          }),
                          jsx("td", { className: "px-4 py-3 text-slate-800 tabular-nums whitespace-nowrap", children: amountLabel }),
                          jsx("td", { className: "px-4 py-3 text-slate-600 whitespace-nowrap", children: inv.issueDate || "—" }),
                          jsx("td", { className: "px-4 py-3 text-slate-600 whitespace-nowrap", children: inv.dueDate || "—" }),
                          jsx("td", { className: "px-4 py-3 whitespace-nowrap", children: jsx(
                            "span",
                            {
                              className: `inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadgeClass(inv.status)}`,
                              children: inv.status || "—"
                            }
                          ) }),
                          jsx("td", { className: "px-4 py-3 text-right", children:
                            hasReceipt
                              ? jsx("a", {
                                  href: receiptUrl,
                                  target: "_blank",
                                  rel: "noopener noreferrer",
                                  title: "View receipt",
                                  className: "inline-flex text-indigo-600 hover:text-indigo-800",
                                  children: jsx(ExternalLink, { size: 14 })
                                })
                              : null
                          })
                        ]
                      },
                      String(inv.id)
                    );
                  })
            })
          ]
        }) })
      ]
    })
  ] });
};

export { AllInvoices };
