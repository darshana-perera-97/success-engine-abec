import { jsx, jsxs } from "react/jsx-runtime";
import { AlertTriangle, Clock, User, ArrowRight, Check } from "lucide-react";
import { Button } from "./Button";
const EscalationDesk = ({ tasks, onReassign }) => {
  const escalatedTasks = tasks.filter((t) => (t.status === "Overdue" || t.priority === "High") && t.status !== "Completed");
  return /* @__PURE__ */ jsx("div", { className: "space-y-4", children: escalatedTasks.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "text-center py-10 bg-emerald-50 rounded-xl border border-emerald-100", children: [
    /* @__PURE__ */ jsx("div", { className: "w-12 h-12 bg-white rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-3 shadow-sm", children: /* @__PURE__ */ jsx(Check, { size: 24 }) }),
    /* @__PURE__ */ jsx("h4", { className: "text-emerald-900 font-medium", children: "All Clear" }),
    /* @__PURE__ */ jsx("p", { className: "text-emerald-700 text-sm", children: "No critical escalations at the moment." })
  ] }) : escalatedTasks.map((task) => /* @__PURE__ */ jsxs("div", { className: "bg-white p-4 rounded-xl border border-rose-100 shadow-sm flex flex-col md:flex-row justify-between gap-4 group hover:border-rose-300 transition-colors", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx("div", { className: "mt-1", children: /* @__PURE__ */ jsx(AlertTriangle, { size: 18, className: "text-rose-500" }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h4", { className: "font-semibold text-slate-900", children: task.task }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mt-1 text-xs text-slate-500", children: [
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsx(User, { size: 12 }),
            " ",
            task.student_id
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1 text-rose-600 font-medium", children: [
            /* @__PURE__ */ jsx(Clock, { size: 12 }),
            " ",
            task.dueDate,
            " (Overdue)"
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsx("div", { className: "flex -space-x-2 mr-2", children: task.assigned_to.map((emp) => /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600", title: emp, children: emp.substring(0, 2) }, emp)) }),
      /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", onClick: () => onReassign(task.id || ""), children: [
        "Reassign ",
        /* @__PURE__ */ jsx(ArrowRight, { size: 14, className: "ml-2" })
      ] })
    ] })
  ] }, task.id)) });
};
export {
  EscalationDesk
};
