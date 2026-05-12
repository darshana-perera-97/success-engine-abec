import { jsx, jsxs } from "react/jsx-runtime";
import { AlertTriangle, Clock, User, ArrowRight, Check } from "lucide-react";
import { Button } from "./Button";
const EscalationDesk = ({ tasks, onReassign, students = [], employees = [] }) => {
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
  const escalatedTasks = tasks.filter((t) => (t.status === "Overdue" || t.priority === "High") && t.status !== "Completed");
  return /* @__PURE__ */ jsx("div", { className: "space-y-4", children: escalatedTasks.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "text-center py-10 bg-emerald-50 rounded-xl border border-emerald-100", children: [
    /* @__PURE__ */ jsx("div", { className: "w-12 h-12 bg-white rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-3 shadow-sm", children: /* @__PURE__ */ jsx(Check, { size: 24 }) }),
    /* @__PURE__ */ jsx("h4", { className: "text-emerald-900 font-medium", children: "All Clear" }),
    /* @__PURE__ */ jsx("p", { className: "text-emerald-700 text-sm", children: "No critical escalations at the moment." })
  ] }) : escalatedTasks.map((task) => {
    const sid = String(task.student_id || task.studentId || "").trim();
    const stu = sid ? studentLookup[sid] : null;
    const studentLabel = stu?.name || sid || "—";
    const counselorLabel = getPrimaryCounselorLabelForTask(task);
    const isOverdueStatus = task.status === "Overdue";
    const dueMeta = isOverdueStatus ? `${task.dueDate || "—"} (Overdue)` : task.priority === "High" ? `${task.dueDate || "No due date"} · High priority` : String(task.dueDate || "");
    const assignees = Array.isArray(task.assigned_to) ? task.assigned_to : [];
    return /* @__PURE__ */ jsxs("div", { className: "bg-white p-4 rounded-xl border border-rose-100 shadow-sm flex flex-col md:flex-row justify-between gap-4 group hover:border-rose-300 transition-colors", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3 min-w-0", children: [
        /* @__PURE__ */ jsx("div", { className: "mt-1 shrink-0", children: /* @__PURE__ */ jsx(AlertTriangle, { size: 18, className: "text-rose-500" }) }),
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
            /* @__PURE__ */ jsxs("span", { className: `flex items-center gap-1 font-medium ${isOverdueStatus ? "text-rose-600" : "text-amber-700"}`, children: [
              /* @__PURE__ */ jsx(Clock, { size: 12, className: "shrink-0" }),
              " ",
              dueMeta
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center gap-2 shrink-0", children: [
        assignees.length > 0 && /* @__PURE__ */ jsx("div", { className: "flex -space-x-2 mr-2", children: assignees.map((emp) => {
          const raw = String(emp ?? "");
          const label = getAssigneeLabel(emp);
          const initials = label.replace(/[^A-Za-z0-9]/g, " ").trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || raw.slice(0, 2).toUpperCase();
          return /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600", title: `${label} (${raw})`, children: initials }, raw);
        }) }),
        /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", onClick: () => onReassign(task.id || ""), children: [
          "Reassign ",
          /* @__PURE__ */ jsx(ArrowRight, { size: 14, className: "ml-2" })
        ] })
      ] })
    ] }, task.id);
  }) });
};
export {
  EscalationDesk
};
