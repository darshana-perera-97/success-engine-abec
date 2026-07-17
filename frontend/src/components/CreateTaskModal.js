import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { X, AlertCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "./Button";
import { MultiSelect } from "./MultiSelect";
import { DatePicker, getLocalDateIso } from "./DatePicker";
import { isCounselorEquivalentPortalRole } from "../roles";
import { getRoleDisplayName } from "../roleDisplay";
const CreateTaskModal = ({ isOpen, onClose, onSubmit, student, currentUser, userRole, students = [], employees = [] }) => {
  const [description, setDescription] = useState("");
  const [studentId, setStudentId] = useState(student?.id || "");
  const [assignedTo, setAssignedTo] = useState([]);
  const [priority, setPriority] = useState("Medium");
  const [dueDate, setDueDate] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [requireStudentDocuments, setRequireStudentDocuments] = useState(false);
  const [docRequestDraft, setDocRequestDraft] = useState("");
  const [taskDocumentRequests, setTaskDocumentRequests] = useState([]);
  const [submitError, setSubmitError] = useState("");
  if (!isOpen) return null;
  const addDocumentRequestRow = () => {
    const label = String(docRequestDraft || "").trim();
    if (!label) {
      setSubmitError("Enter a document name before adding.");
      return;
    }
    setSubmitError("");
    const id = `slot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setTaskDocumentRequests((prev) => [...prev, { id, label }]);
    setDocRequestDraft("");
  };
  const removeDocumentRequestRow = (id) => {
    setTaskDocumentRequests((prev) => prev.filter((row) => row.id !== id));
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    let finalAssignedTo = assignedTo;
    if ((isCounselorEquivalentPortalRole(userRole) || userRole === "Country Coordinator") && currentUser) {
      finalAssignedTo = [currentUser.id];
    }
    if (!description || !studentId || !dueDate) return;
    if (requireStudentDocuments && taskDocumentRequests.length === 0) {
      setSubmitError("Add at least one required document, or turn off student document upload.");
      return;
    }
    const effectivePrivate = requireStudentDocuments ? false : isPrivate;
    const newTask = {
      id: `T${Math.floor(Math.random() * 1e4)}`,
      task: description,
      student_id: studentId,
      assigned_to: effectivePrivate ? (isCounselorEquivalentPortalRole(userRole) || userRole === "Country Coordinator") && currentUser ? [currentUser.id] : assignedTo : finalAssignedTo,
      priority,
      status: "Pending",
      dueDate,
      isPrivate: effectivePrivate,
      requiresStudentDocuments: requireStudentDocuments && taskDocumentRequests.length > 0,
      taskDocumentRequests: requireStudentDocuments && taskDocumentRequests.length > 0 ? taskDocumentRequests : []
    };
    const result = await onSubmit(newTask);
    if (result && result.ok === false) {
      setSubmitError(result.error || "Failed to create task.");
      return;
    }
    setDescription("");
    if (!student) setStudentId("");
    setAssignedTo([]);
    setPriority("Medium");
    setDueDate("");
    setIsPrivate(true);
    setRequireStudentDocuments(false);
    setTaskDocumentRequests([]);
    setDocRequestDraft("");
    setSubmitError("");
    onClose();
  };
  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: e.name,
    subLabel: `${getRoleDisplayName(e.role)} \u2022 ${e.branch}`
  }));
  const showAssignTo = userRole === "Manager" || userRole === "Admin";
  const showRelatedStudent = !student;
  return /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-xl border border-gray-100 scale-100 animate-in zoom-in-95 duration-200 relative flex flex-col max-h-[90vh] my-auto overflow-hidden", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50 rounded-t-xl flex-shrink-0", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-[#0F172A]", children: "Create New Task" }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: isCounselorEquivalentPortalRole(userRole) ? "Add a task to your list." : "Assign an action item to a team member." })
      ] }),
      /* @__PURE__ */ jsx("button", { onClick: onClose, className: "text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-md", children: /* @__PURE__ */ jsx(X, { size: 20 }) })
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "p-6 space-y-5 overflow-y-auto flex-1 min-h-0", children: [
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 uppercase tracking-wide", children: "Task Description" }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: description,
            onChange: (e) => setDescription(e.target.value),
            placeholder: "Describe the task clearly...",
            rows: 2,
            className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400 resize-none",
            required: true
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-5", children: [
        showRelatedStudent && /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 uppercase tracking-wide", children: "Related Student" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsxs(
              "select",
              {
                value: studentId,
                onChange: (e) => setStudentId(e.target.value),
                className: "w-full px-3 py-2.5 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 appearance-none",
                required: true,
                children: [
                  /* @__PURE__ */ jsx("option", { value: "", disabled: true, children: "Select Student" }),
                  students.map((s) => /* @__PURE__ */ jsxs("option", { value: s.id, children: [
                    s.name,
                    " (",
                    s.country,
                    ")"
                  ] }, s.id))
                ]
              }
            ),
            /* @__PURE__ */ jsx("div", { className: "absolute right-3 top-3 pointer-events-none text-slate-400", children: /* @__PURE__ */ jsx("svg", { width: "10", height: "6", viewBox: "0 0 10 6", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: /* @__PURE__ */ jsx("path", { d: "M1 1L5 5L9 1", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) }) })
          ] })
        ] }),
        showAssignTo && /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(
          MultiSelect,
          {
            label: "Assign To",
            options: employeeOptions,
            value: assignedTo,
            onChange: setAssignedTo,
            placeholder: "Search employees..."
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-4 bg-slate-50 rounded-lg border border-slate-100 grid grid-cols-2 gap-5", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxs("label", { className: "text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center", children: [
            /* @__PURE__ */ jsx(AlertCircle, { size: 12, className: "mr-1.5" }),
            " Priority Level"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex gap-2", children: ["Low", "Medium", "High"].map((p) => /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => setPriority(p),
              className: `flex-1 py-1.5 text-xs font-medium rounded-md border transition-all ${priority === p ? p === "High" ? "bg-rose-50 border-rose-200 text-rose-700" : p === "Medium" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-slate-200 border-slate-300 text-slate-800" : "bg-white border-gray-200 text-slate-500 hover:bg-gray-50"}`,
              children: p
            },
            p
          )) })
        ] }),
        /* @__PURE__ */ jsx(
          DatePicker,
          {
            label: "Due Date",
            value: dueDate,
            onChange: setDueDate,
            required: true,
            minDate: getLocalDateIso()
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-3 p-3 rounded-lg border border-slate-200 bg-slate-50/80", children: [
        /* @__PURE__ */ jsxs("label", { className: "flex items-start gap-3 cursor-pointer", children: [
          /* @__PURE__ */ jsx("input", {
            type: "checkbox",
            className: "mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500",
            checked: requireStudentDocuments,
            onChange: (e) => {
              const on = e.target.checked;
              setRequireStudentDocuments(on);
              if (on) setIsPrivate(false);
            }
          }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900", children: "Ask student to upload document(s)" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "The task becomes visible to the student. List each file you need, one by one." })
          ] })
        ] }),
        requireStudentDocuments && /* @__PURE__ */ jsxs("div", { className: "space-y-2 pl-1", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row gap-2", children: [
            /* @__PURE__ */ jsx("input", {
              type: "text",
              value: docRequestDraft,
              onChange: (e) => setDocRequestDraft(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDocumentRequestRow();
                }
              },
              placeholder: 'e.g. "Bank statement (last 3 months)"',
              className: "flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            }),
            /* @__PURE__ */ jsxs(Button, { type: "button", variant: "secondary", onClick: addDocumentRequestRow, children: [
              /* @__PURE__ */ jsx(Plus, { size: 16, className: "mr-1" }),
              "Add"
            ] })
          ] }),
          taskDocumentRequests.length === 0
            ? /* @__PURE__ */ jsx("p", { className: "text-xs text-amber-700", children: "No documents added yet — use Add after typing a label." })
            : /* @__PURE__ */ jsx("ul", {
                className: "space-y-1.5",
                children: taskDocumentRequests.map((row) =>
                  /* @__PURE__ */ jsxs("li", {
                    key: row.id,
                    className: "flex items-center justify-between gap-2 rounded-md bg-white border border-slate-100 px-2 py-1.5 text-sm",
                    children: [
                      /* @__PURE__ */ jsx("span", { className: "text-slate-800 min-w-0", children: row.label }),
                      /* @__PURE__ */ jsx("button", {
                        type: "button",
                        onClick: () => removeDocumentRequestRow(row.id),
                        className: "p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50",
                        "aria-label": "Remove",
                        children: /* @__PURE__ */ jsx(Trash2, { size: 16 })
                      })
                    ]
                  })
                )
              })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: `flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100 ${requireStudentDocuments ? "opacity-60" : ""}`, children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxs("div", { className: `p-1.5 rounded-md ${isPrivate ? "bg-indigo-100 text-indigo-600" : "bg-slate-200 text-slate-500"}`, children: [
            /* @__PURE__ */ jsx(AlertCircle, { size: 16 }),
            " "
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900", children: "Private Task" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Private: counselor only. Public: counselor + student. Document requests always use a public (student-visible) task." })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "relative inline-flex items-center cursor-pointer", children: [
          /* @__PURE__ */ jsx("input", {
            type: "checkbox",
            className: "sr-only peer",
            checked: isPrivate,
            disabled: requireStudentDocuments,
            onChange: (e) => setIsPrivate(e.target.checked)
          }),
          /* @__PURE__ */ jsx("div", { className: `w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 ${requireStudentDocuments ? "opacity-50 pointer-events-none" : ""}` })
        ] })
      ] }),
      submitError && /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-600", children: submitError }),
      /* @__PURE__ */ jsxs("div", { className: "pt-2 flex gap-3 justify-end", children: [
        /* @__PURE__ */ jsx(Button, { type: "button", variant: "ghost", onClick: onClose, children: "Cancel" }),
        /* @__PURE__ */ jsx(Button, { type: "submit", className: "px-6", children: "Create Task" })
      ] })
    ] })
  ] })
});
};
export {
  CreateTaskModal
};
