import { jsx, jsxs } from "react/jsx-runtime";
import { formatLKR } from "../utils";
import { Download, Calendar, Banknote } from "lucide-react";
import { Button } from "./Button";
const IncentiveCalculator = ({ students = [], employees = [] }) => {
  const now = new Date();
  const periodStartLabel = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const periodEndLabel = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const realizedMonthLabel = now.toLocaleDateString("en-US", { month: "short" });
  const pipelineMonthLabel = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("en-US", {
    month: "short"
  });
  const counselors = employees.filter((e) => e.role.includes("Counsel") || e.role.includes("Team Lead"));
  const incentiveData = counselors.map((agent) => {
    const successfulVisas = students.filter(
      (s) => s.counselor === agent.id && (s.status === "Visa" || s.status === "Visa Pilot")
    );
    const flatCommissions = successfulVisas.length * 150;
    const volumeBonus = successfulVisas.reduce((acc, s) => acc + parseFloat(s.budget || "0") * 2e-3, 0);
    const totalPayout = flatCommissions + volumeBonus;
    const targetRevenue = 2e3;
    const achievementPct = Math.min(100, Math.round(totalPayout / targetRevenue * 100));
    return {
      ...agent,
      successCount: successfulVisas.length,
      flatCommissions,
      volumeBonus,
      totalPayout,
      targetRevenue,
      achievementPct
    };
  }).sort((a, b) => b.totalPayout - a.totalPayout);
  const totalMonthPayout = incentiveData.reduce((acc, curr) => acc + curr.totalPayout, 0);
  const totalPipelineRevenue = incentiveData.reduce((acc, curr) => acc + curr.totalPayout * 1.5, 0);
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden", children: [
    /* @__PURE__ */ jsxs("div", { className: "p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-gray-50 to-white", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Banknote, { size: 20, className: "text-emerald-600" }),
          "Incentive & Commission Calculator"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mt-1", children: 'Automated payout calculation based on "Visa" stage completion.' })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "text-right hidden sm:block", children: [
          /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400 uppercase font-bold", children: `Realized (${realizedMonthLabel})` }),
          /* @__PURE__ */ jsx("p", { className: "text-xl font-bold text-emerald-600", children: formatLKR(totalMonthPayout) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "text-right hidden sm:block", children: [
          /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400 uppercase font-bold", children: `Pipeline (${pipelineMonthLabel})` }),
          /* @__PURE__ */ jsx("p", { className: "text-xl font-bold text-slate-900", children: formatLKR(totalPipelineRevenue) })
        ] }),
        /* @__PURE__ */ jsxs(Button, { variant: "secondary", size: "sm", children: [
          /* @__PURE__ */ jsx(Download, { size: 16, className: "mr-2" }),
          " Payroll Export"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm text-left", children: [
      /* @__PURE__ */ jsx("thead", { className: "bg-gray-50 text-slate-500 font-medium border-b border-gray-200", children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4", children: "Counselor" }),
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4", children: "Target Progress" }),
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4", children: "Visas Granted" }),
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4", children: "Total Commission" }),
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4 text-center", children: "Status" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-100", children: incentiveData.map((agent) => /* @__PURE__ */ jsxs("tr", { className: "hover:bg-slate-50 transition-colors", children: [
        /* @__PURE__ */ jsxs("td", { className: "px-6 py-4 flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs", children: agent.name.charAt(0) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "font-medium text-slate-900", children: agent.name }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: agent.branch })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("td", { className: "px-6 py-4 w-64", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-xs mb-1", children: [
            /* @__PURE__ */ jsxs("span", { className: "text-slate-500 font-medium", children: [
              formatLKR(agent.totalPayout),
              " / ",
              formatLKR(agent.targetRevenue)
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "text-slate-700 font-bold", children: [
              agent.achievementPct,
              "%"
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "w-full bg-gray-200 rounded-full h-1.5 overflow-hidden", children: /* @__PURE__ */ jsx(
            "div",
            {
              className: `h-full rounded-full ${agent.achievementPct >= 100 ? "bg-emerald-500" : "bg-indigo-500"}`,
              style: { width: `${agent.achievementPct}%` }
            }
          ) })
        ] }),
        /* @__PURE__ */ jsx("td", { className: "px-6 py-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx("span", { className: "font-bold text-slate-900", children: agent.successCount }),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400", children: "students" })
        ] }) }),
        /* @__PURE__ */ jsx("td", { className: "px-6 py-4 font-bold text-emerald-600 font-mono text-base", children: formatLKR(agent.totalPayout) }),
        /* @__PURE__ */ jsx("td", { className: "px-6 py-4 text-center", children: agent.totalPayout > 0 ? /* @__PURE__ */ jsx("span", { className: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100", children: "Ready" }) : /* @__PURE__ */ jsx("span", { className: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200", children: "-" }) })
      ] }, agent.id)) })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "p-4 bg-slate-50 border-t border-gray-200 text-xs text-slate-500 flex justify-between items-center", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Calendar, { size: 14 }),
        /* @__PURE__ */ jsx("span", { children: `Calculation Period: ${periodStartLabel} - ${periodEndLabel}` })
      ] }),
      /* @__PURE__ */ jsx("span", { children: "* Volume bonus calculated on confirmed tuition budget" })
    ] })
  ] });
};
export {
  IncentiveCalculator
};
