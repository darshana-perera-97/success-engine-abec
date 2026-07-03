import { jsx, jsxs } from "react/jsx-runtime";
import { formatRawLKR } from "../utils";
import { normalizePipelineStatus } from "../pipeline";
import { Calendar, Banknote } from "lucide-react";
import { isCounselorEquivalentAccountRole } from "../roles";
import { dt } from "./DataTable";

const FLAT_COMMISSION_LKR = 150;
const VOLUME_BONUS_RATE = 0.002;
const TARGET_REVENUE_LKR = 2000;
/** Set to true when commission/payout amounts should be visible again. */
const SHOW_INCENTIVE_MONEY = false;

const normalizeIdentity = (value) => String(value || "").trim().toLowerCase();

function isCounselorEmployee(employee) {
  return isCounselorEquivalentAccountRole(employee?.role);
}

function buildCounselorIdentitySet(agent) {
  const identities = new Set();
  [agent?.id, agent?.email, agent?.username, agent?.name].forEach((value) => {
    const normalized = normalizeIdentity(value);
    if (normalized) identities.add(normalized);
  });
  return identities;
}

function studentBelongsToCounselor(student, identities) {
  const studentCounselorId = normalizeIdentity(student?.counselor);
  const studentCounselorName = normalizeIdentity(student?.counselorName);
  if (studentCounselorId && identities.has(studentCounselorId)) return true;
  if (Array.isArray(student?.counselorHistory)) {
    if (student.counselorHistory.some((id) => identities.has(normalizeIdentity(id)))) return true;
  }
  for (const identity of identities) {
    if (studentCounselorName && studentCounselorName === identity) return true;
  }
  return false;
}

function parseStudentBudgetLkr(student) {
  const value = Number(String(student?.budget || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function isRealizedVisaStudent(student) {
  const stage = normalizePipelineStatus(student?.status);
  return stage === "Visa" || stage === "Enrolled" || String(student?.status || "").trim() === "Visa Pilot";
}

function isPipelineProspectStudent(student) {
  const stage = normalizePipelineStatus(student?.status);
  return stage === "Documentation" || stage === "Interview training";
}

function commissionForStudent(student) {
  return FLAT_COMMISSION_LKR + parseStudentBudgetLkr(student) * VOLUME_BONUS_RATE;
}

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
  const counselors = employees.filter(isCounselorEmployee);
  const incentiveData = counselors.map((agent) => {
    const identities = buildCounselorIdentitySet(agent);
    const myStudents = students.filter((s) => studentBelongsToCounselor(s, identities));
    const successfulVisas = myStudents.filter(isRealizedVisaStudent);
    const pipelineProspects = myStudents.filter(isPipelineProspectStudent);
    const flatCommissions = successfulVisas.length * FLAT_COMMISSION_LKR;
    const volumeBonus = successfulVisas.reduce((acc, s) => acc + parseStudentBudgetLkr(s) * VOLUME_BONUS_RATE, 0);
    const totalPayout = flatCommissions + volumeBonus;
    const pipelinePayout = pipelineProspects.reduce((acc, s) => acc + commissionForStudent(s), 0);
    const achievementPct = TARGET_REVENUE_LKR > 0 ? Math.min(100, Math.round(totalPayout / TARGET_REVENUE_LKR * 100)) : 0;
    return {
      ...agent,
      successCount: successfulVisas.length,
      flatCommissions,
      volumeBonus,
      totalPayout,
      pipelinePayout,
      targetRevenue: TARGET_REVENUE_LKR,
      achievementPct
    };
  }).sort((a, b) => b.totalPayout - a.totalPayout || b.pipelinePayout - a.pipelinePayout);
  const totalMonthPayout = incentiveData.reduce((acc, curr) => acc + curr.totalPayout, 0);
  const totalPipelineRevenue = incentiveData.reduce((acc, curr) => acc + curr.pipelinePayout, 0);
  return /* @__PURE__ */ jsxs("div", { className: dt.card, children: [
    /* @__PURE__ */ jsxs("div", { className: "p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-gray-50 to-white", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Banknote, { size: 20, className: "text-emerald-600" }),
          "Incentive & Commission Calculator"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mt-1", children: SHOW_INCENTIVE_MONEY ? 'Automated payout calculation based on "Visa" stage completion.' : 'Visa stage completion tracking by counselor.' })
      ] }),
      SHOW_INCENTIVE_MONEY && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "text-right hidden sm:block", children: [
          /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400 uppercase font-bold", children: `Realized (${realizedMonthLabel})` }),
          /* @__PURE__ */ jsx("p", { className: "text-xl font-bold text-emerald-600", children: formatRawLKR(totalMonthPayout) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "text-right hidden sm:block", children: [
          /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400 uppercase font-bold", children: `Pipeline (${pipelineMonthLabel})` }),
          /* @__PURE__ */ jsx("p", { className: "text-xl font-bold text-slate-900", children: formatRawLKR(totalPipelineRevenue) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: dt.scroll, children: /* @__PURE__ */ jsxs("table", { className: dt.table, children: [
      /* @__PURE__ */ jsx("thead", { className: dt.head, children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4", children: "Counselor" }),
        SHOW_INCENTIVE_MONEY && /* @__PURE__ */ jsx("th", { className: "px-6 py-4", children: "Target Progress" }),
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4", children: "Visas Granted" }),
        SHOW_INCENTIVE_MONEY && /* @__PURE__ */ jsx("th", { className: "px-6 py-4", children: "Total Commission" }),
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4 text-center", children: "Status" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { className: dt.body, children: incentiveData.map((agent) => /* @__PURE__ */ jsxs("tr", { className: dt.row, children: [
        /* @__PURE__ */ jsxs("td", { className: "px-6 py-4 flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs", children: agent.name.charAt(0) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "font-medium text-slate-900", children: agent.name }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: agent.branch })
          ] })
        ] }),
        SHOW_INCENTIVE_MONEY && /* @__PURE__ */ jsxs("td", { className: "px-6 py-4 w-64", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-xs mb-1", children: [
            /* @__PURE__ */ jsxs("span", { className: "text-slate-500 font-medium", children: [
              formatRawLKR(agent.totalPayout),
              " / ",
              formatRawLKR(agent.targetRevenue)
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
        SHOW_INCENTIVE_MONEY && /* @__PURE__ */ jsx("td", { className: "px-6 py-4 font-bold text-emerald-600 font-mono text-base", children: formatRawLKR(agent.totalPayout) }),
        /* @__PURE__ */ jsx("td", { className: "px-6 py-4 text-center", children: (SHOW_INCENTIVE_MONEY ? agent.totalPayout > 0 : agent.successCount > 0) ? /* @__PURE__ */ jsx("span", { className: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100", children: "Ready" }) : /* @__PURE__ */ jsx("span", { className: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200", children: "-" }) })
      ] }, agent.id)) })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "p-4 bg-slate-50 border-t border-gray-200 text-xs text-slate-500 flex justify-between items-center", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Calendar, { size: 14 }),
        /* @__PURE__ */ jsx("span", { children: `Calculation Period: ${periodStartLabel} - ${periodEndLabel}` })
      ] }),
      SHOW_INCENTIVE_MONEY && /* @__PURE__ */ jsx("span", { children: "* Volume bonus calculated on confirmed tuition budget" })
    ] })
  ] });
};
export {
  IncentiveCalculator
};
