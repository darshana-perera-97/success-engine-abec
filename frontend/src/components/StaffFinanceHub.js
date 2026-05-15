import { jsx, jsxs } from "react/jsx-runtime";
import { DollarSign, ChevronRight } from "lucide-react";
import { Button } from "./Button";

function countOpenInvoicesForStudent(invoices, studentId) {
  const sid = String(studentId || "").trim();
  if (!sid) return 0;
  return (invoices || []).filter((inv) => {
    if (String(inv.studentId || "").trim() !== sid) return false;
    const st = String(inv.status || "").trim();
    return st === "Pending" || st === "Overdue" || st === "Verifying";
  }).length;
}

const StaffFinanceHub = ({ students = [], invoices = [], onOpenStudentLedger }) => {
  const rows = (students || []).slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
      /* @__PURE__ */ jsxs("h2", { className: "text-xl font-bold text-slate-900 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(DollarSign, { size: 22, className: "text-slate-500" }),
        "Ledger & Payments"
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 max-w-2xl", children: "Select a student to open their ledger, invoices, and payment status. Use this when you need finance context outside the student profile tabs." })
    ] }),
    rows.length === 0 ? /* @__PURE__ */ jsx("div", { className: "rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-10 text-center text-sm text-slate-500", children: "No students in your current scope." }) : /* @__PURE__ */ jsx("div", { className: "bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden", children: /* @__PURE__ */ jsxs("div", { className: "overflow-x-auto", children: [
      /* @__PURE__ */ jsxs("table", { className: "min-w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { className: "bg-slate-50 border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-500", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Student" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Branch" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-center", children: "Open items" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-right", children: " " })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-slate-100", children: rows.map((s) => {
          const openCount = countOpenInvoicesForStudent(invoices, s.id);
          return /* @__PURE__ */ jsxs(
            "tr",
            {
              className: "hover:bg-slate-50/80",
              children: [
                /* @__PURE__ */ jsx("td", { className: "px-4 py-3 font-medium text-slate-900", children: s.name || s.id }),
                /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-slate-600", children: s.branch || "—" }),
                /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-center tabular-nums", children: openCount }),
                /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-right", children: /* @__PURE__ */ jsxs(
                  Button,
                  {
                    size: "sm",
                    variant: "outline",
                    className: "inline-flex items-center gap-1",
                    onClick: () => onOpenStudentLedger?.(s),
                    children: [
                      "Open ledger",
                      /* @__PURE__ */ jsx(ChevronRight, { size: 14 })
                    ]
                  }
                ) })
              ]
            },
            String(s.id)
          );
        }) })
      ] })
    ] }) })
  ] });
};

export { StaffFinanceHub };
