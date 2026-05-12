import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Clock, AlertCircle, Plus, Lock, Upload, CheckCircle, Hourglass } from "lucide-react";
import { Button } from "./Button";
import { CreateTaskModal } from "./CreateTaskModal";
import { filterTasksForCounselor, isTaskOverdueByDate } from "../counselorTaskScope";
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
  employees = [],
  onSelectStudent,
  onNavigate
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const studentLookup = (monitoredStudents || []).reduce((acc, studentItem) => {
    acc[String(studentItem?.id || "").trim()] = studentItem;
    return acc;
  }, {});
  const employeeLookup = (employees || []).reduce((acc, employee) => {
    acc[String(employee?.id || "").trim()] = employee;
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
  const showManagerCounselorColumn = userRole === "Manager";
  const tableColSpan = userRole === "Student" ? 3 : showManagerCounselorColumn ? 6 : 5;
  const assignedColumnHeaderClass =
    userRole === "Manager"
      ? "px-6 py-3 whitespace-nowrap hidden md:table-cell"
      : "px-6 py-3 whitespace-nowrap hidden lg:table-cell";
  const assignedColumnCellClass =
    userRole === "Manager"
      ? "px-6 py-4 hidden md:table-cell"
      : "px-6 py-4 hidden lg:table-cell";
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
    if (String(task?.status || "") === String(newStatus || "")) return;
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
  const handleToggleCompletedFromRow = (task, event) => {
    event.stopPropagation();
    if (userRole === "Student") return;
    if (String(task?.status || "") === "Completed") {
      handleStatusChange(task, "In Progress");
    } else {
      handleStatusChange(task, "Completed");
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
  const handleOpenTaskContext = (task, studentContext) => {
    const sid = String(task?.student_id || task?.studentId || "").trim();
    const targetStudent = studentContext || (sid ? studentLookup[sid] : null);
    if (!targetStudent || !onSelectStudent || !onNavigate) return;
    onSelectStudent(targetStudent);
    onNavigate("student-detail");
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
  const studentTasks = [...filteredTasks].sort((a, b) => {
    const aDone = String(a?.status || "") === "Completed";
    const bDone = String(b?.status || "") === "Completed";
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (userRole === "Student") return (a.phase || 9) - (b.phase || 9);
    return 0;
  });
  useEffect(() => {
    if (!selectedTaskId || typeof document === "undefined") return;
    const safe = String(selectedTaskId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const row = document.querySelector(`tr[data-task-row-id="${safe}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedTaskId, studentTasks]);
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
          userRole !== "Student" && /* @__PURE__ */ jsx("th", { className: assignedColumnHeaderClass, children: "Assigned" }),
          showManagerCounselorColumn && /* @__PURE__ */ jsx("th", { className: "px-6 py-3 whitespace-nowrap hidden md:table-cell", title: "Student's counselor (case owner), or assignees if unset", children: "Counselor" }),
          /* @__PURE__ */ jsx("th", { className: "px-6 py-3 whitespace-nowrap hidden sm:table-cell", children: "Priority" }),
          /* @__PURE__ */ jsx("th", { className: "px-6 py-3 whitespace-nowrap", children: "Status" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-100", children: studentTasks.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: tableColSpan, className: "px-6 py-10 text-center text-slate-500", children: "No tasks found."         }) }) : studentTasks.map((task) => {
          const studentContext = studentLookup[String(task.student_id || task.studentId || "").trim()] || null;
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
          return /* @__PURE__ */ jsxs("tr", { "data-task-row-id": String(task.id ?? ""), className: `transition-colors ${isLocked ? "bg-gray-50 opacity-60" : "hover:bg-slate-50"} ${selectedTaskId === task.id ? "bg-indigo-50 ring-2 ring-inset ring-indigo-500" : ""}`, children: [
            /* @__PURE__ */ jsx("td", { className: "px-6 py-4 min-w-[200px]", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
              userRole !== "Student" ? isTaskCompleted ? /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  title: "Mark as not completed",
                  "aria-label": "Mark task as not completed",
                  onClick: (e) => handleToggleCompletedFromRow(task, e),
                  className: "shrink-0 p-0 border-0 bg-transparent cursor-pointer rounded hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                  children: /* @__PURE__ */ jsx(CheckCircle, { size: 16, className: "text-emerald-500" })
                }
              ) : /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  title: "Mark as completed",
                  "aria-label": "Mark task as completed",
                  onClick: (e) => handleToggleCompletedFromRow(task, e),
                  className: "shrink-0 p-0 border-0 bg-transparent cursor-pointer rounded hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                  children: /* @__PURE__ */ jsx("div", { className: "w-4 h-4 rounded border-2 border-slate-300" })
                }
              ) : isTaskCompleted ? /* @__PURE__ */ jsx(CheckCircle, { size: 16, className: "text-emerald-500 shrink-0" }) : isLocked ? /* @__PURE__ */ jsx(Lock, { size: 16, className: "text-slate-400 shrink-0" }) : /* @__PURE__ */ jsx("div", { className: "w-4 h-4 rounded border-2 border-slate-300 shrink-0" }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("p", { className: `font-medium ${isTaskCompleted ? "text-slate-500 line-through" : "text-slate-900"}`, children: task.task }),
                task.isBlocking && !isTaskCompleted && /* @__PURE__ */ jsx("span", { className: "text-[10px] text-rose-600 font-bold uppercase tracking-wide", children: "Required" }),
                userRole !== "Student" && studentContext && onSelectStudent && onNavigate && /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: (e) => {
                      e.stopPropagation();
                      handleOpenTaskContext(task, studentContext);
                    },
                    className: "mt-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-2",
                    children: "Go to related student"
                  }
                ),
                showManagerCounselorColumn && /* @__PURE__ */ jsxs("p", { className: "mt-1 text-[11px] text-slate-600 md:hidden", children: [
                  /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-500", children: "Counselor:" }),
                  " ",
                  getPrimaryCounselorLabelForTask(task)
                ] })
              ] })
            ] }) }),
            userRole !== "Student" && /* @__PURE__ */ jsx("td", { className: "px-6 py-4 whitespace-nowrap hidden md:table-cell", children: /* @__PURE__ */ jsx("span", { className: "font-medium", children: studentContext?.name || task.student_id || task.studentId || "—" }) }),
            userRole !== "Student" && /* @__PURE__ */ jsx("td", { className: assignedColumnCellClass, children: (() => {
              const assignees = Array.isArray(task.assigned_to) ? task.assigned_to : [];
              if (assignees.length === 0) {
                return /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400", children: "—" });
              }
              return /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1.5 max-w-[240px]", children: assignees.map((assignee, i) => {
                const label = getAssigneeLabel(assignee);
                return /* @__PURE__ */ jsx("span", { className: "inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-medium text-indigo-700", title: `${label} (${assignee})`, children: label }, `${task.id}-assignee-${i}`);
              }) });
            })() }),
            showManagerCounselorColumn && /* @__PURE__ */ jsx("td", { className: "px-6 py-4 hidden md:table-cell text-slate-800 text-sm max-w-[220px]", children: /* @__PURE__ */ jsx("span", { className: "font-medium line-clamp-2", title: getPrimaryCounselorLabelForTask(task), children: getPrimaryCounselorLabelForTask(task) }) }),
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
              userRole !== "Student" && isTaskOverdueByDate(task) && /* @__PURE__ */ jsxs("div", { className: "flex items-center text-rose-600 text-xs font-bold animate-pulse mr-2", children: [
                /* @__PURE__ */ jsx(AlertCircle, { size: 14, className: "mr-1" }),
                "OVERDUE"
              ] }),
              task.status === "Completed" ? /* @__PURE__ */ jsxs("span", { className: "flex items-center text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1", children: [
                /* @__PURE__ */ jsx(CheckCircle, { size: 12, className: "mr-1" }),
                "Completed"
              ] }) : /* @__PURE__ */ jsxs(
                "select",
                {
                  className: `text-xs border rounded px-2 py-1 font-medium outline-none focus:ring-1 focus:ring-indigo-500
                                                            ${task.status === "In Review" ? "bg-purple-50 text-purple-700 border-purple-200" : task.status === "In Progress" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-slate-600 border-gray-200"}`,
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
              task.status !== "Completed" && /* @__PURE__ */ jsxs("div", { className: `flex items-center text-xs ml-2 ${userRole !== "Student" && isTaskOverdueByDate(task) ? "text-rose-600 font-semibold" : "text-slate-400"}`, children: [
                /* @__PURE__ */ jsx(Clock, { size: 12, className: "mr-1" }),
                task.dueDate || "—"
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
