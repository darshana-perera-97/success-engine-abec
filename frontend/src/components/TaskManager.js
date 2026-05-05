import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Clock, AlertCircle, Plus, Lock, Upload, CheckCircle, Hourglass } from "lucide-react";
import { Button } from "./Button";
import { CreateTaskModal } from "./CreateTaskModal";
import { filterTasksForCounselor } from "../counselorTaskScope";
const TaskManager = ({
  userRole = "Admin",
  tasks = [],
  student,
  onUpdateStudent,
  onAddActivity,
  currentUser,
  selectedTaskId,
  onUpdateTasks,
  onAddTask,
  monitoredStudents = [],
  employees = []
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const studentLookup = (monitoredStudents || []).reduce((acc, studentItem) => {
    acc[String(studentItem?.id || "").trim()] = studentItem;
    return acc;
  }, {});
  const filteredTasks = (() => {
    if (userRole === "Admin") return tasks;
    if (userRole === "Manager") {
      return tasks.filter((task) => task.priority === "High" || task.status === "Overdue" || task.status === "In Review");
    }
    if (userRole === "Counselor") {
      return filterTasksForCounselor(tasks, currentUser, monitoredStudents);
    }
    if (userRole === "Country Coordinator") {
      const ids = new Set((monitoredStudents || []).map((s) => String(s?.id || "").trim()).filter(Boolean));
      return (tasks || []).filter((task) => ids.has(String(task.student_id || task.studentId || "").trim()));
    }
    if (userRole === "Student") {
      return tasks.filter((task) => task.student_id === student?.id && !task.isPrivate);
    }
    return [];
  })();
  const handleStatusChange = (task, newStatus) => {
    const updatedTask = { ...task, status: newStatus };
    if (onUpdateTasks) {
      onUpdateTasks([updatedTask]);
    }
    if (onAddActivity) {
      onAddActivity({
        user: userRole,
        role: userRole,
        action: `moved task to ${newStatus}`,
        target: task.task,
        type: "task"
      });
    }
  };
  const handleStudentUpload = (task) => {
    if (!task.documentType || !student || !onUpdateStudent || !onAddActivity) return;
    const newDoc = {
      // id: `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `${task.documentType.replace(/([A-Z])/g, " $1")}.pdf`,
      type: task.documentType,
      status: "Pending",
      uploadedAt: "Just now",
      phase: task.phase,
      tier: task.tier,
      url: "#"
    };
    const otherDocs = student.documents?.filter((d) => d.type !== task.documentType) || [];
    const updatedStudent = {
      ...student,
      documents: [...otherDocs, newDoc]
    };
    onUpdateStudent(updatedStudent);
    onAddActivity({
      user: student.name,
      role: "Student",
      action: "uploaded",
      target: newDoc.name,
      type: "upload"
    });
    if (onUpdateTasks) {
      onUpdateTasks([{ ...task, status: "In Review" }]);
    }
  };
  const handleCreateTask = async (newTask) => {
    if (onAddTask) {
      const result = await onAddTask(newTask);
      if (result && result.ok === false) return result;
    }
    setIsCreateModalOpen(false);
    return { ok: true };
  };
  const getPriorityColor = (priority) => {
    switch (priority) {
      case "High":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "Medium":
        return "bg-amber-50 text-amber-700 border-amber-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };
  const studentTasks = userRole === "Student" ? filteredTasks.sort((a, b) => (a.phase || 9) - (b.phase || 9)) : filteredTasks;
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6 animate-in fade-in duration-500", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold tracking-tight text-[#0F172A]", children: userRole === "Manager" ? "Escalation Desk" : userRole === "Student" ? "My Action Plan" : "Task Manager" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mt-1", children: userRole === "Manager" ? "High priority items requiring attention." : "Track your to-do list and SLAs." })
      ] }),
      userRole !== "Student" && /* @__PURE__ */ jsxs(Button, { onClick: () => setIsCreateModalOpen(true), children: [
        /* @__PURE__ */ jsx(Plus, { size: 16, className: "mr-2" }),
        "New Task"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden", children: [
      /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm text-left", children: [
        /* @__PURE__ */ jsx("thead", { className: "bg-gray-50 border-b border-gray-200 text-slate-500", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "px-6 py-3 whitespace-nowrap", children: "Task" }),
          userRole !== "Student" && /* @__PURE__ */ jsx("th", { className: "px-6 py-3 whitespace-nowrap hidden md:table-cell", children: "Student" }),
          userRole !== "Student" && /* @__PURE__ */ jsx("th", { className: "px-6 py-3 whitespace-nowrap hidden lg:table-cell", children: "Assigned" }),
          /* @__PURE__ */ jsx("th", { className: "px-6 py-3 whitespace-nowrap hidden sm:table-cell", children: "Priority" }),
          /* @__PURE__ */ jsx("th", { className: "px-6 py-3 whitespace-nowrap", children: "Status" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-100", children: studentTasks.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: userRole === "Student" ? 3 : 5, className: "px-6 py-10 text-center text-slate-500", children: "No tasks found." }) }) : studentTasks.map((task) => {
          const studentContext = studentLookup[String(task.student_id || "").trim()] || null;
          const isLocked = userRole === "Student" && (task.phase || 1) > 1 && task.status === "Pending";
          const isTaskCompleted = task.status === "Completed";
          let docStatus = "none";
          let uploadedDoc;
          if (userRole === "Student" && task.documentType && student?.documents) {
            uploadedDoc = student.documents.find((d) => d.type === task.documentType);
            if (uploadedDoc) {
              if (uploadedDoc.status === "Verified") docStatus = "verified";
              else if (uploadedDoc.status === "Rejected") docStatus = "rejected";
              else docStatus = "pending";
            }
          }
          return /* @__PURE__ */ jsxs("tr", { className: `transition-colors ${isLocked ? "bg-gray-50 opacity-60" : "hover:bg-slate-50"} ${selectedTaskId === task.id ? "bg-indigo-50 ring-2 ring-inset ring-indigo-500" : ""}`, children: [
            /* @__PURE__ */ jsx("td", { className: "px-6 py-4 min-w-[200px]", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
              isTaskCompleted ? /* @__PURE__ */ jsx(CheckCircle, { size: 16, className: "text-emerald-500 shrink-0" }) : isLocked ? /* @__PURE__ */ jsx(Lock, { size: 16, className: "text-slate-400 shrink-0" }) : /* @__PURE__ */ jsx("div", { className: "w-4 h-4 rounded border-2 border-slate-300 shrink-0" }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("p", { className: `font-medium ${isTaskCompleted ? "text-slate-500 line-through" : "text-slate-900"}`, children: task.task }),
                task.isBlocking && !isTaskCompleted && /* @__PURE__ */ jsx("span", { className: "text-[10px] text-rose-600 font-bold uppercase tracking-wide", children: "Required" })
              ] })
            ] }) }),
            userRole !== "Student" && /* @__PURE__ */ jsx("td", { className: "px-6 py-4 whitespace-nowrap", children: /* @__PURE__ */ jsx("span", { className: "font-medium", children: studentContext?.name || task.student_id || "—" }) }),
            userRole !== "Student" && /* @__PURE__ */ jsx("td", { className: "px-6 py-4 whitespace-nowrap", children: /* @__PURE__ */ jsx("div", { className: "flex -space-x-2", children: task.assigned_to.map((assignee, i) => /* @__PURE__ */ jsx("div", { className: "h-8 w-8 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-xs font-bold text-indigo-700 shadow-sm", title: assignee, children: assignee.substring(0, 2) }, i)) }) }),
            /* @__PURE__ */ jsx("td", { className: "px-6 py-4 whitespace-nowrap", children: /* @__PURE__ */ jsx("span", { className: `inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${getPriorityColor(task.priority)}`, children: task.priority }) }),
            /* @__PURE__ */ jsx("td", { className: "px-6 py-4 whitespace-nowrap", children: userRole === "Student" ? isTaskCompleted ? /* @__PURE__ */ jsxs("span", { className: "flex items-center text-xs font-bold text-emerald-600", children: [
              /* @__PURE__ */ jsx(CheckCircle, { size: 12, className: "mr-1" }),
              " Completed"
            ] }) : isLocked ? /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400", children: "Locked" }) : docStatus === "verified" ? /* @__PURE__ */ jsxs("span", { className: "flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full", children: [
              /* @__PURE__ */ jsx(CheckCircle, { size: 12, className: "mr-1" }),
              "Verified"
            ] }) : docStatus === "pending" ? /* @__PURE__ */ jsxs("span", { className: "flex items-center text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full", children: [
              /* @__PURE__ */ jsx(Hourglass, { size: 12, className: "mr-1" }),
              "In Review"
            ] }) : docStatus === "rejected" ? /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
              /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "danger", onClick: () => handleStudentUpload(task), children: [
                /* @__PURE__ */ jsx(Upload, { size: 14, className: "mr-1" }),
                " Re-upload"
              ] }),
              uploadedDoc?.rejectionReason && /* @__PURE__ */ jsxs("div", { className: "absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-2 bg-slate-800 text-white text-xs rounded shadow-lg z-10 hidden group-hover:block", children: [
                /* @__PURE__ */ jsx("strong", { children: "Reason:" }),
                " ",
                uploadedDoc.rejectionReason
              ] })
            ] }) : task.documentType ? /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", onClick: () => handleStudentUpload(task), children: [
              /* @__PURE__ */ jsx(Upload, { size: 14, className: "mr-1" }),
              " Upload"
            ] }) : null : /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              task.status === "Overdue" && /* @__PURE__ */ jsxs("div", { className: "flex items-center text-rose-600 text-xs font-bold animate-pulse mr-2", children: [
                /* @__PURE__ */ jsx(AlertCircle, { size: 14, className: "mr-1" }),
                "OVERDUE"
              ] }),
              /* @__PURE__ */ jsxs(
                "select",
                {
                  className: `text-xs border rounded px-2 py-1 font-medium outline-none focus:ring-1 focus:ring-indigo-500
                                                            ${task.status === "Completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : task.status === "In Review" ? "bg-purple-50 text-purple-700 border-purple-200" : task.status === "In Progress" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-slate-600 border-gray-200"}`,
                  value: task.status,
                  onChange: (e) => handleStatusChange(task, e.target.value),
                  children: [
                    /* @__PURE__ */ jsx("option", { value: "Pending", children: "Pending" }),
                    /* @__PURE__ */ jsx("option", { value: "In Progress", children: "In Progress" }),
                    /* @__PURE__ */ jsx("option", { value: "In Review", children: "In Review" }),
                    /* @__PURE__ */ jsx("option", { value: "Completed", children: "Completed" })
                  ]
                }
              ),
              task.status !== "Overdue" && task.status !== "Completed" && /* @__PURE__ */ jsxs("div", { className: "flex items-center text-slate-400 text-xs ml-2", children: [
                /* @__PURE__ */ jsx(Clock, { size: 12, className: "mr-1" }),
                task.dueDate
              ] })
            ] }) })
          ] }, task.id);
        }) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsx(
      CreateTaskModal,
      {
        isOpen: isCreateModalOpen,
        onClose: () => setIsCreateModalOpen(false),
        onSubmit: handleCreateTask,
        userRole,
        currentUser,
        student,
        students: monitoredStudents || [],
        employees
      }
    )
  ] });
};
export {
  TaskManager
};
