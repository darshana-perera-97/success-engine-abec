import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import React from "react";
import { Dashboard } from "./Dashboard";
import { ActivityFeed } from "./ActivityFeed";
import { Sparkles, Send } from "lucide-react";
const AdminDashboard = ({ activities, tasks, students, invoices = [] }) => {
  const [isTyping, setIsTyping] = React.useState(false);
  const [aiResponse, setAiResponse] = React.useState(null);
  const [inputValue, setInputValue] = React.useState("");
  const overdueTasks = tasks.filter((t) => t.status === "Overdue").length;
  const pendingReviews = tasks.filter((t) => t.status === "In Review").length;
  const totalUnresolvedViolations = students.reduce((acc, s) => {
    return acc + (s.slaViolations?.filter((v) => !v.resolved).length || 0);
  }, 0);
  const avgSlaScore = Math.max(0, 100 - totalUnresolvedViolations * 2);
  const handleSendQuery = () => {
    if (!inputValue.trim()) return;
    setIsTyping(true);
    setAiResponse(null);
    const query = inputValue;
    setInputValue("");
    setTimeout(() => {
      setIsTyping(false);
      if (query.toLowerCase().includes("underperforming")) {
        setAiResponse(
          /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
            /* @__PURE__ */ jsx("p", { children: "Based on live data across all three branches for April 2026, here is the current performance breakdown by student conversion rate:" }),
            /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-3 gap-4", children: [
              /* @__PURE__ */ jsxs("div", { className: "bg-emerald-50 p-3 rounded-lg border border-emerald-100", children: [
                /* @__PURE__ */ jsx("p", { className: "text-[10px] font-bold text-emerald-600 uppercase", children: "Colombo" }),
                /* @__PURE__ */ jsx("p", { className: "text-xl font-bold text-emerald-700", children: "78%" }),
                /* @__PURE__ */ jsx("p", { className: "text-[10px] text-emerald-600", children: "34 of 44 converted" })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "bg-amber-50 p-3 rounded-lg border border-amber-100", children: [
                /* @__PURE__ */ jsx("p", { className: "text-[10px] font-bold text-amber-600 uppercase", children: "Jaffna" }),
                /* @__PURE__ */ jsx("p", { className: "text-xl font-bold text-amber-700", children: "54%" }),
                /* @__PURE__ */ jsx("p", { className: "text-[10px] text-amber-600", children: "19 of 35 converted" })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "bg-rose-50 p-3 rounded-lg border border-rose-100", children: [
                /* @__PURE__ */ jsx("p", { className: "text-[10px] font-bold text-rose-600 uppercase", children: "Kandy" }),
                /* @__PURE__ */ jsx("p", { className: "text-xl font-bold text-rose-700", children: "31%" }),
                /* @__PURE__ */ jsx("p", { className: "text-[10px] text-rose-600", children: "8 of 26 converted" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-700", children: [
              /* @__PURE__ */ jsx("strong", { children: "Kandy is underperforming." }),
              " Conversion rate is 47 points below Colombo. Primary bottleneck identified: ",
              /* @__PURE__ */ jsx("strong", { children: "11 students" }),
              " have been stalled in the Documentation stage for more than 9 days with no counsellor task activity logged. This is a follow-up gap, not a lead quality issue."
            ] }),
            /* @__PURE__ */ jsx("div", { className: "bg-indigo-50 p-3 rounded-lg border border-indigo-100", children: /* @__PURE__ */ jsxs("p", { className: "text-xs text-indigo-800 font-medium", children: [
              /* @__PURE__ */ jsx("strong", { children: "Recommended action:" }),
              " assign a task audit to the Kandy branch manager and trigger a bulk follow-up sequence for the 11 stalled students immediately."
            ] }) })
          ] })
        );
      } else {
        setAiResponse(
          /* @__PURE__ */ jsx("p", { children: "I've analyzed the data. We are currently on track for our monthly targets, but we should keep an eye on the documentation bottlenecks in the Kandy branch." })
        );
      }
    }, 2e3);
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-8 animate-in fade-in duration-500", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-5 pb-2", children: [
      /* @__PURE__ */ jsx("div", { className: "w-16 h-16 rounded-full p-[1.5px] bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#334155] shadow-md flex-shrink-0", children: /* @__PURE__ */ jsx(
        "img",
        {
          src: "/CEO.png",
          alt: "Sandaruwan",
          className: "w-full h-full object-cover rounded-full bg-white",
          referrerPolicy: "no-referrer"
        }
      ) }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col justify-center", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold text-slate-900 tracking-tight", children: "Welcome Back \u{1F44B} Sandaruwan" }),
        /* @__PURE__ */ jsxs("p", { className: "text-slate-500 font-medium mt-1 flex items-center gap-2 text-sm", children: [
          /* @__PURE__ */ jsx("span", { className: "w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" }),
          "Executive Director, ABEC Premier"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 space-y-8", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col h-[500px] relative overflow-hidden group", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3", children: [
            /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(Sparkles, { size: 18, className: "text-indigo-600" }),
              "AI Integrated Data Discussion"
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-full shadow-sm opacity-80 group-hover:opacity-100 transition-opacity w-fit", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex gap-0.5", children: [
                /* @__PURE__ */ jsx("span", { className: "w-1 h-1 rounded-full bg-[#4285F4]" }),
                /* @__PURE__ */ jsx("span", { className: "w-1 h-1 rounded-full bg-[#EA4335]" }),
                /* @__PURE__ */ jsx("span", { className: "w-1 h-1 rounded-full bg-[#FBBC05]" }),
                /* @__PURE__ */ jsx("span", { className: "w-1 h-1 rounded-full bg-[#34A853]" })
              ] }),
              /* @__PURE__ */ jsx("span", { className: "text-[10px] font-semibold text-slate-500 tracking-tight whitespace-nowrap", children: "Powered by Google DeepMind" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto bg-slate-50/50 rounded-lg p-4 mb-4 border border-slate-100 flex flex-col gap-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
              /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ jsx(Sparkles, { size: 14, className: "text-indigo-600" }) }),
              /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-lg p-3 text-sm text-slate-700 shadow-sm max-w-[80%]", children: [
                "Hello Sandaruwan. I've analyzed our current operational metrics. To achieve our ",
                /* @__PURE__ */ jsx("strong", { children: "Q3 revenue target" }),
                ", we require approximately ",
                /* @__PURE__ */ jsx("strong", { children: "450 additional qualified leads" }),
                ". Currently, we have ",
                /* @__PURE__ */ jsxs("strong", { children: [
                  overdueTasks,
                  " overdue tasks"
                ] }),
                " and ",
                /* @__PURE__ */ jsxs("strong", { children: [
                  pendingReviews,
                  " pending reviews"
                ] }),
                ".",
                /* @__PURE__ */ jsx("br", {}),
                /* @__PURE__ */ jsx("br", {}),
                "Our ",
                /* @__PURE__ */ jsxs("strong", { children: [
                  "Global SLA Score is ",
                  avgSlaScore,
                  "%"
                ] }),
                ". I've detected ",
                /* @__PURE__ */ jsxs("strong", { children: [
                  totalUnresolvedViolations,
                  " unresolved SLA violations"
                ] }),
                "."
              ] })
            ] }),
            aiResponse && /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3 flex-row-reverse", children: [
                /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-gray-200", children: /* @__PURE__ */ jsx(
                  "img",
                  {
                    src: "/CEO.png",
                    alt: "Sandaruwan",
                    className: "w-full h-full object-cover",
                    referrerPolicy: "no-referrer"
                  }
                ) }),
                /* @__PURE__ */ jsx("div", { className: "bg-indigo-600 text-white rounded-lg p-3 text-sm shadow-sm max-w-[80%]", children: "Which branch is underperforming this month?" })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
                /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ jsx(Sparkles, { size: 14, className: "text-indigo-600" }) }),
                /* @__PURE__ */ jsx("div", { className: "bg-white border border-gray-200 rounded-lg p-3 text-sm text-slate-700 shadow-sm max-w-[80%]", children: aiResponse })
              ] })
            ] }),
            isTyping && /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
              /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ jsx(Sparkles, { size: 14, className: "text-indigo-600" }) }),
              /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-lg p-3 text-sm text-slate-700 shadow-sm flex items-center gap-1", children: [
                /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" }),
                /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" }),
                /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "relative mt-auto", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                value: inputValue,
                onChange: (e) => setInputValue(e.target.value),
                onKeyDown: (e) => e.key === "Enter" && handleSendQuery(),
                placeholder: "Ask AI Assist about your data...",
                className: "w-full pl-4 pr-12 py-3 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: handleSendQuery,
                className: "absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors",
                children: /* @__PURE__ */ jsx(Send, { size: 16 })
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx(Dashboard, { students, invoices })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col h-full", children: [
        /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 mb-4", children: "Global Audit Log" }),
        /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto max-h-[600px] pr-2", children: /* @__PURE__ */ jsx(ActivityFeed, { activities }) })
      ] })
    ] })
  ] });
};
export {
  AdminDashboard
};
