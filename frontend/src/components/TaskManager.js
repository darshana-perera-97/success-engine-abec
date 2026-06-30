import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState, useRef, useMemo } from "react";
import { AlertCircle, Plus, Upload, CheckCircle, Hourglass, Filter, X } from "lucide-react";
import { Button } from "./Button";
import { CreateTaskModal } from "./CreateTaskModal";
import { filterTasksForMonitoredStudents, formatCalendarDaysRemainingLabel, isTaskDirectlyAssignedToIdentities, isTaskOverdueByDate, resolveCounselorIdentitySet } from "../counselorTaskScope";
import { getCurrentStageSlaDisplay } from "../pipeline";
import { resolveCountryDocConfig } from "../countryDocConfigStore";
import { findTaskDocumentForSlot } from "../taskDocumentRequests";
import { isCounselorEquivalentPortalRole } from "../roles";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "../uploadLimits";

function getCalendarDueSlaParts(task) {
  const completed = String(task?.status || "").trim() === "Completed";
  if (!task?.dueDate) {
    if (completed) return { dateLine: null, subLine: "—", subClass: "text-slate-400" };
    return { dateLine: null, subLine: "No due date", subClass: "text-slate-400" };
  }
  if (completed) return { dateLine: null, subLine: "Completed", subClass: "text-emerald-600 font-medium" };
  const subLine = formatCalendarDaysRemainingLabel(task.dueDate);
  if (subLine.startsWith("Overdue")) return { dateLine: null, subLine, subClass: "text-rose-600 font-semibold" };
  if (subLine === "Due today") return { dateLine: null, subLine, subClass: "text-amber-700 font-medium" };
  return { dateLine: null, subLine, subClass: "text-slate-700" };
}

/**
 * Remaining column: countdown / days-until-due only (no pipeline stage or SLA label row).
 * Prefers live stage SLA for the linked student on open tasks; otherwise calendar due date.
 */
function getTaskSlaParts(task, relatedStudent, nowMs = Date.now()) {
  const completed = String(task?.status || "").trim() === "Completed";
  if (completed) return getCalendarDueSlaParts(task);
  if (relatedStudent) {
    const stageSla = getCurrentStageSlaDisplay(relatedStudent, { now: nowMs, resolveCountryConfig: resolveCountryDocConfig });
    if (stageSla) {
      const subClass =
        stageSla.visualTone === "red"
          ? "text-rose-600 font-semibold"
          : stageSla.visualTone === "orange"
            ? "text-amber-700 font-semibold"
            : "text-slate-700 font-medium";
      return { dateLine: null, subLine: stageSla.text, subClass };
    }
  }
  return getCalendarDueSlaParts(task);
}

const TASK_FILTER_STATUSES = ["Pending", "In Progress", "In Review", "Completed", "Overdue"];
const TASK_FILTER_PRIORITIES = ["High", "Medium", "Low"];

const defaultTaskFilters = {
  search: "",
  status: "All",
  priority: "All",
  counselor: "All",
  country: "All",
  dueFrom: "",
  dueTo: ""
};

function countActiveTaskFilters(filters) {
  let count = 0;
  if (String(filters.search || "").trim()) count += 1;
  if (filters.status !== "All") count += 1;
  if (filters.priority !== "All") count += 1;
  if (filters.counselor !== "All") count += 1;
  if (filters.country !== "All") count += 1;
  if (filters.dueFrom) count += 1;
  if (filters.dueTo) count += 1;
  return count;
}

function taskMatchesDueDateRange(task, dueFrom, dueTo) {
  if (!dueFrom && !dueTo) return true;
  if (!task?.dueDate) return false;
  const due = new Date(String(task.dueDate));
  if (Number.isNaN(due.getTime())) return false;
  due.setHours(0, 0, 0, 0);
  if (dueFrom) {
    const from = new Date(dueFrom);
    from.setHours(0, 0, 0, 0);
    if (due < from) return false;
  }
  if (dueTo) {
    const to = new Date(dueTo);
    to.setHours(0, 0, 0, 0);
    if (due > to) return false;
  }
  return true;
}

function filterTasksByPanel(tasks, filters, { getStudentContextForTask, getStudentLabelForTask }) {
  const search = String(filters.search || "").trim().toLowerCase();
  return (tasks || []).filter((task) => {
    if (search) {
      const taskText = String(task.task || "").toLowerCase();
      const studentLabel = getStudentLabelForTask(task, getStudentContextForTask(task)).toLowerCase();
      if (!taskText.includes(search) && !studentLabel.includes(search)) return false;
    }
    if (filters.status !== "All") {
      if (filters.status === "Overdue") {
        if (!isTaskOverdueByDate(task)) return false;
      } else if (String(task.status || "").trim() !== filters.status) return false;
    }
    if (filters.priority !== "All" && String(task.priority || "").trim() !== filters.priority) return false;
    if (filters.counselor !== "All") {
      const ctx = getStudentContextForTask(task);
      const counselorId = String(ctx?.counselor || "").trim();
      const assignees = Array.isArray(task.assigned_to) ? task.assigned_to : [];
      const matchesCounselor =
        counselorId === filters.counselor ||
        assignees.some((assignee) => String(assignee || "").trim() === filters.counselor);
      if (!matchesCounselor) return false;
    }
    if (filters.country !== "All") {
      const ctx = getStudentContextForTask(task);
      if (String(ctx?.country || "").trim() !== filters.country) return false;
    }
    if (!taskMatchesDueDateRange(task, filters.dueFrom, filters.dueTo)) return false;
    return true;
  });
}

const TaskManager = ({
  userRole = "Admin",
  tasks = [],
  student,
  onUpdateStudent,
  onAddActivity,
  currentUser,
  counselorIdentitySet = null,
  selectedTaskId,
  onUpdateTasks,
  onAddTask,
  monitoredStudents = [],
  employees = [],
  onSelectStudent,
  onNavigate,
  onUploadStudentDocument,
  wrapClassName = ""
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [showCompletedTasks, setShowCompletedTasks] = useState(true);
  const [onlyMyAssignedTasks, setOnlyMyAssignedTasks] = useState(false);
  const [taskFilters, setTaskFilters] = useState(defaultTaskFilters);
  const [taskFiltersOpen, setTaskFiltersOpen] = useState(false);
  const [slaClock, setSlaClock] = useState(() => Date.now());
  const [studentTaskUploadError, setStudentTaskUploadError] = useState("");
  const [studentTaskUploadingKey, setStudentTaskUploadingKey] = useState("");
  const studentTaskFileRefs = useRef({});
  useEffect(() => {
    if (typeof window === "undefined") return void 0;
    const id = window.setInterval(() => setSlaClock(Date.now()), 3e4);
    return () => window.clearInterval(id);
  }, []);
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
  const getStudentContextForTask = (task) => {
    const sid = String(task?.student_id || task?.studentId || "").trim();
    return (
      (sid ? studentLookup[sid] : null) ||
      (userRole === "Student" && student && String(student.id || "").trim() === sid ? student : null) ||
      null
    );
  };
  const getStudentLabelForTask = (task, studentContext) => {
    if (studentContext) {
      const label = String(studentContext.name || studentContext.email || "").trim();
      if (label) return label;
      const id = String(studentContext.id || "").trim();
      if (id) return id;
    }
    const fromTask = String(task?.studentName || task?.student_name || "").trim();
    if (fromTask) return fromTask;
    const sid = String(task?.student_id || task?.studentId || "").trim();
    return sid || "—";
  };
  const tableColSpan = userRole === "Student" ? 4 : 6;
  const assignedColumnHeaderClass =
    userRole === "Manager"
      ? "px-6 py-3 whitespace-nowrap hidden md:table-cell"
      : "px-6 py-3 whitespace-nowrap hidden lg:table-cell";
  const assignedColumnCellClass =
    userRole === "Manager"
      ? "px-6 py-4 hidden md:table-cell"
      : "px-6 py-4 hidden lg:table-cell";
  const roleScopedTasks = (() => {
    if (userRole === "Admin") return tasks;
    if (userRole === "Manager") {
      return tasks.filter((task) => task.priority === "High" || task.status === "Overdue" || task.status === "In Review");
    }
    if (isCounselorEquivalentPortalRole(userRole) || userRole === "Country Coordinator") {
      return filterTasksForMonitoredStudents(tasks, monitoredStudents);
    }
    if (userRole === "Student") {
      return tasks.filter((task) => task.student_id === student?.id && !task.isPrivate);
    }
    return [];
  })();
  const showMyAssignedToggle =
    isCounselorEquivalentPortalRole(userRole) || userRole === "Country Coordinator";
  const myIdentitySet = useMemo(
    () => resolveCounselorIdentitySet(currentUser, counselorIdentitySet),
    [currentUser, counselorIdentitySet]
  );
  const assigneeScopedTasks =
    showMyAssignedToggle && onlyMyAssignedTasks
      ? roleScopedTasks.filter((task) => isTaskDirectlyAssignedToIdentities(task, myIdentitySet))
      : roleScopedTasks;
  const showTaskFilters = userRole === "Admin" || userRole === "Manager";
  const activeTaskFilterCount = useMemo(() => countActiveTaskFilters(taskFilters), [taskFilters]);
  const taskFilterOptions = useMemo(() => {
    const counselorMap = new Map();
    const countries = new Set();
    for (const task of assigneeScopedTasks) {
      const ctx = getStudentContextForTask(task);
      if (!ctx) continue;
      const counselorId = String(ctx.counselor || "").trim();
      if (counselorId) {
        counselorMap.set(counselorId, getAssigneeLabel(counselorId));
      }
      const country = String(ctx.country || "").trim();
      if (country) countries.add(country);
    }
    return {
      counselors: [...counselorMap.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      countries: [...countries].sort((a, b) => a.localeCompare(b))
    };
  }, [assigneeScopedTasks, studentLookup, employees]);
  const completedFilteredTasks = showCompletedTasks
    ? assigneeScopedTasks
    : assigneeScopedTasks.filter((task) => String(task?.status || "").trim() !== "Completed");
  const filteredTasks = showTaskFilters
    ? filterTasksByPanel(completedFilteredTasks, taskFilters, {
        getStudentContextForTask,
        getStudentLabelForTask
      })
    : completedFilteredTasks;
  const updateTaskFilter = (key, value) => {
    setTaskFilters((prev) => ({ ...prev, [key]: value }));
  };
  const resetTaskFilters = () => {
    setTaskFilters(defaultTaskFilters);
  };
  useEffect(() => {
    if (!taskFiltersOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setTaskFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [taskFiltersOpen]);
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
  const emptyTasksMessage =
    filteredTasks.length === 0 && completedFilteredTasks.length > 0 && showTaskFilters && activeTaskFilterCount > 0
      ? "No tasks match the current filters."
      : filteredTasks.length === 0 && assigneeScopedTasks.length > 0 && !showCompletedTasks
        ? "No active tasks. Turn Completed tasks on to see finished items."
        : filteredTasks.length === 0 && onlyMyAssignedTasks && roleScopedTasks.length > 0
          ? "No tasks are assigned directly to you. Turn off Assigned to me to see your full pipeline queue."
          : "No tasks found.";
  const studentTaskDocTasks =
    userRole === "Student" && student
      ? studentTasks.filter(
          (t) =>
            t.requiresStudentDocuments &&
            Array.isArray(t.taskDocumentRequests) &&
            t.taskDocumentRequests.length > 0 &&
            String(t.status || "") !== "Completed"
        )
      : [];
  const setStudentTaskFileRef = (key, el) => {
    if (el) studentTaskFileRefs.current[key] = el;
  };
  const handleStudentTaskSlotUpload = async (task, slot, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !student?.id || !onUploadStudentDocument) return;
    const key = `${task.id}::${slot.id}`;
    setStudentTaskUploadError("");
    const allowedTypes = new Set([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]);
    if (!allowedTypes.has(file.type)) {
      setStudentTaskUploadError("Use PDF, JPG, PNG, DOC, or DOCX.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStudentTaskUploadError(`File must be under ${MAX_UPLOAD_LABEL}.`);
      return;
    }
    setStudentTaskUploadingKey(key);
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read_error"));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) {
      setStudentTaskUploadingKey("");
      setStudentTaskUploadError("Unable to read file. Try again.");
      return;
    }
    const taskDocumentLink = {
      taskId: String(task.id || ""),
      slotId: String(slot.id || ""),
      label: String(slot.label || "").trim()
    };
    const result = await onUploadStudentDocument({
      studentId: student.id,
      dataUrl,
      fileName: file.name,
      docType: `taskDoc__${taskDocumentLink.taskId}__${taskDocumentLink.slotId}`,
      phase: 1,
      tier: "TaskRequest",
      taskDocumentLink
    });
    setStudentTaskUploadingKey("");
    if (!result?.ok) {
      setStudentTaskUploadError(result?.error || "Upload failed.");
      return;
    }
    if (onUpdateTasks && String(task.status || "") !== "Completed") {
      onUpdateTasks([{ ...task, status: "In Review" }]);
    }
    if (onAddActivity) {
      onAddActivity({
        user: student.name,
        role: "Student",
        action: "uploaded task document",
        target: slot.label || task.task,
        type: "upload"
      });
    }
  };
  const rootClass = ["space-y-6 animate-in fade-in duration-500", wrapClassName].filter(Boolean).join(" ");
  const managerTitleClass = "text-xl font-semibold tracking-tight text-[#0F172A]";
  const defaultTitleClass = "text-2xl font-semibold tracking-tight text-[#0F172A]";
  const pipelineTasksTitle =
    userRole === "Student"
      ? "My Action Plan"
      : userRole === "Manager"
        ? "Task Desk"
        : showMyAssignedToggle
          ? "Pipeline Tasks"
          : "Task Manager";
  return /* @__PURE__ */ jsxs("div", { className: rootClass, children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap justify-between items-start gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        userRole === "Manager"
          ? /* @__PURE__ */ jsx("h2", { className: managerTitleClass, children: pipelineTasksTitle })
          : /* @__PURE__ */ jsx("h1", { className: defaultTitleClass, children: pipelineTasksTitle }),
        /* @__PURE__ */ jsx("p", {
          className: userRole === "Manager" ? "text-sm text-slate-500 mt-1 max-w-2xl" : "text-sm text-slate-500 mt-1",
          children: userRole === "Manager" ? "High priority items requiring attention." : "Track your to-do list and SLAs."
        })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-3 sm:gap-4 shrink-0", children: [
        showTaskFilters &&
          /* @__PURE__ */ jsxs(Button, {
            type: "button",
            variant: "outline",
            size: "sm",
            onClick: () => setTaskFiltersOpen(true),
            children: /* @__PURE__ */ jsxs("span", {
              className: "inline-flex items-center gap-1.5",
              children: [
                /* @__PURE__ */ jsx(Filter, { size: 14 }),
                "Filters",
                activeTaskFilterCount > 0
                  ? /* @__PURE__ */ jsx("span", {
                      className:
                        "inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold",
                      children: activeTaskFilterCount
                    })
                  : null
              ]
            })
          }),
        showMyAssignedToggle &&
          /* @__PURE__ */ jsxs("div", {
            className: "inline-flex items-center gap-2.5 select-none",
            children: [
              /* @__PURE__ */ jsx("span", { className: "text-sm text-slate-600", children: "Assigned to me" }),
              /* @__PURE__ */ jsx("button", {
                type: "button",
                role: "switch",
                "aria-checked": onlyMyAssignedTasks,
                "aria-label": "Show only tasks assigned to me",
                onClick: () => setOnlyMyAssignedTasks((v) => !v),
                className: [
                  "relative inline-block h-7 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
                  onlyMyAssignedTasks ? "bg-indigo-600" : "bg-slate-300"
                ].join(" "),
                children: /* @__PURE__ */ jsx("span", {
                  className: [
                    "pointer-events-none absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ease-in-out",
                    onlyMyAssignedTasks ? "translate-x-4" : "translate-x-0"
                  ].join(" "),
                  "aria-hidden": true
                })
              }),
              /* @__PURE__ */ jsx("span", {
                className: `text-xs font-medium tabular-nums ${onlyMyAssignedTasks ? "text-indigo-700" : "text-slate-400"}`,
                children: onlyMyAssignedTasks ? "On" : "Off"
              })
            ]
          }),
        /* @__PURE__ */ jsxs("div", {
          className: "inline-flex items-center gap-2.5 select-none",
          children: [
            /* @__PURE__ */ jsx("span", { className: "text-sm text-slate-600", children: "Completed tasks" }),
            /* @__PURE__ */ jsx("button", {
              type: "button",
              role: "switch",
              "aria-checked": showCompletedTasks,
              "aria-label": "Show completed tasks",
              onClick: () => setShowCompletedTasks((v) => !v),
              className: [
                "relative inline-block h-7 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
                showCompletedTasks ? "bg-indigo-600" : "bg-slate-300"
              ].join(" "),
              children: /* @__PURE__ */ jsx("span", {
                className: [
                  "pointer-events-none absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ease-in-out",
                  showCompletedTasks ? "translate-x-4" : "translate-x-0"
                ].join(" "),
                "aria-hidden": true
              })
            }),
            /* @__PURE__ */ jsx("span", {
              className: `text-xs font-medium tabular-nums ${showCompletedTasks ? "text-indigo-700" : "text-slate-400"}`,
              children: showCompletedTasks ? "On" : "Off"
            })
          ]
        }),
        userRole !== "Student" && /* @__PURE__ */ jsxs(Button, { onClick: () => setIsCreateModalOpen(true), children: [
          /* @__PURE__ */ jsx(Plus, { size: 16, className: "mr-2" }),
          "New Task"
        ] })
      ] })
    ] }),
    showTaskFilters && activeTaskFilterCount > 0
      ? /* @__PURE__ */ jsxs("div", {
          className: "flex flex-wrap items-center gap-2 text-[11px] text-slate-500",
          children: [
            /* @__PURE__ */ jsxs("span", {
              children: [activeTaskFilterCount, " filter", activeTaskFilterCount === 1 ? "" : "s", " active"]
            }),
            /* @__PURE__ */ jsx("button", {
              type: "button",
              className: "text-indigo-600 hover:text-indigo-800 font-medium",
              onClick: resetTaskFilters,
              children: "Clear all"
            })
          ]
        })
      : null,
    studentTaskDocTasks.length > 0 &&
      /* @__PURE__ */ jsxs("div", {
        className: "rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 space-y-3",
        children: [
          /* @__PURE__ */ jsx("h3", {
            className: "text-sm font-bold text-indigo-900",
            children: "Documents your counselor requested"
          }),
          /* @__PURE__ */ jsx("p", {
            className: "text-xs text-indigo-800/90",
            children: "Upload each item below. Files go to your counselor for review."
          }),
          studentTaskUploadError &&
            /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-600", children: studentTaskUploadError }),
          ...studentTaskDocTasks.map((task) =>
            /* @__PURE__ */ jsxs(
              "div",
              {
                key: task.id,
                className: "rounded-lg border border-indigo-100 bg-white p-3 space-y-2",
                children: [
                  /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold text-slate-800", children: task.task }),
                  ...(task.taskDocumentRequests || []).map((slot) => {
                    const doc = findTaskDocumentForSlot(student?.documents, task.id, slot.id);
                    const fkey = `${task.id}::${slot.id}`;
                    const busy = studentTaskUploadingKey === fkey;
                    return /* @__PURE__ */ jsxs(
                      "div",
                      {
                        key: fkey,
                        className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2",
                        children: [
                          /* @__PURE__ */ jsxs("div", {
                            className: "min-w-0",
                            children: [
                              /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-800", children: slot.label }),
                              doc &&
                                /* @__PURE__ */ jsx("p", {
                                  className: "text-[10px] text-slate-500 mt-0.5",
                                  children: ["Status: ", doc.status || "Pending"]
                                })
                            ]
                          }),
                          /* @__PURE__ */ jsxs("div", {
                            className: "flex items-center gap-2 shrink-0",
                            children: [
                              /* @__PURE__ */ jsx("input", {
                                ref: (el) => setStudentTaskFileRef(fkey, el),
                                type: "file",
                                accept: ".pdf,.png,.jpg,.jpeg,.doc,.docx",
                                className: "hidden",
                                onChange: (e) => handleStudentTaskSlotUpload(task, slot, e)
                              }),
                              (!doc || doc.status === "Rejected") &&
                                /* @__PURE__ */ jsxs(Button, {
                                  size: "sm",
                                  variant: "secondary",
                                  disabled: busy,
                                  onClick: () => studentTaskFileRefs.current[fkey]?.click(),
                                  children: [
                                    /* @__PURE__ */ jsx(Upload, { size: 14, className: "mr-1" }),
                                    busy ? "Uploading…" : doc?.status === "Rejected" ? "Re-upload" : "Upload"
                                  ]
                                })
                            ]
                          })
                        ]
                      });
                  })
                ]
              })
          )
        ]
      }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden", children: [
      /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm text-left", children: [
        /* @__PURE__ */ jsx("thead", { className: "bg-gray-50 border-b border-gray-200 text-slate-500", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "px-6 py-3 whitespace-nowrap", children: "Task" }),
          userRole !== "Student" && /* @__PURE__ */ jsx("th", {
            className: "px-6 py-3 whitespace-nowrap min-w-[8rem]",
            children: "Student"
          }),
          userRole !== "Student" && /* @__PURE__ */ jsx("th", {
            className: assignedColumnHeaderClass,
            title: "Student's counselor (case owner), or task assignees if no counselor is set on the student.",
            children: "Assigned"
          }),
          /* @__PURE__ */ jsx("th", {
            className: "px-6 py-3 whitespace-nowrap min-w-[7.5rem]",
            title:
              "Remaining time until the stage SLA deadline (linked student) or until the task due date; overdue when past due.",
            children: "Remaining"
          }),
          /* @__PURE__ */ jsx("th", { className: "px-6 py-3 whitespace-nowrap hidden sm:table-cell", children: "Priority" }),
          /* @__PURE__ */ jsx("th", { className: "px-6 py-3 whitespace-nowrap", children: "Status" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-100", children: studentTasks.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: tableColSpan, className: "px-6 py-10 text-center text-slate-500", children: emptyTasksMessage }) }) : studentTasks.map((task) => {
          const studentContext = getStudentContextForTask(task);
          const studentLabel = getStudentLabelForTask(task, studentContext);
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
          const slaParts = getTaskSlaParts(task, studentContext, slaClock);
          return /* @__PURE__ */ jsxs("tr", { "data-task-row-id": String(task.id ?? ""), className: `transition-colors ${isLocked ? "bg-gray-50 opacity-60" : "hover:bg-slate-50"} ${selectedTaskId === task.id ? "bg-indigo-50 ring-2 ring-inset ring-indigo-500" : ""}`, children: [
            /* @__PURE__ */ jsx("td", { className: "px-6 py-4 min-w-[200px]", children: /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("p", { className: `font-medium ${isTaskCompleted ? "text-slate-500 line-through" : "text-slate-900"}`, children: task.task }),
                task.isBlocking && !isTaskCompleted && /* @__PURE__ */ jsx("span", { className: "text-[10px] text-rose-600 font-bold uppercase tracking-wide", children: "Required" }),
                userRole !== "Student" && /* @__PURE__ */ jsxs("p", { className: "mt-1 text-[11px] text-slate-600 sm:hidden", children: [
                  /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-500", children: "Student:" }),
                  " ",
                  studentLabel
                ] }),
                userRole === "Manager" && /* @__PURE__ */ jsxs("p", { className: "mt-1 text-[11px] text-slate-600 md:hidden", children: [
                  /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-500", children: "Assigned:" }),
                  " ",
                  getPrimaryCounselorLabelForTask(task)
                ] })
            ] }) }),
            userRole !== "Student" && /* @__PURE__ */ jsx("td", {
              className: "px-6 py-4 hidden sm:table-cell min-w-[8rem] max-w-[200px]",
              children:
                studentLabel === "—"
                  ? /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400", children: "—" })
                  : studentContext && onSelectStudent && onNavigate
                    ? /* @__PURE__ */ jsx(
                        "button",
                        {
                          type: "button",
                          onClick: (e) => {
                            e.stopPropagation();
                            handleOpenTaskContext(task, studentContext);
                          },
                          className: "text-left font-medium text-indigo-600 hover:text-indigo-800 hover:underline underline-offset-2 line-clamp-2",
                          title: studentLabel,
                          children: studentLabel
                        }
                      )
                    : /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-800 line-clamp-2", title: studentLabel, children: studentLabel })
            }),
            userRole !== "Student" && /* @__PURE__ */ jsx("td", {
              className: `${assignedColumnCellClass} text-slate-800 text-sm max-w-[260px]`,
              children: (() => {
                const label = getPrimaryCounselorLabelForTask(task);
                if (label === "—") {
                  return /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400", children: "—" });
                }
                return /* @__PURE__ */ jsx("span", { className: "font-medium line-clamp-2", title: label, children: label });
              })()
            }),
            /* @__PURE__ */ jsx("td", { className: "px-6 py-4 text-xs min-w-[7.5rem]", children: /* @__PURE__ */ jsx("span", { className: slaParts.subClass, children: slaParts.subLine }) }),
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
            ] }) : task.requiresStudentDocuments ? /* @__PURE__ */ jsxs("span", {
              className: `inline-flex items-center text-xs font-semibold px-2 py-1 rounded-full ${
                task.status === "Completed"
                  ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                  : task.status === "In Review"
                    ? "text-purple-700 bg-purple-50 border border-purple-200"
                    : "text-slate-600 bg-slate-50 border border-slate-200"
              }`,
              children: [
                task.status === "Completed" && /* @__PURE__ */ jsx(CheckCircle, { size: 12, className: "mr-1" }),
                task.status === "In Review" && /* @__PURE__ */ jsx(Hourglass, { size: 12, className: "mr-1" }),
                task.status || "Pending"
              ]
            }) : task.documentType ? /* @__PURE__ */ jsxs(Button, { size: "sm", className: "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-100 border-none", onClick: () => handleStudentUpload(task), children: [
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
              )
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
    ),
    showTaskFilters && taskFiltersOpen
      ? /* @__PURE__ */ jsx("div", {
          className:
            "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200",
          onClick: () => setTaskFiltersOpen(false),
          children: /* @__PURE__ */ jsxs("div", {
            className:
              "bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto",
            onClick: (e) => e.stopPropagation(),
            children: [
              /* @__PURE__ */ jsxs("div", {
                className: "flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100",
                children: [
                  /* @__PURE__ */ jsxs("div", {
                    children: [
                      /* @__PURE__ */ jsx("h4", {
                        className: "text-base font-semibold text-slate-900",
                        children: "Filter tasks"
                      }),
                      /* @__PURE__ */ jsx("p", {
                        className: "text-xs text-slate-500 mt-0.5",
                        children: "Narrow tasks by student, status, priority, counselor, country, or due date."
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx("button", {
                    type: "button",
                    className:
                      "p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors",
                    "aria-label": "Close filters",
                    onClick: () => setTaskFiltersOpen(false),
                    children: /* @__PURE__ */ jsx(X, { size: 18 })
                  })
                ]
              }),
              /* @__PURE__ */ jsxs("div", {
                className: "grid grid-cols-1 sm:grid-cols-2 gap-3 p-5",
                children: [
                  /* @__PURE__ */ jsxs("label", { className: "block sm:col-span-2", children: [
                    /* @__PURE__ */ jsx("span", {
                      className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
                      children: "Search"
                    }),
                    /* @__PURE__ */ jsx("input", {
                      type: "search",
                      value: taskFilters.search,
                      onChange: (e) => updateTaskFilter("search", e.target.value),
                      placeholder: "Task title or student name",
                      className:
                        "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { className: "block", children: [
                    /* @__PURE__ */ jsx("span", {
                      className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
                      children: "Status"
                    }),
                    /* @__PURE__ */ jsxs("select", {
                      value: taskFilters.status,
                      onChange: (e) => updateTaskFilter("status", e.target.value),
                      className:
                        "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      children: [
                        /* @__PURE__ */ jsx("option", { value: "All", children: "All statuses" }),
                        ...TASK_FILTER_STATUSES.map((status) =>
                          /* @__PURE__ */ jsx("option", { value: status, children: status }, status)
                        )
                      ]
                    })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { className: "block", children: [
                    /* @__PURE__ */ jsx("span", {
                      className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
                      children: "Priority"
                    }),
                    /* @__PURE__ */ jsxs("select", {
                      value: taskFilters.priority,
                      onChange: (e) => updateTaskFilter("priority", e.target.value),
                      className:
                        "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      children: [
                        /* @__PURE__ */ jsx("option", { value: "All", children: "All priorities" }),
                        ...TASK_FILTER_PRIORITIES.map((priority) =>
                          /* @__PURE__ */ jsx("option", { value: priority, children: priority }, priority)
                        )
                      ]
                    })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { className: "block", children: [
                    /* @__PURE__ */ jsx("span", {
                      className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
                      children: "Counselor"
                    }),
                    /* @__PURE__ */ jsxs("select", {
                      value: taskFilters.counselor,
                      onChange: (e) => updateTaskFilter("counselor", e.target.value),
                      className:
                        "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      children: [
                        /* @__PURE__ */ jsx("option", { value: "All", children: "All counselors" }),
                        ...taskFilterOptions.counselors.map((counselor) =>
                          /* @__PURE__ */ jsx("option", { value: counselor.id, children: counselor.label }, counselor.id)
                        )
                      ]
                    })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { className: "block", children: [
                    /* @__PURE__ */ jsx("span", {
                      className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
                      children: "Country"
                    }),
                    /* @__PURE__ */ jsxs("select", {
                      value: taskFilters.country,
                      onChange: (e) => updateTaskFilter("country", e.target.value),
                      className:
                        "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      children: [
                        /* @__PURE__ */ jsx("option", { value: "All", children: "All countries" }),
                        ...taskFilterOptions.countries.map((country) =>
                          /* @__PURE__ */ jsx("option", { value: country, children: country }, country)
                        )
                      ]
                    })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { className: "block", children: [
                    /* @__PURE__ */ jsx("span", {
                      className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
                      children: "Due from"
                    }),
                    /* @__PURE__ */ jsx("input", {
                      type: "date",
                      value: taskFilters.dueFrom,
                      onChange: (e) => updateTaskFilter("dueFrom", e.target.value),
                      className:
                        "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { className: "block", children: [
                    /* @__PURE__ */ jsx("span", {
                      className: "text-[10px] font-bold uppercase tracking-wide text-slate-500",
                      children: "Due to"
                    }),
                    /* @__PURE__ */ jsx("input", {
                      type: "date",
                      value: taskFilters.dueTo,
                      onChange: (e) => updateTaskFilter("dueTo", e.target.value),
                      className:
                        "mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    })
                  ] })
                ]
              }),
              /* @__PURE__ */ jsxs("div", {
                className:
                  "px-5 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-4 mx-5",
                children: [
                  /* @__PURE__ */ jsx("p", {
                    className: "text-[11px] text-slate-500",
                    children:
                      completedFilteredTasks.length > 0
                        ? `Showing ${filteredTasks.length} of ${completedFilteredTasks.length} tasks.`
                        : "No tasks in the current view."
                  }),
                  /* @__PURE__ */ jsxs("div", {
                    className: "flex items-center gap-2 shrink-0",
                    children: [
                      /* @__PURE__ */ jsx(Button, {
                        type: "button",
                        variant: "ghost",
                        size: "sm",
                        onClick: resetTaskFilters,
                        children: "Reset"
                      }),
                      /* @__PURE__ */ jsx(Button, {
                        type: "button",
                        size: "sm",
                        onClick: () => setTaskFiltersOpen(false),
                        children: "Done"
                      })
                    ]
                  })
                ]
              })
            ]
          })
        })
      : null
  ] });
};
export {
  TaskManager
};
