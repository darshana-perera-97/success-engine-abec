import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { AlertTriangle, Clock, User, ArrowRight, Check, ListTodo } from "lucide-react";
import { Button } from "./Button";
import { isTaskOverdueByDate } from "../counselorTaskScope";
import { getCurrentStageSlaDisplay } from "../pipeline";
import { resolveCountryDocConfig } from "../countryDocConfigStore";
import { SLA_CLOCK_INTERVAL_MS } from "../runtimeConfig";

const EscalationDesk = ({ tasks, onReassign, students = [], employees = [], variant = "escalations" }) => {
  const [stageSlaNow, setStageSlaNow] = useState(() => Date.now());
  useEffect(() => {
    if (variant !== "tasks") return void 0;
    if (typeof window === "undefined") return void 0;
    const id = window.setInterval(() => setStageSlaNow(Date.now()), SLA_CLOCK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [variant]);
  const studentLookup = (students || []).reduce((acc, s) => {
    const id = String(s?.id || "").trim();
    if (id) acc[id] = s;
    return acc;
  }, {});
  const employeeLookup = (employees || []).reduce((acc, e) => {
    const id = String(e?.id || "").trim();
    if (id) acc[id] = e;
    return acc;
  }, {});
  const getAssigneeLabel = (assigneeId) => {
    const key = String(assigneeId || "").trim();
    if (!key) return "Unknown";
    const employee = employeeLookup[key];
    if (employee) {
      return String(employee.name || employee.username || employee.email || key).trim() || key;
    }
    const studentItem = studentLookup[key];
    if (studentItem) {
      return String(studentItem.name || studentItem.email || key).trim() || key;
    }
    return key;
  };
  const getPrimaryCounselorLabelForTask = (task) => {
    const sid = String(task?.student_id || task?.studentId || "").trim();
    const stu = sid ? studentLookup[sid] : null;
    const counselorRaw = stu?.counselor;
    if (counselorRaw != null && String(counselorRaw).trim()) {
      const lab = getAssigneeLabel(counselorRaw);
      if (lab && lab !== "Unknown") return lab;
    }
    const assignees = Array.isArray(task?.assigned_to) ? task.assigned_to : [];
    if (assignees.length === 0) return "—";
    return assignees.map((a) => getAssigneeLabel(a)).join(", ");
  };
  const isUpcomingHighPriority = (t) =>
    t.status !== "Completed" && !isTaskOverdueByDate(t) && t.priority === "High";
  const isOverdueOpen = (t) => t.status !== "Completed" && isTaskOverdueByDate(t);
  const deskTasks =
    variant === "tasks" ? tasks.filter(isUpcomingHighPriority) : tasks.filter(isOverdueOpen);
  const emptyTitle = variant === "tasks" ? "No active time-bound tasks" : "All Clear";
  const emptySubtitle =
    variant === "tasks"
      ? "No high-priority tasks with time remaining. When work is still on track, it appears here."
      : "No overdue tasks at the moment.";
  const cardBorder =
    variant === "tasks"
      ? "border-blue-100 group-hover:border-blue-200"
      : "border-rose-100 group-hover:border-rose-300";
  const iconClass = variant === "tasks" ? "text-blue-600" : "text-rose-500";
  return /* @__PURE__ */ jsx("div", { className: "space-y-4", children: deskTasks.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "text-center py-10 bg-emerald-50 rounded-xl border border-emerald-100", children: [
    /* @__PURE__ */ jsx("div", { className: "w-12 h-12 bg-white rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-3 shadow-sm", children: /* @__PURE__ */ jsx(Check, { size: 24 }) }),
    /* @__PURE__ */ jsx("h4", { className: "text-emerald-900 font-medium", children: emptyTitle }),
    /* @__PURE__ */ jsx("p", { className: "text-emerald-700 text-sm", children: emptySubtitle })
  ] }) : deskTasks.map((task) => {
    const sid = String(task.student_id || task.studentId || "").trim();
    const stu = sid ? studentLookup[sid] : null;
    const studentLabel = stu?.name || sid || "—";
    const counselorLabel = getPrimaryCounselorLabelForTask(task);
    const stageSla =
      variant === "tasks" && stu ? getCurrentStageSlaDisplay(stu, { now: stageSlaNow, resolveCountryConfig: resolveCountryDocConfig }) : null;
    const stageSlaClass =
      stageSla == null
        ? ""
        : stageSla.visualTone === "red"
          ? "text-rose-600 font-semibold"
          : stageSla.visualTone === "orange"
            ? "text-amber-700 font-semibold"
            : "text-slate-700 font-medium";
    const dueMeta = variant === "tasks" ? null : `${task.dueDate || "—"} (Overdue)`;
    return /* @__PURE__ */ jsxs("div", { className: `bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row justify-between gap-4 group transition-colors ${cardBorder}`, children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3 min-w-0", children: [
        /* @__PURE__ */ jsx("div", {
          className: "mt-1 shrink-0",
          children:
            variant === "tasks"
              ? /* @__PURE__ */ jsx(ListTodo, { size: 18, className: iconClass, strokeWidth: 2 })
              : /* @__PURE__ */ jsx(AlertTriangle, { size: 18, className: iconClass })
        }),
        /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsx("h4", { className: "font-semibold text-slate-900", children: task.task }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-slate-500", children: [
            /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsx(User, { size: 12, className: "shrink-0" }),
              /* @__PURE__ */ jsxs("span", { children: [
                "Student: ",
                /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-700", children: studentLabel })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1 text-slate-600", children: [
              /* @__PURE__ */ jsx(User, { size: 12, className: "shrink-0" }),
              /* @__PURE__ */ jsxs("span", { children: [
                "Counselor: ",
                /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-700", children: counselorLabel })
              ] })
            ] }),
            variant === "tasks" &&
              stageSla &&
              /* @__PURE__ */ jsxs("span", {
                className: `flex items-center gap-1 tabular-nums ${stageSlaClass}`,
                title: `${stageSla.stage} — ${stageSla.slaLabel} from stage entry`,
                children: [
                  /* @__PURE__ */ jsx(Clock, { size: 12, className: "shrink-0 text-slate-500" }),
                  /* @__PURE__ */ jsxs("span", { children: [
                    "Stage ",
                    /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-600", children: stageSla.stage }),
                    ": ",
                    stageSla.text
                  ] })
                ]
              }),
            dueMeta != null &&
              /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1 font-medium text-rose-600", children: [
                /* @__PURE__ */ jsx(Clock, { size: 12, className: "shrink-0" }),
                " ",
                dueMeta
              ] })
          ] })
        ] })
      ] }),
      typeof onReassign === "function" &&
        variant !== "tasks" &&
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center gap-2 shrink-0", children: [
          /* @__PURE__ */ jsxs(Button, {
            size: "sm",
            variant: "secondary",
            onClick: () => onReassign(task),
            children: [
              "Reassign ",
              /* @__PURE__ */ jsx(ArrowRight, { size: 14, className: "ml-2" })
            ]
          })
        ] })
    ] }, task.id);
  }) });
};
export {
  EscalationDesk
};
