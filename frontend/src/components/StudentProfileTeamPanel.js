import { jsx, jsxs } from "react/jsx-runtime";
import { Plane } from "lucide-react";
import { PersonContactCard } from "./PersonContactCard";
import {
  buildVisaAgentEntries
} from "../studentContactHelpers";
export function StudentProfileTeamPanel({ student, employees = [], userRole = "Admin", onUpdateStudent }) {
  const visaAgents = buildVisaAgentEntries(student, employees);
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2 mb-3", children: [
        /* @__PURE__ */ jsxs("h3", { className: "text-sm font-semibold text-slate-900 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Plane, { size: 16, className: "text-indigo-600", strokeWidth: 1.75 }),
          "Visa agents"
        ] }),
        visaAgents.length > 0 && /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wide", children: [
          visaAgents.length,
          " assigned"
        ] })
      ] }),
      visaAgents.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic mb-3", children: "No visa agents assigned." }) : /* @__PURE__  */ jsx("div", { className: "space-y-3 max-h-52 overflow-y-auto pr-1 mb-3", children: visaAgents.map((v) => /* @__PURE__ */ jsx(
        PersonContactCard,
        {
          name: v.name,
          role: v.role,
          badges: [],
          email: v.email,
          phone: v.phone,
          avatar: v.avatar,
          avatarClassName: "h-12 w-12 text-base"
        },
        v.id
      )) })
    ] })
  ] });
}
