import { useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { Clock, Users, CheckCircle, ArrowRight, CheckSquare, X } from "lucide-react";
import { Button } from "./Button";
import { BarChart, Bar, ResponsiveContainer, XAxis } from "recharts";
import { LeaderboardWidget } from "./LeaderboardWidget";
import { getBranches, getChats, getCountries, moveStudentToRequests } from "../authApi";
import { filterTasksForCounselor, isTaskOverdueByDate } from "../counselorTaskScope";
import { normalizePipelineStatus } from "../pipeline";
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
const CounselorDashboard = ({ onNavigate, tasks, currentUser, students, allStudents = students, employees = [], onSelectStudent, onSelectTask, assignmentAlerts = [], onDismissAssignmentAlert, onUpdateStudent, onStudentMovedToRequests }) => {
  const [chatMessages, setChatMessages] = useState([]);
  const [countries, setCountries] = useState([]);
  const [offices, setOffices] = useState([]);
  const [inquiryAlert, setInquiryAlert] = useState(null);
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
    status: "Inquiry",
    priority: "Medium",
    notes: ""
  });
  const [isSavingInquiry, setIsSavingInquiry] = useState(false);
  const [inquiryError, setInquiryError] = useState("");
  const [summaryAlert, setSummaryAlert] = useState(null);
  const [summaryStudent, setSummaryStudent] = useState(null);
  const [summaryAction, setSummaryAction] = useState("meeting-note");
  const [summaryNote, setSummaryNote] = useState("");
  const [summaryBranch, setSummaryBranch] = useState("");
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState("");
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
  const myStudents = students;
  const myTasks = filterTasksForCounselor(tasks, currentUser, myStudents);
  const overdueTasksCount = myTasks.filter((t) => isTaskOverdueByDate(t)).length;
  const totalUnresolvedViolations = myStudents.reduce((acc, s) => {
    return acc + (s.slaViolations?.filter((v) => !v.resolved).length || 0);
  }, 0);
  const slaScore = Math.max(0, 100 - overdueTasksCount * 5 - totalUnresolvedViolations * 2);
  const overdueTasks = myTasks.filter((t) => isTaskOverdueByDate(t));
  const pendingTasks = myTasks.filter((t) => t.status === "Pending" || t.status === "In Progress" || t.status === "In Review");
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
  const pipelineTotals = myStudents.reduce((acc, student) => {
    const stage = normalizePipelineStatus(student?.status);
    if (stage === "Inquiry") acc.inquiries += 1;
    if (stage === "Documentation") acc.docsPending += 1;
    if (stage === "Visa") acc.visa += 1;
    return acc;
  }, { inquiries: 0, docsPending: 0, visa: 0 });
  const inquiryStageStudents = myStudents.filter((student) => normalizePipelineStatus(student?.status) === "Inquiry");
  const pipelineDenominator = Math.max(1, myStudents.length);
  const inquiriesPct = Math.max(8, Math.round(pipelineTotals.inquiries / pipelineDenominator * 100));
  const docsPendingPct = Math.max(8, Math.round(pipelineTotals.docsPending / pipelineDenominator * 100));
  const visaPct = Math.max(8, Math.round(pipelineTotals.visa / pipelineDenominator * 100));
  const activityData = [
    { name: "Mon", calls: 4 },
    { name: "Tue", calls: 8 },
    { name: "Wed", calls: 3 },
    { name: "Thu", calls: 12 },
    { name: "Fri", calls: 9 }
  ];
  const openInquiryPopup = (alert) => {
    const studentId = String(alert?.studentId || "").trim();
    if (!studentId) return;
    const student = (allStudents || []).find((s) => String(s.id || "").trim() === studentId) || (students || []).find((s) => String(s.id || "").trim() === studentId);
    if (!student) return;
    setInquiryAlert(alert);
    setInquiryError("");
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
      status: String(student.status || "Inquiry") || "Inquiry",
      priority: String(student.priority || "Medium") || "Medium",
      notes: String(student.notes || "")
    });
  };
  const closeInquiryPopup = () => {
    if (isSavingInquiry) return;
    setInquiryAlert(null);
    setInquiryError("");
  };
  const handleSaveInquiry = async (e) => {
    e.preventDefault();
    if (!inquiryAlert) return;
    const studentId = String(inquiryAlert.studentId || "").trim();
    if (!studentId) return;
    const existingStudent = (allStudents || []).find((s) => String(s.id || "").trim() === studentId) || (students || []).find((s) => String(s.id || "").trim() === studentId);
    if (!existingStudent) {
      setInquiryError("Student not found.");
      return;
    }
    setIsSavingInquiry(true);
    setInquiryError("");
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
      country: String(inquiryForm.countryToVisit || "").trim() || existingStudent.country,
      branch: String(inquiryForm.nearestOffice || "").trim() || existingStudent.branch,
      status: String(inquiryForm.status || "").trim() || existingStudent.status,
      priority: String(inquiryForm.priority || "").trim() || existingStudent.priority,
      notes: String(inquiryForm.notes || "")
    };
    if (!updatedStudent.name || !updatedStudent.email || !updatedStudent.phone || !updatedStudent.countryToVisit || !updatedStudent.nearestOffice || !updatedStudent.currentEducationLevel || !updatedStudent.intendedProgram) {
      setIsSavingInquiry(false);
      setInquiryError("Please fill all required interest form fields.");
      return;
    }
    try {
      await onUpdateStudent?.(updatedStudent);
      setSummaryAlert(inquiryAlert);
      setSummaryStudent(updatedStudent);
      setSummaryAction("meeting-note");
      setSummaryNote("");
      setSummaryBranch(updatedStudent.nearestOffice || updatedStudent.branch || offices[0] || "");
      setSummaryError("");
      setInquiryAlert(null);
    } catch {
      setInquiryError("Failed to save student details.");
    } finally {
      setIsSavingInquiry(false);
    }
  };
  const closeSummaryPopup = () => {
    if (isSavingSummary) return;
    setSummaryAlert(null);
    setSummaryStudent(null);
    setSummaryError("");
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
        onDismissAssignmentAlert?.(summaryAlert?.id);
        closeSummaryPopup();
        const latest = (allStudents || []).find((s) => String(s.id || "").trim() === studentId) || merged;
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
        onDismissAssignmentAlert?.(summaryAlert?.id);
        closeSummaryPopup();
        return;
      }
      if (summaryAction === "open-profile") {
        const latest = (allStudents || []).find((s) => String(s.id || "").trim() === studentId) || summaryStudent;
        onDismissAssignmentAlert?.(summaryAlert?.id);
        closeSummaryPopup();
        await onUpdateStudent?.(latest);
        onSelectStudent?.(latest);
        return;
      }
    } finally {
      setIsSavingSummary(false);
    }
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
            overdueTasks.length > 0 && /* @__PURE__ */ jsxs("div", { className: "p-3 bg-rose-50 border border-rose-100 rounded-lg flex justify-between items-center", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-rose-500 animate-pulse" }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsxs("p", { className: "text-sm font-medium text-rose-900", children: [
                    "You have ",
                    overdueTasks.length,
                    " overdue tasks!"
                  ] }),
                  /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-700", children: "Immediate action required." })
                ] })
              ] }),
              /* @__PURE__ */ jsx(Button, { size: "sm", variant: "danger", onClick: () => onNavigate("tasks"), children: "Fix Now" })
            ] }),
            assignmentAlerts.map((alert) => /* @__PURE__ */ jsxs(
              "div",
              {
                className: "p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex justify-between items-center",
                children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
                    /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-indigo-500 animate-pulse" }),
                    /* @__PURE__ */ jsxs("div", { children: [
                      /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-indigo-900", children: alert.type === "reassigned" ? `${alert.studentName} was reassigned to you` : `${alert.studentName} is a newly added student` }),
                      /* @__PURE__ */ jsx("p", { className: "text-xs text-indigo-700", children: "Reach out and start onboarding actions." })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsx(Button, { size: "sm", variant: "ghost", onClick: () => openInquiryPopup(alert), children: "Start Inquiry" })
                ]
              },
              alert.id
            )),
            inquiryStageStudents.map((student) => {
              const inquiryAlertPayload = {
                id: `inquiry-student-${student.id}`,
                studentId: String(student.id || ""),
                studentName: student.name || String(student.id || ""),
                type: "new"
              };
              return /* @__PURE__ */ jsxs(
                "div",
                {
                  className: "p-3 bg-amber-50 border border-amber-100 rounded-lg flex justify-between items-center",
                  children: [
                    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
                      /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-amber-500 animate-pulse" }),
                      /* @__PURE__ */ jsxs("div", { children: [
                        /* @__PURE__ */ jsxs("p", { className: "text-sm font-medium text-amber-900", children: [
                          student.name || "Student",
                          " is in Inquiry stage"
                        ] }),
                        /* @__PURE__ */ jsx("p", { className: "text-xs text-amber-700", children: "Initiate first counselor meeting and capture inquiry details." })
                      ] })
                    ] }),
                    /* @__PURE__ */ jsx(Button, { size: "sm", variant: "ghost", onClick: () => openInquiryPopup(inquiryAlertPayload), children: "Start Inquiry" })
                  ]
                },
                `inquiry-stage-${student.id}`
              );
            }),
            pendingTasks.slice(0, 3).map((task) => /* @__PURE__ */ jsxs(
              "div",
              {
                className: "flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg border border-transparent hover:border-gray-100 transition-all group cursor-pointer",
                onClick: () => onSelectTask && onSelectTask(task.id),
                children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
                    /* @__PURE__ */ jsx("div", { className: "w-5 h-5 mt-0.5 rounded border-2 border-slate-300 group-hover:border-indigo-500 transition-colors" }),
                    /* @__PURE__ */ jsxs("div", { children: [
                      /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-700 group-hover:text-indigo-900", children: task.task }),
                      /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-400", children: [
                        "Due: ",
                        task.dueDate
                      ] })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsx("span", { className: `text-[10px] font-bold px-2 py-0.5 rounded-full ${task.priority === "High" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`, children: task.priority })
                ]
              },
              task.id
            ))
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
          /* @__PURE__ */ jsx("h4", { className: "text-slate-400 text-xs font-bold uppercase tracking-wider mb-4", children: "Pipeline Health" }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-sm mb-1", children: [
                /* @__PURE__ */ jsx("span", { className: "text-slate-300", children: "New Inquiries" }),
                  /* @__PURE__ */ jsx("span", { className: "font-bold", children: pipelineTotals.inquiries })
              ] }),
              /* @__PURE__ */ jsx("div", { className: "w-full bg-slate-700 rounded-full h-1.5", children: /* @__PURE__ */ jsx("div", { className: "bg-indigo-500 h-1.5 rounded-full", style: { width: `${inquiriesPct}%` } }) })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-sm mb-1", children: [
                /* @__PURE__ */ jsx("span", { className: "text-slate-300", children: "Docs Pending" }),
                /* @__PURE__ */ jsx("span", { className: "font-bold", children: pipelineTotals.docsPending })
              ] }),
              /* @__PURE__ */ jsx("div", { className: "w-full bg-slate-700 rounded-full h-1.5", children: /* @__PURE__ */ jsx("div", { className: "bg-amber-500 h-1.5 rounded-full", style: { width: `${docsPendingPct}%` } }) })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-sm mb-1", children: [
                /* @__PURE__ */ jsx("span", { className: "text-slate-300", children: "Visa" }),
                /* @__PURE__ */ jsx("span", { className: "font-bold", children: pipelineTotals.visa })
              ] }),
              /* @__PURE__ */ jsx("div", { className: "w-full bg-slate-700 rounded-full h-1.5", children: /* @__PURE__ */ jsx("div", { className: "bg-emerald-500 h-1.5 rounded-full", style: { width: `${visaPct}%` } }) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "bg-white p-6 rounded-xl border border-gray-200 shadow-sm", children: [
          /* @__PURE__ */ jsx("h4", { className: "text-slate-900 text-sm font-bold mb-4", children: "Weekly Activity" }),
          /* @__PURE__ */ jsx("div", { className: "h-32", children: /* @__PURE__ */ jsx(ResponsiveContainer, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs(BarChart, { data: activityData, children: [
            /* @__PURE__ */ jsx(XAxis, { dataKey: "name", axisLine: false, tickLine: false, tick: { fontSize: 10 } }),
            /* @__PURE__ */ jsx(Bar, { dataKey: "calls", fill: "#6366F1", radius: [4, 4, 0, 0] })
          ] }) }) })
        ] })
      ] })
    ] }),
    inquiryAlert && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4 py-6 overflow-y-auto", children: /* @__PURE__ */ jsxs("div", { className: "bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[85vh] flex flex-col my-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between p-4 border-b border-gray-100", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold text-slate-900", children: "Start Inquiry" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: inquiryAlert?.studentName || "Update student details before starting." })
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: closeInquiryPopup, className: "text-slate-400 hover:text-slate-700 p-1", children: /* @__PURE__ */ jsx(X, { size: 18 }) })
      ] }),
      /* @__PURE__ */ jsxs("form", { onSubmit: handleSaveInquiry, className: "p-5 space-y-4 overflow-y-auto", children: [
        inquiryError ? /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: inquiryError }) : null,
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Name" }),
            /* @__PURE__ */ jsx("input", { type: "text", required: true, className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: inquiryForm.name, onChange: (e) => setInquiryForm((prev) => ({ ...prev, name: e.target.value })) })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Email" }),
            /* @__PURE__ */ jsx("input", { type: "email", required: true, className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: inquiryForm.email, onChange: (e) => setInquiryForm((prev) => ({ ...prev, email: e.target.value })) })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Phone" }),
            /* @__PURE__ */ jsx("input", { type: "tel", required: true, className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: inquiryForm.phone, onChange: (e) => setInquiryForm((prev) => ({ ...prev, phone: e.target.value })) })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Country you wish to visit" }),
            /* @__PURE__ */ jsxs("select", { required: true, className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: inquiryForm.countryToVisit, onChange: (e) => setInquiryForm((prev) => ({ ...prev, countryToVisit: e.target.value })), children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Select..." }),
              ...(countries || []).map((country) => /* @__PURE__ */ jsx("option", { value: country, children: country }, country))
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Nearest office" }),
            /* @__PURE__ */ jsxs("select", { required: true, className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: inquiryForm.nearestOffice, onChange: (e) => setInquiryForm((prev) => ({ ...prev, nearestOffice: e.target.value })), children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Select..." }),
              ...(offices || []).map((office) => /* @__PURE__ */ jsx("option", { value: office, children: office }, office))
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "City / location" }),
            /* @__PURE__ */ jsx("input", { type: "text", className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: inquiryForm.city, onChange: (e) => setInquiryForm((prev) => ({ ...prev, city: e.target.value })) })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Priority" }),
            /* @__PURE__ */ jsxs("select", { className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: inquiryForm.priority, onChange: (e) => setInquiryForm((prev) => ({ ...prev, priority: e.target.value })), children: [
              /* @__PURE__ */ jsx("option", { value: "Low", children: "Low" }),
              /* @__PURE__ */ jsx("option", { value: "Medium", children: "Medium" }),
              /* @__PURE__ */ jsx("option", { value: "High", children: "High" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Current education level" }),
            /* @__PURE__ */ jsxs("select", { required: true, className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: inquiryForm.currentEducationLevel, onChange: (e) => setInquiryForm((prev) => ({ ...prev, currentEducationLevel: e.target.value })), children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Select..." }),
              ...EDUCATION_LEVELS.map((level) => /* @__PURE__ */ jsx("option", { value: level, children: level }, level))
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Intended program of study" }),
            /* @__PURE__ */ jsx("input", { type: "text", required: true, className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: inquiryForm.intendedProgram, onChange: (e) => setInquiryForm((prev) => ({ ...prev, intendedProgram: e.target.value })) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Additional message" }),
            /* @__PURE__ */ jsx("textarea", { rows: 3, className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: inquiryForm.message, onChange: (e) => setInquiryForm((prev) => ({ ...prev, message: e.target.value })) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Status" }),
            /* @__PURE__ */ jsxs("select", { className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: inquiryForm.status, onChange: (e) => setInquiryForm((prev) => ({ ...prev, status: e.target.value })), children: [
              /* @__PURE__ */ jsx("option", { value: "Inquiry", children: "Inquiry" }),
              /* @__PURE__ */ jsx("option", { value: "Documentation", children: "Documentation" }),
              /* @__PURE__ */ jsx("option", { value: "Application", children: "Application" }),
              /* @__PURE__ */ jsx("option", { value: "Interview training", children: "Interview training" }),
              /* @__PURE__ */ jsx("option", { value: "Visa", children: "Visa" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Notes" }),
            /* @__PURE__ */ jsx("textarea", { rows: 3, className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: inquiryForm.notes, onChange: (e) => setInquiryForm((prev) => ({ ...prev, notes: e.target.value })) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2 pt-2 border-t border-gray-100", children: [
          /* @__PURE__ */ jsx(Button, { type: "button", variant: "ghost", onClick: closeInquiryPopup, disabled: isSavingInquiry, children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { type: "submit", isLoading: isSavingInquiry, children: "Save" })
        ] })
      ] })
    ] }) }),
    summaryAlert && summaryStudent && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4", children: /* @__PURE__ */ jsxs("div", { className: "bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-gray-200 overflow-hidden", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between p-4 border-b border-gray-100", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold text-slate-900", children: "Inquiry Call Summary" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: summaryStudent?.name || "Choose next action" })
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: closeSummaryPopup, className: "text-slate-400 hover:text-slate-700 p-1", children: /* @__PURE__ */ jsx(X, { size: 18 }) })
      ] }),
      /* @__PURE__ */ jsxs("form", { onSubmit: handleSaveSummary, className: "p-5 space-y-4", children: [
        summaryError ? /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: summaryError }) : null,
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm text-slate-700", children: [
            /* @__PURE__ */ jsx("input", { type: "radio", name: "summaryAction", value: "meeting-note", checked: summaryAction === "meeting-note", onChange: (e) => setSummaryAction(e.target.value) }),
            "Add a meeting note"
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm text-slate-700", children: [
            /* @__PURE__ */ jsx("input", { type: "radio", name: "summaryAction", value: "request-branch", checked: summaryAction === "request-branch", onChange: (e) => setSummaryAction(e.target.value) }),
            "Request another branch"
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm text-slate-700", children: [
            /* @__PURE__ */ jsx("input", { type: "radio", name: "summaryAction", value: "open-profile", checked: summaryAction === "open-profile", onChange: (e) => setSummaryAction(e.target.value) }),
            "Navigate to student profile"
          ] })
        ] }),
        summaryAction === "meeting-note" && /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Meeting notes (bullets or paragraphs)" }),
          /* @__PURE__ */ jsx("textarea", { rows: 5, className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: summaryNote, onChange: (e) => setSummaryNote(e.target.value), placeholder: "- Discussed timeline\n- Shared university options\nNext steps..." })
        ] }),
        summaryAction === "request-branch" && /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Select branch" }),
          /* @__PURE__ */ jsxs("select", { className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500", value: summaryBranch, onChange: (e) => setSummaryBranch(e.target.value), children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "Select..." }),
            ...(offices || []).map((office) => /* @__PURE__ */ jsx("option", { value: office, children: office }, office))
          ] }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: "Student will be moved to requested students list for the selected branch." })
        ] }),
        summaryAction === "open-profile" && /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600", children: "You will be taken to this student's profile in counselor view." }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2 pt-2 border-t border-gray-100", children: [
          /* @__PURE__ */ jsx(Button, { type: "button", variant: "ghost", onClick: closeSummaryPopup, disabled: isSavingSummary, children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { type: "submit", isLoading: isSavingSummary, children: "Save" })
        ] })
      ] })
    ] }) })
  ] });
};
export {
  CounselorDashboard
};
