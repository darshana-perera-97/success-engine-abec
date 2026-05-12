import { jsx, jsxs } from "react/jsx-runtime";
import { Plane } from "lucide-react";
import { Button } from "./Button";
import { PersonContactCard } from "./PersonContactCard";
import {
  buildVisaAgentEntries,
  isVisaAgentEmployee,
  normalizeVisaAgentIds
} from "../studentContactHelpers";
export function StudentProfileTeamPanel({ student, employees = [], userRole = "Admin", onUpdateStudent }) {
  const visaAgents = buildVisaAgentEntries(student, employees);
  const visaCandidates = employees.filter(isVisaAgentEmployee);
  const canAssignVisa = userRole !== "Student" && typeof onUpdateStudent === "function";
  const toggleVisaAgent = (empId) => {
    const id = String(empId || "").trim();
    if (!id || !canAssignVisa) return;
    const cur = normalizeVisaAgentIds(student);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    onUpdateStudent({ ...student, visaAgentIds: next });
  };
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
      visaAgents.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic mb-3", children: "No visa agents assigned." }) : /* @__PURE__ */ jsx("div", { className: "space-y-3 max-h-52 overflow-y-auto pr-1 mb-3", children: visaAgents.map((v) => /* @__PURE__ */ jsx(
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
      )) }),
      canAssignVisa && visaCandidates.length > 0 && /* @__PURE__ */ jsxs("div", { className: "pt-3 border-t border-slate-100", children: [
        /* @__PURE__ */ jsx("p", { className: "text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2", children: "Assign visa agents" }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: visaCandidates.map((emp) => {
          const id = String(emp.id || "").trim();
          const selected = normalizeVisaAgentIds(student).includes(id);
          const label = emp.name || emp.username || emp.email || id;
          return /* @__PURE__ */ jsx(
            Button,
            {
              size: "sm",
              variant: selected ? "primary" : "outline",
              className: "text-xs h-8",
              type: "button",
              onClick: () => toggleVisaAgent(id),
              children: label
            },
            id
          );
        }) })
      ] }),
      canAssignVisa && visaCandidates.length === 0 && /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400 mt-2", children: "Add staff accounts with “Visa” in the role to assign visa agents here." })
    ] })
  ] });
}
