import { jsx, jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { ActivityFeed } from "./ActivityFeed";
import { EscalationDesk } from "./EscalationDesk";
import { StageEscalations } from "./StageEscalations";
import { IncentiveCalculator } from "./IncentiveCalculator";
import { LeaderboardWidget } from "./LeaderboardWidget";
import { formatLKR, formatRawLKR, EXCHANGE_RATES } from "../utils";
import { buildUniversityOfferLetterRows, offerStatusBadgeClass } from "../utils/universityOfferLetters";
import { invoiceBalanceDue } from "../invoicePaymentHelpers";
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
import { StudentMilestonesTable } from "./StudentMilestonesTable";
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
  invoicesLoading = false,
  onUpdateInvoice,
  onSelectStudent,
  onNotify,
  canApproveInvoicePayments = false,
  onUpdateTasks,
  pipelineStageEscalations = [],
  onOpenStageEscalationStudent,
  studentsScopeLabel = null,
}) => {
  const [activeTab, setActiveTab] = useState("escalations");
  const [acceptingInvoiceId, setAcceptingInvoiceId] = useState(null);
  const [approveInvoiceModal, setApproveInvoiceModal] = useState({ open: false, invoice: null, paidAmount: "", error: "" });
  const [reviewingTaskId, setReviewingTaskId] = useState(null);
  const { quarter: calendarQuarter } = getCalendarQuarter();
  const quarterLabel = `Q${calendarQuarter}`;
  const allPaidInvoices = useMemo(
    () => (invoices || []).filter((inv) => isPaidInvoice(inv)),
    [invoices]
  );
  const quarterPaidInvoices = useMemo(
    () =>
      allPaidInvoices.filter(
        (inv) => isDateInCalendarQuarter(inv.issueDate || inv.createdAt)
      ),
    [allPaidInvoices]
  );
  const collectedRevenueLkr = useMemo(
    () =>
      quarterPaidInvoices.reduce((sum, inv) => sum + invoiceAmountLkr(inv, EXCHANGE_RATES), 0),
    [quarterPaidInvoices]
  );
  const allTimeRevenueLkr = useMemo(
    () =>
      allPaidInvoices.reduce((sum, inv) => sum + invoiceAmountLkr(inv, EXCHANGE_RATES), 0),
    [allPaidInvoices]
  );
  const pipelineBudgetLkr = useMemo(
    () => students.reduce((sum, student) => sum + parseStudentBudgetLkr(student, EXCHANGE_RATES), 0),
    [students]
  );
  const revenueDisplayLkr = collectedRevenueLkr > 0 ? collectedRevenueLkr : allTimeRevenueLkr;
  const revenueCardTitle = collectedRevenueLkr > 0 || allTimeRevenueLkr === 0
    ? `Collected Revenue (${quarterLabel})`
    : "Collected Revenue (All-time)";
  const revenueTrendLabel = invoicesLoading
    ? "Loading invoices…"
    : collectedRevenueLkr > 0
      ? `${quarterPaidInvoices.length} paid invoice${quarterPaidInvoices.length === 1 ? "" : "s"} in ${quarterLabel}`
      : allTimeRevenueLkr > 0
        ? `${allPaidInvoices.length} paid invoice${allPaidInvoices.length === 1 ? "" : "s"} all-time · ${formatRawLKR(pipelineBudgetLkr)} pipeline`
        : pipelineBudgetLkr > 0
          ? `No paid invoices yet · ${formatRawLKR(pipelineBudgetLkr)} inquiry budgets`
          : "No paid invoices yet";
  const revenueTrendColor = revenueDisplayLkr > 0 ? "text-emerald-600" : "text-slate-500";
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
          title: revenueCardTitle,
          value: invoicesLoading ? "…" : formatRawLKR(revenueDisplayLkr),
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
                                  onClick: () => {
                                    const recorded = inv?.paidAmount ?? inv?.amount;
                                    setApproveInvoiceModal({
                                      open: true,
                                      invoice: inv,
                                      paidAmount: recorded != null && recorded !== "" ? String(recorded) : "",
                                      error: ""
                                    });
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
                            (Array.isArray(task.assigned_to) ? task.assigned_to : []).join(", ") || "—"
                          ] })
                        ] }),
                        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2 shrink-0", children: [
                          onUpdateTasks && /* @__PURE__ */ jsx(Button, {
                            size: "sm",
                            variant: "outline",
                            className: "text-xs h-7",
                            disabled: reviewingTaskId === task.id,
                            onClick: () => {
                              setReviewingTaskId(task.id);
                              onUpdateTasks([{ ...task, status: "Pending" }]);
                              setReviewingTaskId(null);
                              onNotify?.(
                                "Task returned",
                                `"${task.task}" was sent back for rework.`,
                                "warning"
                              );
                            },
                            children: reviewingTaskId === task.id ? "Updating…" : "Reject"
                          }),
                          onUpdateTasks && /* @__PURE__ */ jsx(Button, {
                            size: "sm",
                            className: "text-xs h-7 bg-emerald-600 hover:bg-emerald-700",
                            disabled: reviewingTaskId === task.id,
                            onClick: () => {
                              setReviewingTaskId(task.id);
                              onUpdateTasks([{ ...task, status: "Completed" }]);
                              setReviewingTaskId(null);
                            },
                            children: reviewingTaskId === task.id ? "Approving…" : "Approve"
                          })
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
    ] }),
    /* @__PURE__ */ jsx(StudentMilestonesTable, {
      students,
      employees,
      onSelectStudent,
      scopeLabel: studentsScopeLabel,
    }),
    approveInvoiceModal.open && approveInvoiceModal.invoice && /* @__PURE__ */ jsx("div", {
      className: "fixed inset-0 z-[60] overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm",
      children: /* @__PURE__ */ jsxs("div", {
        className: "bg-white rounded-xl border border-gray-100 shadow-2xl p-6 w-full max-w-md my-auto",
        children: [
          /* @__PURE__ */ jsx("h3", { className: "font-bold text-lg text-slate-900 mb-2", children: "Approve payment evidence" }),
          /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-600 mb-4", children: [
            "Invoice ",
            approveInvoiceModal.invoice.id,
            " — enter the amount received."
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-2", children: [
            /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-slate-600 shrink-0", children: approveInvoiceModal.invoice.currency || "LKR" }),
            /* @__PURE__ */ jsx("input", {
              type: "number",
              min: "0",
              step: "0.01",
              disabled: acceptingInvoiceId === approveInvoiceModal.invoice.id,
              className: "flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-md outline-none focus:border-indigo-500 disabled:bg-slate-50",
              placeholder: "0.00",
              value: approveInvoiceModal.paidAmount,
              onChange: (event) => setApproveInvoiceModal((prev) => ({ ...prev, paidAmount: event.target.value, error: "" }))
            })
          ] }),
          approveInvoiceModal.error ? /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-600 mb-4", children: approveInvoiceModal.error }) : null,
          /* @__PURE__ */ jsxs("div", { className: "flex gap-3 mt-6", children: [
            /* @__PURE__ */ jsx(Button, {
              variant: "ghost",
              className: "flex-1",
              onClick: () => setApproveInvoiceModal({ open: false, invoice: null, paidAmount: "", error: "" }),
              children: "Cancel"
            }),
            /* @__PURE__ */ jsx(Button, {
              className: "flex-1 bg-emerald-600 hover:bg-emerald-700 text-white",
              disabled: acceptingInvoiceId === approveInvoiceModal.invoice.id,
              onClick: async () => {
                const inv = approveInvoiceModal.invoice;
                const parsed = parseFloat(String(approveInvoiceModal.paidAmount || "").trim());
                if (!Number.isFinite(parsed) || parsed <= 0) {
                  setApproveInvoiceModal((prev) => ({ ...prev, error: "Enter a valid amount greater than zero." }));
                  return;
                }
                const balanceDue = invoiceBalanceDue(inv);
                if (parsed > balanceDue + 0.009) {
                  setApproveInvoiceModal((prev) => ({
                    ...prev,
                    error: `Receipt amount cannot exceed the outstanding balance (${balanceDue.toLocaleString()}).`,
                  }));
                  return;
                }
                setAcceptingInvoiceId(inv.id);
                const result = await onUpdateInvoice({
                  ...inv,
                  status: "Paid",
                  paidAmount: parsed,
                  generatedReceiptUrl: `REC-${inv.id}.pdf`
                });
                setAcceptingInvoiceId(null);
                if (!result?.ok) {
                  setApproveInvoiceModal((prev) => ({ ...prev, error: result?.error || "Failed to approve payment." }));
                  return;
                }
                setApproveInvoiceModal({ open: false, invoice: null, paidAmount: "", error: "" });
                const approvedStatus = String(result?.data?.status || "").trim();
                onNotify?.(
                  approvedStatus === "Partially Paid" ? "Partial payment approved" : "Payment approved",
                  approvedStatus === "Partially Paid"
                    ? `Invoice ${inv.id} — partial payment recorded.`
                    : `Invoice ${inv.id} payment evidence was approved.`,
                  "success"
                );
              },
              children: acceptingInvoiceId === approveInvoiceModal.invoice.id ? "Approving…" : "Approve"
            })
          ] })
        ]
      })
    })
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
