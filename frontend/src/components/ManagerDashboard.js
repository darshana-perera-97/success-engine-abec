import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ActivityFeed } from "./ActivityFeed";
import { EscalationDesk } from "./EscalationDesk";
import { IncentiveCalculator } from "./IncentiveCalculator";
import { LeaderboardWidget } from "./LeaderboardWidget";
import { formatLKR } from "../utils";
import { AlertOctagon, TrendingUp, ArrowRight, Zap, CheckSquare, Banknote } from "lucide-react";
import { Button } from "./Button";
const ManagerDashboard = ({ activities, tasks, students = [], employees = [], currentUser, onNavigate }) => {
  const [activeTab, setActiveTab] = useState("escalations");
  const totalRevenue = students.reduce((acc, s) => acc + parseFloat(s.budget || "0") * 0.1, 0);
  const overdueTasks = tasks.filter((t) => t.status === "Overdue").length;
  const pendingReviews = tasks.filter((t) => t.status === "In Review").length;
  const visaGrantedCount = students.filter((s) => s.status === "Visa" || s.status === "Visa Pilot").length;
  const visaProcessingCount = students.filter((s) => ["Visa", "Visa Pilot"].includes(s.status)).length;
  const successRate = visaProcessingCount ? Math.round(visaGrantedCount / visaProcessingCount * 100) : 0;
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
          title: "Est. Revenue (Q3)",
          value: formatLKR(totalRevenue),
          icon: /* @__PURE__ */ jsx(Banknote, { size: 20 }),
          trend: "+12% vs target",
          trendColor: "text-emerald-600"
        }
      ),
      /* @__PURE__ */ jsx(
        DashboardCard,
        {
          title: "SLA Breaches",
          value: overdueTasks.toString(),
          icon: /* @__PURE__ */ jsx(AlertOctagon, { size: 20 }),
          trend: overdueTasks > 0 ? "Requires Attention" : "All Clear",
          trendColor: overdueTasks > 0 ? "text-rose-600" : "text-emerald-600",
          highlight: overdueTasks > 0,
          onClick: () => onNavigate("tasks")
        }
      ),
      /* @__PURE__ */ jsx(
        DashboardCard,
        {
          title: "Pending Reviews",
          value: pendingReviews.toString(),
          icon: /* @__PURE__ */ jsx(CheckSquare, { size: 20 }),
          trend: pendingReviews > 0 ? "Action Required" : "Up to date",
          trendColor: pendingReviews > 0 ? "text-amber-600" : "text-slate-500",
          highlight: pendingReviews > 0,
          onClick: () => onNavigate("tasks")
        }
      ),
      /* @__PURE__ */ jsx(
        DashboardCard,
        {
          title: "Visa Success Rate",
          value: `${successRate}%`,
          icon: /* @__PURE__ */ jsx(TrendingUp, { size: 20 }),
          trend: "Top Tier",
          trendColor: "text-indigo-600"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 space-y-8", children: [
        /* @__PURE__ */ jsx(IncentiveCalculator, { students, employees }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row justify-between sm:items-center gap-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center gap-4", children: [
              /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
                /* @__PURE__ */ jsx("div", { className: `w-2 h-2 rounded-full ${activeTab === "escalations" ? "bg-rose-500 animate-pulse" : "bg-slate-300"}` }),
                "Command Center"
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex bg-slate-100 p-1 rounded-lg self-start", children: [
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => setActiveTab("escalations"),
                    className: `px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === "escalations" ? "bg-white text-rose-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`,
                    children: [
                      "Escalations (",
                      overdueTasks,
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
                      pendingReviews,
                      ")"
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs("button", { onClick: () => onNavigate("tasks"), className: "text-xs text-indigo-600 font-medium hover:underline flex items-center", children: [
              "Manage All Tasks ",
              /* @__PURE__ */ jsx(ArrowRight, { size: 12, className: "ml-1" })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "bg-white border border-gray-200 rounded-xl p-1 shadow-sm", children: activeTab === "escalations" ? /* @__PURE__ */ jsx(EscalationDesk, { tasks, onReassign: (id) => console.log(id) }) : /* @__PURE__ */ jsx("div", { className: "p-4 space-y-3", children: tasks.filter((t) => t.status === "In Review").length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-center py-8 text-slate-500 text-sm", children: "No tasks pending review." }) : tasks.filter((t) => t.status === "In Review").map((task) => /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center p-3 bg-amber-50 border border-amber-100 rounded-lg", children: [
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
          ] }, task.id)) }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-8", children: [
        /* @__PURE__ */ jsx(LeaderboardWidget, { students, employees, currentUserId: currentUser?.id || "", currentUserEmail: currentUser?.email || "" }),
        /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm h-auto flex flex-col", children: [
          /* @__PURE__ */ jsx("div", { className: "flex justify-between items-center mb-4", children: /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Zap, { size: 18, className: "text-indigo-600", fill: "currentColor" }),
            "Live Operations Feed"
          ] }) }),
          /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-[250px] overflow-y-auto", children: /* @__PURE__ */ jsx(ActivityFeed, { activities, limit: 5, showRoleBadge: false }) })
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
