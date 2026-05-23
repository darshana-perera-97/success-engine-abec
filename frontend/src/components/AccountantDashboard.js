import { jsx, jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import {
  Banknote,
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  ArrowRight
} from "lucide-react";
import { Button } from "./Button";
import { formatRawLKR, formatLKR } from "../utils";
import { useExchangeRates } from "../useExchangeRates";
import { isPaidInvoice, invoiceAmountLkr } from "../pipeline";

function getCalendarQuarter(date = new Date()) {
  const month = date.getMonth();
  return { quarter: Math.floor(month / 3) + 1, year: date.getFullYear() };
}

function isDateInCalendarQuarter(dateStr, refDate = new Date()) {
  const parsed = new Date(dateStr || "");
  if (Number.isNaN(parsed.getTime())) return false;
  const { quarter, year } = getCalendarQuarter(refDate);
  const dateQuarter = Math.floor(parsed.getMonth() / 3) + 1;
  return parsed.getFullYear() === year && dateQuarter === quarter;
}

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

function formatIssueDate(inv) {
  const raw = inv.issueDate || inv.createdAt;
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10) || "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const OPEN_STATUSES = new Set(["Pending", "Overdue", "Verifying"]);

const DashboardCard = ({ title, value, icon, trend, trendColor, highlight, onClick }) =>
  /* @__PURE__ */ jsxs(
    "div",
    {
      onClick,
      className: `p-5 rounded-xl border shadow-sm flex flex-col justify-between transition-all
        ${highlight ? "bg-rose-50 border-rose-100" : "bg-white border-gray-200"}
        ${onClick ? "cursor-pointer hover:border-indigo-300 hover:shadow-md" : ""}
    `,
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start", children: [
          /* @__PURE__ */ jsx("div", {
            className: `p-2 rounded-lg ${highlight ? "bg-white text-rose-600" : "bg-slate-50 text-slate-500"}`,
            children: icon
          }),
          highlight &&
            /* @__PURE__ */ jsx("div", { className: "h-2 w-2 rounded-full bg-rose-500 animate-ping" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-4", children: [
          /* @__PURE__ */ jsx("h4", {
            className: `text-xs font-bold uppercase tracking-wider ${highlight ? "text-rose-700" : "text-slate-500"}`,
            children: title
          }),
          /* @__PURE__ */ jsx("div", {
            className: `text-2xl font-bold mt-1 tracking-tight ${highlight ? "text-rose-900" : "text-slate-900"}`,
            children: value
          }),
          /* @__PURE__ */ jsx("p", { className: `text-xs font-medium mt-2 ${trendColor}`, children: trend })
        ] })
      ]
    }
  );

const AccountantDashboard = ({
  branchLabel = "",
  students = [],
  invoices = [],
  onNavigate,
  onSelectStudent
}) => {
  const { rates: exchangeRates } = useExchangeRates();
  const { quarter: calendarQuarter } = getCalendarQuarter();
  const quarterLabel = `Q${calendarQuarter}`;

  const studentById = useMemo(() => {
    const map = new Map();
    (students || []).forEach((s) => {
      const id = String(s.id || "").trim();
      if (id) map.set(id, s);
    });
    return map;
  }, [students]);

  const metrics = useMemo(() => {
    const list = invoices || [];
    const sumLkr = (items) =>
      items.reduce((sum, inv) => sum + invoiceAmountLkr(inv, exchangeRates), 0);

    const pending = list.filter((inv) => String(inv.status || "") === "Pending");
    const toApprove = list.filter((inv) => String(inv.status || "") === "Verifying");
    const overdue = list.filter((inv) => String(inv.status || "") === "Overdue");
    const paid = list.filter((inv) => isPaidInvoice(inv));
    const quarterPaid = paid.filter((inv) =>
      isDateInCalendarQuarter(inv.issueDate || inv.createdAt)
    );
    const open = list.filter((inv) => OPEN_STATUSES.has(String(inv.status || "").trim()));

    const collectedQuarterLkr = sumLkr(quarterPaid);
    const collectedAllTimeLkr = sumLkr(paid);
    const outstandingLkr = sumLkr(open);
    const pendingLkr = sumLkr(pending);
    const overdueLkr = sumLkr(overdue);
    const toApproveLkr = sumLkr(toApprove);

    const recent = [...list]
      .sort(
        (a, b) =>
          new Date(b.issueDate || b.createdAt || 0).getTime() -
          new Date(a.issueDate || a.createdAt || 0).getTime()
      )
      .slice(0, 12);

    const actionRequired = list
      .filter(
        (inv) =>
          String(inv.status || "") === "Verifying" || String(inv.status || "") === "Overdue"
      )
      .sort(
        (a, b) =>
          new Date(a.dueDate || a.issueDate || 0).getTime() -
          new Date(b.dueDate || b.issueDate || 0).getTime()
      );

    const byStatus = [
      { label: "Paid", count: paid.length, lkr: collectedAllTimeLkr, tone: "text-emerald-600" },
      { label: "Pending", count: pending.length, lkr: pendingLkr, tone: "text-amber-600" },
      { label: "To approve", count: toApprove.length, lkr: toApproveLkr, tone: "text-blue-600" },
      { label: "Over due", count: overdue.length, lkr: overdueLkr, tone: "text-rose-600" }
    ];

    return {
      total: list.length,
      pending,
      toApprove,
      overdue,
      paid,
      quarterPaid,
      open,
      collectedQuarterLkr,
      collectedAllTimeLkr,
      outstandingLkr,
      recent,
      actionRequired,
      byStatus
    };
  }, [invoices, exchangeRates]);

  const branchTitle = branchLabel ? `${branchLabel} branch` : "your branch";

  const renderInvoiceTable = (rows, emptyMessage) =>
    /* @__PURE__ */ jsx("div", {
      className: "bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden",
      children: /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", {
        className: "min-w-full text-sm",
        children: [
          /* @__PURE__ */ jsx("thead", {
            className: "bg-slate-50 border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-500",
            children: /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Invoice" }),
              /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Student" }),
              /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Amount" }),
              /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Due" }),
              /* @__PURE__ */ jsx("th", { className: "px-4 py-3", children: "Status" }),
              /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-right", children: " " })
            ] })
          }),
          /* @__PURE__ */ jsx("tbody", {
            className: "divide-y divide-slate-100",
            children: rows.length === 0
              ? /* @__PURE__ */ jsx("tr", {
                  children: /* @__PURE__ */ jsx("td", {
                    colSpan: 6,
                    className: "px-4 py-10 text-center text-sm text-slate-500",
                    children: emptyMessage
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
                  return /* @__PURE__ */ jsxs(
                    "tr",
                    { className: "hover:bg-slate-50/80", children: [
                      /* @__PURE__ */ jsx("td", { className: "px-4 py-3 font-mono text-xs text-slate-800", children: inv.id }),
                      /* @__PURE__ */ jsx("td", { className: "px-4 py-3 font-medium text-slate-900", children: studentName }),
                      /* @__PURE__ */ jsx("td", { className: "px-4 py-3 tabular-nums text-slate-700", children: amountLabel }),
                      /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-slate-600", children: inv.dueDate || "—" }),
                      /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx(
                        "span",
                        {
                          className: `inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadgeClass(inv.status)}`,
                          children: inv.status || "—"
                        }
                      ) }),
                      /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-right", children: student && onSelectStudent
                        ? /* @__PURE__ */ jsx(Button, {
                            size: "sm",
                            variant: "outline",
                            className: "text-xs h-8",
                            onClick: () => onSelectStudent(student, { profileTab: "ledger" }),
                            children: "Ledger"
                          })
                        : null })
                    ] },
                    String(inv.id)
                  );
                })
          })
        ]
      }) })
    });

  return /* @__PURE__ */ jsxs("div", { className: "space-y-8 animate-in fade-in duration-500 pb-10", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("h1", {
          className: "text-2xl font-semibold tracking-tight text-[#0F172A] flex items-center gap-2",
          children: [
            /* @__PURE__ */ jsx(DollarSign, { size: 24, className: "text-slate-500" }),
            "Invoice summary"
          ]
        }),
        /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-500 mt-1", children: [
          "Branch invoice totals. Open ",
          /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-700", children: "Review payments" }),
          " to check evidence and approve or reject."
        ] })
      ] }),
      /* @__PURE__ */ jsxs(Button, {
        variant: "outline",
        className: "self-start shrink-0",
        onClick: () => onNavigate?.("invoices"),
        children: [
          "Review payments",
          /* @__PURE__ */ jsx(ArrowRight, { size: 16, className: "ml-2" })
        ]
      })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", children: [
      /* @__PURE__ */ jsx(DashboardCard, {
        title: "Total invoices",
        value: String(metrics.total),
        icon: /* @__PURE__ */ jsx(FileText, { size: 20 }),
        trend: `${metrics.open.length} open · ${metrics.paid.length} paid`,
        trendColor: "text-slate-500"
      }),
      /* @__PURE__ */ jsx(DashboardCard, {
        title: `Collected (${quarterLabel})`,
        value: formatRawLKR(metrics.collectedQuarterLkr),
        icon: /* @__PURE__ */ jsx(Banknote, { size: 20 }),
        trend:
          metrics.quarterPaid.length > 0
            ? `${metrics.quarterPaid.length} paid this quarter`
            : `No payments in ${quarterLabel}`,
        trendColor: metrics.collectedQuarterLkr > 0 ? "text-emerald-600" : "text-slate-500"
      }),
      /* @__PURE__ */ jsx(DashboardCard, {
        title: "Outstanding",
        value: formatRawLKR(metrics.outstandingLkr),
        icon: /* @__PURE__ */ jsx(Clock, { size: 20 }),
        trend: `${metrics.open.length} unpaid invoice${metrics.open.length === 1 ? "" : "s"}`,
        trendColor: metrics.outstandingLkr > 0 ? "text-amber-600" : "text-emerald-600",
        highlight: metrics.outstandingLkr > 0,
        onClick: metrics.open.length ? () => onNavigate?.("invoices") : void 0
      }),
      /* @__PURE__ */ jsx(DashboardCard, {
        title: "Collected (all time)",
        value: formatRawLKR(metrics.collectedAllTimeLkr),
        icon: /* @__PURE__ */ jsx(CheckCircle, { size: 20 }),
        trend: `${metrics.paid.length} paid invoice${metrics.paid.length === 1 ? "" : "s"}`,
        trendColor: "text-emerald-600"
      })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", children: [
      /* @__PURE__ */ jsx(DashboardCard, {
        title: "Pending",
        value: String(metrics.pending.length),
        icon: /* @__PURE__ */ jsx(Clock, { size: 20 }),
        trend: formatRawLKR(metrics.byStatus.find((s) => s.label === "Pending")?.lkr || 0),
        trendColor: metrics.pending.length ? "text-amber-600" : "text-slate-500",
        highlight: metrics.pending.length > 0,
        onClick: metrics.pending.length ? () => onNavigate?.("invoices") : void 0
      }),
      /* @__PURE__ */ jsx(DashboardCard, {
        title: "To approve",
        value: String(metrics.toApprove.length),
        icon: /* @__PURE__ */ jsx(FileText, { size: 20 }),
        trend: formatRawLKR(metrics.byStatus.find((s) => s.label === "To approve")?.lkr || 0),
        trendColor: metrics.toApprove.length ? "text-blue-600" : "text-slate-500",
        highlight: metrics.toApprove.length > 0,
        onClick: metrics.toApprove.length ? () => onNavigate?.("invoices") : void 0
      }),
      /* @__PURE__ */ jsx(DashboardCard, {
        title: "Over due",
        value: String(metrics.overdue.length),
        icon: /* @__PURE__ */ jsx(AlertTriangle, { size: 20 }),
        trend: formatRawLKR(metrics.byStatus.find((s) => s.label === "Over due")?.lkr || 0),
        trendColor: metrics.overdue.length ? "text-rose-600" : "text-emerald-600",
        highlight: metrics.overdue.length > 0,
        onClick: metrics.overdue.length ? () => onNavigate?.("invoices") : void 0
      }),
      /* @__PURE__ */ jsx(DashboardCard, {
        title: "Paid",
        value: String(metrics.paid.length),
        icon: /* @__PURE__ */ jsx(CheckCircle, { size: 20 }),
        trend: formatRawLKR(metrics.collectedAllTimeLkr),
        trendColor: "text-emerald-600"
      })
    ] }),
    /* @__PURE__ */ jsxs("div", {
      className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm",
      children: [
        /* @__PURE__ */ jsx("h3", { className: "text-sm font-bold text-slate-900 mb-4", children: "By status" }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4", children: metrics.byStatus.map((row) =>
          /* @__PURE__ */ jsxs(
            "div",
            {
              className: "rounded-lg border border-slate-100 bg-slate-50/50 p-4",
              children: [
                /* @__PURE__ */ jsx("p", { className: "text-xs font-bold uppercase tracking-wide text-slate-500", children: row.label }),
                /* @__PURE__ */ jsx("p", { className: `text-2xl font-bold mt-1 ${row.tone}`, children: row.count }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-600 mt-1 tabular-nums", children: formatRawLKR(row.lkr) })
              ]
            },
            row.label
          )
        ) })
      ]
    }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
        /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900", children: "Needs attention" }),
        metrics.actionRequired.length > 0 &&
          /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-rose-600", children: "Over due & to approve" })
      ] }),
      renderInvoiceTable(metrics.actionRequired, "No overdue or pending-approval invoices.")
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
        /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900", children: "Recent invoices" }),
        /* @__PURE__ */ jsx(Button, {
          size: "sm",
          variant: "ghost",
          className: "text-xs text-indigo-600",
          onClick: () => onNavigate?.("invoices"),
          children: "View all"
        })
      ] }),
      renderInvoiceTable(metrics.recent, "No invoices for this branch yet.")
    ] })
  ] });
};

export { AccountantDashboard };
