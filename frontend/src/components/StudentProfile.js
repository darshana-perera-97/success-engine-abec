import { jsx, jsxs } from "react/jsx-runtime";
import React, { useState, useEffect } from "react";
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
  Download,
  Eye,
  Pencil,
  Trash2,
  X
} from "lucide-react";
import { DocumentManager } from "./DocumentManager";
import { COUNTRY_CHECKLISTS } from "../constants";
import { FinancialCalculator } from "./FinancialCalculator";
import { FinanceModule } from "./FinanceModule";
import { VisaPilot } from "./VisaPilot";
import { PIPELINE_STEPS, normalizePipelineStatus } from "../pipeline";
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
function isCounselorRole(roleValue) {
  const role = String(roleValue || "").trim().toLowerCase();
  return role.includes("counselor") || role.includes("counsellor") || role.includes("consultor");
}
const KeyDetails = ({ student, canEditContact = false, onEditContact }) => {
  const details = [
    { icon: MapPin, label: "Branch", value: student.branch },
    { icon: DollarSign, label: "Annual Budget", value: `$${student.budget}` },
    { icon: Mail, label: "Email", value: student.email },
    { icon: Phone, label: "Contact", value: student.phone }
  ];
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "Key Details" }),
      canEditContact && /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "outline", className: "h-8 px-2.5 text-[11px]", onClick: onEditContact, children: [
        /* @__PURE__ */ jsx(Pencil, { size: 13, strokeWidth: 1.75, className: "mr-1.5" }),
        "Edit Contact"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "space-y-4", children: details.map((item) => /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx(item.icon, { className: "text-slate-400 flex-shrink-0 mt-0.5", size: 16, strokeWidth: 1.5 }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: item.label }),
        /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-800", children: item.value })
      ] })
    ] }, item.label)) })
  ] });
};
const StudentTasksPanel = ({ student, tasks = [], userRole }) => {
  const studentTasks = tasks.filter((task) => {
    if (task.student_id !== student.id) return false;
    if (userRole === "Student" && task.isPrivate) return false;
    return true;
  });
  const pendingCount = studentTasks.filter((task) => task.status !== "Completed").length;
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-slate-900", children: "Student Tasks" }),
      /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wide", children: [
        pendingCount,
        " Pending"
      ] })
    ] }),
    studentTasks.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic", children: "No tasks found for this student." }) : /* @__PURE__ */ jsx("div", { className: "space-y-2 max-h-52 overflow-y-auto pr-1", children: studentTasks.slice(0, 8).map((task) => /* @__PURE__ */ jsxs("div", { className: "p-2.5 rounded-lg border border-slate-100 bg-slate-50", children: [
      /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold text-slate-800", children: task.task }),
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
    ] }, task.id)) })
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
const StudentHistory = ({ activities, student, assignedCounselorName = "" }) => {
  const genericLabels = new Set(["Counselor", "Country Coordinator", "Manager", "Team Lead", "Admin", "Student", "System"]);
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
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-700 truncate capitalize", children: activity.action === "rejected document" ? "Remove doc" : activity.action === "verified document" ? "Verify doc" : activity.action === "added specialized note" ? "Notes" : activity.action }),
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
          activity.counselorName && !genericLabels.has(String(activity.counselorName || "").trim()) ? activity.counselorName : assignedCounselorName || (activity.role === "Counselor" ? activity.actorName || activity.user || "N/A" : "N/A"),
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
  onUpdateTasks,
  activities = [],
  invoices = [],
  onUpdateInvoice,
  onCreateInvoice,
  onUploadStudentDocument,
  employees = [],
  currentUser = null,
  authenticatedUser = null
}) => {
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
  useEffect(() => {
    setLocalStudent(student);
  }, [student]);
  const effectiveStatus = normalizePipelineStatus(localStudent.status);
  const currentStepIndex = Math.max(0, PIPELINE_STEPS.indexOf(effectiveStatus));
  const nextStep = PIPELINE_STEPS[currentStepIndex + 1];
  const remainingStudentTasks = tasks.filter((task) => task.student_id === localStudent.id && task.status !== "Completed");
  const actingCounselorId = String(currentUser?.id || authenticatedUser?.id || localStudent.counselor || "").trim();
  const currentCounselorId = String(localStudent.counselor || "").trim() || actingCounselorId;
  const availableBranchCounselors = employees.filter((employee) => {
    if (!isCounselorRole(employee?.role || employee?.position)) return false;
    const studentBranch = localStudent.branch || localStudent.nearestOffice || "";
    if (!studentBranch) return true;
    const employeeBranch = employee?.branch || employee?.location || employee?.office || "";
    return branchesMatch(employeeBranch, studentBranch);
  });
  const reassignableBranchCounselors = availableBranchCounselors.filter(
    (employee) => String(employee?.id || "").trim() !== String(currentCounselorId || "").trim()
  );
  const assignedCounselorName = (() => {
    const match = employees.find((employee) => employee.id === localStudent.counselor);
    return match?.name || match?.username || localStudent.counselorName || "";
  })();
  const canManagerEditContact = userRole === "Manager";
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
    setLocalStudent(updated);
    onUpdateStudent?.(updated);
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
      const countryChecklist = COUNTRY_CHECKLISTS[localStudent.country] || COUNTRY_CHECKLISTS["Default"];
      const studentDocs = localStudent.documents || [];
      const checkStageRequirements = (stageName) => {
        const stageReqs = countryChecklist.find((c) => c.stage === stageName);
        if (!stageReqs) return [];
        const missingDocs = stageReqs.items.filter((item) => {
          const hasUploaded = studentDocs.some(
            (d) => (d.type === item.docType || d.type.includes(item.docType) || item.docType.includes(d.type)) && d.status !== "Rejected"
          );
          return !hasUploaded;
        });
        return missingDocs.map((m) => m.docType);
      };
      let allMissingItems = [];
      const st = normalizePipelineStatus(localStudent.status);
      if (st === "Documentation") {
        allMissingItems = checkStageRequirements("Documentation");
      } else if (st === "Application") {
        allMissingItems = checkStageRequirements("Uni Application");
      } else if (st === "Interview training") {
        allMissingItems = checkStageRequirements("Offer Received");
      }
      const updatedViolations = [...localStudent.slaViolations || []];
      if (allMissingItems.length > 0) {
        updatedViolations.push({
          id: `SLA-${Date.now()}`,
          stage: localStudent.status,
          missingItems: allMissingItems,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          resolved: false
        });
      }
      const selectedCounselor = availableBranchCounselors.find((employee) => employee.id === advanceDialog.counselorId);
      const shouldAssignAnother = advanceDialog.counselorMode === "another" && advanceDialog.counselorId;
      const nextCounselorId = shouldAssignAnother ? String(advanceDialog.counselorId || "").trim() : "";
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
        action: allMissingItems.length > 0 ? "advanced pipeline with SLA violation" : "moved pipeline to",
        target: `${nextStep} (${localStudent.name})`,
        type: allMissingItems.length > 0 ? "system" : "approval",
        studentName: localStudent.name,
        studentId: localStudent.id
      });
      if (taskUpdates.length > 0) {
        onUpdateTasks?.(taskUpdates);
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
  const renderContent = () => {
    switch (activeTab) {
      case "pipeline":
        return /* @__PURE__ */ jsx(DocumentManager, { student: localStudent, userRole, onUpdateDocument: (doc) => {
          const updatedDocs = localStudent.documents?.map((d) => d.id === doc.id ? doc : d) || [];
          const updatedStudent = { ...localStudent, documents: updatedDocs };
          setLocalStudent(updatedStudent);
          onUpdateStudent?.(updatedStudent);
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
        }, tasks, onUpdateTasks, onUploadDocument: onUploadStudentDocument });
      case "show-money":
        return /* @__PURE__ */ jsx(FinancialCalculator, { student: localStudent });
      case "visa-pilot":
        return /* @__PURE__ */ jsx(VisaPilot, { student: localStudent, onUpdateStudent: handleUpdateStudentLocal });
      case "ledger":
        return /* @__PURE__ */ jsx(FinanceModule, { student: localStudent, invoices, userRole, onUpdateInvoice, onCreateInvoice });
      case "resume":
        return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
          localStudent.cvFile ? /* @__PURE__ */ jsxs("div", { className: "bg-white border border-emerald-200 rounded-xl p-5 flex items-center justify-between", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx("div", { className: "h-10 w-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center", children: /* @__PURE__ */ jsx(FileText, { size: 18 }) }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-900", children: localStudent.cvFile.name || "Uploaded CV" }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Student uploaded CV (Update Old CV)" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsx("a", { href: localStudent.cvFile.url, target: "_blank", rel: "noreferrer", children: /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "outline", className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx(Eye, { size: 16 }),
                " View"
              ] }) }),
              /* @__PURE__ */ jsx("a", { href: localStudent.cvFile.url, target: "_blank", rel: "noopener noreferrer", children: /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "outline", className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx(Download, { size: 16 }),
                " Download"
              ] }) })
            ] })
          ] }) : null,
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsx("h3", { className: "text-lg font-bold text-slate-900", children: "AI-Optimized Resume" }),
            localStudent.generatedCV && /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "outline", className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(Download, { size: 16 }),
              " Download PDF"
            ] })
          ] }),
          localStudent.generatedCV ? /* @__PURE__ */ jsx("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-8 max-w-2xl mx-auto shadow-inner", children: /* @__PURE__ */ jsxs("div", { className: "bg-white p-8 shadow-lg border border-gray-100 min-h-[600px] flex flex-col gap-6 font-serif", children: [
            /* @__PURE__ */ jsxs("div", { className: "border-b-2 border-slate-900 pb-4 flex justify-between items-start", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold text-slate-900 uppercase tracking-tight", children: localStudent.generatedCV.personalInfo.fullName }),
                /* @__PURE__ */ jsxs("div", { className: "text-sm text-slate-600 mt-1 flex flex-wrap gap-x-4", children: [
                  /* @__PURE__ */ jsx("span", { children: localStudent.generatedCV.personalInfo.email }),
                  /* @__PURE__ */ jsx("span", { children: localStudent.generatedCV.personalInfo.phone }),
                  /* @__PURE__ */ jsx("span", { children: localStudent.generatedCV.personalInfo.location })
                ] })
              ] }),
              localStudent.generatedCV.personalInfo.profilePicture && /* @__PURE__ */ jsx("div", { className: "w-20 h-20 rounded-lg overflow-hidden border border-slate-200", children: /* @__PURE__ */ jsx("img", { src: localStudent.generatedCV.personalInfo.profilePicture, alt: "Profile", className: "w-full h-full object-cover", referrerPolicy: "no-referrer" }) })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h4", { className: "text-xs font-bold text-slate-900 uppercase tracking-widest mb-2 border-b border-slate-200 pb-1", children: "Professional Summary" }),
              /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-700 leading-relaxed", children: localStudent.generatedCV.summary })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h4", { className: "text-xs font-bold text-slate-900 uppercase tracking-widest mb-3 border-b border-slate-200 pb-1", children: "Experience" }),
              /* @__PURE__ */ jsx("div", { className: "space-y-4", children: localStudent.generatedCV.experience.map((exp, i) => /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-baseline", children: [
                  /* @__PURE__ */ jsx("h5", { className: "text-sm font-bold text-slate-800", children: exp.role }),
                  /* @__PURE__ */ jsx("span", { className: "text-xs font-medium text-slate-500", children: exp.period })
                ] }),
                /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold text-indigo-600 mb-1", children: exp.company }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-600 leading-relaxed", children: exp.description })
              ] }, i)) })
            ] }),
            localStudent.generatedCV.customSections?.map((section, i) => /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h4", { className: "text-xs font-bold text-slate-900 uppercase tracking-widest mb-2 border-b border-slate-200 pb-1", children: section.title }),
              /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-700 leading-relaxed", children: section.content })
            ] }, i))
          ] }) }) : /* @__PURE__ */ jsxs("div", { className: "text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200", children: [
            /* @__PURE__ */ jsx("div", { className: "w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm", children: /* @__PURE__ */ jsx(FileText, { size: 32, className: "text-slate-300" }) }),
            /* @__PURE__ */ jsx("h4", { className: "text-slate-900 font-bold", children: "No AI Resume Generated" }),
            /* @__PURE__ */ jsx("p", { className: "text-slate-500 text-sm mt-1 max-w-xs mx-auto", children: "The student hasn't used the ABEC Premier AI Resume Builder yet. You can encourage them to generate one from their dashboard." })
          ] })
        ] });
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
                /* @__PURE__ */ jsx(PriorityBadge, { priority: localStudent.priority })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "text-sm text-slate-500 font-medium flex items-center gap-x-3 mt-1 flex-wrap", children: [
                /* @__PURE__ */ jsx(
                  "select",
                  {
                    value: localStudent.country,
                    onChange: (e) => handleUpdateStudentLocal({ ...localStudent, country: e.target.value }),
                    className: "text-sm font-medium text-slate-500 bg-transparent border-none p-0 focus:ring-0 cursor-pointer hover:text-nexgenai-navy transition-colors",
                    children: ["UK", "Canada", "Australia", "New Zealand", "USA", "Japan", "Singapore"].map((c) => /* @__PURE__ */ jsx("option", { value: c, children: c }, c))
                  }
                ),
                /* @__PURE__ */ jsx("span", { className: "text-slate-300", children: "\u2022" }),
                /* @__PURE__ */ jsxs("span", { children: [
                  "GPA: ",
                  localStudent.gpa
                ] }),
                /* @__PURE__ */ jsx("span", { className: "text-slate-300", children: "\u2022" }),
                /* @__PURE__ */ jsxs("span", { children: [
                  "IELTS: ",
                  localStudent.ielts
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 self-end md:self-auto", children: [
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
        localStudent.slaViolations && localStudent.slaViolations.some((v) => !v.resolved) && /* @__PURE__ */ jsxs("div", { className: "mb-6 bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-4 shadow-sm animate-pulse", children: [
          /* @__PURE__ */ jsx("div", { className: "bg-rose-100 p-2 rounded-xl text-rose-600", children: /* @__PURE__ */ jsx(ShieldAlert, { size: 24 }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
            /* @__PURE__ */ jsx("h4", { className: "text-sm font-bold text-rose-900", children: "SLA Requirement Notice" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-700 mt-1", children: "This student was advanced through stages without completing all mandatory requirements. This will impact the counselor's SLA score until resolved." }),
            /* @__PURE__ */ jsx("div", { className: "mt-3 flex flex-wrap gap-2", children: localStudent.slaViolations.filter((v) => !v.resolved).map((v) => /* @__PURE__ */ jsxs("div", { className: "bg-white/60 border border-rose-100 px-2 py-1 rounded-lg text-[10px] font-bold text-rose-800", children: [
              v.stage,
              ": Missing ",
              v.missingItems.join(", ")
            ] }, v.id)) })
          ] }),
          /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", className: "border-rose-200 text-rose-700 hover:bg-rose-100", children: "Resolve Now" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-2xl p-1 mb-6 shadow-sm flex flex-col lg:flex-row items-stretch overflow-hidden", children: [
          /* @__PURE__ */ jsxs("div", { className: "w-full lg:w-3/4 p-4 overflow-x-auto hide-scrollbar border-b lg:border-b-0 lg:border-r border-gray-100", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-3 px-1", children: [
              /* @__PURE__ */ jsx("span", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest", children: "Staging Progress" }),
              /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-bold text-indigo-600 uppercase tracking-widest", children: [
                currentStepIndex + 1,
                " / ",
                PIPELINE_STEPS.length,
                " Steps"
              ] })
            ] }),
            /* @__PURE__ */ jsx("nav", { className: "flex items-center gap-2 min-w-max pb-1", children: PIPELINE_STEPS.map((step, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return /* @__PURE__ */ jsxs(React.Fragment, { children: [
                /* @__PURE__ */ jsxs("div", { className: `flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all whitespace-nowrap ${isCurrent ? "bg-nexgenai-navy text-white shadow-md shadow-slate-200 scale-105" : isCompleted ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-50 text-slate-400 border border-transparent"}`, children: [
                  isCompleted ? /* @__PURE__ */ jsx(CheckCircle, { size: 12, className: "text-emerald-500" }) : /* @__PURE__ */ jsx("span", { className: `w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${isCurrent ? "bg-white text-nexgenai-navy" : "bg-slate-200 text-slate-500"}`, children: idx + 1 }),
                  /* @__PURE__ */ jsx("span", { children: step })
                ] }),
                idx < PIPELINE_STEPS.length - 1 && /* @__PURE__ */ jsx("div", { className: `w-4 lg:w-6 h-0.5 flex-shrink-0 ${isCompleted ? "bg-emerald-200" : "bg-slate-100"}` })
              ] }, step);
            }) })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "w-full lg:w-1/4 bg-slate-50/80 p-4 flex flex-col justify-center items-center text-center", children: nextStep && userRole !== "Student" ? /* @__PURE__ */ jsxs("div", { className: "w-full space-y-2", children: [
            /* @__PURE__ */ jsx("p", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-tight", children: "Next Action Required" }),
            /* @__PURE__ */ jsxs(
              Button,
              {
                className: "w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-100 border-none h-11 rounded-xl font-bold text-sm group",
                onClick: handleAdvancePipeline,
                children: [
                  "Next Stage",
                  /* @__PURE__ */ jsx(ChevronRight, { size: 18, className: "ml-1 group-hover:translate-x-1 transition-transform" })
                ]
              }
            )
          ] }) : /* @__PURE__ */ jsxs("div", { className: "w-full space-y-1", children: [
            /* @__PURE__ */ jsx("div", { className: "w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-1", children: /* @__PURE__ */ jsx(CheckCircle, { size: 20 }) }),
            /* @__PURE__ */ jsx("p", { className: "text-xs font-bold text-slate-800", children: userRole === "Student" ? "Current Stage" : "Pipeline Completed" }),
            /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-500", children: localStudent.status })
          ] }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 grid grid-cols-12 gap-6 min-h-0", children: [
          /* @__PURE__ */ jsxs("div", { className: "col-span-12 lg:col-span-8 flex flex-col min-w-0", children: [
            /* @__PURE__ */ jsx("div", { className: "border-b border-gray-200 bg-white/50 rounded-t-xl overflow-hidden", children: /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("div", { className: "flex min-w-max", children: [
              /* @__PURE__ */ jsx(TabButton, { icon: FileText, label: "Pipeline", activeTab, tabName: "pipeline", onClick: setActiveTab }),
              /* @__PURE__ */ jsx(TabButton, { icon: FileText, label: "Resume", activeTab, tabName: "resume", onClick: setActiveTab }),
              /* @__PURE__ */ jsx(TabButton, { icon: DollarSign, label: "Show Money", activeTab, tabName: "show-money", onClick: setActiveTab }),
              /* @__PURE__ */ jsx(TabButton, { icon: Plane, label: "Visa", activeTab, tabName: "visa-pilot", onClick: setActiveTab }),
              /* @__PURE__ */ jsx(TabButton, { icon: Banknote, label: "Ledger", activeTab, tabName: "ledger", onClick: setActiveTab })
            ] }) }) }),
            /* @__PURE__ */ jsx("div", { className: "p-6 bg-white border-l border-r border-b border-gray-200 rounded-b-xl flex-1 overflow-y-auto", children: renderContent() })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "col-span-12 lg:col-span-4 space-y-6", children: [
            /* @__PURE__ */ jsx(StudentTasksPanel, { student: localStudent, tasks, userRole }),
            /* @__PURE__ */ jsx(KeyDetails, { student: localStudent, canEditContact: canManagerEditContact, onEditContact: openContactDialog }),
            /* @__PURE__ */ jsx(SpecializedNotes, { student: localStudent, onUpdateStudent: handleUpdateStudentLocal, currentUser, authenticatedUser, userRole }),
            /* @__PURE__ */ jsx(StudentHistory, { activities, student: localStudent, assignedCounselorName })
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
        advanceDialog.open && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm", onClick: () => setAdvanceDialog((prev) => ({ ...prev, open: false })), children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-xl w-full overflow-hidden", onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ jsxs("div", { className: "px-5 py-4 border-b border-gray-100 bg-slate-50/80 flex items-center justify-between", children: [
            /* @__PURE__ */ jsx("h3", { className: "text-sm font-bold text-slate-900", children: "Move to next stage" }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "p-1 rounded-md text-slate-500 hover:bg-slate-100", onClick: () => setAdvanceDialog((prev) => ({ ...prev, open: false })), children: /* @__PURE__ */ jsx(X, { size: 18 }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "p-5 space-y-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-800", children: [
              /* @__PURE__ */ jsxs("p", { className: "font-semibold", children: ["Upcoming stage: ", nextStep || "N/A"] }),
              /* @__PURE__ */ jsx("p", { className: "mt-1", children: "Review pending tasks and assign who will continue counseling for remaining stages." })
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
                "Assign another counselor from current branch"
              ] }),
              advanceDialog.counselorMode === "another" && /* @__PURE__ */ jsx("select", { value: advanceDialog.counselorId, onChange: (e) => setAdvanceDialog((prev) => ({ ...prev, counselorId: e.target.value })), className: "mt-1 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 bg-white", children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Select counselor" }),
                ...reassignableBranchCounselors.map((employee) => /* @__PURE__ */ jsx("option", { value: employee.id, children: employee.name || employee.username || employee.email || employee.id }, employee.id))
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "px-5 py-4 border-t border-gray-100 flex justify-end gap-2 bg-white", children: [
            /* @__PURE__ */ jsx(Button, { variant: "outline", onClick: () => setAdvanceDialog((prev) => ({ ...prev, open: false })), children: "Cancel" }),
            /* @__PURE__ */ jsx(Button, { onClick: handleConfirmAdvancePipeline, disabled: advanceDialog.counselorMode === "another" && !advanceDialog.counselorId, children: "Confirm & Continue" })
          ] })
        ] }) })
      ]
    }
  );
};
const TabButton = ({ icon: Icon, label, activeTab, tabName, onClick }) => /* @__PURE__ */ jsxs(
  "button",
  {
    onClick: () => onClick(tabName),
    className: `flex-1 py-3 px-4 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-nexgenai-navy ${activeTab === tabName ? "border-indigo-600 text-indigo-600 bg-white" : "border-transparent text-slate-500 hover:bg-slate-50"}`,
    children: [
      /* @__PURE__ */ jsx(Icon, { size: 16, strokeWidth: 1.5 }),
      label
    ]
  }
);
export {
  StudentProfile
};
