import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "./Button";
import {
  ArrowLeft,
  CheckCircle,
  FileText,
  Plane,
  ShieldAlert,
  ChevronRight,
  MapPin,
  DollarSign,
  Mail,
  Phone,
  Banknote,
  MessageSquare,
  PlusCircle,
  Clock,
  Calendar,
  Download,
  Archive,
  Eye,
  Pencil,
  Trash2,
  X
} from "lucide-react";
import { DocumentManager } from "./DocumentManager";
import { TaskDocumentRequestsPanel } from "./TaskDocumentRequestsPanel";
import InquiryCaptureFlowModals, { InquirySlaBadge } from "./InquiryCaptureFlowModals";
import { BUDGET_CURRENCIES } from "./InquiryIntakeForm";
import { FinancialCalculator } from "./FinancialCalculator";
import { FinanceModule } from "./FinanceModule";
import { VisaPilot } from "./VisaPilot";

import { StudentProfileCounselorsRoster } from "./StudentProfileCounselorsRoster";
import { AIResumeBuilder } from "./AIResumeBuilder";
import {
  PIPELINE_STEPS,
  normalizePipelineStatus,
  getCurrentStageSlaDisplay,
  getEffectiveSlaViolationMissingItems,
  getOpenSlaViolationsForCurrentStage,
  hasOpenSlaViolationsForCurrentStage,
  reconcileStudentSlaViolationsWithDocuments,
} from "../pipeline";
import {
  getNextPipelineStepLabel,
  getPipelineStagesForConfig,
  getRequiredDocTypesBeforeAdvance,
  getStudentPipelineStepIndex,
  isVisaPilotUnlockedForConfig,
  resolveStudentStageId,
  stageLabelsEquivalent,
  studentHasUploadedDocType,
} from "../docMappingConfig";
import { useCountryDocConfig } from "../hooks/useCountryDocConfig";
import { exportStudentDocumentsZip } from "../utils/exportStudentDocumentsZip";
import { getEnrolledAdvanceBlockReasons, collectMissingVisaPilotUploads } from "../studentEnrolledGate.js";
import { getInvoicesByStudentId } from "../authApi";
import { buildCounselorTeamEntriesWithFallback } from "../studentContactHelpers";
import {
  isCounselorEquivalentAccountRole,
  isCounselorEquivalentPortalRole,
  VISA_OFFICER_COUNSELOR_ROLE,
  VISA_OFFICER_ROLE,
} from "../roles";
function normalizeBranchValue(value) {
  return String(value || "").trim().toLowerCase();
}
function branchesMatch(a, b) {
  const x = normalizeBranchValue(a);
  const y = normalizeBranchValue(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}
function resolveProfileStudentKey(record) {
  if (!record || typeof record !== "object") return "";
  const raw = record.id ?? record.studentId;
  return String(raw ?? "").trim();
}
function resolveTaskStudentKey(task) {
  if (!task || typeof task !== "object") return "";
  const top = task.student_id ?? task.studentId;
  if (top != null && String(top).trim() !== "") return String(top).trim();
  const nested = task.student;
  if (nested && typeof nested === "object") {
    const n = nested.id ?? nested.studentId;
    if (n != null && String(n).trim() !== "") return String(n).trim();
  }
  return "";
}
function isCounselorRole(roleValue) {
  return isCounselorEquivalentAccountRole(roleValue);
}
function isMeaningfulGpaDisplay(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return false;
  if (s === "—" || s === "-" || s === "n/a" || s === "na" || s === "none" || s === "tbd") return false;
  const n = Number.parseFloat(s.replace(",", "."));
  if (!Number.isNaN(n) && n === 0) return false;
  return true;
}
function isMeaningfulIeltsDisplay(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return false;
  if (s === "pending" || s === "—" || s === "-" || s === "n/a" || s === "na" || s === "none" || s === "tbd" || s === "to be confirmed") return false;
  return true;
}
function hasStudentAnnualBudget(student) {
  const raw = String(student?.budget || "").trim();
  if (!raw) return false;
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0;
}
function formatStudentAnnualBudget(student) {
  if (!hasStudentAnnualBudget(student)) return "Not set";
  const raw = String(student.budget || "").trim();
  const currency = String(student?.budgetCurrency || "LKR").trim().toUpperCase();
  const label = BUDGET_CURRENCIES.find((c) => c.value === currency)?.label || currency;
  const num = Number(String(raw).replace(/[^\d.]/g, ""));
  const formatted = num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${formatted} ${label}`;
}
function formatExamResultsSubtitle(student) {
  const raw = student?.examResults;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const parts = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const name = String(r.examName ?? r.exam ?? r.name ?? "").trim();
    const result = String(r.result ?? r.score ?? "").trim();
    if (!name || !result) continue;
    const resLower = result.toLowerCase();
    if (resLower === "pending" || resLower === "tbd" || resLower === "n/a") continue;
    parts.push(`${name}: ${result}`);
  }
  return parts.length ? parts.join("\u2022") : null;
}
function buildLegacyMetricsSubtitleLine(student) {
  const country = String(student?.country || "").trim();
  const gpa = String(student?.gpa ?? "").trim();
  const ielts = String(student?.ielts ?? "").trim();
  const segments = [];
  if (country) segments.push(country);
  if (isMeaningfulGpaDisplay(gpa)) segments.push(`GPA: ${gpa}`);
  if (isMeaningfulIeltsDisplay(ielts)) segments.push(`IELTS: ${ielts}`);
  return segments.length ? segments.join("\u2022") : null;
}
const KeyDetails = ({ student, canEditContact = false, onEditContact, canSetBudget = false, onSetBudget }) => {
  const budgetUnset = !hasStudentAnnualBudget(student);
  const details = [
    { icon: MapPin, label: "Branch", value: student.branch || "—" },
    { icon: Mail, label: "Email", value: student.email || "—" },
    { icon: Phone, label: "Contact", value: student.phone || "—" },
    {
      icon: Banknote,
      label: "Annual budget",
      value: formatStudentAnnualBudget(student),
      valueClass: budgetUnset ? "text-slate-500 italic" : "text-slate-800"
    }
  ];
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "Key Details" }),
      canEditContact && /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "outline", className: "h-8 px-2.5 text-[11px] shrink-0", onClick: onEditContact, children: [
        /* @__PURE__ */ jsx(Pencil, { size: 13, strokeWidth: 1.75, className: "mr-1.5" }),
        "Edit Contact"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "space-y-4", children: details.map((item) => {
      const isAnnualBudget = item.label === "Annual budget";
      return /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
        /* @__PURE__ */ jsx(item.icon, { className: "text-slate-400 flex-shrink-0 mt-0.5", size: 16, strokeWidth: 1.5 }),
        /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: item.label }),
          isAnnualBudget ? /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 mt-0.5", children: [
            /* @__PURE__ */ jsx("p", { className: `text-sm font-medium ${item.valueClass || "text-slate-800"}`, children: item.value }),
            canSetBudget && budgetUnset && onSetBudget && /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "outline", className: "h-7 px-2 text-[11px]", onClick: onSetBudget, children: [
              /* @__PURE__ */ jsx(Pencil, { size: 12, strokeWidth: 1.75, className: "mr-1" }),
              "Set Annual budget"
            ] })
          ] }) : /* @__PURE__ */ jsx("p", { className: `text-sm font-medium ${item.valueClass || "text-slate-800"}`, children: item.value })
        ] })
      ] }, item.label);
    }) })
  ] });
};
const StudentTasksPanel = ({ student, tasks = [], userRole, highlightTaskId, onNavigateToTask }) => {
  const scrollRef = useRef(null);
  const highlightKey = highlightTaskId != null ? String(highlightTaskId).trim() : "";
  const profileKey = resolveProfileStudentKey(student);
  const studentTasksRaw = tasks.filter((task) => {
    const tid = resolveTaskStudentKey(task);
    if (!profileKey || !tid || tid !== profileKey) return false;
    if (userRole === "Student" && task.isPrivate) return false;
    return true;
  });
  const studentTasks = [...studentTasksRaw].sort((a, b) => {
    if (!highlightKey) return 0;
    const aid = String(a.id ?? "");
    const bid = String(b.id ?? "");
    if (aid === highlightKey) return -1;
    if (bid === highlightKey) return 1;
    return 0;
  });
  useEffect(() => {
    if (!highlightKey || typeof document === "undefined") return;
    const root = scrollRef.current;
    if (!root) return;
    const node = root.querySelector(`[data-profile-task-id="${CSS.escape(highlightKey)}"]`);
    node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightKey, student.id, studentTasks.length]);
  const pendingCount = studentTasks.filter((task) => task.status !== "Completed").length;
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4 gap-2", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "Student Tasks" }),
      /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0", children: [
        pendingCount,
        " Pending"
      ] })
    ] }),
    highlightKey && userRole !== "Student" && onNavigateToTask && /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-600 mb-2", children: "Focused task from your dashboard — you can also edit status in Task Manager." }),
    highlightKey && userRole !== "Student" && onNavigateToTask && /* @__PURE__ */ jsx("div", { className: "mb-3", children: /* @__PURE__ */ jsx(
      Button,
      {
        size: "sm",
        variant: "outline",
        className: "w-full text-xs",
        onClick: () => onNavigateToTask(highlightKey),
        children: "Open in Task Manager"
      }
    ) }),
    studentTasks.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic", children: "No tasks found for this student." }) : /* @__PURE__ */ jsx("div", { ref: scrollRef, className: "space-y-2 max-h-52 overflow-y-auto pr-1", children: studentTasks.slice(0, 12).map((task) => {
      const isHi = highlightKey && String(task.id ?? "") === highlightKey;
      return /* @__PURE__ */ jsxs(
        "div",
        {
          "data-profile-task-id": String(task.id ?? ""),
          className: `p-2.5 rounded-lg border text-left transition-colors ${isHi ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200 shadow-sm" : "border-slate-100 bg-slate-50"}`,
          children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-2", children: [
              /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold text-slate-800 min-w-0", children: task.task }),
              isHi && /* @__PURE__ */ jsx("span", { className: "text-[9px] font-bold uppercase tracking-wide text-indigo-700 bg-white/80 border border-indigo-200 px-1.5 py-0.5 rounded shrink-0", children: "Here" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "mt-1 flex items-center justify-between text-[10px] text-slate-500", children: [
              /* @__PURE__ */ jsxs("span", { children: [
                "Status: ",
                task.status
              ] }),
              /* @__PURE__ */ jsxs("span", { children: [
                "Due: ",
                task.dueDate || "N/A"
              ] })
            ] })
          ]
        },
        task.id
      );
    }) })
  ] });
};
const SpecializedNotes = ({ student, onUpdateStudent, currentUser, authenticatedUser, userRole }) => {
  const [draft, setDraft] = useState("");
  const [dialog, setDialog] = useState(null);
  const authorLabel = String(currentUser?.name || currentUser?.username || authenticatedUser?.username || authenticatedUser?.email || "Staff").trim() || "Staff";
  const notes = Array.isArray(student?.specializedNotes) ? student.specializedNotes : [];
  const persistNotes = (next) => {
    onUpdateStudent?.({ ...student, specializedNotes: next });
  };
  const handleAddNote = () => {
    const text = draft.trim();
    if (!text) return;
    const newNote = {
      id: `sn-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      text,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      author: authorLabel,
      authorId: currentUser?.id ? String(currentUser.id) : ""
    };
    persistNotes([newNote, ...notes]);
    setDraft("");
  };
  const formatWhen = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
  };
  const preview = (text) => {
    const t = String(text || "").trim();
    if (t.length <= 90) return t;
    return `${t.slice(0, 87)}...`;
  };
  if (userRole === "Student") return null;
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxs("h3", { className: "text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2", children: [
      /* @__PURE__ */ jsx(ShieldAlert, { size: 16, className: "text-indigo-600" }),
      " Specialized Notes"
    ] }),
    /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-500 mb-3", children: "Stored only on this student record. Not shown in Student History." }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-2 mb-4 max-h-52 overflow-y-auto pr-1", children: [
      notes.length === 0 && /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic", children: "No specialized notes yet." }),
      notes.map((n) => /* @__PURE__ */ jsxs("div", { className: "bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs flex gap-2 items-start justify-between group", children: [
        /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsx("p", { className: "text-slate-700 line-clamp-2", children: preview(n.text) }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-x-2 mt-1 text-[10px] text-slate-400", children: [
            /* @__PURE__ */ jsx("span", { children: n.author || authorLabel }),
            /* @__PURE__ */ jsx("span", { children: formatWhen(n.updatedAt || n.createdAt) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-0.5 flex-shrink-0", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              title: "View",
              className: "p-1.5 rounded-md text-slate-500 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200",
              onClick: () => setDialog({ kind: "view", note: n }),
              children: /* @__PURE__ */ jsx(Eye, { size: 14 })
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              title: "Edit",
              className: "p-1.5 rounded-md text-slate-500 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200",
              onClick: () => setDialog({ kind: "edit", note: n, draft: n.text }),
              children: /* @__PURE__ */ jsx(Pencil, { size: 14 })
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              title: "Delete",
              className: "p-1.5 rounded-md text-slate-500 hover:bg-white hover:text-rose-600 border border-transparent hover:border-slate-200",
              onClick: () => setDialog({ kind: "delete", note: n }),
              children: /* @__PURE__ */ jsx(Trash2, { size: 14 })
            }
          )
        ] })
      ] }, n.id))
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsx("textarea", {
        className: "w-full text-xs border border-gray-200 rounded-lg px-3 py-2 min-h-[72px] focus:outline-none focus:border-indigo-500 resize-y",
        placeholder: "Add a specialized note...",
        value: draft,
        onChange: (e) => setDraft(e.target.value)
      }),
      /* @__PURE__ */ jsx(Button, { size: "sm", className: "w-full sm:w-auto", onClick: handleAddNote, disabled: !draft.trim(), children: "Save note" })
    ] }),
    dialog && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm", onClick: () => setDialog(null), children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col", onClick: (e) => e.stopPropagation(), children: [
      dialog.kind === "view" && /* @__PURE__ */ jsxs(React.Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80", children: [
          /* @__PURE__ */ jsx("h4", { className: "text-sm font-semibold text-slate-900", children: "Specialized note" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "p-1 rounded-md text-slate-500 hover:bg-slate-100", onClick: () => setDialog(null), children: /* @__PURE__ */ jsx(X, { size: 18 }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "p-4 overflow-y-auto flex-1", children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-800 whitespace-pre-wrap break-words", children: dialog.note.text }),
          /* @__PURE__ */ jsxs("div", { className: "mt-4 text-[11px] text-slate-500 space-y-1", children: [
            /* @__PURE__ */ jsxs("p", { children: [/* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-600", children: "Author: " }), dialog.note.author || "—"] }),
            /* @__PURE__ */ jsxs("p", { children: [/* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-600", children: "Created: " }), formatWhen(dialog.note.createdAt)] }),
            dialog.note.updatedAt && /* @__PURE__ */ jsxs("p", { children: [/* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-600", children: "Updated: " }), formatWhen(dialog.note.updatedAt)] })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "px-4 py-3 border-t border-gray-100 flex justify-end", children: /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: () => setDialog(null), children: "Close" }) })
      ] }),
      dialog.kind === "edit" && /* @__PURE__ */ jsxs(React.Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80", children: [
          /* @__PURE__ */ jsx("h4", { className: "text-sm font-semibold text-slate-900", children: "Edit note" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "p-1 rounded-md text-slate-500 hover:bg-slate-100", onClick: () => setDialog(null), children: /* @__PURE__ */ jsx(X, { size: 18 }) })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "p-4", children: /* @__PURE__ */ jsx("textarea", {
          className: "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 min-h-[140px] focus:outline-none focus:border-indigo-500",
          value: dialog.draft,
          onChange: (e) => setDialog({ ...dialog, draft: e.target.value })
        }) }),
        /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-t border-gray-100 flex justify-end gap-2", children: [
          /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: () => setDialog(null), children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, {
            size: "sm",
            onClick: () => {
              const text = String(dialog.draft || "").trim();
              if (!text) return;
              const id = dialog.note.id;
              const next = notes.map((item) => item.id === id ? {
                ...item,
                text,
                updatedAt: (/* @__PURE__ */ new Date()).toISOString()
              } : item);
              persistNotes(next);
              setDialog(null);
            },
            disabled: !String(dialog.draft || "").trim(),
            children: "Save changes"
          })
        ] })
      ] }),
      dialog.kind === "delete" && /* @__PURE__ */ jsxs(React.Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-100 bg-slate-50/80", children: [
          /* @__PURE__ */ jsx("h4", { className: "text-sm font-semibold text-slate-900", children: "Delete note?" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: "This cannot be undone." })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "p-4 max-h-40 overflow-y-auto", children: /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-600 whitespace-pre-wrap break-words", children: preview(dialog.note.text) }) }),
        /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-t border-gray-100 flex justify-end gap-2", children: [
          /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: () => setDialog(null), children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, {
            size: "sm",
            className: "bg-rose-600 hover:bg-rose-700 border-none text-white",
            onClick: () => {
              persistNotes(notes.filter((item) => item.id !== dialog.note.id));
              setDialog(null);
            },
            children: "Delete"
          })
        ] })
      ] })
    ] }) })
  ] });
};
const MeetingNotes = ({ student, onUpdateStudent, currentUser, authenticatedUser, userRole }) => {
  const [addDraft, setAddDraft] = useState("");
  const [addMeetingDate, setAddMeetingDate] = useState("");
  const [dialog, setDialog] = useState(null);
  const authorLabel = String(currentUser?.name || currentUser?.username || authenticatedUser?.username || authenticatedUser?.email || "Staff").trim() || "Staff";
  const notes = Array.isArray(student?.meetingNotes) ? student.meetingNotes : [];
  const persistNotes = (next) => {
    onUpdateStudent?.({ ...student, meetingNotes: next });
  };
  const handleAddNote = () => {
    const text = addDraft.trim();
    if (!text) return;
    const newNote = {
      id: `mn-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      text,
      meetingDate: String(addMeetingDate || "").trim() || "",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      author: authorLabel,
      authorId: currentUser?.id ? String(currentUser.id) : ""
    };
    persistNotes([newNote, ...notes]);
    setAddDraft("");
    setAddMeetingDate("");
    setDialog(null);
  };
  const formatWhen = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
  };
  const preview = (text) => {
    const t = String(text || "").trim();
    if (t.length <= 90) return t;
    return `${t.slice(0, 87)}...`;
  };
  if (userRole === "Student") return null;
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxs("h3", { className: "text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2", children: [
      /* @__PURE__ */ jsx(Calendar, { size: 16, className: "text-indigo-600" }),
      " Meeting Notes"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mb-3 flex flex-col items-start gap-2", children: [
      /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-500", children: "Log sessions, calls, and follow-ups. Stored on this student record." }),
      /* @__PURE__ */ jsx(Button, { size: "sm", className: "h-7 px-2.5 text-[11px] font-semibold", onClick: () => setDialog({ kind: "add" }), children: "Add meeting note" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1", children: [
      notes.length === 0 && /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic", children: "No meeting notes yet." }),
      notes.map((n) => /* @__PURE__ */ jsxs("button", { type: "button", className: "w-full text-left bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs transition hover:bg-white hover:border-slate-200", onClick: () => setDialog({ kind: "view", note: n }), children: [
        /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
          n.meetingDate && /* @__PURE__ */ jsx("p", { className: "text-[10px] font-semibold text-indigo-600 mb-0.5", children: n.meetingDate }),
          /* @__PURE__ */ jsx("p", { className: "text-slate-700 line-clamp-3", children: preview(n.text) }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-x-2 mt-1 text-[10px] text-slate-400", children: [
            /* @__PURE__ */ jsx("span", { children: n.author || authorLabel }),
            /* @__PURE__ */ jsx("span", { children: formatWhen(n.updatedAt || n.createdAt) })
          ] })
        ] })
      ] }, n.id))
    ] }),
    dialog && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm", onClick: () => setDialog(null), children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col", onClick: (e) => e.stopPropagation(), children: [
      dialog.kind === "add" && /* @__PURE__ */ jsxs(React.Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80", children: [
          /* @__PURE__ */ jsx("h4", { className: "text-sm font-semibold text-slate-900", children: "Add meeting note" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "p-1 rounded-md text-slate-500 hover:bg-slate-100", onClick: () => setDialog(null), children: /* @__PURE__ */ jsx(X, { size: 18 }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "p-4 space-y-3", children: [
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-slate-700", children: "Meeting date (optional)" }),
            /* @__PURE__ */ jsx("input", {
              type: "date",
              className: "mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500",
              value: addMeetingDate,
              onChange: (e) => setAddMeetingDate(e.target.value)
            })
          ] }),
          /* @__PURE__ */ jsx("textarea", {
            className: "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 min-h-[140px] focus:outline-none focus:border-indigo-500",
            placeholder: "Add meeting notes in bullets or paragraphs...",
            value: addDraft,
            onChange: (e) => setAddDraft(e.target.value)
          })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-t border-gray-100 flex justify-end gap-2", children: [
          /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: () => setDialog(null), children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { size: "sm", onClick: handleAddNote, disabled: !String(addDraft || "").trim(), children: "Save note" })
        ] })
      ] }),
      dialog.kind === "view" && /* @__PURE__ */ jsxs(React.Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80", children: [
          /* @__PURE__ */ jsx("h4", { className: "text-sm font-semibold text-slate-900", children: "Meeting note" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "p-1 rounded-md text-slate-500 hover:bg-slate-100", onClick: () => setDialog(null), children: /* @__PURE__ */ jsx(X, { size: 18 }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "p-4 overflow-y-auto flex-1", children: [
          dialog.note.meetingDate && /* @__PURE__ */ jsxs("p", { className: "text-xs font-semibold text-indigo-600 mb-2", children: ["Date: ", dialog.note.meetingDate] }),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-800 whitespace-pre-wrap break-words", children: dialog.note.text }),
          /* @__PURE__ */ jsxs("div", { className: "mt-4 text-[11px] text-slate-500 space-y-1", children: [
            /* @__PURE__ */ jsxs("p", { children: [/* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-600", children: "Author: " }), dialog.note.author || "—"] }),
            /* @__PURE__ */ jsxs("p", { children: [/* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-600", children: "Created: " }), formatWhen(dialog.note.createdAt)] }),
            dialog.note.updatedAt && /* @__PURE__ */ jsxs("p", { children: [/* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-600", children: "Updated: " }), formatWhen(dialog.note.updatedAt)] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-t border-gray-100 flex justify-end gap-2", children: [
          /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: () => setDialog(null), children: "Close" })
        ] })
      ] }),
      dialog.kind === "edit" && /* @__PURE__ */ jsxs(React.Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80", children: [
          /* @__PURE__ */ jsx("h4", { className: "text-sm font-semibold text-slate-900", children: "Edit meeting note" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "p-1 rounded-md text-slate-500 hover:bg-slate-100", onClick: () => setDialog(null), children: /* @__PURE__ */ jsx(X, { size: 18 }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "p-4 space-y-3", children: [
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-slate-700", children: "Meeting date" }),
            /* @__PURE__ */ jsx("input", {
              type: "date",
              className: "mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500",
              value: dialog.meetingDate || "",
              onChange: (e) => setDialog({ ...dialog, meetingDate: e.target.value })
            })
          ] }),
          /* @__PURE__ */ jsx("textarea", {
            className: "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 min-h-[140px] focus:outline-none focus:border-indigo-500",
            value: dialog.draft,
            onChange: (e) => setDialog({ ...dialog, draft: e.target.value })
          })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-t border-gray-100 flex justify-end gap-2", children: [
          /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: () => setDialog(null), children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, {
            size: "sm",
            onClick: () => {
              const text = String(dialog.draft || "").trim();
              if (!text) return;
              const id = dialog.note.id;
              const next = notes.map((item) => item.id === id ? {
                ...item,
                text,
                meetingDate: String(dialog.meetingDate || "").trim(),
                updatedAt: (/* @__PURE__ */ new Date()).toISOString()
              } : item);
              persistNotes(next);
              setDialog(null);
            },
            disabled: !String(dialog.draft || "").trim(),
            children: "Save changes"
          })
        ] })
      ] }),
      dialog.kind === "delete" && /* @__PURE__ */ jsxs(React.Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-100 bg-slate-50/80", children: [
          /* @__PURE__ */ jsx("h4", { className: "text-sm font-semibold text-slate-900", children: "Delete meeting note?" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: "This cannot be undone." })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "p-4 max-h-40 overflow-y-auto", children: /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-600 whitespace-pre-wrap break-words", children: preview(dialog.note.text) }) }),
        /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-t border-gray-100 flex justify-end gap-2", children: [
          /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: () => setDialog(null), children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, {
            size: "sm",
            className: "bg-rose-600 hover:bg-rose-700 border-none text-white",
            onClick: () => {
              persistNotes(notes.filter((item) => item.id !== dialog.note.id));
              setDialog(null);
            },
            children: "Delete"
          })
        ] })
      ] })
    ] }) })
  ] });
};
const StudentHistory = ({ activities, student, assignedCounselorName = "" }) => {
  const genericLabels = new Set([
    "Counselor",
    VISA_OFFICER_ROLE,
    VISA_OFFICER_COUNSELOR_ROLE,
    "Country Coordinator",
    "Manager",
    "Team Lead",
    "Admin",
    "Student",
    "System",
  ]);
  const studentActivities = activities.filter((a) => {
    if (String(a.action || "") === "added specialized note") return false;
    return a.studentId === student.id || a.studentName === student.name || a.target.includes(student.name) || a.user === student.name || student.documents?.some((d) => a.target.includes(d.name)) || a.target.includes(student.id);
  });
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden", children: [
    /* @__PURE__ */ jsxs("div", { className: "p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50/50", children: [
      /* @__PURE__ */ jsxs("h3", { className: "text-sm font-bold text-slate-900 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Clock, { size: 16, className: "text-indigo-600" }),
        "Student History"
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide flex items-center gap-1", children: [
        studentActivities.length,
        " Events"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "divide-y divide-gray-50 max-h-80 overflow-y-auto", children: studentActivities.length > 0 ? studentActivities.map((activity) => /* @__PURE__ */ jsx("div", { className: "p-4 hover:bg-slate-50 transition-colors group", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx("div", { className: "mt-0.5 w-5 h-5 rounded-full border-2 border-indigo-200 flex items-center justify-center bg-indigo-50", children: /* @__PURE__ */ jsx("div", { className: "w-2.5 h-2.5 rounded-full bg-indigo-400" }) }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start", children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-700 truncate capitalize", children: activity.action === "rejected document" ? "Remove doc" : activity.action === "verified document" ? "Verify doc" : activity.action === "removed rejected document" ? "Delete rejected doc" : activity.action === "removed approved document" ? "Delete approved doc" : activity.action === "added specialized note" ? "Notes" : activity.action }),
          /* @__PURE__ */ jsx("span", { className: "text-[10px] text-slate-400 whitespace-nowrap ml-2", children: activity.timestamp })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1 truncate", children: activity.target }),
        /* @__PURE__ */ jsxs("p", { className: "text-[10px] text-slate-400 mt-1 font-medium", children: [
          "By ",
          !genericLabels.has(String(activity.actorName || "").trim()) ? activity.actorName || activity.user : assignedCounselorName || activity.actorName || activity.user,
          " (",
          activity.role,
          ")"
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "text-[10px] text-slate-500 mt-1", children: [
          "Counselor: ",
          activity.counselorName && !genericLabels.has(String(activity.counselorName || "").trim()) ? activity.counselorName : assignedCounselorName || (isCounselorEquivalentPortalRole(activity.role) ? activity.actorName || activity.user || "N/A" : "N/A"),
          " | Student: ",
          activity.studentName || student.name
        ] })
      ] })
    ] }) }, activity.id)) : /* @__PURE__ */ jsxs("div", { className: "p-8 text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3", children: /* @__PURE__ */ jsx(Clock, { size: 20, className: "text-slate-300" }) }),
      /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-600", children: "No history yet" }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 mt-1", children: "Events will appear here" })
    ] }) })
  ] });
};
const StudentProfile = ({
  student,
  onBack,
  onNavigate,
  userRole = "Admin",
  onUpdateStudent,
  onAddActivity,
  onOpenCreateTaskModal,
  tasks = [],
  onAddTasks,
  onUpdateTasks,
  activities = [],
  paymentAccounts = [],
  onUpdateInvoice,
  onCreateInvoice,
  onUploadStudentDocument,
  onUploadStudentProfileOtherDocument,
  onUploadStudentUniversityOfferLetters,
  onUploadStudentCv,
  employees = [],
  currentUser = null,
  authenticatedUser = null,
  onNotify,
  onSendStaffMessage,
  highlightTaskId = null,
  onNavigateToTask,
  allStudents = [],
  onDismissAssignmentAlert,
  onStudentMovedToRequests,
  onSelectStudent
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [localStudent, setLocalStudent] = useState(student);
  const [activeTab, setActiveTab] = useState("pipeline");
  const [advanceDialog, setAdvanceDialog] = useState({
    open: false,
    counselorMode: "current",
    counselorId: "",
    taskActions: {}
  });
  const [contactDialog, setContactDialog] = useState({
    open: false,
    email: "",
    phone: ""
  });
  const [budgetDialog, setBudgetDialog] = useState({
    open: false,
    budget: "",
    budgetCurrency: "LKR"
  });
  const [slaResolveBusy, setSlaResolveBusy] = useState(false);
  useEffect(() => {
    setLocalStudent((prev) => {
      if (!student) return student;
      if (String(prev?.id || "") !== String(student?.id || "")) return student;
      const prevAt = new Date(prev?.updatedAt || prev?.stageEnteredAt || 0).getTime();
      const nextAt = new Date(student?.updatedAt || student?.stageEnteredAt || 0).getTime();
      if (!Number.isNaN(nextAt) && (Number.isNaN(prevAt) || nextAt >= prevAt)) return student;
      if (String(prev?.status || "") !== String(student?.status || "")) return student;
      return prev;
    });
  }, [student]);
  const advanceDialogStudentKeyRef = useRef("");
  useEffect(() => {
    const key = resolveProfileStudentKey(student);
    const prev = advanceDialogStudentKeyRef.current;
    advanceDialogStudentKeyRef.current = key;
    if (prev && key && prev !== key) {
      setAdvanceDialog({ open: false, counselorMode: "current", counselorId: "", taskActions: {} });
    }
  }, [student]);
  const [stageSlaClock, setStageSlaClock] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStageSlaClock((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const stageSlaDisplay = useMemo(
    () => getCurrentStageSlaDisplay(localStudent, { now: Date.now() }),
    [localStudent, stageSlaClock]
  );
  const stageSlaToneClass =
    stageSlaDisplay?.visualTone === "red"
      ? "bg-red-50 text-red-800 border-red-200"
      : stageSlaDisplay?.visualTone === "orange"
        ? "bg-orange-50 text-orange-900 border-orange-200"
        : "bg-green-50 text-green-800 border-green-200";
  const [inquiryTarget, setInquiryTarget] = useState(null);
  const [exportingDocuments, setExportingDocuments] = useState(false);
  const inquiryNowMs = useMemo(() => Date.now(), [stageSlaClock]);
  useEffect(() => {
    setInquiryTarget(null);
  }, [String(student?.id ?? "")]);
  const profileMetricsRow = useMemo(() => {
    const country = String(localStudent.country || "").trim();
    const examLine = formatExamResultsSubtitle(localStudent);
    if (examLine) {
      const text = country ? `${country}\u2022${examLine}` : examLine;
      return /* @__PURE__ */ jsx("span", {
        className: "text-sm font-medium text-slate-600 tabular-nums [overflow-wrap:anywhere]",
        children: text
      });
    }
    const legacyLine = buildLegacyMetricsSubtitleLine(localStudent);
    if (!legacyLine) return null;
    return /* @__PURE__ */ jsx("span", {
      className: "text-sm font-medium text-slate-600 tabular-nums [overflow-wrap:anywhere]",
      children: legacyLine
    });
  }, [localStudent]);
  const { config: countryDocConfig } = useCountryDocConfig(localStudent?.country);
  const handleExportDocuments = useCallback(async () => {
    if (exportingDocuments) return;
    setExportingDocuments(true);
    try {
      const result = await exportStudentDocumentsZip(localStudent, countryDocConfig);
      if (!result.ok) {
        onNotify?.("Export failed", result.error || "Could not export documents.", "error");
        return;
      }
      const skipped = result.skippedCount ? ` (${result.skippedCount} skipped)` : "";
      const docPart =
        result.exportedCount > 0
          ? `${result.exportedCount} document${result.exportedCount === 1 ? "" : "s"}`
          : "no documents";
      const tone = result.partial ? "warning" : "success";
      const partialNote = result.warning ? ` ${result.warning}` : "";
      onNotify?.(
        result.partial ? "Export partial" : "Export ready",
        `Downloaded zip with ${docPart}, student-data.csv, and student-data.json${skipped}.${partialNote}`,
        tone
      );
    } catch {
      onNotify?.("Export failed", "Something went wrong while building the zip file.", "error");
    } finally {
      setExportingDocuments(false);
    }
  }, [countryDocConfig, exportingDocuments, localStudent, onNotify]);
  const effectiveStatus = normalizePipelineStatus(localStudent.status);
  const countryStages = useMemo(
    () => getPipelineStagesForConfig(countryDocConfig),
    [countryDocConfig]
  );
  const pipelineSteps = useMemo(
    () => countryStages.map((s) => s.label),
    [countryStages]
  );
  const currentStageOpenSlaViolations = useMemo(
    () => getOpenSlaViolationsForCurrentStage(localStudent),
    [localStudent]
  );
  const visaPilotUnlocked = isVisaPilotUnlockedForConfig(localStudent.status, countryDocConfig);
  useEffect(() => {
    if (!visaPilotUnlocked && activeTab === "visa-pilot") {
      setActiveTab("pipeline");
    }
  }, [visaPilotUnlocked, activeTab]);
  useEffect(() => {
    const raw = String(searchParams.get("tab") || "").trim().toLowerCase();
    const allowed = new Set(["pipeline", "resume", "show-money", "ledger"]);
    if (raw === "visa-pilot" && visaPilotUnlocked) {
      setActiveTab("visa-pilot");
      return;
    }
    if (allowed.has(raw)) {
      setActiveTab(raw);
      return;
    }
    setActiveTab("pipeline");
  }, [searchParams, student?.id, visaPilotUnlocked]);
  const [openInvoiceCreatePending, setOpenInvoiceCreatePending] = useState(false);
  useEffect(() => {
    setOpenInvoiceCreatePending(false);
  }, [student?.id]);
  useEffect(() => {
    if (searchParams.get("createInvoice") !== "1") return;
    setOpenInvoiceCreatePending(true);
    const next = new URLSearchParams(searchParams);
    next.delete("createInvoice");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [studentInvoices, setStudentInvoices] = useState([]);
  const loadStudentInvoices = useCallback(async () => {
    const sid = String(localStudent?.id || "").trim();
    if (!sid) { setStudentInvoices([]); return; }
    const result = await getInvoicesByStudentId(sid);
    if (result.ok) setStudentInvoices(result.data);
  }, [localStudent?.id]);
  useEffect(() => { loadStudentInvoices(); }, [loadStudentInvoices]);

  const currentStepIndex = useMemo(() => {
    const idx = getStudentPipelineStepIndex(localStudent.status, countryStages);
    return idx >= 0 ? idx : 0;
  }, [localStudent.status, countryStages]);
  const nextStep = useMemo(
    () => getNextPipelineStepLabel(localStudent.status, countryDocConfig),
    [localStudent.status, countryDocConfig]
  );
  const enrolledAdvanceBlockReasons = useMemo(
    () => (nextStep === "Enrolled" ? getEnrolledAdvanceBlockReasons(localStudent, studentInvoices, countryDocConfig) : []),
    [nextStep, localStudent, studentInvoices, countryDocConfig]
  );
  const pipelineGridSmClass =
    pipelineSteps.length <= 4
      ? "sm:grid-cols-4"
      : pipelineSteps.length <= 5
        ? "sm:grid-cols-5"
        : pipelineSteps.length <= 6
          ? "sm:grid-cols-6"
          : "sm:grid-cols-7";
  const profileStudentKey = useMemo(() => resolveProfileStudentKey(localStudent), [localStudent]);
  const remainingStudentTasks = useMemo(() => {
    if (!profileStudentKey) return [];
    return tasks.filter((task) => {
      const sid = resolveTaskStudentKey(task);
      return Boolean(sid) && sid === profileStudentKey && task.status !== "Completed";
    });
  }, [tasks, profileStudentKey]);
  const actingCounselorId = String(currentUser?.id || authenticatedUser?.id || localStudent.counselor || "").trim();
  const currentCounselorId = String(localStudent.counselor || "").trim() || actingCounselorId;
  const availableBranchCounselors = employees.filter((employee) => {
    return isCounselorRole(employee?.role || employee?.position);
  });
  const reassignableBranchCounselors = availableBranchCounselors.filter(
    (employee) => String(employee?.id || "").trim() !== String(currentCounselorId || "").trim()
  );
  const assignedCounselorName = (() => {
    const match = employees.find((employee) => employee.id === localStudent.counselor);
    return match?.name || match?.username || localStudent.counselorName || "";
  })();
  const slaNoticeCounselorTeam = useMemo(
    () => buildCounselorTeamEntriesWithFallback(localStudent, employees),
    [localStudent, employees]
  );
  const canEscalateSlaNotice = userRole === "Admin" || userRole === "Manager";
  const handleSlaResolveNow = async () => {
    if (!canEscalateSlaNotice || slaResolveBusy) return;
    if (!onAddTasks) {
      onNotify?.("Unavailable", "Task creation is not available.", "error");
      return;
    }
    const studentDocs = localStudent.documents || [];
    const hasOpenSlaGaps = getOpenSlaViolationsForCurrentStage(localStudent).length > 0;
    if (!hasOpenSlaGaps) {
      onNotify?.("Nothing to resolve", "This SLA notice is already cleared.", "info");
      return;
    }
    const teamIds = slaNoticeCounselorTeam.map((c) => String(c.id || "").trim()).filter((id) => id && id.toLowerCase() !== "unassigned");
    const branchIds = availableBranchCounselors.map((e) => String(e.id || "").trim()).filter(Boolean);
    const targetIds = Array.from(new Set(teamIds.length > 0 ? teamIds : branchIds));
    if (targetIds.length === 0) {
      onNotify?.(
        "No counselors",
        "Assign a counselor on this record or add roster staff for this branch before escalating.",
        "warning"
      );
      return;
    }
    const pk = resolveProfileStudentKey(localStudent);
    const missingLabels = [];
    const seenMiss = /* @__PURE__ */ new Set();
    for (const v of getOpenSlaViolationsForCurrentStage(localStudent)) {
      for (const it of getEffectiveSlaViolationMissingItems(v, studentDocs)) {
        const k = String(it || "").trim();
        if (!k) continue;
        const low = k.toLowerCase();
        if (seenMiss.has(low)) continue;
        seenMiss.add(low);
        missingLabels.push(k);
      }
    }
    const missShort =
      missingLabels.length > 0
        ? `${missingLabels.slice(0, 6).join(", ")}${missingLabels.length > 6 ? "…" : ""}`
        : "mandatory requirements";
    const TASK_PREFIX = "SLA notice (management)";
    const pendingManagementSlaTask = (counselorId) =>
      (tasks || []).some((t) => {
        if (String(t.status || "") === "Completed") return false;
        if (resolveTaskStudentKey(t) !== pk) return false;
        const title = String(t.task || "");
        if (!title.startsWith(TASK_PREFIX)) return false;
        const to = Array.isArray(t.assigned_to) ? t.assigned_to : [];
        return to.some((a) => String(a || "").trim() === counselorId);
      });
    const toCreate = targetIds.filter((id) => !pendingManagementSlaTask(id));
    if (toCreate.length === 0) {
      onNotify?.(
        "Already escalated",
        "Each targeted counselor already has an open management SLA task for this student.",
        "info"
      );
      return;
    }
    setSlaResolveBusy(true);
    try {
      const due = /* @__PURE__ */ new Date();
      due.setDate(due.getDate() + 1);
      const dueDate = due.toISOString().split("T")[0];
      const now = Date.now();
      const actorLabel = String(currentUser?.name || authenticatedUser?.username || userRole || "Staff").trim() || userRole;
      const newTasks = toCreate.map((counselorId, idx) => ({
        id: `T-SLA-${localStudent.id}-${counselorId}-${now}-${idx}`,
        task: `${TASK_PREFIX}: ${missShort} — ${localStudent.name}`.slice(0, 500),
        assigned_to: [counselorId],
        counselor_ids: [counselorId],
        student_id: localStudent.id,
        priority: "High",
        status: "Pending",
        dueDate,
        tier: "Global",
        phase: 1,
        isBlocking: true,
        isPrivate: true
      }));
      const addRes = await onAddTasks(newTasks);
      let messagesOk = 0;
      let messagesFail = 0;
      if (addRes?.ok && typeof onSendStaffMessage === "function") {
        const msgBody = `${actorLabel} (${userRole}) escalated an SLA requirement notice for ${localStudent.name} (${localStudent.id}). Gaps: ${missShort}. A HIGH priority task was added to your list — please complete missing items in the pipeline / documents.`;
        for (const counselorId of toCreate) {
          const msgRes = await onSendStaffMessage(msgBody, counselorId);
          if (msgRes?.ok) messagesOk += 1;
          else messagesFail += 1;
        }
      }
      if (addRes?.ok) {
        onAddActivity?.({
          user: userRole,
          role: userRole,
          action: "escalated SLA requirement notice",
          target: `${localStudent.name}: ${toCreate.length} counselor task(s); ${messagesOk} portal message(s)`,
          type: "task",
          studentName: localStudent.name,
          studentId: localStudent.id
        });
        if (typeof onSendStaffMessage === "function") {
          if (messagesFail === 0) {
            onNotify?.(
              "Escalation sent",
              `Created ${toCreate.length} high priority task(s) and notified counselors in Messages.`,
              "success"
            );
          } else {
            onNotify?.(
              "Partially sent",
              `Created ${toCreate.length} task(s). ${messagesOk} counselor message(s) sent; ${messagesFail} failed.`,
              messagesOk > 0 ? "warning" : "error"
            );
          }
        } else {
          onNotify?.("Tasks created", `Created ${toCreate.length} high priority counselor task(s).`, "success");
        }
      } else {
        onNotify?.("Escalation issue", addRes?.error || "Some tasks could not be saved.", "error");
      }
    } finally {
      setSlaResolveBusy(false);
    }
  };
  const canManagerEditContact = userRole === "Manager";
  const canSetAnnualBudget = ["Admin", "Manager"].includes(userRole) || isCounselorEquivalentPortalRole(userRole);
  const showCounselorsRosterSection =
    ["Admin", "Manager", "Team Lead", "Country Coordinator"].includes(userRole) ||
    isCounselorEquivalentPortalRole(userRole);
  const handleUpdateStudentLocal = (updated) => {
    if (updated.country !== localStudent.country) {
      const archivedVisa = {
        country: localStudent.country,
        milestones: localStudent.visa || {},
        archivedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      updated.visaHistory = [...localStudent.visaHistory || [], archivedVisa];
      updated.visa = {};
      onAddActivity?.({
        user: userRole,
        role: userRole,
        action: "reconfigured Visa Pilot",
        target: `Destination changed from ${localStudent.country} to ${updated.country}. Old progress archived.`,
        type: "system",
        studentName: localStudent.name,
        studentId: localStudent.id
      });
    }
    const slaNext = reconcileStudentSlaViolationsWithDocuments(updated);
    const next = slaNext !== void 0 ? { ...updated, slaViolations: slaNext } : updated;
    setLocalStudent(next);
    return onUpdateStudent?.(next);
  };
  const handleResumeSaveCV = (cvData, mergeBase) => {
    handleUpdateStudentLocal({
      ...(mergeBase || localStudent),
      generatedCV: cvData
    });
    onNotify?.("Resume saved", `${localStudent.name}'s AI resume was saved.`, "success");
  };
  const handleProfileUploadCv = async (payload) => {
    if (!onUploadStudentCv) {
      return { ok: false, error: "Student CV upload is not available." };
    }
    const result = await onUploadStudentCv(payload);
    if (result?.ok && result.data) {
      handleUpdateStudentLocal(result.data);
    }
    return result;
  };
  const handleAdvancePipeline = () => {
    if (!nextStep) return;
    const defaultTaskActions = remainingStudentTasks.reduce((acc, task) => {
      acc[task.id] = "assign-me";
      return acc;
    }, {});
    setAdvanceDialog({
      open: true,
      counselorMode: "current",
      counselorId: localStudent.counselor || "",
      taskActions: defaultTaskActions
    });
  };
  const openContactDialog = () => {
    if (!canManagerEditContact) return;
    setContactDialog({
      open: true,
      email: String(localStudent.email || ""),
      phone: String(localStudent.phone || "")
    });
  };
  const closeContactDialog = () => {
    setContactDialog((prev) => ({ ...prev, open: false }));
  };
  const openBudgetDialog = () => {
    if (!canSetAnnualBudget || hasStudentAnnualBudget(localStudent)) return;
    setBudgetDialog({
      open: true,
      budget: "",
      budgetCurrency: String(localStudent.budgetCurrency || "LKR").trim().toUpperCase() || "LKR"
    });
  };
  const closeBudgetDialog = () => {
    setBudgetDialog((prev) => ({ ...prev, open: false }));
  };
  const handleSaveAnnualBudget = () => {
    if (!canSetAnnualBudget || hasStudentAnnualBudget(localStudent)) return;
    const nextBudget = String(budgetDialog.budget || "").trim();
    const nextCurrency = String(budgetDialog.budgetCurrency || "LKR").trim().toUpperCase() || "LKR";
    const amount = Number(nextBudget.replace(/[^\d.]/g, ""));
    if (!nextBudget || !Number.isFinite(amount) || amount <= 0) return;
    const updated = {
      ...localStudent,
      budget: nextBudget,
      budgetCurrency: nextCurrency
    };
    handleUpdateStudentLocal(updated);
    onAddActivity?.({
      user: userRole,
      role: userRole,
      action: "set annual budget",
      target: `${localStudent.name} (${formatStudentAnnualBudget(updated)})`,
      type: "system",
      studentName: localStudent.name,
      studentId: localStudent.id
    });
    closeBudgetDialog();
  };
  const handleSaveContactDetails = () => {
    if (!canManagerEditContact) return;
    const nextEmail = String(contactDialog.email || "").trim();
    const nextPhone = String(contactDialog.phone || "").trim();
    const prevEmail = String(localStudent.email || "").trim();
    const prevPhone = String(localStudent.phone || "").trim();
    if (!nextEmail || !nextPhone) return;
    if (nextEmail === prevEmail && nextPhone === prevPhone) {
      closeContactDialog();
      return;
    }
    const updated = {
      ...localStudent,
      email: nextEmail,
      phone: nextPhone
    };
    handleUpdateStudentLocal(updated);
    onAddActivity?.({
      user: userRole,
      role: userRole,
      action: "updated contact details",
      target: `${localStudent.name} (${nextEmail}, ${nextPhone})`,
      type: "system",
      studentName: localStudent.name,
      studentId: localStudent.id
    });
    closeContactDialog();
  };
  const handleConfirmAdvancePipeline = () => {
    if (nextStep) {
      if (nextStep === "Enrolled") {
        const blockReasons = getEnrolledAdvanceBlockReasons(localStudent, studentInvoices);
        if (blockReasons.length > 0) {
          onNotify?.("Cannot move to Enrolled", blockReasons.join("\n\n"), "error");
          return;
        }
      }
      const studentDocs = localStudent.documents || [];
      const stageId = resolveStudentStageId(localStudent.status, countryDocConfig?.stages);
      let allMissingItems = getRequiredDocTypesBeforeAdvance(localStudent.status, countryDocConfig)
        .filter(({ docType }) => !studentHasUploadedDocType(studentDocs, docType))
        .map(({ docType }) => docType);
      if (stageId === "documentation") {
        for (const { docType } of collectMissingVisaPilotUploads(localStudent, countryDocConfig)) {
          allMissingItems.push(docType);
        }
      }
      allMissingItems = [...new Set(allMissingItems)];
      const selectedCounselor = availableBranchCounselors.find((employee) => employee.id === advanceDialog.counselorId);
      const shouldAssignAnother = advanceDialog.counselorMode === "another" && advanceDialog.counselorId;
      const nextCounselorId = shouldAssignAnother ? String(advanceDialog.counselorId || "").trim() : "";
      const docTaskCounselorId = nextCounselorId || String(localStudent.counselor || "").trim() || currentCounselorId;
      const relatedCounselorIds = Array.from(
        new Set(
          [
            String(localStudent.counselor || "").trim(),
            String(localStudent.inquiryCounselorId || "").trim(),
            String(currentCounselorId || "").trim(),
            String(nextCounselorId || "").trim(),
            ...(Array.isArray(localStudent.counselorHistory) ? localStudent.counselorHistory : []).map((id) => String(id || "").trim())
          ].filter((id) => id && id !== "Unassigned")
        )
      );
      const buildDueDate = (daysFromNow = 3) => {
        const due = new Date();
        due.setDate(due.getDate() + daysFromNow);
        return due.toISOString().split("T")[0];
      };
      let updatedViolations = [...localStudent.slaViolations || []];
      if (allMissingItems.length > 0) {
        const existingTaskTypes = new Set(
          (tasks || [])
            .filter((t) => {
              const tid = resolveTaskStudentKey(t);
              const pk = resolveProfileStudentKey(localStudent);
              return Boolean(pk) && Boolean(tid) && tid === pk && t.status !== "Completed";
            })
            .map((t) => String(t.documentType || "").trim())
            .filter(Boolean)
        );
        const now = Date.now();
        const docTasks = allMissingItems
          .filter((docType) => !existingTaskTypes.has(String(docType || "").trim()))
          .map((docType, idx) => ({
            id: `T-DOC-${localStudent.id}-${now}-${idx}`,
            task: `Upload ${docType}`,
            assigned_to: relatedCounselorIds.length > 0 ? relatedCounselorIds : docTaskCounselorId ? [docTaskCounselorId] : [],
            counselor_ids: relatedCounselorIds,
            student_id: localStudent.id,
            priority: "High",
            status: "Pending",
            dueDate: buildDueDate(3),
            tier: "Global",
            phase: 1,
            isBlocking: true,
            isPrivate: true,
            documentType: docType
          }));
        if (docTasks.length > 0) {
          onAddTasks?.(docTasks);
        }
        updatedViolations = [...updatedViolations, {
          id: `SLA-${Date.now()}`,
          stage: localStudent.status,
          missingItems: allMissingItems,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          resolved: false
        }];
        onAddActivity?.({
          user: userRole,
          role: userRole,
          action: "advanced stage with missing required documents",
          target: `${allMissingItems.slice(0, 6).join(", ")} (${localStudent.name})`,
          type: "system",
          studentName: localStudent.name,
          studentId: localStudent.id
        });
      }
      const taskUpdates = remainingStudentTasks.map((task) => {
        const selectedAction = advanceDialog.taskActions?.[task.id] || "assign-me";
        const actionType = !shouldAssignAnother && selectedAction === "assign-next" ? "assign-me" : selectedAction;
        if (shouldAssignAnother && actionType === "assign-next") {
          return {
            ...task,
            assigned_to: nextCounselorId ? [nextCounselorId] : task.assigned_to || [],
            isPrivate: true
          };
        }
        if (actionType === "student-task") {
          const recipients = [localStudent.id, currentCounselorId, nextCounselorId].filter(Boolean);
          return {
            ...task,
            assigned_to: Array.from(new Set(recipients)),
            isPrivate: false
          };
        }
        return {
          ...task,
          assigned_to: currentCounselorId ? [currentCounselorId] : task.assigned_to || [],
          isPrivate: true
        };
      });
      const updated = {
        ...localStudent,
        status: nextStep,
        slaViolations: updatedViolations,
        counselor: shouldAssignAnother ? advanceDialog.counselorId : localStudent.counselor,
        counselorName: shouldAssignAnother ? selectedCounselor?.name || selectedCounselor?.username || localStudent.counselorName : localStudent.counselorName
      };
      handleUpdateStudentLocal(updated);
      onAddActivity?.({
        user: userRole,
        role: userRole,
        action: "moved pipeline to",
        target: `${nextStep} (${localStudent.name})`,
        type: "approval",
        studentName: localStudent.name,
        studentId: localStudent.id
      });
      if (taskUpdates.length > 0) {
        onUpdateTasks?.(taskUpdates);
      }
      if (nextStep === "Interview training") {
        const interviewTask = {
          id: `T-INT-${localStudent.id}-${Date.now()}`,
          task: "Create Interview for student",
          assigned_to: [shouldAssignAnother ? advanceDialog.counselorId : currentCounselorId].filter(Boolean),
          student_id: localStudent.id,
          priority: "High",
          status: "Pending",
          dueDate: buildDueDate(2),
          tier: "Global",
          phase: 1,
          isBlocking: false,
          isPrivate: true
        };
        onAddTasks?.([interviewTask]);
        onAddActivity?.({
          user: userRole,
          role: userRole,
          action: "created interview setup task",
          target: `${localStudent.name} (Interview training)`,
          type: "task",
          studentName: localStudent.name,
          studentId: localStudent.id
        });
      }
      if (shouldAssignAnother && selectedCounselor) {
        onAddActivity?.({
          user: userRole,
          role: userRole,
          action: "reassigned counselor",
          target: `${selectedCounselor?.name || selectedCounselor?.username || "Counselor"} (${localStudent.name})`,
          type: "system",
          studentName: localStudent.name,
          studentId: localStudent.id
        });
      }
      if (taskUpdates.length > 0) {
        onAddActivity?.({
          user: userRole,
          role: userRole,
          action: "updated remaining task ownership",
          target: `${taskUpdates.length} task(s) for ${localStudent.name}`,
          type: "task",
          studentName: localStudent.name,
          studentId: localStudent.id
        });
      }
      setAdvanceDialog((prev) => ({ ...prev, open: false }));
    }
  };
  const PriorityBadge = ({ priority }) => {
    if (!priority) return null;
    const styles = {
      High: "bg-rose-100 text-rose-700",
      Medium: "bg-amber-100 text-amber-700",
      Low: "bg-slate-100 text-slate-700"
    };
    return /* @__PURE__ */ jsxs("span", { className: `px-2 py-1 text-xs font-bold rounded ${styles[priority]}`, children: [
      priority.toUpperCase(),
      " PRIORITY"
    ] });
  };
  const handlePipelineDocumentUpdate = async (doc) => {
    const updatedDocs =
      localStudent.documents?.map((d) => (String(d.id) === String(doc.id) ? doc : d)) || [];
    const slaNext = reconcileStudentSlaViolationsWithDocuments({ ...localStudent, documents: updatedDocs });
    const updatedStudent =
      slaNext !== void 0 ? { ...localStudent, documents: updatedDocs, slaViolations: slaNext } : { ...localStudent, documents: updatedDocs };
    setLocalStudent(updatedStudent);
    const persistResult = await onUpdateStudent?.(updatedStudent);
    if (persistResult && persistResult.ok === false) {
      return persistResult;
    }
    if (doc.status === "Rejected") {
      onAddActivity?.({
        user: userRole,
        role: userRole,
        action: "rejected document",
        target: `${doc.name} (Reason: ${doc.rejectionReason})`,
        type: "system",
        studentName: localStudent.name,
        studentId: localStudent.id
      });
    } else if (doc.status === "Verified") {
      onAddActivity?.({
        user: userRole,
        role: userRole,
        action: "verified document",
        target: `${doc.name}`,
        type: "approval",
        studentName: localStudent.name,
        studentId: localStudent.id
      });
    }
    return persistResult;
  };
  const handleDeleteStudentDocument = async (doc) => {
    if (userRole === "Student") {
      return { ok: false, error: "Students cannot remove documents." };
    }
    const previousDocs = localStudent.documents || [];
    const updatedDocs = previousDocs.filter((d) => String(d.id) !== String(doc.id));
    const slaNext = reconcileStudentSlaViolationsWithDocuments({ ...localStudent, documents: updatedDocs });
    const updatedStudent =
      slaNext !== void 0 ? { ...localStudent, documents: updatedDocs, slaViolations: slaNext } : { ...localStudent, documents: updatedDocs };
    setLocalStudent(updatedStudent);
    const persistResult = await onUpdateStudent?.(updatedStudent);
    if (persistResult && persistResult.ok === false) {
      setLocalStudent({ ...localStudent, documents: previousDocs });
      return persistResult;
    }
    onAddActivity?.({
      user: userRole,
      role: userRole,
      action: doc.status === "Verified" ? "removed approved document" : "removed rejected document",
      target: doc.name,
      type: "system",
      studentName: localStudent.name,
      studentId: localStudent.id
    });
    return persistResult;
  };
  const renderContent = () => {
    switch (activeTab) {
      case "pipeline":
        return /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(TaskDocumentRequestsPanel, {
            student: localStudent,
            tasks,
            userRole,
            onUploadDocument: onUploadStudentDocument,
            onUpdateDocument: handlePipelineDocumentUpdate,
            onUpdateTasks
          }),
          /* @__PURE__ */ jsx(DocumentManager, { student: localStudent, userRole, countryDocConfig, onUpdateDocument: handlePipelineDocumentUpdate, onDeleteDocument: handleDeleteStudentDocument, tasks, onUpdateTasks, onUploadDocument: onUploadStudentDocument, onUploadProfileOtherDocument: onUploadStudentProfileOtherDocument, onUploadUniversityOfferLetters: onUploadStudentUniversityOfferLetters })
        ] });
      case "show-money":
        return /* @__PURE__ */ jsx(FinancialCalculator, { student: localStudent, onUpdateStudent: handleUpdateStudentLocal });
      case "visa-pilot":
        return /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(VisaPilot, { student: localStudent, userRole, countryDocConfig, onUpdateStudent: handleUpdateStudentLocal, onUploadDocument: onUploadStudentDocument, onDeleteDocument: handleDeleteStudentDocument }),
          /* @__PURE__ */ jsx(DocumentManager, { student: localStudent, userRole, countryDocConfig, onUpdateDocument: handlePipelineDocumentUpdate, onDeleteDocument: handleDeleteStudentDocument, tasks, onUpdateTasks, onUploadDocument: onUploadStudentDocument, onUploadProfileOtherDocument: onUploadStudentProfileOtherDocument, onUploadUniversityOfferLetters: onUploadStudentUniversityOfferLetters, showPipelineChecklist: false, showUniversityOfferLettersBlock: false, showProfileOtherDocuments: true })
        ] });
      case "ledger":
        return /* @__PURE__ */ jsx(FinanceModule, {
          student: localStudent,
          paymentAccounts,
          userRole,
          onUpdateInvoice,
          onCreateInvoice,
          onNotify,
          openCreateInvoice: openInvoiceCreatePending
        });
      case "resume":
        return /* @__PURE__ */ jsx("div", { className: "rounded-xl border border-slate-100 bg-slate-50/50 -mx-1 px-1 py-3 sm:mx-0 sm:px-0", children: /* @__PURE__ */ jsx(AIResumeBuilder, {
          embedMode: true,
          onSaveCV: handleResumeSaveCV,
          currentStudent: localStudent,
          onUploadStudentCv: onUploadStudentCv ? handleProfileUploadCv : void 0,
          onUploadStudentDocument
        }) });
      default:
        return null;
    }
  };
  return /* @__PURE__ */ jsxs(
    motion.div,
    {
      initial: { opacity: 0, x: 20 },
      animate: { opacity: 1, x: 0 },
      transition: { duration: 0.3 },
      className: "h-full flex flex-col p-6 bg-slate-50/50 font-sans",
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col md:flex-row md:items-center justify-between mb-4 flex-shrink-0 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("button", { onClick: onBack, className: "p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500 flex-shrink-0", children: /* @__PURE__ */ jsx(ArrowLeft, { size: 20 }) }),
            /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 flex-wrap", children: [
                /* @__PURE__ */ jsx("h1", { className: "text-xl md:text-2xl font-bold text-slate-800 tracking-tight truncate", children: localStudent.name }),
                /* @__PURE__ */ jsx("span", { className: "text-sm font-mono text-slate-400 pt-1 hidden sm:inline", children: localStudent.id }),
                /* @__PURE__ */ jsx(PriorityBadge, { priority: localStudent.priority }),
                stageSlaDisplay && /* @__PURE__ */ jsxs(
                  "span",
                  {
                    className: `inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded border ${stageSlaToneClass}`,
                    title: `Workflow stage session — ${stageSlaDisplay.stage} (target ${stageSlaDisplay.slaLabel} from stage entry). ${stageSlaDisplay.text}`,
                    children: [
                      /* @__PURE__ */ jsx(Clock, { size: 12, strokeWidth: 2, className: "flex-shrink-0 opacity-90" }),
                      stageSlaDisplay.text
                    ]
                  }
                )
              ] }),
              profileMetricsRow
                ? /* @__PURE__ */ jsx("div", { className: "mt-1 text-slate-500", children: profileMetricsRow })
                : null
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 self-end md:self-auto", children: [
            /* @__PURE__ */ jsxs(Button, {
              variant: "outline",
              onClick: handleExportDocuments,
              size: "sm",
              disabled: exportingDocuments,
              title: "Download pipeline & visa documents, student CSV, and full JSON export",
              children: [
                /* @__PURE__ */ jsx(Archive, { size: 16, strokeWidth: 1.5, className: "mr-2" }),
                exportingDocuments ? " Exporting…" : " Export"
              ]
            }),
            /* @__PURE__ */ jsxs(Button, { variant: "outline", onClick: () => onNavigate("messages"), size: "sm", children: [
              /* @__PURE__ */ jsx(MessageSquare, { size: 16, strokeWidth: 1.5, className: "mr-2" }),
              " Message"
            ] }),
            /* @__PURE__ */ jsxs(Button, { onClick: () => onOpenCreateTaskModal(localStudent), size: "sm", children: [
              /* @__PURE__ */ jsx(PlusCircle, { size: 16, strokeWidth: 1.5, className: "mr-2" }),
              " Task"
            ] })
          ] })
        ] }),
        effectiveStatus === "Inquiry" && showCounselorsRosterSection && /* @__PURE__ */ jsxs("div", { className: "mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3 min-w-0", children: [
            /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0 mt-1.5" }),
            /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxs("p", { className: "text-sm font-medium text-amber-900", children: [
                localStudent.name || "Student",
                " is in Inquiry stage"
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5", children: [
                /* @__PURE__ */ jsx("p", { className: "text-xs text-amber-700", children: "Initiate first counselor meeting and capture inquiry details." }),
                (localStudent.stageEnteredAt || localStudent.createdAt) && /* @__PURE__ */ jsxs("span", { className: "text-[11px] text-amber-800", children: [
                  "Inquiry SLA ",
                  /* @__PURE__ */ jsx(InquirySlaBadge, { startedAt: localStudent.stageEnteredAt || localStudent.createdAt, nowMs: inquiryNowMs })
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsx(Button, {
            size: "sm",
            variant: "ghost",
            className: "shrink-0 self-start sm:self-auto",
            onClick: () =>
              setInquiryTarget({
                student: localStudent,
                assignmentAlert: null,
                _key: `profile-inquiry-${Date.now()}`
              }),
            children: "Start Inquiry"
          })
        ] }),
        hasOpenSlaViolationsForCurrentStage(localStudent) && /* @__PURE__ */ jsxs("div", { className: "mb-6 bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-4 shadow-sm animate-pulse", children: [
          /* @__PURE__ */ jsx("div", { className: "bg-rose-100 p-2 rounded-xl text-rose-600", children: /* @__PURE__ */ jsx(ShieldAlert, { size: 24 }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
            /* @__PURE__ */ jsx("h4", { className: "text-sm font-bold text-rose-900", children: "SLA Requirement Notice" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-700 mt-1", children: slaNoticeCounselorTeam.length === 0 ? `Mandatory ${effectiveStatus} requirements are incomplete on this record. SLA impact applies once counselors are assigned.` : slaNoticeCounselorTeam.length > 1 ? `Mandatory ${effectiveStatus} requirements are incomplete. This can impact each related counselor's SLA score until resolved.` : `Mandatory ${effectiveStatus} requirements are incomplete. This will impact the counselor's SLA score until resolved.` }),
            slaNoticeCounselorTeam.length > 0 ? /* @__PURE__ */ jsxs("div", { className: "mt-2", children: [
              /* @__PURE__ */ jsx("p", { className: "text-[10px] font-bold uppercase tracking-wide text-rose-800/90", children: "Related counselors" }),
              /* @__PURE__ */ jsx("div", { className: "mt-1.5 flex flex-wrap gap-1.5", children: slaNoticeCounselorTeam.map((c) => /* @__PURE__ */ jsxs("span", { className: "inline-flex max-w-full items-center gap-1 rounded-lg border border-rose-100 bg-white/70 px-2 py-1 text-[11px] text-rose-900 shadow-sm", children: [
                /* @__PURE__ */ jsx("span", { className: "font-semibold truncate", children: c.name }),
                c.badgeLabel ? /* @__PURE__ */ jsx("span", { className: "shrink-0 text-[10px] font-medium text-rose-600", children: [
                  "(",
                  c.badgeLabel,
                  ")"
                ] }) : null
              ] }, c.id)) })
            ] }) : /* @__PURE__ */ jsx("p", { className: "mt-2 text-[11px] text-rose-600/90 italic", children: "No counselors linked on this record yet." }),
            /* @__PURE__ */ jsx("div", { className: "mt-3 flex flex-wrap gap-2", children: (() => {
              const seen = new Map();
              const studentDocs = localStudent.documents || [];
              for (const v of currentStageOpenSlaViolations) {
                const items = getEffectiveSlaViolationMissingItems(v, studentDocs);
                if (items.length === 0) continue;
                const key = `${v.stage || ""}::${[...items].map((s) => String(s).trim().toLowerCase()).sort().join("|")}`;
                const existing = seen.get(key);
                if (existing) {
                  existing.count += 1;
                  continue;
                }
                seen.set(key, { key, id: v.id || key, stage: v.stage, missingItems: items, count: 1 });
              }
              return [...seen.values()].map((v) => /* @__PURE__ */ jsxs("div", { className: "bg-white/60 border border-rose-100 px-2 py-1 rounded-lg text-[10px] font-bold text-rose-800 inline-flex items-center gap-1", children: [
                /* @__PURE__ */ jsxs("span", { children: [
                  v.stage,
                  ": Missing ",
                  v.missingItems.join(", ")
                ] }),
                v.count > 1 && /* @__PURE__ */ jsxs("span", { className: "ml-1 px-1 rounded bg-rose-100 text-rose-700 text-[9px]", children: ["x", v.count] })
              ] }, v.id));
            })() })
          ] }),
          canEscalateSlaNotice && /* @__PURE__ */ jsx(Button, {
            size: "sm",
            variant: "outline",
            className: "border-rose-200 text-rose-700 hover:bg-rose-100 shrink-0 self-start sm:self-center",
            disabled: slaResolveBusy,
            onClick: handleSlaResolveNow,
            children: slaResolveBusy ? "Sending…" : "Resolve Now"
          })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mb-8 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsxs("p", { className: "text-xs sm:text-sm font-bold uppercase tracking-wide text-slate-600", children: [
              /* @__PURE__ */ jsx("span", { children: "Staging Progress" }),
              /* @__PURE__ */ jsx("span", { className: "mx-2.5 text-slate-400 font-normal", children: "|" }),
              /* @__PURE__ */ jsxs("span", { className: "text-indigo-700", children: [
                currentStepIndex + 1,
                " / ",
                pipelineSteps.length,
                " Steps"
              ] })
            ] }),
            /* @__PURE__ */ jsx("nav", { className: `mt-3 sm:mt-4 grid grid-cols-3 ${pipelineGridSmClass} gap-1.5 sm:gap-2 min-w-0`, "aria-label": "Pipeline stages", children: pipelineSteps.map((step, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isCurrent =
                idx === currentStepIndex ||
                stageLabelsEquivalent(step, localStudent.status) ||
                stageLabelsEquivalent(step, effectiveStatus);
              return /* @__PURE__ */ jsxs("div", { title: step, className: `flex items-center justify-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold leading-tight transition-all min-w-0 ${isCurrent ? "bg-nexgenai-navy text-white shadow-sm ring-1 ring-indigo-200" : isCompleted ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-50 text-slate-400 border border-slate-100/80"}`, children: [
                isCompleted ? /* @__PURE__ */ jsx(CheckCircle, { size: 11, className: "text-emerald-500 shrink-0" }) : /* @__PURE__ */ jsx("span", { className: `w-3.5 h-3.5 rounded-full flex shrink-0 items-center justify-center text-[8px] font-bold ${isCurrent ? "bg-white text-nexgenai-navy" : "bg-slate-200 text-slate-500"}`, children: idx + 1 }),
                /* @__PURE__ */ jsx("span", { className: "truncate", children: step })
              ] }, step);
            }) })
          ] }),
          nextStep && userRole !== "Student" ? /* @__PURE__ */ jsxs("div", { className: "shrink-0 space-y-2", children: [
            /* @__PURE__ */ jsx("p", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-tight", children: "Next Action Required" }),
            /* @__PURE__ */ jsxs(
              Button,
              {
                className: "w-full lg:w-auto lg:min-w-[11rem] bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-100 border-none h-11 px-6 rounded-xl font-bold text-sm group",
                onClick: handleAdvancePipeline,
                children: [
                  "Next Stage",
                  /* @__PURE__ */ jsx(ChevronRight, { size: 18, className: "ml-1 group-hover:translate-x-1 transition-transform" })
                ]
              }
            )
          ] }) : /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [
            /* @__PURE__ */ jsx("div", { className: "w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0", children: /* @__PURE__ */ jsx(CheckCircle, { size: 20 }) }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("p", { className: "text-xs font-bold text-slate-800", children: userRole === "Student" ? "Current Stage" : "Pipeline Completed" }),
              /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-500", children: localStudent.status })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 grid grid-cols-12 gap-6 min-h-0", children: [
          /* @__PURE__ */ jsxs("div", { className: "col-span-12 lg:col-span-8 flex flex-col min-w-0", children: [
            /* @__PURE__ */ jsx("div", { className: "border-b border-gray-200 bg-white/50 rounded-t-xl overflow-hidden", children: /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("div", { className: "flex min-w-max", children: [
              /* @__PURE__ */ jsx(TabButton, { icon: FileText, label: "Pipeline", activeTab, tabName: "pipeline", onClick: setActiveTab }),
              /* @__PURE__ */ jsx(TabButton, { icon: FileText, label: "Resume", activeTab, tabName: "resume", onClick: setActiveTab }),
              /* @__PURE__ */ jsx(TabButton, { icon: DollarSign, label: "Show Money", activeTab, tabName: "show-money", onClick: setActiveTab }),
              visaPilotUnlocked && /* @__PURE__ */ jsx(TabButton, { icon: Plane, label: "Visa", activeTab, tabName: "visa-pilot", onClick: setActiveTab }),
              /* @__PURE__ */ jsx(TabButton, { icon: Banknote, label: "Ledger", activeTab, tabName: "ledger", onClick: setActiveTab })
            ] }) }) }),
            /* @__PURE__ */ jsx("div", { className: "p-6 bg-white border-l border-r border-b border-gray-200 rounded-b-xl flex-1 overflow-y-auto", children: renderContent() })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "col-span-12 lg:col-span-4 space-y-6", children: [

            /* @__PURE__ */ jsx(StudentTasksPanel, { student: localStudent, tasks, userRole, highlightTaskId, onNavigateToTask }),
            /* @__PURE__ */ jsx(KeyDetails, { student: localStudent, canEditContact: canManagerEditContact, onEditContact: openContactDialog, canSetBudget: canSetAnnualBudget, onSetBudget: openBudgetDialog }),
            /* @__PURE__ */ jsx(SpecializedNotes, { student: localStudent, onUpdateStudent: handleUpdateStudentLocal, currentUser, authenticatedUser, userRole }),
            showCounselorsRosterSection && /* @__PURE__ */ jsx(StudentProfileCounselorsRoster, { student: localStudent, employees }),
            /* @__PURE__ */ jsx(StudentHistory, { activities, student: localStudent, assignedCounselorName }),
            /* @__PURE__ */ jsx(MeetingNotes, { student: localStudent, onUpdateStudent: handleUpdateStudentLocal, currentUser, authenticatedUser, userRole })
          ] })
        ] }),
        contactDialog.open && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm", onClick: closeContactDialog, children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-2xl max-w-md w-full overflow-hidden", onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80", children: [
            /* @__PURE__ */ jsx("h4", { className: "text-sm font-semibold text-slate-900", children: "Edit contact details" }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "p-1 rounded-md text-slate-500 hover:bg-slate-100", onClick: closeContactDialog, children: /* @__PURE__ */ jsx(X, { size: 18 }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "p-4 space-y-3", children: [
            /* @__PURE__ */ jsxs("label", { className: "block", children: [
              /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-slate-700", children: "Email" }),
              /* @__PURE__ */ jsx("input", { type: "email", value: contactDialog.email, onChange: (e) => setContactDialog((prev) => ({ ...prev, email: e.target.value })), className: "mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500", placeholder: "student@email.com" })
            ] }),
            /* @__PURE__ */ jsxs("label", { className: "block", children: [
              /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-slate-700", children: "Phone" }),
              /* @__PURE__ */ jsx("input", { type: "text", value: contactDialog.phone, onChange: (e) => setContactDialog((prev) => ({ ...prev, phone: e.target.value })), className: "mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500", placeholder: "+8801XXXXXXXXX" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-t border-gray-100 flex justify-end gap-2", children: [
            /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: closeContactDialog, children: "Cancel" }),
            /* @__PURE__ */ jsx(Button, { size: "sm", onClick: handleSaveContactDetails, disabled: !String(contactDialog.email || "").trim() || !String(contactDialog.phone || "").trim(), children: "Save changes" })
          ] })
        ] }) }),
        budgetDialog.open && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm", onClick: closeBudgetDialog, children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-2xl max-w-md w-full overflow-hidden", onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80", children: [
            /* @__PURE__ */ jsx("h4", { className: "text-sm font-semibold text-slate-900", children: "Set annual budget" }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "p-1 rounded-md text-slate-500 hover:bg-slate-100", onClick: closeBudgetDialog, children: /* @__PURE__ */ jsx(X, { size: 18 }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "p-4 space-y-3", children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "This student has no annual budget on file. Enter their estimated annual study budget to continue." }),
            /* @__PURE__ */ jsxs("label", { className: "block", children: [
              /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-slate-700", children: "Annual budget" }),
              /* @__PURE__ */ jsxs("div", { className: "mt-1 flex gap-2", children: [
                /* @__PURE__ */ jsx("input", { type: "number", min: "0", step: "any", value: budgetDialog.budget, onChange: (e) => setBudgetDialog((prev) => ({ ...prev, budget: e.target.value })), className: "min-w-0 flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500", placeholder: "e.g. 25000" }),
                /* @__PURE__ */ jsx("select", { value: budgetDialog.budgetCurrency, onChange: (e) => setBudgetDialog((prev) => ({ ...prev, budgetCurrency: e.target.value })), className: "w-28 shrink-0 text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:border-indigo-500 bg-white", "aria-label": "Currency", children: BUDGET_CURRENCIES.map((c) => /* @__PURE__ */ jsx("option", { value: c.value, children: c.label }, c.value)) })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-t border-gray-100 flex justify-end gap-2", children: [
            /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: closeBudgetDialog, children: "Cancel" }),
            /* @__PURE__ */ jsx(Button, { size: "sm", onClick: handleSaveAnnualBudget, disabled: !String(budgetDialog.budget || "").trim() || !(Number(String(budgetDialog.budget || "").replace(/[^\d.]/g, "")) > 0), children: "Save budget" })
          ] })
        ] }) }),
        advanceDialog.open && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[160] overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/50 backdrop-blur-sm", onClick: () => setAdvanceDialog((prev) => ({ ...prev, open: false })), children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col my-auto", onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ jsxs("div", { className: "px-5 py-4 border-b border-gray-100 bg-slate-50/80 flex items-center justify-between shrink-0", children: [
            /* @__PURE__ */ jsx("h3", { className: "text-sm font-bold text-slate-900", children: "Move to next stage" }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "p-1 rounded-md text-slate-500 hover:bg-slate-100", onClick: () => setAdvanceDialog((prev) => ({ ...prev, open: false })), children: /* @__PURE__ */ jsx(X, { size: 18 }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "p-5 space-y-4 overflow-y-auto flex-1 min-h-0", children: [
            /* @__PURE__ */ jsxs("div", { className: "bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-800", children: [
              /* @__PURE__ */ jsxs("p", { className: "font-semibold", children: ["Upcoming stage: ", nextStep || "N/A"] }),
              /* @__PURE__ */ jsx("p", { className: "mt-1", children: "Review pending tasks and assign who will continue counseling for remaining stages." })
            ] }),
            nextStep === "Enrolled" && enrolledAdvanceBlockReasons.length > 0 && /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 space-y-2", children: [
              /* @__PURE__ */ jsx("p", { className: "font-bold", children: "Enrolled is blocked until:" }),
              /* @__PURE__ */ jsx("ul", { className: "list-disc pl-4 space-y-1", children: enrolledAdvanceBlockReasons.map((r, i) => /* @__PURE__ */ jsx("li", { className: "whitespace-pre-wrap", children: r }, i)) }),
              /* @__PURE__ */ jsx("p", { className: "text-[11px] text-rose-800", children: "Complete pipeline documents (all checklist stages), the Visa tab checklist, and pay every invoice (Paid status)." })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold text-slate-700 mb-2", children: "Remaining tasks" }),
              remainingStudentTasks.length > 0 ? /* @__PURE__ */ jsx("div", { className: "max-h-56 overflow-y-auto space-y-2 pr-1", children: remainingStudentTasks.map((task) => /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs space-y-2", children: [
                /* @__PURE__ */ jsx("p", { className: "font-medium text-slate-800", children: task.task }),
                /* @__PURE__ */ jsxs("p", { className: "text-[11px] text-slate-500 mt-1", children: ["Status: ", task.status, task.dueDate ? ` | Due: ${task.dueDate}` : ""] }),
                /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                  /* @__PURE__ */ jsx("label", { className: "text-[11px] font-semibold text-slate-700", children: "Action for this task" }),
                  /* @__PURE__ */ jsx("select", { value: advanceDialog.counselorMode !== "another" && (advanceDialog.taskActions?.[task.id] || "assign-me") === "assign-next" ? "assign-me" : advanceDialog.taskActions?.[task.id] || "assign-me", onChange: (e) => setAdvanceDialog((prev) => ({
                    ...prev,
                    taskActions: {
                      ...prev.taskActions,
                      [task.id]: e.target.value
                    }
                  })), className: "w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 bg-white", children: advanceDialog.counselorMode === "another" ? [
                    /* @__PURE__ */ jsx("option", { value: "assign-me", children: "Assign for current counselor" }),
                    /* @__PURE__ */ jsx("option", { value: "assign-next", children: "Assign for next counselor" }),
                    /* @__PURE__ */ jsx("option", { value: "student-task", children: "Add as Student Task (Student + Me + Next Counselor)" })
                  ] : [
                    /* @__PURE__ */ jsx("option", { value: "assign-me", children: "Assign for current counselor" }),
                    /* @__PURE__ */ jsx("option", { value: "student-task", children: "Assign for student as a task and for me also" })
                  ] })
                ] })
              ] }, task.id)) }) : /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "No pending tasks for this student." })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold text-slate-700", children: "Who will conduct the student in remaining stages?" }),
              /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-xs text-slate-700", children: [
                /* @__PURE__ */ jsx("input", { type: "radio", name: "counselor-mode", checked: advanceDialog.counselorMode === "current", onChange: () => setAdvanceDialog((prev) => ({ ...prev, counselorMode: "current", counselorId: "" })) }),
                "Current counselor will continue"
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-xs text-slate-700", children: [
                /* @__PURE__ */ jsx("input", { type: "radio", name: "counselor-mode", checked: advanceDialog.counselorMode === "another", onChange: () => setAdvanceDialog((prev) => ({ ...prev, counselorMode: "another", counselorId: "" })) }),
                "Assign another counselor"
              ] }),
              advanceDialog.counselorMode === "another" && /* @__PURE__ */ jsx("select", { value: advanceDialog.counselorId, onChange: (e) => setAdvanceDialog((prev) => ({ ...prev, counselorId: e.target.value })), className: "mt-1 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 bg-white", children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Select counselor" }),
                ...reassignableBranchCounselors.map((employee) => /* @__PURE__ */ jsx("option", { value: employee.id, children: employee.name || employee.username || employee.email || employee.id }, employee.id))
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "px-5 py-4 border-t border-gray-100 flex justify-end gap-2 bg-white shrink-0", children: [
            /* @__PURE__ */ jsx(Button, { variant: "outline", onClick: () => setAdvanceDialog((prev) => ({ ...prev, open: false })), children: "Cancel" }),
            /* @__PURE__ */ jsx(Button, { onClick: handleConfirmAdvancePipeline, disabled: advanceDialog.counselorMode === "another" && !advanceDialog.counselorId || nextStep === "Enrolled" && enrolledAdvanceBlockReasons.length > 0, children: "Confirm & Continue" })
          ] })
        ] }) }),
        /* @__PURE__ */ jsx(InquiryCaptureFlowModals, {
          target: inquiryTarget,
          onClear: () => setInquiryTarget(null),
          currentUser,
          allStudents,
          onUpdateStudent: handleUpdateStudentLocal,
          onDismissAssignmentAlert,
          onStudentMovedToRequests,
          onSelectStudent
        })
      ]
    }
  );
};
const TabButton = ({ icon: Icon, label, activeTab, tabName, onClick }) => /* @__PURE__ */ jsxs(
  "button",
  {
    onClick: () => onClick(tabName),
    className: `shrink-0 whitespace-nowrap py-3 px-4 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-nexgenai-navy ${activeTab === tabName ? "border-indigo-600 text-indigo-600 bg-white" : "border-transparent text-slate-500 hover:bg-slate-50"}`,
    children: [
      /* @__PURE__ */ jsx(Icon, { size: 16, strokeWidth: 1.5 }),
      label
    ]
  }
);
export {
  StudentProfile
};
