import { jsx, jsxs } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { CheckCircle, Upload, AlertTriangle, Calendar, Info, Plane, X, CheckSquare, FileText, Download, Eye } from "lucide-react";
import { Button } from "./Button";
import { PersonContactCard } from "./PersonContactCard";
import { COUNTRY_CHECKLISTS } from "../constants";
import { PIPELINE_STEPS, normalizePipelineStatus } from "../pipeline";
import { buildStudentDashboardCounselorRoster, buildVisaAgentEntries } from "../studentContactHelpers";
const formatRegisteredDate = (student) => {
  const candidate = student.joinedDate || student.createdAt || "";
  if (!candidate) return "Not available";
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return String(candidate);
  return parsed.toLocaleDateString();
};
const StudentDashboard = ({ student, onNavigate, tasks = [], employees = [], onUploadDocument }) => {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedDocumentType, setSelectedDocumentType] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const counselorTeam = buildStudentDashboardCounselorRoster(student, employees);
  const visaAgentTeam = buildVisaAgentEntries(student, employees);
  const canonical = normalizePipelineStatus(student.status);
  const rawIndex = PIPELINE_STEPS.indexOf(canonical);
  const visualIndex = rawIndex < 0 ? 0 : rawIndex;
  const steps = PIPELINE_STEPS.map((label, i) => ({ label, icon: String(i + 1) }));
  const progressPercentage = steps.length <= 1 ? 0 : visualIndex / (steps.length - 1) * 100;
  const pendingTasks = tasks.filter((t) => t.student_id === student.id && t.status !== "Completed");
  const sortedActions = pendingTasks.sort((a, b) => {
    if (a.isBlocking && !b.isBlocking) return -1;
    if (!a.isBlocking && b.isBlocking) return 1;
    if (a.priority === "High" && b.priority !== "High") return -1;
    if (a.priority !== "High" && b.priority === "High") return 1;
    return 0;
  });
  const checklist = COUNTRY_CHECKLISTS[student.country] || COUNTRY_CHECKLISTS["Default"] || [];
  const documentTypeOptions = Array.from(
    new Set(
      checklist.flatMap((category) => category.items.map((item) => item.docType))
    )
  );
  const closeUploadModal = () => {
    setIsUploadModalOpen(false);
    setSelectedDocumentType("");
    setSelectedFile(null);
    setUploadError("");
    setIsUploading(false);
  };
  const handleUploadSubmit = async () => {
    if (!selectedDocumentType) {
      setUploadError("Please choose a document type.");
      return;
    }
    if (!selectedFile) {
      setUploadError("Please choose a file to upload.");
      return;
    }
    const allowedTypes = new Set(["application/pdf", "image/png", "image/jpeg", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
    if (!allowedTypes.has(selectedFile.type)) {
      setUploadError("Unsupported format. Use PDF, JPG, PNG, DOC, or DOCX.");
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setUploadError("File must be under 10MB.");
      return;
    }
    if (!onUploadDocument) {
      closeUploadModal();
      return;
    }
    setUploadError("");
    setIsUploading(true);
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read_error"));
      reader.readAsDataURL(selectedFile);
    }).catch(() => "");
    if (!dataUrl) {
      setIsUploading(false);
      setUploadError("Unable to read file. Try again.");
      return;
    }
    const result = await onUploadDocument({
      studentId: student.id,
      dataUrl,
      fileName: selectedFile.name,
      docType: selectedDocumentType,
      phase: 1,
      tier: "Global"
    });
    if (!result?.ok) {
      setIsUploading(false);
      setUploadError(result?.error || "Failed to upload document.");
      return;
    }
    setIsUploading(false);
    closeUploadModal();
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-8 animate-in fade-in duration-500 pb-10", children: [
    /* @__PURE__ */ jsxs("div", { className: "bg-[#0F172A] rounded-2xl p-8 text-white shadow-xl relative overflow-hidden group", children: [
      /* @__PURE__ */ jsxs("div", { className: "relative z-10", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col md:flex-row justify-between items-start md:items-center gap-4", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("h1", { className: "text-3xl font-bold tracking-tight", children: [
              "Hello, ",
              student.name.split(" ")[0],
              "!"
            ] }),
            /* @__PURE__ */ jsxs("p", { className: "text-slate-300 mt-2 max-w-xl", children: [
              "Your application to ",
              /* @__PURE__ */ jsx("span", { className: "text-white font-semibold", children: student.country }),
              " is currently in the",
              /* @__PURE__ */ jsx("span", { className: "ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500 text-white shadow-sm border border-indigo-400/50", children: student.status }),
              " stage."
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "hidden md:block text-right", children: [
            /* @__PURE__ */ jsx("div", { className: "text-xs text-slate-400 uppercase tracking-wider font-bold mb-1", children: "Student ID" }),
            /* @__PURE__ */ jsx("div", { className: "font-mono text-indigo-300", children: student.id })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-8 flex flex-wrap gap-3", children: [
          /* @__PURE__ */ jsxs(
            Button,
            {
              variant: "secondary",
              className: "bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm",
              onClick: () => onNavigate("tasks"),
              children: [
                /* @__PURE__ */ jsx(CheckSquare, { size: 16, className: "mr-2" }),
                "My Checklist"
              ]
            }
          ),
          /* @__PURE__ */ jsxs(Button, { variant: "ghost", className: "text-white hover:bg-white/10 hover:text-white border border-white/20", onClick: () => setIsUploadModalOpen(true), children: [
            /* @__PURE__ */ jsx(Upload, { size: 16, className: "mr-2" }),
            "Upload Documents"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "absolute top-0 right-0 w-80 h-80 bg-indigo-500 rounded-full blur-[100px] opacity-20 -mr-20 -mt-20 group-hover:opacity-30 transition-opacity duration-1000" }),
      /* @__PURE__ */ jsx("div", { className: "absolute bottom-0 left-10 w-40 h-40 bg-rose-500 rounded-full blur-[80px] opacity-10" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-8 shadow-sm relative overflow-hidden", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col md:flex-row justify-between md:items-center mb-12 gap-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 text-lg flex items-center gap-2", children: [
            "Application Journey",
            /* @__PURE__ */ jsx(Info, { size: 16, className: "text-slate-400 cursor-help" })
          ] }),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mt-1", children: "Track your admission & visa milestones." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg border border-indigo-100 text-sm font-medium self-start md:self-auto shadow-sm", children: [
          /* @__PURE__ */ jsx(Calendar, { size: 16 }),
          /* @__PURE__ */ jsxs("span", { children: [
            "Registered Date: ",
              formatRegisteredDate(student)
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "overflow-x-auto pb-4 -mx-4 px-4 md:overflow-visible md:pb-0 md:px-0", children: /* @__PURE__ */ jsxs("div", { className: "relative mx-4 md:mx-10 mb-4 min-w-[500px] md:min-w-0", children: [
        /* @__PURE__ */ jsx("div", { className: "absolute top-1/2 left-0 w-full h-1.5 bg-gray-100 -translate-y-1/2 rounded-full z-0" }),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "absolute top-1/2 left-0 h-1.5 bg-indigo-600 -translate-y-1/2 rounded-full transition-all duration-1000 ease-out z-0 shadow-sm",
            style: { width: `${progressPercentage}%` }
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "relative flex justify-between w-full", children: steps.map((step, index) => {
          const isCompleted = index < visualIndex;
          const isActive = index === visualIndex;
          return /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center z-10 relative group", children: [
            /* @__PURE__ */ jsx("div", { className: `
                                            w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center border-4 transition-all duration-500 bg-white
                                            ${isCompleted ? "border-indigo-600 text-indigo-600" : isActive ? "border-indigo-600 text-indigo-600 scale-110 shadow-xl shadow-indigo-100 ring-4 ring-white" : "border-gray-200 text-gray-300"}
                                        `, children: isCompleted ? /* @__PURE__ */ jsx("div", { className: "bg-indigo-600 w-full h-full rounded-full flex items-center justify-center text-white scale-105", children: /* @__PURE__ */ jsx(CheckCircle, { size: 18, strokeWidth: 3 }) }) : isActive ? /* @__PURE__ */ jsx("div", { className: "w-3 h-3 bg-indigo-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(79,70,229,0.5)]" }) : /* @__PURE__ */ jsx("div", { className: "w-2.5 h-2.5 bg-gray-200 rounded-full" }) }),
            /* @__PURE__ */ jsx("div", { className: `
                                            absolute top-14 left-1/2 -translate-x-1/2 text-xs font-bold whitespace-nowrap transition-all px-3 py-1.5 rounded-full border
                                            ${isActive ? "bg-indigo-600 text-white border-indigo-600 shadow-md transform translate-y-1 scale-105" : isCompleted ? "bg-white text-indigo-900 border-indigo-100" : "bg-white text-gray-400 border-transparent"}
                                        `, children: step.label })
          ] }, step.label);
        }) })
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: "mt-16 text-center md:hidden", children: /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic", children: "Scroll right to view full timeline" }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 space-y-6", children: [
        student.cvFile && /* @__PURE__ */ jsxs("div", { className: "bg-white border border-emerald-100 rounded-xl p-6 shadow-sm bg-gradient-to-br from-white to-emerald-50/30", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
            /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center", children: [
              /* @__PURE__ */ jsx(FileText, { size: 18, className: "mr-2 text-emerald-600" }),
              "Uploaded Old CV"
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wide", children: [
              "Uploaded: ",
              new Date(student.cvFile.uploadedAt || Date.now()).toLocaleDateString()
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between p-4 bg-white border border-emerald-100 rounded-xl shadow-sm", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
              /* @__PURE__ */ jsx("div", { className: "h-12 w-12 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-md", children: /* @__PURE__ */ jsx(FileText, { size: 24 }) }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("p", { className: "font-bold text-slate-900", children: student.cvFile.name || "Uploaded_CV.pdf" }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Saved in student profile" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsx("a", { href: student.cvFile.url, target: "_blank", rel: "noreferrer", children: /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", children: [
                /* @__PURE__ */ jsx(Eye, { size: 14, className: "mr-1" }),
                " View"
              ] }) }),
              /* @__PURE__ */ jsx("a", { href: student.cvFile.url, target: "_blank", rel: "noopener noreferrer", children: /* @__PURE__ */ jsxs(Button, { size: "sm", className: "bg-emerald-600 hover:bg-emerald-700", children: [
                /* @__PURE__ */ jsx(Download, { size: 14, className: "mr-1" }),
                " Download"
              ] }) })
            ] })
          ] })
        ] }),
        student.generatedCV && /* @__PURE__ */ jsxs("div", { className: "bg-white border border-indigo-100 rounded-xl p-6 shadow-sm bg-gradient-to-br from-white to-indigo-50/30", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
            /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center", children: [
              /* @__PURE__ */ jsx(FileText, { size: 18, className: "mr-2 text-indigo-600" }),
              "Your AI-Optimized CV"
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wide", children: [
              "Last Updated: ",
              new Date(student.generatedCV.updatedAt).toLocaleDateString()
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between p-4 bg-white border border-indigo-100 rounded-xl shadow-sm", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
              /* @__PURE__ */ jsx("div", { className: "h-12 w-12 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md", children: /* @__PURE__ */ jsx(FileText, { size: 24 }) }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsxs("p", { className: "font-bold text-slate-900", children: [
                  student.generatedCV.name,
                  "_Resume.pdf"
                ] }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "AI-Enhanced \u2022 Professional Template" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", onClick: () => onNavigate("resume"), children: [
                /* @__PURE__ */ jsx(Eye, { size: 14, className: "mr-1" }),
                " View"
              ] }),
              /* @__PURE__ */ jsxs(Button, { size: "sm", className: "bg-indigo-600 hover:bg-indigo-700", children: [
                /* @__PURE__ */ jsx(Download, { size: 14, className: "mr-1" }),
                " Download"
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-6 shadow-sm", children: [
          /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 mb-4 flex items-center", children: [
            /* @__PURE__ */ jsx(AlertTriangle, { size: 18, className: "mr-2 text-amber-500" }),
            "Action Required"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "space-y-3", children: sortedActions.length > 0 ? sortedActions.map((task) => /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 border border-gray-100 rounded-xl hover:border-indigo-200 transition-colors gap-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
              /* @__PURE__ */ jsx("div", { className: `h-10 w-10 rounded-full flex items-center justify-center shadow-sm border border-gray-100 shrink-0 ${task.documentType ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"}`, children: task.documentType ? /* @__PURE__ */ jsx(Upload, { size: 20 }) : /* @__PURE__ */ jsx(CheckSquare, { size: 20 }) }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("p", { className: "font-semibold text-slate-900 text-sm", children: task.task }),
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mt-1", children: [
                  task.isBlocking && /* @__PURE__ */ jsx("span", { className: "text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full uppercase tracking-wide", children: "Required" }),
                  /* @__PURE__ */ jsxs("span", { className: "text-xs text-slate-500", children: [
                    "Due: ",
                    task.dueDate || "ASAP"
                  ] })
                ] })
              ] })
            ] }),
            task.documentType ? /* @__PURE__ */ jsx(Button, { size: "sm", className: "w-full sm:w-auto", onClick: () => setIsUploadModalOpen(true), children: "Upload Now" }) : /* @__PURE__ */ jsx(Button, { size: "sm", variant: "secondary", className: "w-full sm:w-auto", onClick: () => onNavigate("tasks"), children: "View Task" })
          ] }, task.id)) : /* @__PURE__ */ jsxs("div", { className: "text-center py-8 text-slate-500 text-sm", children: [
            /* @__PURE__ */ jsx(CheckCircle, { size: 24, className: "mx-auto mb-2 text-emerald-500" }),
            "No pending actions required at this stage."
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-6 shadow-sm", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
            /* @__PURE__ */ jsx("h3", { className: "text-xs font-bold text-slate-400 uppercase tracking-wider", children: "Your counselors" }),
            /* @__PURE__ */ jsx("div", { className: "h-2 w-2 bg-emerald-500 rounded-full animate-pulse", title: "Online Now" })
          ] }),
          counselorTeam.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mb-4", children: "Your counselor details will appear here once assigned." }) : /* @__PURE__ */ jsx("div", { className: "space-y-3 max-h-[min(28rem,55vh)] overflow-y-auto pr-1 mb-4", children: counselorTeam.map((c) => /* @__PURE__ */ jsx(
            PersonContactCard,
            {
              name: c.name,
              role: `${c.role} · ${student.country}`,
              badges: c.badges,
              email: c.email,
              phone: c.phone,
              avatar: c.avatar,
              avatarClassName: "h-12 w-12 text-base"
            },
            c.id
          )) }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ jsx(Button, { className: "w-full", variant: "secondary", onClick: () => onNavigate("messages"), children: "Message" }),
            /* @__PURE__ */ jsx(Button, { className: "w-full", variant: "secondary", onClick: () => onNavigate("calendar"), children: "Book Call" })
          ] })
        ] }),
        visaAgentTeam.length > 0 && /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-6 shadow-sm", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-4", children: [
            /* @__PURE__ */ jsx(Plane, { size: 16, className: "text-indigo-600", strokeWidth: 2 }),
            /* @__PURE__ */ jsx("h3", { className: "text-xs font-bold text-slate-400 uppercase tracking-wider", children: "Visa agents" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "space-y-3 max-h-64 overflow-y-auto pr-1", children: visaAgentTeam.map((v) => /* @__PURE__ */ jsx(
            PersonContactCard,
            {
              name: v.name,
              role: v.role,
              badges: [],
              email: v.email,
              phone: v.phone,
              avatar: v.avatar,
              avatarClassName: "h-12 w-12 text-base"
            },
            v.id
          )) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "bg-indigo-900 rounded-xl p-6 text-white relative overflow-hidden", children: [
          /* @__PURE__ */ jsxs("div", { className: "relative z-10", children: [
            /* @__PURE__ */ jsxs("h3", { className: "font-bold mb-2 flex items-center gap-2", children: [
              /* @__PURE__ */ jsx("span", { className: "bg-white/20 p-1 rounded", children: /* @__PURE__ */ jsx(Info, { size: 14 }) }),
              "Need Help?"
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-indigo-200 mb-4 leading-relaxed", children: "Stuck on a document? Check our FAQ or contact support directly." }),
            /* @__PURE__ */ jsxs("p", { className: "text-[10px] text-indigo-400 font-mono pt-2 border-t border-white/10", children: [
              "Ref ID: ",
              student.id
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "absolute -bottom-6 -right-6 w-24 h-24 bg-indigo-700 rounded-full blur-xl opacity-50" })
        ] })
      ] })
    ] }),
    isUploadModalOpen && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-100 shadow-2xl p-6 w-full max-w-md scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-4", children: [
        /* @__PURE__ */ jsx("h3", { className: "font-bold text-lg text-slate-900", children: "Upload Documents" }),
        /* @__PURE__ */ jsx("button", { onClick: closeUploadModal, className: "text-slate-400 hover:text-slate-600", children: /* @__PURE__ */ jsx(X, { size: 20 }) })
      ] }),
      /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-slate-700 mb-2", children: "Document Type" }),
      /* @__PURE__ */ jsxs("select", { className: "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500", value: selectedDocumentType, onChange: (event) => setSelectedDocumentType(event.target.value), children: [
        /* @__PURE__ */ jsx("option", { value: "", children: "Select a document type" }),
        documentTypeOptions.map((docType) => /* @__PURE__ */ jsx("option", { value: docType, children: docType }, docType))
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors cursor-pointer", onClick: () => fileInputRef.current?.click(), children: [
        /* @__PURE__ */ jsx("div", { className: "w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3", children: /* @__PURE__ */ jsx(Upload, { size: 24 }) }),
        /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-900", children: selectedFile?.name || "Click to choose a file" }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: "PDF, JPG, PNG, DOC or DOCX (max. 10MB)" })
      ] }),
      /* @__PURE__ */ jsx("input", { ref: fileInputRef, type: "file", className: "hidden", accept: ".pdf,.png,.jpg,.jpeg,.doc,.docx", onChange: (event) => {
        const file = event.target.files?.[0];
        setSelectedFile(file || null);
        setUploadError("");
      } }),
      uploadError && /* @__PURE__ */ jsx("p", { className: "mt-3 text-xs text-rose-600", children: uploadError }),
      /* @__PURE__ */ jsxs("div", { className: "mt-4 flex justify-end gap-2", children: [
        /* @__PURE__ */ jsx(Button, { variant: "ghost", onClick: closeUploadModal, children: "Cancel" }),
        /* @__PURE__ */ jsx(Button, { onClick: handleUploadSubmit, disabled: !selectedDocumentType || !selectedFile || isUploading, children: isUploading ? "Uploading..." : "Upload" })
      ] })
    ] }) })
  ] });
};
export {
  StudentDashboard
};
