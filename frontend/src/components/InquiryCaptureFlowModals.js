import React, { Fragment, useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { X } from "lucide-react";
import { Button } from "./Button";
import { getBranches, getCountries, moveStudentToRequests } from "../authApi";
import { getInquiryIntakeSlaRemainingParts } from "../pipeline";
import {
  examResultsRowsFromStudent,
  InquiryIntakeForm,
  inquiryFormToStudentFields,
  newInquiryExamResultRow,
  validateInquiryFormRequired
} from "./InquiryIntakeForm";

export function InquirySlaBadge({ startedAt, nowMs }) {
  const meta = getInquiryIntakeSlaRemainingParts(startedAt, nowMs);
  if (!meta) return null;
  const toneClass =
    meta.tone === "overdue"
      ? "text-rose-700 font-semibold"
      : meta.tone === "urgent"
        ? "text-amber-700 font-semibold"
        : meta.tone === "soon"
          ? "text-amber-600 font-medium"
          : "text-emerald-700 font-medium";
  return /* @__PURE__ */ jsx("span", { className: `text-xs tabular-nums ${toneClass}`, children: meta.text });
}

const InquiryCaptureFlowModals = ({
  target,
  onClear,
  currentUser,
  allStudents = [],
  scopedStudents = null,
  onUpdateStudent,
  onDismissAssignmentAlert,
  onStudentMovedToRequests,
  onSelectStudent
}) => {
  const [countries, setCountries] = useState([]);
  const [offices, setOffices] = useState([]);
  const [inquiryForm, setInquiryForm] = useState({
    name: "",
    email: "",
    phone: "",
    countryToVisit: "",
    nearestOffice: "",
    city: "",
    livingStatus: "",
    budget: "",
    budgetCurrency: "LKR",
    visaRejectionAnyCountry: "No",
    currentEducationLevel: "",
    intendedProgram: "",
    message: "",
    priority: "Medium",
    examResults: [newInquiryExamResultRow()]
  });
  const [inquiryError, setInquiryError] = useState("");
  const [isSavingInquiry, setIsSavingInquiry] = useState(false);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryStudent, setSummaryStudent] = useState(null);
  const [summaryAction, setSummaryAction] = useState("meeting-note");
  const [summaryNote, setSummaryNote] = useState("");
  const [summaryBranch, setSummaryBranch] = useState("");
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [dismissAlertId, setDismissAlertId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [countriesRes, branchesRes] = await Promise.all([getCountries(), getBranches()]);
      if (cancelled) return;
      if (countriesRes.ok) setCountries(countriesRes.data || []);
      if (branchesRes.ok) {
        const locations = (branchesRes.data || []).map((b) => String(b?.location || "").trim()).filter(Boolean);
        setOffices(locations);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!target?.student) {
      setInquiryOpen(false);
      setSummaryOpen(false);
      setSummaryStudent(null);
      setDismissAlertId(null);
      return;
    }
    const student = target.student;
    setInquiryError("");
    setSummaryError("");
    setInquiryForm({
      name: String(student.name || ""),
      email: String(student.email || ""),
      phone: String(student.phone || ""),
      countryToVisit: String(student.countryToVisit || student.country || countries[0] || ""),
      nearestOffice: String(student.nearestOffice || student.branch || offices[0] || ""),
      city: String(student.city || ""),
      livingStatus: String(student.livingStatus || ""),
      budget: String(student.budget || ""),
      budgetCurrency: String(student.budgetCurrency || "LKR"),
      visaRejectionAnyCountry: String(student.visaRejectionAnyCountry || "No"),
      currentEducationLevel: String(student.currentEducationLevel || ""),
      intendedProgram: String(student.intendedProgram || ""),
      message: String(student.message || ""),
      priority: String(student.priority || "Medium") || "Medium",
      examResults: examResultsRowsFromStudent(student)
    });
    setDismissAlertId(target.assignmentAlert?.id != null ? String(target.assignmentAlert.id) : null);
    setInquiryOpen(true);
    setSummaryOpen(false);
    setSummaryStudent(null);
  }, [target?._key, countries, offices]);

  const resolveStudentById = (studentId) => {
    const sid = String(studentId || "").trim();
    if (!sid) return null;
    const pools = [scopedStudents, allStudents].filter(Boolean);
    for (const list of pools) {
      const hit = (list || []).find((s) => String(s?.id || "").trim() === sid);
      if (hit) return hit;
    }
    return null;
  };

  const closeInquiryPopup = () => {
    if (isSavingInquiry) return;
    setInquiryOpen(false);
    setInquiryError("");
    onClear?.();
  };

  const handleSaveInquiry = async (e) => {
    e.preventDefault();
    const studentId = String(target?.student?.id || "").trim();
    if (!studentId) return;
    const existingStudent = resolveStudentById(studentId) || target?.student;
    if (!existingStudent) {
      setInquiryError("Student not found.");
      return;
    }
    const validation = validateInquiryFormRequired(inquiryForm, { requireBudget: false });
    if (!validation.ok) {
      setInquiryError(validation.error);
      return;
    }
    setIsSavingInquiry(true);
    setInquiryError("");
    const updatedStudent = inquiryFormToStudentFields(inquiryForm, {
      ...existingStudent,
      status: existingStudent.status,
      notes: existingStudent.notes
    });
    try {
      await onUpdateStudent?.(updatedStudent);
      setSummaryStudent(updatedStudent);
      setSummaryAction("meeting-note");
      setSummaryNote("");
      setSummaryBranch(updatedStudent.nearestOffice || updatedStudent.branch || offices[0] || "");
      setSummaryError("");
      setInquiryOpen(false);
      setSummaryOpen(true);
    } catch {
      setInquiryError("Failed to save student details.");
    } finally {
      setIsSavingInquiry(false);
    }
  };

  const closeSummaryPopup = () => {
    if (isSavingSummary) return;
    setSummaryOpen(false);
    setSummaryStudent(null);
    setSummaryError("");
    onClear?.();
  };

  const saveMeetingNoteFromSummary = async () => {
    if (!summaryStudent) return { ok: false };
    const studentId = String(summaryStudent.id || "").trim();
    if (!studentId) return { ok: false };
    const note = String(summaryNote || "").trim();
    if (!note) {
      setSummaryError("Please add meeting notes.");
      return { ok: false };
    }
    const existingNotes = Array.isArray(summaryStudent.meetingNotes) ? summaryStudent.meetingNotes : [];
    const noteEntry = {
      id: `mn-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      note,
      text: note,
      meetingDate: "",
      createdAt: new Date().toISOString(),
      author: String(currentUser?.name || currentUser?.username || currentUser?.email || "Staff").trim() || "Staff",
      authorId: String(currentUser?.id || ""),
      source: "inquiry-call-summary"
    };
    const merged = {
      ...summaryStudent,
      meetingNotes: [noteEntry, ...existingNotes]
    };
    await onUpdateStudent?.(merged);
    if (dismissAlertId) onDismissAssignmentAlert?.(dismissAlertId);
    setSummaryOpen(false);
    setSummaryStudent(null);
    onClear?.();
    const latest = resolveStudentById(studentId) || merged;
    return { ok: true, latest };
  };

  const handleSaveAndCreateInvoice = async () => {
    if (!summaryStudent || summaryAction !== "meeting-note") return;
    setIsSavingSummary(true);
    setSummaryError("");
    try {
      const result = await saveMeetingNoteFromSummary();
      if (!result.ok) return;
      onSelectStudent?.(result.latest, { profileTab: "ledger", openCreateInvoice: true });
    } finally {
      setIsSavingSummary(false);
    }
  };

  const handleSaveSummary = async (e) => {
    e.preventDefault();
    if (!summaryStudent) return;
    const studentId = String(summaryStudent.id || "").trim();
    if (!studentId) return;
    setIsSavingSummary(true);
    setSummaryError("");
    try {
      if (summaryAction === "meeting-note") {
        const result = await saveMeetingNoteFromSummary();
        if (!result.ok) {
          setIsSavingSummary(false);
          return;
        }
        onSelectStudent?.(result.latest);
        return;
      }
      if (summaryAction === "request-branch") {
        const branch = String(summaryBranch || "").trim();
        if (!branch) {
          setSummaryError("Please select a branch.");
          setIsSavingSummary(false);
          return;
        }
        const moved = await moveStudentToRequests(studentId, branch);
        if (!moved.ok) {
          setSummaryError(moved.error || "Failed to move student to requested list.");
          setIsSavingSummary(false);
          return;
        }
        onStudentMovedToRequests?.(studentId);
        if (dismissAlertId) onDismissAssignmentAlert?.(dismissAlertId);
        setSummaryOpen(false);
        setSummaryStudent(null);
        onClear?.();
        return;
      }
      if (summaryAction === "open-profile") {
        const latest = resolveStudentById(studentId) || summaryStudent;
        if (dismissAlertId) onDismissAssignmentAlert?.(dismissAlertId);
        setSummaryOpen(false);
        setSummaryStudent(null);
        onClear?.();
        await onUpdateStudent?.(latest);
        onSelectStudent?.(latest);
        return;
      }
    } finally {
      setIsSavingSummary(false);
    }
  };

  if (!inquiryOpen && !summaryOpen) return null;

  return /* @__PURE__ */ jsxs(Fragment, {
    children: [
      inquiryOpen &&
        /* @__PURE__ */ jsx("div", {
          className: "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4 py-6 overflow-y-auto",
          children: /* @__PURE__ */ jsxs("div", {
            className: "bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[85vh] flex flex-col my-auto",
            children: [
              /* @__PURE__ */ jsxs("div", {
                className: "flex items-center justify-between p-4 border-b border-gray-100",
                children: [
                  /* @__PURE__ */ jsxs("div", {
                    children: [
                      /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold text-slate-900", children: "Start Inquiry" }),
                      /* @__PURE__ */ jsx("p", {
                        className: "text-xs text-slate-500 mt-0.5",
                        children: target?.student?.name || "Update student details before starting."
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx("button", {
                    onClick: closeInquiryPopup,
                    className: "text-slate-400 hover:text-slate-700 p-1",
                    children: /* @__PURE__ */ jsx(X, { size: 18 })
                  })
                ]
              }),
              /* @__PURE__ */ jsx(InquiryIntakeForm, {
                form: inquiryForm,
                setForm: setInquiryForm,
                countries,
                offices,
                error: inquiryError,
                isSaving: isSavingInquiry,
                onSubmit: handleSaveInquiry,
                onCancel: closeInquiryPopup,
                submitLabel: "Save",
                cancelLabel: "Cancel",
                showBudgetField: false
              })
            ]
          })
        }),
      summaryOpen &&
        summaryStudent &&
        /* @__PURE__ */ jsx("div", {
          className: "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4",
          children: /* @__PURE__ */ jsxs("div", {
            className: "bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-gray-200 overflow-hidden",
            children: [
              /* @__PURE__ */ jsxs("div", {
                className: "flex items-center justify-between p-4 border-b border-gray-100",
                children: [
                  /* @__PURE__ */ jsxs("div", {
                    children: [
                      /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold text-slate-900", children: "Inquiry Call Summary" }),
                      /* @__PURE__ */ jsx("p", {
                        className: "text-xs text-slate-500 mt-0.5",
                        children: summaryStudent?.name || "Choose next action"
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx("button", {
                    onClick: closeSummaryPopup,
                    className: "text-slate-400 hover:text-slate-700 p-1",
                    children: /* @__PURE__ */ jsx(X, { size: 18 })
                  })
                ]
              }),
              /* @__PURE__ */ jsxs("form", {
                onSubmit: handleSaveSummary,
                className: "p-5 space-y-4",
                children: [
                  summaryError
                    ? /* @__PURE__ */ jsx("div", {
                        className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2",
                        children: summaryError
                      })
                    : null,
                  /* @__PURE__ */ jsxs("div", {
                    className: "space-y-2",
                    children: [
                      /* @__PURE__ */ jsxs("label", {
                        className: "flex items-center gap-2 text-sm text-slate-700",
                        children: [
                          /* @__PURE__ */ jsx("input", {
                            type: "radio",
                            name: "summaryAction",
                            value: "meeting-note",
                            checked: summaryAction === "meeting-note",
                            onChange: (e) => setSummaryAction(e.target.value)
                          }),
                          "Add a meeting note"
                        ]
                      }),
                      /* @__PURE__ */ jsxs("label", {
                        className: "flex items-center gap-2 text-sm text-slate-700",
                        children: [
                          /* @__PURE__ */ jsx("input", {
                            type: "radio",
                            name: "summaryAction",
                            value: "request-branch",
                            checked: summaryAction === "request-branch",
                            onChange: (e) => setSummaryAction(e.target.value)
                          }),
                          "Request another branch"
                        ]
                      }),
                      /* @__PURE__ */ jsxs("label", {
                        className: "flex items-center gap-2 text-sm text-slate-700",
                        children: [
                          /* @__PURE__ */ jsx("input", {
                            type: "radio",
                            name: "summaryAction",
                            value: "open-profile",
                            checked: summaryAction === "open-profile",
                            onChange: (e) => setSummaryAction(e.target.value)
                          }),
                          "Navigate to student profile"
                        ]
                      })
                    ]
                  }),
                  summaryAction === "meeting-note" &&
                    /* @__PURE__ */ jsxs("div", {
                      children: [
                        /* @__PURE__ */ jsx("label", {
                          className: "text-xs font-semibold text-slate-700 mb-1 block",
                          children: "Meeting notes (bullets or paragraphs)"
                        }),
                        /* @__PURE__ */ jsx("textarea", {
                          rows: 5,
                          className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                          value: summaryNote,
                          onChange: (e) => setSummaryNote(e.target.value),
                          placeholder: "- Discussed timeline\n- Shared university options\nNext steps..."
                        })
                      ]
                    }),
                  summaryAction === "request-branch" &&
                    /* @__PURE__ */ jsxs("div", {
                      children: [
                        /* @__PURE__ */ jsx("label", {
                          className: "text-xs font-semibold text-slate-700 mb-1 block",
                          children: "Select branch"
                        }),
                        /* @__PURE__ */ jsxs("select", {
                          className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                          value: summaryBranch,
                          onChange: (e) => setSummaryBranch(e.target.value),
                          children: [
                            /* @__PURE__ */ jsx("option", { value: "", disabled: true, children: "Select..." }),
                            ...(offices || []).map((office) => /* @__PURE__ */ jsx("option", { value: office, children: office }, office))
                          ]
                        }),
                        /* @__PURE__ */ jsx("p", {
                          className: "text-xs text-slate-500 mt-1",
                          children: "Student will be moved to requested students list for the selected branch."
                        })
                      ]
                    }),
                  summaryAction === "open-profile" &&
                    /* @__PURE__ */ jsx("p", {
                      className: "text-sm text-slate-600",
                      children: "You will be taken to this student's profile in counselor view."
                    }),
                  /* @__PURE__ */ jsxs("div", {
                    className: "flex flex-wrap justify-end items-center gap-2 pt-2 border-t border-gray-100",
                    children: [
                      summaryAction === "meeting-note" &&
                        /* @__PURE__ */ jsx(Button, {
                          type: "button",
                          variant: "outline",
                          onClick: handleSaveAndCreateInvoice,
                          isLoading: isSavingSummary,
                          disabled: isSavingSummary,
                          children: "Save and create Invoice"
                        }),
                      /* @__PURE__ */ jsx(Button, {
                        type: "button",
                        variant: "ghost",
                        onClick: closeSummaryPopup,
                        disabled: isSavingSummary,
                        children: "Cancel"
                      }),
                      /* @__PURE__ */ jsx(Button, { type: "submit", isLoading: isSavingSummary, children: "Save" })
                    ]
                  })
                ]
              })
            ]
          })
        })
    ]
  });
};

export default InquiryCaptureFlowModals;
