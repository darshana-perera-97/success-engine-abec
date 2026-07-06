import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { X } from "lucide-react";
import { Button } from "./Button";
import { getBranches, getCountries, moveStudentToRequests } from "../authApi";
import { resolveCountriesForOffice } from "../utils/branchCountries";
import {
  formatInquiryScheduledCallLabel,
  getInquiryIntakeSlaRemainingParts,
  INQUIRY_SCHEDULE_CALL_MAX_MS,
  normalizePipelineStatus
} from "../pipeline";
import {
  examResultsRowsFromStudent,
  InquiryIntakeForm,
  inquiryFormToStudentFields,
  mergeInquiryFormForScheduleLater,
  newInquiryExamResultRow,
  validateInquiryFormRequired
} from "./InquiryIntakeForm";
import { intakeFieldsFromStudent } from "../utils/intakeFields";
import { whatsappFieldsFromStudent } from "../utils/phoneWhatsapp";
import { normalizeInquirySource } from "../utils/inquirySource";

export function InquirySlaBadge({ startedAt, scheduledCallAt, nowMs }) {
  const meta = getInquiryIntakeSlaRemainingParts(startedAt, nowMs, scheduledCallAt);
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

function toDatetimeLocalValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getDefaultScheduleCallValue() {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  next.setSeconds(0, 0);
  return toDatetimeLocalValue(next);
}

function getScheduleCallBounds() {
  const now = new Date();
  const max = new Date(now.getTime() + INQUIRY_SCHEDULE_CALL_MAX_MS);
  return { min: toDatetimeLocalValue(now), max: toDatetimeLocalValue(max) };
}

function buildScheduledCallReasonEntry({ reason, scheduledAtIso, author, authorId, source }) {
  const trimmedReason = String(reason || "").trim();
  return {
    id: `scr-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    reason: trimmedReason,
    scheduledAt: String(scheduledAtIso || "").trim(),
    createdAt: new Date().toISOString(),
    author: String(author || "Staff").trim() || "Staff",
    authorId: String(authorId || ""),
    source: String(source || "schedule-call-later").trim() || "schedule-call-later"
  };
}

function appendScheduledCallReason(student, entry) {
  const existing = Array.isArray(student?.scheduledCallReasons) ? student.scheduledCallReasons : [];
  return {
    ...student,
    scheduledCallReasons: [entry, ...existing]
  };
}

function validateScheduleReason(raw) {
  const reason = String(raw || "").trim();
  if (!reason) {
    return { ok: false, error: "Please add a reason for scheduling the call later." };
  }
  return { ok: true, reason };
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
  onSelectStudent,
  onCompleteStudentIntakeTask,
  onAddActivity,
  userRole = "Counselor"
}) => {
  const [branchRecords, setBranchRecords] = useState([]);
  const [globalCountries, setGlobalCountries] = useState([]);
  const [branchCountriesEnabled, setBranchCountriesEnabled] = useState(false);
  const [offices, setOffices] = useState([]);
  const [inquiryForm, setInquiryForm] = useState({
    name: "",
    email: "",
    phone: "",
    whatsappSameAsPhone: true,
    whatsappNumber: "",
    countryToVisit: "",
    nearestOffice: "",
    city: "",
    livingStatus: "",
    budget: "",
    budgetCurrency: "LKR",
    visaRejectionAnyCountry: "No",
    currentEducationLevel: "",
    intendedProgram: "",
    intakeMonth: "",
    intakeYear: "",
    message: "",
    priority: "Medium",
    inquirySource: "",
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
  const [summaryScheduledAt, setSummaryScheduledAt] = useState("");
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [dismissAlertId, setDismissAlertId] = useState(null);
  const [scheduleLaterOpen, setScheduleLaterOpen] = useState(false);
  const [scheduleLaterStudent, setScheduleLaterStudent] = useState(null);
  const [scheduleLaterAt, setScheduleLaterAt] = useState("");
  const [scheduleLaterReason, setScheduleLaterReason] = useState("");
  const [scheduleLaterError, setScheduleLaterError] = useState("");
  const [isSavingScheduleLater, setIsSavingScheduleLater] = useState(false);
  const [summaryScheduleReason, setSummaryScheduleReason] = useState("");
  const lastFormTargetKeyRef = useRef(null);
  const modalFlowRef = useRef("inquiry");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [countriesRes, branchesRes] = await Promise.all([getCountries(), getBranches()]);
      if (cancelled) return;
      if (countriesRes.ok) {
        setGlobalCountries(countriesRes.data || []);
        setBranchCountriesEnabled(countriesRes.branchCountriesEnabled === true);
      }
      if (branchesRes.ok) {
        const records = branchesRes.data || [];
        setBranchRecords(records);
        const locations = records.map((b) => String(b?.location || "").trim()).filter(Boolean);
        setOffices(locations);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const countries = useMemo(
    () => resolveCountriesForOffice(branchRecords, inquiryForm.nearestOffice, globalCountries, { branchCountriesEnabled }),
    [branchRecords, inquiryForm.nearestOffice, globalCountries, branchCountriesEnabled]
  );

  useEffect(() => {
    setInquiryForm((prev) => {
      const nextCountry = countries.includes(prev.countryToVisit) ? prev.countryToVisit : countries[0] || "";
      if (nextCountry === prev.countryToVisit) return prev;
      return { ...prev, countryToVisit: nextCountry };
    });
  }, [countries, inquiryForm.nearestOffice]);

  useEffect(() => {
    if (!target?.student) {
      lastFormTargetKeyRef.current = null;
      modalFlowRef.current = "inquiry";
      setInquiryOpen(false);
      setSummaryOpen(false);
      setSummaryStudent(null);
      setScheduleLaterOpen(false);
      setScheduleLaterStudent(null);
      setDismissAlertId(null);
      return;
    }
    modalFlowRef.current = "inquiry";
    setDismissAlertId(target.assignmentAlert?.id != null ? String(target.assignmentAlert.id) : null);
    setInquiryError("");
    setSummaryError("");
    setInquiryOpen(true);
    setSummaryOpen(false);
    setSummaryStudent(null);
    setScheduleLaterOpen(false);
    setScheduleLaterStudent(null);
  }, [target?._key]);

  useEffect(() => {
    if (!target?.student) {
      lastFormTargetKeyRef.current = null;
      return;
    }
    const student = target.student;
    const targetKey = target?._key;
    const nearestOffice = String(student.nearestOffice || student.branch || offices[0] || "");
    const officeCountries = resolveCountriesForOffice(branchRecords, nearestOffice, globalCountries, { branchCountriesEnabled });
    const preferredCountry = String(student.countryToVisit || student.country || "").trim();
    const countryToVisit = officeCountries.includes(preferredCountry) ? preferredCountry : officeCountries[0] || "";
    const waFields = whatsappFieldsFromStudent(student);
    const intakeFields = intakeFieldsFromStudent(student);
    const nextForm = {
      name: String(student.name || ""),
      email: String(student.email || ""),
      phone: String(student.phone || ""),
      whatsappSameAsPhone: waFields.whatsappSameAsPhone,
      whatsappNumber: waFields.whatsappNumber,
      countryToVisit,
      nearestOffice,
      city: String(student.city || ""),
      livingStatus: String(student.livingStatus || ""),
      budget: String(student.budget || ""),
      budgetCurrency: String(student.budgetCurrency || "LKR"),
      visaRejectionAnyCountry: String(student.visaRejectionAnyCountry || "No"),
      currentEducationLevel: String(student.currentEducationLevel || ""),
      intendedProgram: String(student.intendedProgram || ""),
      intakeMonth: intakeFields.intakeMonth,
      intakeYear: intakeFields.intakeYear,
      message: String(student.message || ""),
      priority: String(student.priority || "Medium") || "Medium",
      inquirySource: normalizeInquirySource(student.inquirySource) || "",
      examResults: examResultsRowsFromStudent(student)
    };
    if (lastFormTargetKeyRef.current !== targetKey) {
      lastFormTargetKeyRef.current = targetKey;
      setInquiryForm(nextForm);
      return;
    }
    if (modalFlowRef.current === "schedule-later" || modalFlowRef.current === "summary") return;
    setInquiryForm((prev) => {
      const officeCountriesForPrev = resolveCountriesForOffice(
        branchRecords,
        prev.nearestOffice || nearestOffice,
        globalCountries,
        { branchCountriesEnabled }
      );
      const nextCountry = officeCountriesForPrev.includes(prev.countryToVisit)
        ? prev.countryToVisit
        : officeCountriesForPrev[0] || prev.countryToVisit;
      const nextOffice = (offices || []).includes(prev.nearestOffice) ? prev.nearestOffice : nearestOffice;
      if (nextCountry === prev.countryToVisit && nextOffice === prev.nearestOffice) return prev;
      return { ...prev, countryToVisit: nextCountry, nearestOffice: nextOffice };
    });
  }, [target?._key, target?.student?.id, branchRecords, globalCountries, branchCountriesEnabled, offices]);

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
    modalFlowRef.current = "inquiry";
    setInquiryOpen(false);
    setInquiryError("");
    onClear?.();
  };

  const saveInquiryForm = async () => {
    const studentId = String(target?.student?.id || "").trim();
    if (!studentId) return { ok: false, error: "Student not found." };
    const existingStudent = resolveStudentById(studentId) || target?.student;
    if (!existingStudent) {
      return { ok: false, error: "Student not found." };
    }
    const validation = validateInquiryFormRequired(inquiryForm, { requireBudget: false, requireSource: true });
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }
    const updatedStudent = inquiryFormToStudentFields(inquiryForm, {
      ...existingStudent,
      status: existingStudent.status,
      notes: existingStudent.notes
    });
    try {
      const saveResult = await onUpdateStudent?.(updatedStudent);
      if (saveResult && saveResult.ok === false) {
        return { ok: false, error: saveResult.error || "Failed to save student details." };
      }
      return { ok: true, student: updatedStudent };
    } catch {
      return { ok: false, error: "Failed to save student details." };
    }
  };

  const validateScheduledCallAt = (raw) => {
    const value = String(raw || "").trim();
    if (!value) {
      return { ok: false, error: "Please choose a date and time for the call." };
    }
    const scheduledMs = new Date(value).getTime();
    const nowMs = Date.now();
    if (Number.isNaN(scheduledMs)) {
      return { ok: false, error: "Invalid date and time." };
    }
    if (scheduledMs <= nowMs) {
      return { ok: false, error: "Scheduled time must be in the future." };
    }
    if (scheduledMs > nowMs + INQUIRY_SCHEDULE_CALL_MAX_MS) {
      return { ok: false, error: "Scheduled time must be within the next 7 days." };
    }
    return { ok: true, scheduledMs };
  };

  const handleSaveInquiry = async (e) => {
    e.preventDefault();
    setIsSavingInquiry(true);
    setInquiryError("");
    const result = await saveInquiryForm();
    if (!result.ok) {
      setInquiryError(result.error || "Failed to save student details.");
      setIsSavingInquiry(false);
      return;
    }
    modalFlowRef.current = "summary";
    setSummaryStudent(result.student);
    setSummaryAction("meeting-note");
    setSummaryNote("");
    setSummaryBranch(result.student.nearestOffice || result.student.branch || offices[0] || "");
    setSummaryScheduledAt(getDefaultScheduleCallValue());
    setSummaryScheduleReason("");
    setSummaryError("");
    setInquiryOpen(false);
    setSummaryOpen(true);
    setIsSavingInquiry(false);
  };

  const handleScheduleLaterFromInquiry = () => {
    const studentId = String(target?.student?.id || "").trim();
    if (!studentId) {
      setInquiryError("Student not found.");
      return;
    }
    const existingStudent = resolveStudentById(studentId) || target?.student;
    if (!existingStudent) {
      setInquiryError("Student not found.");
      return;
    }
    const merged = mergeInquiryFormForScheduleLater(inquiryForm, {
      ...existingStudent,
      status: existingStudent.status,
      notes: existingStudent.notes
    });
    setInquiryError("");
    modalFlowRef.current = "schedule-later";
    setScheduleLaterStudent(merged.student);
    setScheduleLaterAt(getDefaultScheduleCallValue());
    setScheduleLaterReason("");
    setScheduleLaterError("");
    setInquiryOpen(false);
    setScheduleLaterOpen(true);
  };

  const closeSummaryPopup = () => {
    if (isSavingSummary) return;
    modalFlowRef.current = "inquiry";
    setSummaryOpen(false);
    setSummaryStudent(null);
    setSummaryError("");
    onClear?.();
  };

  const closeScheduleLaterPopup = () => {
    if (isSavingScheduleLater) return;
    modalFlowRef.current = "inquiry";
    setScheduleLaterOpen(false);
    setScheduleLaterStudent(null);
    setScheduleLaterReason("");
    setScheduleLaterError("");
    onClear?.();
  };

  const completeIntakeTaskForStudent = (studentId) => {
    onCompleteStudentIntakeTask?.(studentId);
  };

  const authorLabel = String(currentUser?.name || currentUser?.username || currentUser?.email || "Staff").trim() || "Staff";

  const logScheduledCallActivity = (student, scheduledAtIso, reason) => {
    const studentName = String(student?.name || "").trim();
    const studentId = String(student?.id || "").trim();
    const scheduledLabel = formatInquiryScheduledCallLabel(scheduledAtIso);
    const trimmedReason = String(reason || "").trim();
    const targetParts = [studentName || studentId || "Student"];
    if (scheduledLabel) targetParts.push(`call at ${scheduledLabel}`);
    if (trimmedReason) targetParts.push(`reason: ${trimmedReason}`);
    onAddActivity?.({
      user: authorLabel,
      role: userRole,
      action: "scheduled inquiry call",
      target: targetParts.join(" — "),
      type: "inquiry",
      studentName,
      studentId
    });
  };

  const handleSaveScheduleLater = async (e) => {
    e.preventDefault();
    if (!scheduleLaterStudent) return;
    const studentId = String(scheduleLaterStudent.id || "").trim();
    if (!studentId) return;
    setIsSavingScheduleLater(true);
    setScheduleLaterError("");
    try {
      const validation = validateScheduledCallAt(scheduleLaterAt);
      if (!validation.ok) {
        setScheduleLaterError(validation.error);
        return;
      }
      const reasonValidation = validateScheduleReason(scheduleLaterReason);
      if (!reasonValidation.ok) {
        setScheduleLaterError(reasonValidation.error);
        return;
      }
      const scheduledAtIso = new Date(validation.scheduledMs).toISOString();
      const reasonEntry = buildScheduledCallReasonEntry({
        reason: reasonValidation.reason,
        scheduledAtIso,
        author: authorLabel,
        authorId: currentUser?.id,
        source: "schedule-call-later"
      });
      const merged = appendScheduledCallReason(
        {
          ...scheduleLaterStudent,
          inquiryScheduledCallAt: scheduledAtIso
        },
        reasonEntry
      );
      const saveResult = await onUpdateStudent?.(merged);
      if (saveResult && saveResult.ok === false) {
        setScheduleLaterError(saveResult.error || "Failed to save scheduled call.");
        return;
      }
      logScheduledCallActivity(scheduleLaterStudent, scheduledAtIso, scheduleLaterReason);
      completeIntakeTaskForStudent(studentId);
      if (dismissAlertId) onDismissAssignmentAlert?.(dismissAlertId);
      modalFlowRef.current = "inquiry";
      setScheduleLaterOpen(false);
      setScheduleLaterStudent(null);
      onClear?.();
    } finally {
      setIsSavingScheduleLater(false);
    }
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
      meetingNotes: [noteEntry, ...existingNotes],
      inquiryScheduledCallAt: "",
      ...(normalizePipelineStatus(summaryStudent.status) === "Inquiry"
        ? { status: "Registration" }
        : {})
    };
    await onUpdateStudent?.(merged);
    completeIntakeTaskForStudent(studentId);
    if (dismissAlertId) onDismissAssignmentAlert?.(dismissAlertId);
    setSummaryOpen(false);
    setSummaryStudent(null);
    onClear?.();
    const latest = { ...(resolveStudentById(studentId) || {}), ...merged };
    return { ok: true, latest };
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
      if (summaryAction === "schedule-call-later") {
        const validation = validateScheduledCallAt(summaryScheduledAt);
        if (!validation.ok) {
          setSummaryError(validation.error);
          setIsSavingSummary(false);
          return;
        }
        const reasonValidation = validateScheduleReason(summaryScheduleReason);
        if (!reasonValidation.ok) {
          setSummaryError(reasonValidation.error);
          setIsSavingSummary(false);
          return;
        }
        const scheduledAtIso = new Date(validation.scheduledMs).toISOString();
        const reasonEntry = buildScheduledCallReasonEntry({
          reason: reasonValidation.reason,
          scheduledAtIso,
          author: authorLabel,
          authorId: currentUser?.id,
          source: "inquiry-call-summary"
        });
        const merged = appendScheduledCallReason(
          {
            ...summaryStudent,
            inquiryScheduledCallAt: scheduledAtIso
          },
          reasonEntry
        );
        await onUpdateStudent?.(merged);
        logScheduledCallActivity(summaryStudent, scheduledAtIso, summaryScheduleReason);
        completeIntakeTaskForStudent(studentId);
        if (dismissAlertId) onDismissAssignmentAlert?.(dismissAlertId);
        setSummaryOpen(false);
        setSummaryStudent(null);
        onClear?.();
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
        completeIntakeTaskForStudent(studentId);
        if (dismissAlertId) onDismissAssignmentAlert?.(dismissAlertId);
        setSummaryOpen(false);
        setSummaryStudent(null);
        onClear?.();
        return;
      }
      if (summaryAction === "open-profile") {
        const latest = resolveStudentById(studentId) || summaryStudent;
        completeIntakeTaskForStudent(studentId);
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

  if (!inquiryOpen && !summaryOpen && !scheduleLaterOpen) return null;

  const scheduleCallBounds = getScheduleCallBounds();

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
                onScheduleLater: handleScheduleLaterFromInquiry,
                submitLabel: "Save",
                cancelLabel: "Cancel",
                showBudgetField: false,
                showSourceField: true,
                intakeCountry: inquiryForm.countryToVisit
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
                            value: "schedule-call-later",
                            checked: summaryAction === "schedule-call-later",
                            onChange: (e) => setSummaryAction(e.target.value)
                          }),
                          "Schedule call later"
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
                  summaryAction === "schedule-call-later" &&
                    /* @__PURE__ */ jsxs("div", {
                      children: [
                        /* @__PURE__ */ jsx("label", {
                          className: "text-xs font-semibold text-slate-700 mb-1 block",
                          children: "Call date and time"
                        }),
                        /* @__PURE__ */ jsx("input", {
                          type: "datetime-local",
                          className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                          value: summaryScheduledAt,
                          min: scheduleCallBounds.min,
                          max: scheduleCallBounds.max,
                          onChange: (e) => setSummaryScheduledAt(e.target.value)
                        }),
                        /* @__PURE__ */ jsx("p", {
                          className: "text-xs text-slate-500 mt-1",
                          children: "Inquiry is held until this time (up to 7 days). It will reappear in Priority Action Items when the call is due — no SLA countdown while on hold. The student receives a WhatsApp when the call is scheduled or rescheduled, and a reminder 15 minutes before."
                        }),
                        /* @__PURE__ */ jsxs("div", {
                          className: "mt-3",
                          children: [
                            /* @__PURE__ */ jsx("label", {
                              className: "text-xs font-semibold text-slate-700 mb-1 block",
                              children: "Reason"
                            }),
                            /* @__PURE__ */ jsx("textarea", {
                              rows: 3,
                              required: true,
                              className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                              value: summaryScheduleReason,
                              onChange: (e) => setSummaryScheduleReason(e.target.value),
                              placeholder: "e.g. Student asked to call back after work hours..."
                            })
                          ]
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
        }),
      scheduleLaterOpen &&
        scheduleLaterStudent &&
        /* @__PURE__ */ jsx("div", {
          className: "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4",
          children: /* @__PURE__ */ jsxs("div", {
            className: "bg-white w-full max-w-md rounded-xl shadow-2xl border border-gray-200 overflow-hidden",
            children: [
              /* @__PURE__ */ jsxs("div", {
                className: "flex items-center justify-between p-4 border-b border-gray-100",
                children: [
                  /* @__PURE__ */ jsxs("div", {
                    children: [
                      /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold text-slate-900", children: "Schedule Call Later" }),
                      /* @__PURE__ */ jsx("p", {
                        className: "text-xs text-slate-500 mt-0.5",
                        children: scheduleLaterStudent?.name || "Choose when to follow up"
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx("button", {
                    onClick: closeScheduleLaterPopup,
                    className: "text-slate-400 hover:text-slate-700 p-1",
                    children: /* @__PURE__ */ jsx(X, { size: 18 })
                  })
                ]
              }),
              /* @__PURE__ */ jsxs("form", {
                onSubmit: handleSaveScheduleLater,
                className: "p-5 space-y-4",
                children: [
                  scheduleLaterError
                    ? /* @__PURE__ */ jsx("div", {
                        className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2",
                        children: scheduleLaterError
                      })
                    : null,
                  /* @__PURE__ */ jsxs("div", {
                    children: [
                      /* @__PURE__ */ jsx("label", {
                        className: "text-xs font-semibold text-slate-700 mb-1 block",
                        children: "Call date and time"
                      }),
                      /* @__PURE__ */ jsx("input", {
                        type: "datetime-local",
                        className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                        value: scheduleLaterAt,
                        min: scheduleCallBounds.min,
                        max: scheduleCallBounds.max,
                        onChange: (e) => setScheduleLaterAt(e.target.value)
                      }),
                      /* @__PURE__ */ jsx("p", {
                        className: "text-xs text-slate-500 mt-1",
                        children: "Inquiry is held until this time (up to 7 days). It will reappear in Priority Action Items when the call is due — no SLA countdown while on hold. The student receives a WhatsApp when the call is scheduled or rescheduled, and a reminder 15 minutes before."
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsxs("div", {
                    children: [
                      /* @__PURE__ */ jsx("label", {
                        className: "text-xs font-semibold text-slate-700 mb-1 block",
                        children: "Reason"
                      }),
                      /* @__PURE__ */ jsx("textarea", {
                        rows: 3,
                        required: true,
                        className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                        value: scheduleLaterReason,
                        onChange: (e) => setScheduleLaterReason(e.target.value),
                        placeholder: "e.g. Student asked to call back after work hours..."
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsxs("div", {
                    className: "flex flex-wrap justify-end items-center gap-2 pt-2 border-t border-gray-100",
                    children: [
                      /* @__PURE__ */ jsx(Button, {
                        type: "button",
                        variant: "ghost",
                        onClick: closeScheduleLaterPopup,
                        disabled: isSavingScheduleLater,
                        children: "Cancel"
                      }),
                      /* @__PURE__ */ jsx(Button, { type: "submit", isLoading: isSavingScheduleLater, children: "Schedule" })
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
