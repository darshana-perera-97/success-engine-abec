import { jsx, jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { ActivityFeed } from "./ActivityFeed";
import { EscalationDesk } from "./EscalationDesk";
import { StageEscalations } from "./StageEscalations";
import { IncentiveCalculator } from "./IncentiveCalculator";
import { LeaderboardWidget } from "./LeaderboardWidget";
import { formatLKR, formatRawLKR, EXCHANGE_RATES } from "../utils";
import { buildUniversityOfferLetterRows, offerStatusBadgeClass } from "../utils/universityOfferLetters";
import {
  normalizePipelineStatus,
  countOpenSlaRequirementViolations,
  isPaidInvoice,
  invoiceAmountLkr,
  parseStudentBudgetLkr
} from "../pipeline";
import { isTaskOverdueByDate } from "../counselorTaskScope";
import { AlertOctagon, TrendingUp, ArrowRight, Zap, CheckSquare, Banknote, User, FileText } from "lucide-react";
import { Button } from "./Button";
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
const ManagerDashboard = ({
  activities,
  tasks,
  students = [],
  employees = [],
  currentUser,
  onNavigate,
  onReassignDeskTask,
  invoices = [],
  onUpdateInvoice,
  onSelectStudent,
  onNotify,
  canApproveInvoicePayments = false,
  pipelineStageEscalations = [],
  onOpenStageEscalationStudent
}) => {
  const [activeTab, setActiveTab] = useState("escalations");
  const [acceptingInvoiceId, setAcceptingInvoiceId] = useState(null);
  const { quarter: calendarQuarter } = getCalendarQuarter();
  const quarterLabel = `Q${calendarQuarter}`;
  const quarterPaidInvoices = useMemo(
    () =>
      (invoices || []).filter(
        (inv) => isPaidInvoice(inv) && isDateInCalendarQuarter(inv.issueDate || inv.createdAt)
      ),
    [invoices]
  );
  const collectedRevenueLkr = useMemo(
    () =>
      quarterPaidInvoices.reduce((sum, inv) => sum + invoiceAmountLkr(inv, EXCHANGE_RATES), 0),
    [quarterPaidInvoices]
  );
  const pipelineBudgetLkr = useMemo(
    () => students.reduce((sum, student) => sum + parseStudentBudgetLkr(student, EXCHANGE_RATES), 0),
    [students]
  );
  const revenueTrendLabel =
    collectedRevenueLkr > 0
      ? `${quarterPaidInvoices.length} paid invoice${quarterPaidInvoices.length === 1 ? "" : "s"} in ${quarterLabel}`
      : pipelineBudgetLkr > 0
        ? `No paid invoices in ${quarterLabel} · ${formatRawLKR(pipelineBudgetLkr)} inquiry budgets`
        : `No paid invoices in ${quarterLabel}`;
  const revenueTrendColor = collectedRevenueLkr > 0 ? "text-emerald-600" : "text-slate-500";
  const overdueTasks = (tasks || []).filter((t) => t.status !== "Completed" && isTaskOverdueByDate(t)).length;
  const timeRemainingHighPriorityTasks = (tasks || []).filter(
    (t) => t.status !== "Completed" && !isTaskOverdueByDate(t) && t.priority === "High"
  ).length;
  const unresolvedSlaViolations = students.reduce((acc, s) => acc + countOpenSlaRequirementViolations(s), 0);
  const tasksPastDueDate = (tasks || []).filter((t) => isTaskOverdueByDate(t)).length;
  const slaBreachTotal = unresolvedSlaViolations + tasksPastDueDate;
  const slaBreachTrend = slaBreachTotal === 0 ? "All Clear" : `${unresolvedSlaViolations} open stage notice${unresolvedSlaViolations === 1 ? "" : "s"} · ${tasksPastDueDate} overdue task${tasksPastDueDate === 1 ? "" : "s"}`;
  const tasksPendingReview = (tasks || []).filter((t) => t.status === "In Review");
  const invoicesPendingReview = (invoices || []).filter((inv) => String(inv.status || "") === "Verifying");
  const pendingReviewsTotal = tasksPendingReview.length + invoicesPendingReview.length;
  const inActivePipeline = students.filter((s) => {
    const x = normalizePipelineStatus(s.status);
    return ["Application", "Interview training", "Documentation", "Visa", "Enrolled"].includes(x);
  }).length;
  const visaSuccessCount = students.filter((s) => {
    const x = normalizePipelineStatus(s.status);
    return x === "Visa" || x === "Enrolled";
  }).length;
  const successRate = inActivePipeline ? Math.round(visaSuccessCount / inActivePipeline * 100) : 0;
  const visaTrendLabel = inActivePipeline === 0 ? "No students past inquiry" : `${visaSuccessCount} of ${inActivePipeline} at visa or enrolled`;
  const visaTrendTier = successRate >= 75 ? "Top tier" : successRate >= 40 ? "On track" : inActivePipeline === 0 ? "" : "Building pipeline";
  const visaTrendDisplay = visaTrendTier ? `${visaTrendLabel} · ${visaTrendTier}` : visaTrendLabel;
  const offerLetterRows = useMemo(() => buildUniversityOfferLetterRows(students, employees), [students, employees]);
  const stagePipelineDeskCount = pipelineStageEscalations?.length || 0;
  const escalationDeskTabTotal = overdueTasks + stagePipelineDeskCount;
  return /* @__PURE__ */ jsxs("div", { className: "space-y-8 animate-in fade-in duration-500 pb-10", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold tracking-tight text-[#0F172A]", children: "Command Center" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mt-1", children: "Operational oversight and critical action items." })
      ] }),
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", children: [
      /* @__PURE__ */ jsx(
        DashboardCard,
        {
          title: `Collected Revenue (${quarterLabel})`,
          value: formatRawLKR(collectedRevenueLkr),
          icon: /* @__PURE__ */ jsx(Banknote, { size: 20 }),
          trend: revenueTrendLabel,
          trendColor: revenueTrendColor
        }
      ),
      /* @__PURE__ */ jsx(
        DashboardCard,
        {
          title: "SLA Breaches",
          value: String(slaBreachTotal),
          icon: /* @__PURE__ */ jsx(AlertOctagon, { size: 20 }),
          trend: slaBreachTrend,
          trendColor: slaBreachTotal > 0 ? "text-rose-600" : "text-emerald-600",
          highlight: slaBreachTotal > 0,
          onClick: () => onNavigate("tasks")
        }
      ),
      /* @__PURE__ */ jsx(
        DashboardCard,
        {
          title: "Pending Reviews",
          value: pendingReviewsTotal.toString(),
          icon: /* @__PURE__ */ jsx(CheckSquare, { size: 20 }),
          trend: pendingReviewsTotal > 0 ? "Action Required" : "Up to date",
          trendColor: pendingReviewsTotal > 0 ? "text-amber-600" : "text-slate-500",
          highlight: pendingReviewsTotal > 0,
          onClick: () => onNavigate("tasks")
        }
      ),
      /* @__PURE__ */ jsx(
        DashboardCard,
        {
          title: "Visa Success Rate",
          value: `${successRate}%`,
          icon: /* @__PURE__ */ jsx(TrendingUp, { size: 20 }),
          trend: visaTrendDisplay,
          trendColor: successRate >= 40 ? "text-emerald-600" : inActivePipeline === 0 ? "text-slate-500" : "text-amber-600"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 space-y-8", children: [
        /* @__PURE__ */ jsx(IncentiveCalculator, { students, employees }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center gap-4", children: [
              /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
                /* @__PURE__ */ jsx("div", {
                  className: `w-2 h-2 rounded-full ${
                    activeTab === "escalations"
                      ? "bg-rose-500 animate-pulse"
                      : activeTab === "tasks"
                        ? "bg-blue-500 animate-pulse"
                        : activeTab === "offerLetters"
                          ? "bg-indigo-500 animate-pulse"
                          : activeTab === "reviews"
                            ? "bg-amber-500 animate-pulse"
                            : "bg-slate-300"
                  }`
                }),
                "Command Center"
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap bg-slate-100 p-1 rounded-lg self-start gap-1", children: [
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => setActiveTab("escalations"),
                    className: `px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === "escalations" ? "bg-white text-rose-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`,
                    children: [
                      "Escalations (",
                      escalationDeskTabTotal,
                      ")"
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => setActiveTab("tasks"),
                    className: `px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === "tasks" ? "bg-white text-blue-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`,
                    children: [
                      "Tasks (",
                      timeRemainingHighPriorityTasks,
                      ")"
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => setActiveTab("reviews"),
                    className: `px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === "reviews" ? "bg-white text-amber-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`,
                    children: [
                      "Pending Reviews (",
                      pendingReviewsTotal,
                      ")"
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => setActiveTab("offerLetters"),
                    className: `px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${activeTab === "offerLetters" ? "bg-white text-indigo-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`,
                    children: [
                      /* @__PURE__ */ jsx(FileText, { size: 12, className: "opacity-70 shrink-0" }),
                      "Offer letters (",
                      offerLetterRows.length,
                      ")"
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs("button", {
              type: "button",
              onClick: () => onNavigate("tasks"),
              className: "text-xs text-indigo-600 font-medium hover:underline inline-flex items-center self-start",
              children: [
                "Manage All Tasks ",
                /* @__PURE__ */ jsx(ArrowRight, { size: 12, className: "ml-1" })
              ]
            })
          ] }),
          /* @__PURE__ */ jsx("div", {
            className: "bg-white border border-gray-200 rounded-xl p-1 shadow-sm max-h-[min(70vh,36rem)] overflow-y-auto overscroll-contain",
            children:
              activeTab === "escalations"
                ? /* @__PURE__ */ jsxs("div", {
                    className: "p-3 space-y-6",
                    children: [
                      /* @__PURE__ */ jsx(StageEscalations, {
                        escalations: pipelineStageEscalations,
                        employees,
                        variant: "manager",
                        embedded: true,
                        onOpenStudent: onOpenStageEscalationStudent
                      }),
                      /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
                        /* @__PURE__ */ jsx("h4", {
                          className: "text-xs font-bold text-slate-500 uppercase tracking-wide px-0.5",
                          children: "Overdue tasks"
                        }),
                        /* @__PURE__ */ jsx(EscalationDesk, {
                          tasks,
                          students,
                          employees,
                          variant: "escalations",
                          onReassign: onReassignDeskTask
                        })
                      ] })
                    ]
                  })
                : activeTab === "tasks"
                  ? /* @__PURE__ */ jsx(EscalationDesk, { tasks, students, employees, variant: "tasks", onReassign: onReassignDeskTask })
                  : activeTab === "offerLetters"
                    ? /* @__PURE__ */ jsxs("div", { className: "p-4 space-y-3", children: [
                      offerLetterRows.length === 0 && /* @__PURE__ */ jsx("div", { className: "text-center py-10 text-slate-500 text-sm", children: "No offer letters uploaded yet." }),
                      ...offerLetterRows.map((row) =>
                        /* @__PURE__ */ jsxs(
                          "div",
                          {
                            className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-slate-50 border border-slate-100 rounded-lg",
                            children: [
                              /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1 space-y-0.5", children: [
                                /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900", children: row.studentName }),
                                /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-600", children: row.counselorLabel })
                              ] }),
                              /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 shrink-0", children: [
                                /* @__PURE__ */ jsx(
                                  "span",
                                  {
                                    className: `px-2 py-0.5 rounded-full text-[10px] font-bold border ${offerStatusBadgeClass(row.offerStatus)}`,
                                    children: row.offerStatus
                                  }
                                ),
                                onSelectStudent &&
                                  /* @__PURE__ */ jsx(Button, {
                                    size: "sm",
                                    variant: "outline",
                                    className: "text-xs h-8",
                                    onClick: () => onSelectStudent(row.student, { profileTab: "pipeline" }),
                                    children: /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1.5", children: [
                                      /* @__PURE__ */ jsx(User, { size: 14 }),
                                      "Student profile"
                                    ] })
                                  })
                              ] })
                            ]
                          },
                          row.key
                        )
                      )
                    ] })
                    : /* @__PURE__ */ jsxs("div", { className: "p-4 space-y-6", children: [
                    invoicesPendingReview.length > 0 && /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
                      /* @__PURE__ */ jsx("h4", { className: "text-xs font-bold text-slate-500 uppercase tracking-wide", children: "Invoice payment evidence" }),
                      ...invoicesPendingReview.map((inv) => {
                        const sid = String(inv.studentId || "").trim();
                        const student = students.find((s) => String(s.id || "").trim() === sid);
                        const studentName = String(student?.name || "").trim() || sid || "Unknown student";
                        const amountLabel = formatLKR(
                          typeof inv.amount === "string" ? parseFloat(inv.amount) : inv.amount,
                          inv.currency || "LKR"
                        );
                        const busy = acceptingInvoiceId === inv.id;
                        return /* @__PURE__ */ jsxs(
                          "div",
                          {
                            className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg",
                            children: [
                              /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
                                /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900", children: studentName }),
                                /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-600 mt-0.5", children: [
                                  "Invoice ",
                                  /* @__PURE__ */ jsx("span", { className: "font-mono", children: inv.id }),
                                  " · ",
                                  amountLabel
                                ] })
                              ] }),
                              /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 shrink-0", children: [
                                student && onSelectStudent && /* @__PURE__ */ jsx(Button, {
                                  size: "sm",
                                  variant: "outline",
                                  className: "text-xs h-8",
                                  onClick: () => onSelectStudent(student, { profileTab: "ledger" }),
                                  children: /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1.5", children: [
                                    /* @__PURE__ */ jsx(User, { size: 14 }),
                                    "View student profile"
                                  ] })
                                }),
                                !student && sid && /* @__PURE__ */ jsx("span", { className: "text-xs text-amber-800", children: "Student not in your scope." }),
                                canApproveInvoicePayments && onUpdateInvoice && /* @__PURE__ */ jsx(Button, {
                                  size: "sm",
                                  className: "text-xs h-8 bg-emerald-600 hover:bg-emerald-700",
                                  disabled: busy,
                                  onClick: async () => {
                                    setAcceptingInvoiceId(inv.id);
                                    const result = await onUpdateInvoice({
                                      ...inv,
                                      status: "Paid",
                                      generatedReceiptUrl: `REC-${inv.id}.pdf`
                                    });
                                    setAcceptingInvoiceId(null);
                                    if (result?.ok) {
                                      onNotify?.(
                                        "Payment approved",
                                        `Invoice ${inv.id} payment evidence was approved.`,
                                        "success"
                                      );
                                    }
                                  },
                                  children: busy ? "Accepting…" : "Accept payment"
                                })
                              ] })
                            ]
                          },
                          inv.id
                        );
                      })
                    ] }),
                    tasksPendingReview.length > 0 && /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
                      /* @__PURE__ */ jsx("h4", { className: "text-xs font-bold text-slate-500 uppercase tracking-wide", children: "Tasks & documents" }),
                      ...tasksPendingReview.map((task) => /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center p-3 bg-amber-50 border border-amber-100 rounded-lg", children: [
                        /* @__PURE__ */ jsxs("div", { children: [
                          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900", children: task.task }),
                          /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500", children: [
                            "Submitted by ",
                            task.assigned_to.join(", ")
                          ] })
                        ] }),
                        /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
                          /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", className: "text-xs h-7", children: "Reject" }),
                          /* @__PURE__ */ jsx(Button, { size: "sm", className: "text-xs h-7 bg-emerald-600 hover:bg-emerald-700", children: "Approve" })
                        ] })
                      ] }, task.id))
                    ] }),
                    pendingReviewsTotal === 0 && /* @__PURE__ */ jsx("div", { className: "text-center py-8 text-slate-500 text-sm", children: "No tasks or invoice evidence pending review." })
                  ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-8", children: [
        /* @__PURE__ */ jsx(LeaderboardWidget, { students, employees, currentUserId: currentUser?.id || "", currentUserEmail: currentUser?.email || "" }),
        /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm h-auto flex flex-col", children: [
          /* @__PURE__ */ jsx("div", { className: "flex justify-between items-center mb-4", children: /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Zap, { size: 18, className: "text-indigo-600", fill: "currentColor" }),
            "Live Operations Feed"
          ] }) }),
          /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-[250px] overflow-y-auto", children: /* @__PURE__ */ jsx(ActivityFeed, { activities, limit: 5, showRoleBadge: false, showCounselorBadge: false }) })
        ] })
      ] })
    ] })
  ] });
};
const DashboardCard = ({ title, value, icon, trend, trendColor, highlight, onClick }) => /* @__PURE__ */ jsxs(
  "div",
  {
    onClick,
    className: `p-5 rounded-xl border shadow-sm flex flex-col justify-between transition-all
        ${highlight ? "bg-rose-50 border-rose-100" : "bg-white border-gray-200"}
        ${onClick ? "cursor-pointer hover:border-indigo-300 hover:shadow-md" : ""}
    `,
    children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start", children: [
        /* @__PURE__ */ jsx("div", { className: `p-2 rounded-lg ${highlight ? "bg-white text-rose-600" : "bg-slate-50 text-slate-500"}`, children: icon }),
        highlight && /* @__PURE__ */ jsx("div", { className: "h-2 w-2 rounded-full bg-rose-500 animate-ping" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-4", children: [
        /* @__PURE__ */ jsx("h4", { className: `text-xs font-bold uppercase tracking-wider ${highlight ? "text-rose-700" : "text-slate-500"}`, children: title }),
        /* @__PURE__ */ jsx("div", { className: `text-2xl font-bold mt-1 tracking-tight ${highlight ? "text-rose-900" : "text-slate-900"}`, children: value }),
        /* @__PURE__ */ jsx("p", { className: `text-xs font-medium mt-2 ${trendColor}`, children: trend })
      ] })
    ]
  }
);
export {
  ManagerDashboard
};
