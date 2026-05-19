import { useEffect, useMemo, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { Clock, Users, CheckCircle, ArrowRight, CheckSquare, AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { LeaderboardWidget } from "./LeaderboardWidget";
import { getChats } from "../authApi";
import InquiryCaptureFlowModals, { InquirySlaBadge } from "./InquiryCaptureFlowModals";
import { filterTasksForCounselor, isTaskOverdueByDate } from "../counselorTaskScope";
import {
  PIPELINE_STEPS,
  normalizePipelineStatus,
  computePipelineEscalations,
  computePipelineStageCounts,
  countOpenSlaRequirementViolations
} from "../pipeline";
const DAY_MS = 86400000;
function localDayStartMs(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function parseIsoMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}
function isNewStudentIntakeTask(task) {
  return /new student intake/i.test(String(task?.task || ""));
}
function CounselorWeeklyActivityTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return /* @__PURE__ */ jsxs("div", {
    className: "rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] shadow-sm",
    children: [
      /* @__PURE__ */ jsx("div", { className: "font-semibold text-slate-800 mb-1", children: p.name }),
      /* @__PURE__ */ jsxs("div", { className: "text-slate-600 tabular-nums", children: ["Tasks completed: ", p.tasks] }),
      /* @__PURE__ */ jsxs("div", { className: "text-slate-600 tabular-nums", children: ["Messages sent: ", p.messages] }),
      /* @__PURE__ */ jsxs("div", { className: "text-slate-500 mt-1 pt-1 border-t border-slate-100 tabular-nums", children: ["Total: ", p.total] })
    ]
  });
}
const PRIORITY_ACTION_ITEMS_LIMIT = 7;
const CounselorDashboard = ({
  onNavigate,
  tasks,
  currentUser,
  counselorIdentitySet = null,
  students,
  allStudents = students,
  employees = [],
  onSelectStudent,
  onSelectTask,
  onOpenStudentTask,
  assignmentAlerts = [],
  onDismissAssignmentAlert,
  onUpdateStudent,
  onStudentMovedToRequests
}) => {
  const [chatMessages, setChatMessages] = useState([]);
  const [clockTick, setClockTick] = useState(0);
  const [inquiryTarget, setInquiryTarget] = useState(null);
  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let cancelled = false;
    const uid = String(currentUser?.id || "").trim();
    if (!uid) {
      setChatMessages([]);
      return;
    }
    const load = async () => {
      const result = await getChats(uid);
      if (cancelled || !result.ok) return;
      setChatMessages(result.data || []);
    };
    load();
    const t = setInterval(load, 5e3);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [currentUser?.id]);
  const myStudents = students;
  const stageEscalations = useMemo(() => computePipelineEscalations(myStudents || []), [myStudents]);
  const myTasks = filterTasksForCounselor(tasks, currentUser, myStudents, counselorIdentitySet);
  const overdueTasksCount = myTasks.filter((t) => isTaskOverdueByDate(t)).length;
  const totalUnresolvedViolations = myStudents.reduce((acc, s) => acc + countOpenSlaRequirementViolations(s), 0);
  const slaScore = Math.max(0, 100 - overdueTasksCount * 5 - totalUnresolvedViolations * 2);
  const overdueTasks = myTasks.filter((t) => isTaskOverdueByDate(t));
  const overdueTasksSorted = useMemo(() => {
    const list = [...overdueTasks];
    const dueMs = (t) => {
      if (!t.dueDate) return t.status === "Overdue" ? 0 : Number.MAX_SAFE_INTEGER;
      const ms = new Date(String(t.dueDate)).getTime();
      return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
    };
    list.sort((a, b) => dueMs(a) - dueMs(b) || String(a.id || "").localeCompare(String(b.id || "")));
    return list;
  }, [overdueTasks]);
  const pendingTasks = myTasks.filter(
    (t) =>
      t.status === "Pending" ||
      t.status === "In Progress" ||
      t.status === "In Review" ||
      t.status === "Overdue"
  );
  const pendingTasksOpen = myTasks.filter((t) => t.status === "Pending" || t.status === "In Progress");
  const completedTasks = myTasks.filter((t) => t.status === "Completed");
  const pendingReviewTasks = myTasks.filter((t) => t.status === "In Review");
  const itemsReviewed = myTasks.filter((t) => {
    if (t.status !== "Completed") return false;
    if (t.documentType) return true;
    return /review/i.test(String(t.task || ""));
  }).length;
  const studentIdSet = new Set(
    (myStudents || []).map((s) => String(s.id || "").trim()).filter(Boolean)
  );
  const counselorId = String(currentUser?.id || "").trim();
  const inboundFromStudents = chatMessages.filter((m) => {
    return studentIdSet.has(String(m.senderId || "")) && String(m.receiverId || "") === counselorId;
  }).length;
  const counselorReplies = chatMessages.filter((m) => {
    const fromCounselor = String(m.senderId || "") === counselorId;
    const toStudent = studentIdSet.has(String(m.receiverId || ""));
    const hasBody = (String(m.content || "").trim().length > 0 || m.attachment);
    return fromCounselor && toStudent && hasBody;
  }).length;
  const reviewDenominator = itemsReviewed + pendingReviewTasks.length;
  const reviewScore = reviewDenominator > 0 ? itemsReviewed / reviewDenominator * 100 : 100;
  const totalMyTasks = myTasks.length;
  const taskCompletionPct = totalMyTasks > 0 ? completedTasks.length / totalMyTasks * 100 : 100;
  const chatScore = inboundFromStudents > 0 ? Math.min(100, counselorReplies / Math.max(1, inboundFromStudents) * 100) : 100;
  const baseActivity = 0.4 * taskCompletionPct + 0.3 * chatScore + 0.3 * reviewScore;
  const performanceScore = Math.max(0, Math.min(100, Math.round(baseActivity / 100 * slaScore)));
  const pipelineStageCounts = useMemo(() => computePipelineStageCounts(myStudents || []), [myStudents]);
  const pipelineHealthRows = useMemo(() => {
    const palette = ["#6366F1", "#F59E0B", "#A855F7", "#F97316", "#14B8A6", "#22C55E", "#38BDF8"];
    const rows = PIPELINE_STEPS.map((stage, idx) => ({
      stage,
      count: pipelineStageCounts.byStage[stage] ?? 0,
      color: palette[idx % palette.length]
    }));
    if (pipelineStageCounts.other > 0) {
      rows.push({
        stage: "Other / unmapped",
        count: pipelineStageCounts.other,
        color: "#94A3B8"
      });
    }
    return rows;
  }, [pipelineStageCounts]);
  const inquiryStageStudents = myStudents.filter((student) => normalizePipelineStatus(student?.status) === "Inquiry");
  const studentById = useMemo(() => {
    const map = new Map();
    for (const s of allStudents || []) {
      const sid = String(s?.id || "").trim();
      if (sid) map.set(sid, s);
    }
    return map;
  }, [allStudents]);
  const reassignedAlertStudentIds = useMemo(() => {
    const set = /* @__PURE__ */ new Set();
    for (const a of assignmentAlerts || []) {
      if (a?.type === "reassigned") set.add(String(a.studentId || "").trim());
    }
    return set;
  }, [assignmentAlerts]);
  const assignmentAlertsForPanel = useMemo(() => {
    const inquiryIds = new Set(
      inquiryStageStudents.map((s) => String(s.id || "").trim()).filter(Boolean)
    );
    return (assignmentAlerts || []).filter((a) => {
      const sid = String(a.studentId || "").trim();
      if (!sid) return true;
      if (a.type === "new" && inquiryIds.has(sid)) return false;
      return true;
    });
  }, [assignmentAlerts, inquiryStageStudents]);
  const inquiryStageStudentsForPanel = useMemo(() => {
    return inquiryStageStudents.filter((s) => {
      const sid = String(s.id || "").trim();
      return !reassignedAlertStudentIds.has(sid);
    });
  }, [inquiryStageStudents, reassignedAlertStudentIds]);
  const priorityActionList = useMemo(() => {
    const items = [];
    for (const alert of assignmentAlertsForPanel) {
      items.push({ kind: "alert", alert });
    }
    for (const student of inquiryStageStudentsForPanel) {
      items.push({ kind: "inquiry", student });
    }
    for (const task of pendingTasks) {
      if (!isNewStudentIntakeTask(task)) items.push({ kind: "task", task });
    }
    const total = items.length;
    const shown = total > PRIORITY_ACTION_ITEMS_LIMIT ? items.slice(-PRIORITY_ACTION_ITEMS_LIMIT) : items;
    return { shown, total };
  }, [assignmentAlertsForPanel, inquiryStageStudentsForPanel, pendingTasks]);
  const nowMs = useMemo(() => Date.now(), [clockTick]);
  const openInquiryPopup = (alert) => {
    const studentId = String(alert?.studentId || "").trim();
    if (!studentId) return;
    const student =
      (allStudents || []).find((s) => String(s.id || "").trim() === studentId) ||
      (students || []).find((s) => String(s.id || "").trim() === studentId);
    if (!student) return;
    setInquiryTarget({
      student,
      assignmentAlert: alert,
      _key: `${String(alert?.id || "inquiry")}-${Date.now()}`
    });
  };
  const weeklyActivityData = useMemo(() => {
    const scopedTasks = filterTasksForCounselor(tasks, currentUser, myStudents, counselorIdentitySet);
    const now = Date.now();
    const today0 = localDayStartMs(now);
    const dayStarts = [];
    for (let i = 6; i >= 0; i--) {
      dayStarts.push(today0 - i * DAY_MS);
    }
    const minTs = dayStarts[0];
    const maxTs = dayStarts[6] + DAY_MS;
    const rows = dayStarts.map((dayStart) => ({
      name: new Date(dayStart).toLocaleDateString(undefined, { weekday: "short" }),
      dayStart,
      tasks: 0,
      messages: 0,
      total: 0
    }));
    const sidSet = new Set((myStudents || []).map((s) => String(s?.id || "").trim()).filter(Boolean));
    const uid = String(currentUser?.id || "").trim();
    for (const task of scopedTasks || []) {
      if (String(task?.status || "") !== "Completed") continue;
      const ts = parseIsoMs(task.completedAt || task.completed_at || task.updatedAt);
      if (ts == null || ts < minTs || ts >= maxTs) continue;
      const idx = dayStarts.indexOf(localDayStartMs(ts));
      if (idx >= 0) {
        rows[idx].tasks += 1;
        rows[idx].total += 1;
      }
    }
    for (const m of chatMessages || []) {
      if (!uid || String(m?.senderId || "") !== uid) continue;
      if (!sidSet.has(String(m?.receiverId || "").trim())) continue;
      const hasBody = String(m?.content || "").trim().length > 0 || m?.attachment;
      if (!hasBody) continue;
      const ts = parseIsoMs(m.timestamp || m.createdAt);
      if (ts == null || ts < minTs || ts >= maxTs) continue;
      const idx = dayStarts.indexOf(localDayStartMs(ts));
      if (idx >= 0) {
        rows[idx].messages += 1;
        rows[idx].total += 1;
      }
    }
    return rows.map(({ name, tasks, messages, total }) => ({ name, tasks, messages, total }));
  }, [tasks, chatMessages, myStudents, currentUser, counselorIdentitySet]);
  const openStudentProfileById = (studentId) => {
    const sid = String(studentId || "").trim();
    if (!sid || typeof onSelectStudent !== "function") return;
    const scoped = (students || []).find((s) => String(s.id || "").trim() === sid);
    const student =
      scoped || studentById.get(sid) || (allStudents || []).find((s) => String(s.id || "").trim() === sid);
    if (student) onSelectStudent(student);
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6 animate-in fade-in duration-500", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("h1", { className: "text-2xl font-semibold tracking-tight text-[#0F172A]", children: [
          "Welcome back, ",
          currentUser?.name || "Sarah"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mt-1", children: "Here's what's on your plate today." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "text-left sm:text-right", children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold text-slate-400 uppercase tracking-wider", children: "Your Performance" }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-start sm:items-end gap-1 mt-1", children: [
          /* @__PURE__ */ jsxs("div", { className: `inline-flex items-center text-sm font-bold px-2 py-0.5 rounded-full ${performanceScore >= 90 ? "bg-emerald-50 text-emerald-600" : performanceScore >= 70 ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"}`, children: [
            /* @__PURE__ */ jsx(CheckCircle, { size: 14, className: "mr-1" }),
            " ",
            performanceScore,
            "% score"
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "text-[11px] text-slate-500 leading-tight", children: [
            completedTasks.length,
            " tasks done \xB7 ",
            counselorReplies,
            " replies \xB7 ",
            itemsReviewed,
            " reviewed"
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-6 shadow-sm", children: [
      /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 mb-4 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(CheckSquare, { size: 18, className: "text-indigo-600" }),
        "Task Tower Overview"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "p-4 bg-slate-50 rounded-lg border border-slate-100 text-center", children: [
          /* @__PURE__ */ jsx("div", { className: "text-2xl font-bold text-slate-900", children: completedTasks.length }),
          /* @__PURE__ */ jsx("div", { className: "text-xs text-slate-500 uppercase font-semibold mt-1", children: "Completed" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "p-4 bg-amber-50 rounded-lg border border-amber-100 text-center", children: [
          /* @__PURE__ */ jsx("div", { className: "text-2xl font-bold text-amber-800", children: pendingTasksOpen.length }),
          /* @__PURE__ */ jsx("div", { className: "text-xs text-amber-700 uppercase font-semibold mt-1", children: "Pending Tasks" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "p-4 bg-rose-50 rounded-lg border border-rose-100 text-center", children: [
          /* @__PURE__ */ jsx("div", { className: "text-2xl font-bold text-rose-700", children: overdueTasks.length }),
          /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-600 uppercase font-semibold mt-1", children: "Overdue" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "p-4 bg-indigo-50 rounded-lg border border-indigo-100 text-center", children: [
          /* @__PURE__ */ jsx("div", { className: "text-2xl font-bold text-indigo-700", children: pendingReviewTasks.length }),
          /* @__PURE__ */ jsx("div", { className: "text-xs text-indigo-600 uppercase font-semibold mt-1", children: "Pending Review" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 space-y-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-white p-6 rounded-xl border border-gray-200 shadow-sm", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-4", children: [
            /* @__PURE__ */ jsxs("h3", { className: "font-semibold text-slate-900 flex items-center", children: [
              /* @__PURE__ */ jsx(Clock, { size: 18, className: "mr-2 text-indigo-600" }),
              "Priority Action Items"
            ] }),
            /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: () => onNavigate("tasks"), children: "View All" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
            stageEscalations.length > 0 && /* @__PURE__ */ jsxs("div", { className: "p-3 bg-orange-50 border border-orange-200 rounded-lg flex justify-between items-center gap-3 flex-wrap", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
                /* @__PURE__ */ jsx("div", { className: "shrink-0", children: /* @__PURE__ */ jsx(AlertTriangle, { size: 18, className: "text-orange-600" }) }),
                /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-orange-950", children: "Stage SLA overdue" }),
                  /* @__PURE__ */ jsxs("p", { className: "text-xs text-orange-800 mt-0.5", children: [
                    stageEscalations.length,
                    " ",
                    stageEscalations.length === 1 ? "student has" : "students have",
                    " exceeded the time limit for their current pipeline stage."
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsx(Button, { size: "sm", variant: "danger", className: "shrink-0", onClick: () => onNavigate("stage-escalations"), children: "Review" })
            ] }),
            overdueTasks.length > 0 && /* @__PURE__ */ jsxs("div", { className: "p-3 bg-rose-50 border border-rose-100 rounded-lg space-y-3", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start gap-3 flex-wrap", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
                  /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0 mt-1.5" }),
                  /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                    /* @__PURE__ */ jsxs("p", { className: "text-sm font-medium text-rose-900", children: [
                      "You have ",
                      overdueTasks.length,
                      " overdue task",
                      overdueTasks.length === 1 ? "" : "s"
                    ] }),
                    /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-700 mt-0.5", children: "Tap a row to open that student\u2019s profile with the task highlighted, or use Fix Now for the oldest due item." })
                  ] })
                ] }),
                /* @__PURE__ */ jsx(Button, {
                  size: "sm",
                  variant: "danger",
                  className: "shrink-0",
                  onClick: () => {
                    const first = overdueTasksSorted[0];
                    if (onOpenStudentTask && first) onOpenStudentTask(first);
                    else {
                      const tid = first?.id != null ? String(first.id).trim() : "";
                      if (tid && onSelectTask) onSelectTask(tid);
                      else onNavigate("tasks");
                    }
                  },
                  children: "Fix Now"
                })
              ] }),
              /* @__PURE__ */ jsxs("ul", { className: "space-y-2 border-t border-rose-200/70 pt-2", children: [
                overdueTasksSorted.slice(0, 6).map((task) => {
                  const sid = String(task.student_id || task.studentId || "").trim();
                  const stu = sid ? studentById.get(sid) : null;
                  const studentLabel = stu?.name || sid || "Student";
                  const tid = task.id != null ? String(task.id).trim() : "";
                  return /* @__PURE__ */ jsx(
                    "li",
                    {
                      className: `rounded-md border border-rose-100 bg-white/80 px-3 py-2 text-left transition-colors ${tid && (onOpenStudentTask || onSelectTask) ? "cursor-pointer hover:bg-white hover:border-rose-200" : ""}`,
                      onClick: () => {
                        if (onOpenStudentTask) onOpenStudentTask(task);
                        else if (tid && onSelectTask) onSelectTask(tid);
                      },
                      children: /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                        /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900 truncate", children: task.task || "Task" }),
                        /* @__PURE__ */ jsxs("p", { className: "text-[11px] text-rose-800 mt-0.5", children: [
                          studentLabel,
                          task.dueDate
                            ? /* @__PURE__ */ jsxs("span", { className: "text-slate-600", children: [" · Due ", task.dueDate] })
                            : null
                        ] })
                      ] })
                    },
                    tid || `overdue-${task.task}-${sid}`
                  );
                }),
                overdueTasksSorted.length > 6 && /* @__PURE__ */ jsxs("li", { className: "text-[11px] text-rose-800 px-1", children: [
                  "+ ",
                  overdueTasksSorted.length - 6,
                  " more — Fix Now opens the oldest due item on that student\u2019s profile."
                ] })
              ] })
            ] }),
            priorityActionList.shown.map((entry) => {
              if (entry.kind === "alert") {
                const alert = entry.alert;
                const sid = String(alert.studentId || "").trim();
                const sourceStudent = sid ? studentById.get(sid) : null;
                const inquiryStartedAt = sourceStudent?.stageEnteredAt || sourceStudent?.createdAt;
                const titleLine =
                  alert.type === "reassigned"
                    ? `${alert.studentName || "Student"} was reassigned to you`
                    : `${alert.studentName || "Student"} is in Inquiry stage`;
                return /* @__PURE__ */ jsxs(
                  "div",
                  {
                    className: `p-3 bg-amber-50 border border-amber-100 rounded-lg flex justify-between items-center gap-3 flex-wrap${sid && typeof onSelectStudent === "function" ? " cursor-pointer hover:bg-amber-100/80 hover:border-amber-200" : ""}`,
                    onClick: () => openStudentProfileById(sid),
                    children: [
                      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
                        /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" }),
                        /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-amber-900", children: titleLine }),
                          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5", children: [
                            /* @__PURE__ */ jsx("p", { className: "text-xs text-amber-700", children: "Initiate first counselor meeting and capture inquiry details." }),
                            inquiryStartedAt && /* @__PURE__ */ jsxs("span", { className: "text-[11px] text-amber-800", children: [
                              "Inquiry SLA ",
                              /* @__PURE__ */ jsx(InquirySlaBadge, { startedAt: inquiryStartedAt, nowMs })
                            ] })
                          ] })
                        ] })
                      ] }),
                      /* @__PURE__ */ jsx(Button, {
                        size: "sm",
                        variant: "ghost",
                        className: "shrink-0",
                        onClick: (e) => {
                          e.stopPropagation();
                          openInquiryPopup(alert);
                        },
                        children: "Start Inquiry"
                      })
                    ]
                  },
                  alert.id
                );
              }
              if (entry.kind === "inquiry") {
                const student = entry.student;
                const inquiryAlertPayload = {
                  id: `inquiry-student-${student.id}`,
                  studentId: String(student.id || ""),
                  studentName: student.name || String(student.id || ""),
                  type: "new"
                };
                const sid = String(student.id || "").trim();
                const sourceStudent = sid ? studentById.get(sid) || student : student;
                const inquiryStartedAt = sourceStudent?.stageEnteredAt || sourceStudent?.createdAt;
                return /* @__PURE__ */ jsxs(
                  "div",
                  {
                    className: `p-3 bg-amber-50 border border-amber-100 rounded-lg flex justify-between items-center gap-3 flex-wrap${sid && typeof onSelectStudent === "function" ? " cursor-pointer hover:bg-amber-100/80 hover:border-amber-200" : ""}`,
                    onClick: () => openStudentProfileById(sid),
                    children: [
                      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
                        /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" }),
                        /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                          /* @__PURE__ */ jsxs("p", { className: "text-sm font-medium text-amber-900", children: [
                            student.name || "Student",
                            " is in Inquiry stage"
                          ] }),
                          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5", children: [
                            /* @__PURE__ */ jsx("p", { className: "text-xs text-amber-700", children: "Initiate first counselor meeting and capture inquiry details." }),
                            inquiryStartedAt && /* @__PURE__ */ jsxs("span", { className: "text-[11px] text-amber-800", children: [
                              "Inquiry SLA ",
                              /* @__PURE__ */ jsx(InquirySlaBadge, { startedAt: inquiryStartedAt, nowMs })
                            ] })
                          ] })
                        ] })
                      ] }),
                      /* @__PURE__ */ jsx(Button, {
                        size: "sm",
                        variant: "ghost",
                        className: "shrink-0",
                        onClick: (e) => {
                          e.stopPropagation();
                          openInquiryPopup(inquiryAlertPayload);
                        },
                        children: "Start Inquiry"
                      })
                    ]
                  },
                  `inquiry-stage-${student.id}`
                );
              }
              const task = entry.task;
              const taskRowOverdue = isTaskOverdueByDate(task);
              const taskSid = String(task.student_id || task.studentId || "").trim();
              const taskStu = taskSid ? studentById.get(taskSid) : null;
              return /* @__PURE__ */ jsxs(
                "div",
                {
                  className: `flex items-center justify-between p-3 rounded-lg border transition-all group cursor-pointer gap-2 ${taskRowOverdue ? "bg-rose-50/60 border-rose-100 hover:border-rose-200" : "border-transparent hover:bg-slate-50 hover:border-gray-100"}`,
                  onClick: () => {
                    if (onOpenStudentTask) onOpenStudentTask(task);
                    else if (onSelectTask) onSelectTask(task.id);
                  },
                  children: [
                    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3 min-w-0", children: [
                      /* @__PURE__ */ jsx("div", { className: `w-5 h-5 mt-0.5 rounded border-2 shrink-0 transition-colors ${taskRowOverdue ? "border-rose-400 group-hover:border-rose-500" : "border-slate-300 group-hover:border-indigo-500"}` }),
                      /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                        /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-700 group-hover:text-indigo-900", children: task.task }),
                        isNewStudentIntakeTask(task)
                          ? null
                          : /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5", children: [
                              taskRowOverdue && /* @__PURE__ */ jsx("span", { className: "text-[10px] font-bold uppercase tracking-wide bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full", children: "Overdue" }),
                              (taskStu?.name || taskSid) && /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-500", children: taskStu?.name || taskSid }),
                              task.dueDate && /* @__PURE__ */ jsxs("span", { className: `text-xs tabular-nums ${taskRowOverdue ? "text-rose-700 font-medium" : "text-slate-400"}`, children: ["Due ", task.dueDate] })
                            ] })
                      ] })
                    ] }),
                    /* @__PURE__ */ jsx("span", { className: `text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${task.priority === "High" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`, children: task.priority })
                  ]
                },
                task.id
              );
            }),
            priorityActionList.total > PRIORITY_ACTION_ITEMS_LIMIT && /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 text-center pt-1", children: [
              "Showing last ",
              PRIORITY_ACTION_ITEMS_LIMIT,
              " of ",
              priorityActionList.total,
              " items \xB7 ",
              /* @__PURE__ */ jsx("button", { type: "button", className: "text-indigo-600 font-semibold hover:underline", onClick: () => onNavigate("tasks"), children: "View all in My Tasks" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "bg-white p-6 rounded-xl border border-gray-200 shadow-sm", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-4", children: [
            /* @__PURE__ */ jsxs("h3", { className: "font-semibold text-slate-900 flex items-center", children: [
              /* @__PURE__ */ jsx(Users, { size: 18, className: "mr-2 text-indigo-600" }),
              "My Students"
            ] }),
            /* @__PURE__ */ jsxs(Button, { variant: "ghost", size: "sm", onClick: () => onNavigate("students"), children: [
              "View All (",
              myStudents.length,
              ")"
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
            /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { className: "text-left text-xs text-slate-400 uppercase border-b border-gray-100", children: [
              /* @__PURE__ */ jsx("th", { className: "pb-2 font-medium", children: "Name" }),
              /* @__PURE__ */ jsx("th", { className: "pb-2 font-medium", children: "Stage" }),
              /* @__PURE__ */ jsx("th", { className: "pb-2 font-medium text-right", children: "Action" })
            ] }) }),
            /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-50", children: myStudents.slice(0, 5).map((student) => /* @__PURE__ */ jsxs("tr", { className: "group", children: [
              /* @__PURE__ */ jsx("td", { className: "py-3 font-medium text-slate-700", children: student.name }),
              /* @__PURE__ */ jsx("td", { className: "py-3", children: /* @__PURE__ */ jsx("span", { className: "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200", children: student.status }) }),
              /* @__PURE__ */ jsx("td", { className: "py-3 text-right", children: /* @__PURE__ */ jsxs(
                "button",
                {
                  className: "text-indigo-600 hover:text-indigo-800 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1 ml-auto",
                  onClick: () => onSelectStudent && onSelectStudent(student),
                  children: [
                    "Open ",
                    /* @__PURE__ */ jsx(ArrowRight, { size: 12 })
                  ]
                }
              ) })
            ] }, student.id)) })
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
        /* @__PURE__ */ jsx(LeaderboardWidget, { students: allStudents, employees, currentUserId: currentUser?.id || "", currentUserEmail: currentUser?.email || "" }),
        /* @__PURE__ */ jsxs("div", { className: "bg-[#0F172A] p-6 rounded-xl shadow-lg text-white", children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-4", children: [
            /* @__PURE__ */ jsx("h4", { className: "text-slate-400 text-xs font-bold uppercase tracking-wider", children: "Pipeline Health" }),
            /* @__PURE__ */ jsxs("p", { className: "text-[11px] text-slate-500 mt-1", children: [
              "Your students by stage (",
              pipelineStageCounts.total,
              " total)"
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "space-y-2.5 max-h-[280px] overflow-y-auto pr-1", children: pipelineHealthRows.map(({ stage, count, color }) => {
            const denom = Math.max(1, pipelineStageCounts.total);
            const widthPct = Math.round(count / denom * 100);
            return /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-sm mb-1 gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "text-slate-300 truncate", title: stage, children: stage }),
                /* @__PURE__ */ jsx("span", { className: "font-bold tabular-nums shrink-0", children: count })
              ] }),
              /* @__PURE__ */ jsx("div", { className: "w-full bg-slate-700 rounded-full h-1.5", children: /* @__PURE__ */ jsx("div", { className: "h-1.5 rounded-full transition-[width] duration-300", style: { width: `${widthPct}%`, backgroundColor: color } }) })
            ] }, stage);
          }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "bg-white p-6 rounded-xl border border-gray-200 shadow-sm", children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-3", children: [
            /* @__PURE__ */ jsx("h4", { className: "text-slate-900 text-sm font-bold", children: "Weekly Activity" }),
            /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500 mt-0.5", children: "Tasks marked completed and messages you sent to your students (last 7 days, local time)." })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "h-32", children: /* @__PURE__ */ jsx(ResponsiveContainer, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs(BarChart, { data: weeklyActivityData, margin: { top: 4, right: 4, left: 0, bottom: 0 }, children: [
            /* @__PURE__ */ jsx(XAxis, { dataKey: "name", axisLine: false, tickLine: false, tick: { fontSize: 10 } }),
            /* @__PURE__ */ jsx(Tooltip, { cursor: false, content: CounselorWeeklyActivityTooltip }),
            /* @__PURE__ */ jsx(Bar, { dataKey: "total", fill: "#6366F1", radius: [4, 4, 0, 0], name: "Activity" })
          ] }) }) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(InquiryCaptureFlowModals, {
      target: inquiryTarget,
      onClear: () => setInquiryTarget(null),
      currentUser,
      allStudents,
      scopedStudents: students,
      onUpdateStudent,
      onDismissAssignmentAlert,
      onStudentMovedToRequests,
      onSelectStudent
    })
  ] });
};
export {
  CounselorDashboard
};
