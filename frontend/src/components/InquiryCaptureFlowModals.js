import React, { Fragment, useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "./Button";
import { getBranches, getCountries, moveStudentToRequests } from "../authApi";
import { getInquiryIntakeSlaRemainingParts } from "../pipeline";

const EDUCATION_LEVELS = [
  "High school",
  "Foundation / pathway",
  "Diploma",
  "Bachelor's degree",
  "Master's degree",
  "Doctorate / PhD",
  "Professional qualification",
  "Other"
];

function newInquiryExamResultRow() {
  return { id: `er-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, examName: "", result: "" };
}

function examResultsRowsFromStudent(student) {
  const raw = student?.examResults;
  if (!Array.isArray(raw) || raw.length === 0) return [newInquiryExamResultRow()];
  const rows = raw.map((r, idx) => ({
    id: String(r?.id || "").trim() || `er-${idx}-${Date.now()}`,
    examName: String(r?.examName ?? r?.exam ?? r?.name ?? ""),
    result: String(r?.result ?? r?.score ?? "")
  }));
  return rows.length ? rows : [newInquiryExamResultRow()];
}

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

  const updateInquiryExamRow = (id, field, value) => {
    setInquiryForm((prev) => ({
      ...prev,
      examResults: (prev.examResults || []).map((row) => (row.id === id ? { ...row, [field]: value } : row))
    }));
  };

  const addInquiryExamRow = () => {
    setInquiryForm((prev) => ({
      ...prev,
      examResults: [...(prev.examResults || []), newInquiryExamResultRow()]
    }));
  };

  const removeInquiryExamRow = (id) => {
    setInquiryForm((prev) => {
      const rows = prev.examResults || [];
      if (rows.length <= 1) {
        return { ...prev, examResults: [newInquiryExamResultRow()] };
      }
      return { ...prev, examResults: rows.filter((r) => r.id !== id) };
    });
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
    setIsSavingInquiry(true);
    setInquiryError("");
    const sanitizedExamResults = (inquiryForm.examResults || [])
      .map((row) => ({
        examName: String(row.examName || "").trim(),
        result: String(row.result || "").trim()
      }))
      .filter((row) => row.examName || row.result);
    const updatedStudent = {
      ...existingStudent,
      name: String(inquiryForm.name || "").trim(),
      email: String(inquiryForm.email || "").trim(),
      phone: String(inquiryForm.phone || "").trim(),
      countryToVisit: String(inquiryForm.countryToVisit || "").trim(),
      nearestOffice: String(inquiryForm.nearestOffice || "").trim(),
      city: String(inquiryForm.city || "").trim(),
      currentEducationLevel: String(inquiryForm.currentEducationLevel || "").trim(),
      intendedProgram: String(inquiryForm.intendedProgram || "").trim(),
      message: String(inquiryForm.message || "").trim(),
      examResults: sanitizedExamResults,
      country: String(inquiryForm.countryToVisit || "").trim() || existingStudent.country,
      branch: String(inquiryForm.nearestOffice || "").trim() || existingStudent.branch,
      status: existingStudent.status,
      priority: String(inquiryForm.priority || "").trim() || existingStudent.priority,
      notes: existingStudent.notes
    };
    if (
      !updatedStudent.name ||
      !updatedStudent.email ||
      !updatedStudent.phone ||
      !updatedStudent.countryToVisit ||
      !updatedStudent.nearestOffice ||
      !updatedStudent.currentEducationLevel ||
      !updatedStudent.intendedProgram
    ) {
      setIsSavingInquiry(false);
      setInquiryError("Please fill all required interest form fields.");
      return;
    }
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

  const handleSaveSummary = async (e) => {
    e.preventDefault();
    if (!summaryStudent) return;
    const studentId = String(summaryStudent.id || "").trim();
    if (!studentId) return;
    setIsSavingSummary(true);
    setSummaryError("");
    try {
      if (summaryAction === "meeting-note") {
        const note = String(summaryNote || "").trim();
        if (!note) {
          setSummaryError("Please add meeting notes.");
          setIsSavingSummary(false);
          return;
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
        onSelectStudent?.(latest);
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
              /* @__PURE__ */ jsxs("form", {
                onSubmit: handleSaveInquiry,
                className: "p-5 space-y-4 overflow-y-auto",
                children: [
                  inquiryError
                    ? /* @__PURE__ */ jsx("div", {
                        className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2",
                        children: inquiryError
                      })
                    : null,
                  /* @__PURE__ */ jsxs("div", {
                    className: "grid grid-cols-1 sm:grid-cols-2 gap-3",
                    children: [
                      /* @__PURE__ */ jsxs("div", {
                        children: [
                          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Name" }),
                          /* @__PURE__ */ jsx("input", {
                            type: "text",
                            required: true,
                            className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                            value: inquiryForm.name,
                            onChange: (e) => setInquiryForm((prev) => ({ ...prev, name: e.target.value }))
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsxs("div", {
                        children: [
                          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Email" }),
                          /* @__PURE__ */ jsx("input", {
                            type: "email",
                            required: true,
                            className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                            value: inquiryForm.email,
                            onChange: (e) => setInquiryForm((prev) => ({ ...prev, email: e.target.value }))
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsxs("div", {
                        children: [
                          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Phone" }),
                          /* @__PURE__ */ jsx("input", {
                            type: "tel",
                            required: true,
                            className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                            value: inquiryForm.phone,
                            onChange: (e) => setInquiryForm((prev) => ({ ...prev, phone: e.target.value }))
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsxs("div", {
                        children: [
                          /* @__PURE__ */ jsx("label", {
                            className: "text-xs font-semibold text-slate-700 mb-1 block",
                            children: "Country you wish to visit"
                          }),
                          /* @__PURE__ */ jsxs("select", {
                            required: true,
                            className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                            value: inquiryForm.countryToVisit,
                            onChange: (e) => setInquiryForm((prev) => ({ ...prev, countryToVisit: e.target.value })),
                            children: [
                              /* @__PURE__ */ jsx("option", { value: "", children: "Select..." }),
                              ...(countries || []).map((country) => /* @__PURE__ */ jsx("option", { value: country, children: country }, country))
                            ]
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsxs("div", {
                        children: [
                          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Nearest office" }),
                          /* @__PURE__ */ jsxs("select", {
                            required: true,
                            className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                            value: inquiryForm.nearestOffice,
                            onChange: (e) => setInquiryForm((prev) => ({ ...prev, nearestOffice: e.target.value })),
                            children: [
                              /* @__PURE__ */ jsx("option", { value: "", children: "Select..." }),
                              ...(offices || []).map((office) => /* @__PURE__ */ jsx("option", { value: office, children: office }, office))
                            ]
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsxs("div", {
                        children: [
                          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "City / location" }),
                          /* @__PURE__ */ jsx("input", {
                            type: "text",
                            className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                            value: inquiryForm.city,
                            onChange: (e) => setInquiryForm((prev) => ({ ...prev, city: e.target.value }))
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsxs("div", {
                        children: [
                          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Priority" }),
                          /* @__PURE__ */ jsxs("select", {
                            className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                            value: inquiryForm.priority,
                            onChange: (e) => setInquiryForm((prev) => ({ ...prev, priority: e.target.value })),
                            children: [
                              /* @__PURE__ */ jsx("option", { value: "Low", children: "Low" }),
                              /* @__PURE__ */ jsx("option", { value: "Medium", children: "Medium" }),
                              /* @__PURE__ */ jsx("option", { value: "High", children: "High" })
                            ]
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsxs("div", {
                        className: "sm:col-span-2",
                        children: [
                          /* @__PURE__ */ jsx("label", {
                            className: "text-xs font-semibold text-slate-700 mb-1 block",
                            children: "Current education level"
                          }),
                          /* @__PURE__ */ jsxs("select", {
                            required: true,
                            className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                            value: inquiryForm.currentEducationLevel,
                            onChange: (e) => setInquiryForm((prev) => ({ ...prev, currentEducationLevel: e.target.value })),
                            children: [
                              /* @__PURE__ */ jsx("option", { value: "", children: "Select..." }),
                              ...EDUCATION_LEVELS.map((level) => /* @__PURE__ */ jsx("option", { value: level, children: level }, level))
                            ]
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsxs("div", {
                        className: "sm:col-span-2",
                        children: [
                          /* @__PURE__ */ jsx("label", {
                            className: "text-xs font-semibold text-slate-700 mb-1 block",
                            children: "Intended program of study"
                          }),
                          /* @__PURE__ */ jsx("input", {
                            type: "text",
                            required: true,
                            className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                            value: inquiryForm.intendedProgram,
                            onChange: (e) => setInquiryForm((prev) => ({ ...prev, intendedProgram: e.target.value }))
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsxs("div", {
                        className: "sm:col-span-2",
                        children: [
                          /* @__PURE__ */ jsx("label", {
                            className: "text-xs font-semibold text-slate-700 mb-1 block",
                            children: "Additional message"
                          }),
                          /* @__PURE__ */ jsx("textarea", {
                            rows: 3,
                            className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                            value: inquiryForm.message,
                            onChange: (e) => setInquiryForm((prev) => ({ ...prev, message: e.target.value }))
                          })
                        ]
                      }),
                      /* @__PURE__ */ jsxs("div", {
                        className: "sm:col-span-2",
                        children: [
                          /* @__PURE__ */ jsxs("div", {
                            className: "flex flex-wrap items-center justify-between gap-2 mb-1",
                            children: [
                              /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700", children: "Exam results" }),
                              /* @__PURE__ */ jsxs(Button, {
                                type: "button",
                                variant: "ghost",
                                size: "sm",
                                className: "shrink-0",
                                onClick: addInquiryExamRow,
                                children: [/* @__PURE__ */ jsx(Plus, { size: 14, className: "mr-1" }), "Add row"]
                              })
                            ]
                          }),
                          /* @__PURE__ */ jsx("p", {
                            className: "text-[11px] text-slate-500 mb-2",
                            children: "Optional. Add as many rows as you need (exam or qualification name and score or grade)."
                          }),
                          /* @__PURE__ */ jsx("div", {
                            className: "border border-gray-200 rounded-md overflow-hidden",
                            children: /* @__PURE__ */ jsxs("table", {
                              className: "w-full text-sm",
                              children: [
                                /* @__PURE__ */ jsx("thead", {
                                  className: "bg-slate-50 border-b border-gray-200",
                                  children: /* @__PURE__ */ jsxs("tr", {
                                    children: [
                                      /* @__PURE__ */ jsx("th", {
                                        className: "text-left px-3 py-2 text-xs font-semibold text-slate-600",
                                        children: "Exam name"
                                      }),
                                      /* @__PURE__ */ jsx("th", {
                                        className: "text-left px-3 py-2 text-xs font-semibold text-slate-600",
                                        children: "Result"
                                      }),
                                      /* @__PURE__ */ jsx("th", { className: "w-11 px-1 py-2", children: "" })
                                    ]
                                  })
                                }),
                                /* @__PURE__ */ jsx("tbody", {
                                  className: "divide-y divide-gray-100 bg-white",
                                  children: (inquiryForm.examResults || []).map((row) =>
                                    /* @__PURE__ */ jsxs(
                                      "tr",
                                      {
                                        children: [
                                          /* @__PURE__ */ jsx("td", {
                                            className: "px-2 py-1.5 align-middle",
                                            children: /* @__PURE__ */ jsx("input", {
                                              type: "text",
                                              className:
                                                "w-full min-w-0 px-2 py-1.5 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                                              value: row.examName,
                                              onChange: (e) => updateInquiryExamRow(row.id, "examName", e.target.value),
                                              placeholder: "e.g. IELTS"
                                            })
                                          }),
                                          /* @__PURE__ */ jsx("td", {
                                            className: "px-2 py-1.5 align-middle",
                                            children: /* @__PURE__ */ jsx("input", {
                                              type: "text",
                                              className:
                                                "w-full min-w-0 px-2 py-1.5 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                                              value: row.result,
                                              onChange: (e) => updateInquiryExamRow(row.id, "result", e.target.value),
                                              placeholder: "e.g. 7.5"
                                            })
                                          }),
                                          /* @__PURE__ */ jsx("td", {
                                            className: "px-1 py-1.5 align-middle text-center",
                                            children: /* @__PURE__ */ jsx("button", {
                                              type: "button",
                                              className:
                                                "inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50",
                                              "aria-label": "Remove row",
                                              onClick: () => removeInquiryExamRow(row.id),
                                              children: /* @__PURE__ */ jsx(Trash2, { size: 14 })
                                            })
                                          })
                                        ]
                                      },
                                      row.id
                                    )
                                  )
                                })
                              ]
                            })
                          })
                        ]
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsxs("div", {
                    className: "flex justify-end gap-2 pt-2 border-t border-gray-100",
                    children: [
                      /* @__PURE__ */ jsx(Button, {
                        type: "button",
                        variant: "ghost",
                        onClick: closeInquiryPopup,
                        disabled: isSavingInquiry,
                        children: "Cancel"
                      }),
                      /* @__PURE__ */ jsx(Button, { type: "submit", isLoading: isSavingInquiry, children: "Save" })
                    ]
                  })
                ]
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
                            /* @__PURE__ */ jsx("option", { value: "", children: "Select..." }),
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
                    className: "flex justify-end gap-2 pt-2 border-t border-gray-100",
                    children: [
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
