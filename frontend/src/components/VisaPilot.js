import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { CheckCircle, AlertCircle, Lock, Unlock, Upload, FileText, Eye, Download, X, FileUp } from "lucide-react";
import { Button } from "./Button";
const VISA_WORKFLOWS = {
  Australia: [
    { name: "Pre-Flight Check", description: "Compliance Verification", items: ["FAR (Financial Audit)", "GTE/GS Approval", "OSHC"], blockerMessage: "Cannot proceed to Launch without FAR and GTE." },
    { name: "Launch", description: "Lodgment & Biometrics", items: ["ImmiAccount Lodgment", "HAP ID (Medical)", "Biometrics"], blockerMessage: "Cannot proceed to Landing without Biometrics." },
    { name: "Landing", description: "Decision & Pre-Departure", items: ["Visa Grant Notice", "VEVO Check", "Flight Ticket"], blockerMessage: "Cannot complete without Visa Grant Notice." }
  ],
  Canada: [
    { name: "Pre-Flight Check", description: "Compliance Verification", items: ["PAL (Provincial Attestation)", "GIC Certificate", "Upfront Medicals"], blockerMessage: "Cannot proceed to Launch without PAL and GIC." },
    { name: "Launch", description: "Lodgment & Biometrics", items: ["IRCC Portal Lodgment", "Biometrics Instruction Letter (BIL)"], blockerMessage: "Cannot proceed to Landing without BIL." },
    { name: "Landing", description: "Decision & Pre-Departure", items: ["Passport Request (PPR)", "POE Letter", "Flight Ticket"], blockerMessage: "Cannot complete without POE Letter." }
  ],
  UK: [
    { name: "Pre-Flight Check", description: "Compliance Verification", items: ["CAS Issuance", "TB Test Certificate", "Financials (28-day rule)"], blockerMessage: "Cannot proceed to Launch without CAS and TB Test." },
    { name: "Launch", description: "Lodgment & Biometrics", items: ["UKVI Lodgment", "IHS Payment", "VFS Appointment"], blockerMessage: "Cannot proceed to Landing without VFS Appointment." },
    { name: "Landing", description: "Decision & Pre-Departure", items: ["BRP Collection Letter", "Vignette", "Flight Ticket"], blockerMessage: "Cannot complete without Vignette." }
  ],
  Default: [
    { name: "Pre-Flight Check", description: "Compliance Verification", items: ["Financial Clearance", "Medical Check"], blockerMessage: "Cannot proceed to Launch without Financial Clearance." },
    { name: "Launch", description: "Lodgment & Biometrics", items: ["Portal Lodgment", "Biometrics"], blockerMessage: "Cannot proceed to Landing without Biometrics." },
    { name: "Landing", description: "Decision & Pre-Departure", items: ["Visa Decision", "Flight Ticket"], blockerMessage: "Cannot complete without Visa Decision." }
  ]
};
const VisaPilot = ({ student, userRole = "Admin", onUpdateStudent, onUploadDocument }) => {
  const workflow = VISA_WORKFLOWS[student.country] || VISA_WORKFLOWS.Default;
  const [visaState, setVisaState] = useState(student.visa || {});
  const [uploadModal, setUploadModal] = useState({ isOpen: false, item: "", stageIndex: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const visaDocuments = useMemo(() => student.documents?.filter((doc) => String(doc.tier || "").toLowerCase() === "visapilot") || [], [student.documents]);
  const canUploadVisaDocs = userRole !== "Student";
  let currentStageIndex = 0;
  for (let i = 0; i < workflow.length; i++) {
    const stage = workflow[i];
    const allCompleted = stage.items.every((item) => visaState[item] === "Completed");
    if (allCompleted) {
      currentStageIndex = i + 1;
    } else {
      break;
    }
  }
  if (currentStageIndex >= workflow.length) {
    currentStageIndex = workflow.length - 1;
  }
  const handleToggleItem = (item) => {
    const newState = {
      ...visaState,
      [item]: visaState[item] === "Completed" ? "Pending" : "Completed"
    };
    setVisaState(newState);
    if (onUpdateStudent) {
      onUpdateStudent({ ...student, visa: newState });
    }
  };
  const buildVisaDocType = (item) => `Visa Pilot - ${item}`;
  const getItemDocuments = (item) => {
    const docType = buildVisaDocType(item);
    return visaDocuments.filter((doc) => doc.type === docType).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  };
  const handleUploadFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !uploadModal.item) return;
    if (!onUploadDocument) {
      setUploadError("Document upload service is unavailable.");
      event.target.value = "";
      return;
    }
    const allowedTypes = new Set([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]);
    if (!allowedTypes.has(file.type)) {
      setUploadError("Unsupported format. Use PDF, JPG, PNG, DOC, or DOCX.");
      event.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File must be under 10MB.");
      event.target.value = "";
      return;
    }
    setUploadError("");
    setIsUploading(true);
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read_error"));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) {
      setIsUploading(false);
      setUploadError("Unable to read file. Try again.");
      event.target.value = "";
      return;
    }
    const result = await onUploadDocument({
      studentId: student.id,
      dataUrl,
      fileName: file.name,
      docType: buildVisaDocType(uploadModal.item),
      phase: uploadModal.stageIndex + 1,
      tier: "VisaPilot"
    });
    setIsUploading(false);
    event.target.value = "";
    if (!result?.ok) {
      setUploadError(result?.error || "Failed to upload document.");
      return;
    }
    if (result.data && onUpdateStudent) {
      onUpdateStudent(result.data);
    }
    setUploadModal({ isOpen: false, item: "", stageIndex: 0 });
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-8", children: [
    /* @__PURE__ */ jsx("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-slate-800", children: "Visa Pilot Engine" }),
      /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-500 mt-1", children: [
        "Country-specific state machine for ",
        student.country
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "flex flex-col gap-6", children: workflow.map((stage, index) => {
      const isLocked = index > currentStageIndex;
      const isActive = index === currentStageIndex;
      const isCompleted = index < currentStageIndex || index === workflow.length - 1 && stage.items.every((item) => visaState[item] === "Completed");
      return /* @__PURE__ */ jsxs(
        "div",
        {
          className: `relative rounded-xl border p-5 transition-all ${isLocked ? "bg-slate-50 border-slate-200 opacity-60" : isActive ? "bg-white border-nexgenai-navy shadow-md ring-1 ring-nexgenai-navy/20" : "bg-emerald-50/30 border-emerald-200"}`,
          children: [
            /* @__PURE__ */ jsx("div", { className: "flex items-start justify-between mb-4", children: /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
                /* @__PURE__ */ jsxs("span", { className: `text-xs font-bold px-2 py-0.5 rounded-full ${isLocked ? "bg-slate-200 text-slate-500" : isActive ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`, children: [
                  "STAGE ",
                  index + 1
                ] }),
                isLocked && /* @__PURE__ */ jsx(Lock, { size: 14, className: "text-slate-400" }),
                isActive && /* @__PURE__ */ jsx(Unlock, { size: 14, className: "text-indigo-500" }),
                isCompleted && /* @__PURE__ */ jsx(CheckCircle, { size: 14, className: "text-emerald-500" })
              ] }),
              /* @__PURE__ */ jsx("h3", { className: `font-bold ${isLocked ? "text-slate-500" : "text-slate-800"}`, children: stage.name }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: stage.description })
            ] }) }),
            /* @__PURE__ */ jsx("div", { className: "space-y-3 mt-6", children: stage.items.map((item) => {
              const itemStatus = visaState[item] || "Pending";
              const itemCompleted = itemStatus === "Completed";
              const itemDocuments = getItemDocuments(item);
              return /* @__PURE__ */ jsx(
                "div",
                {
                  className: `space-y-3 p-3 rounded-lg border ${isLocked ? "border-slate-200 bg-slate-100/50" : itemCompleted ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`,
                  children: [
                    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
                      /* @__PURE__ */ jsxs(
                        "div",
                        {
                          className: `flex items-center gap-3 ${!isLocked ? "cursor-pointer" : ""}`,
                          onClick: () => !isLocked && handleToggleItem(item),
                          children: [
                            /* @__PURE__ */ jsx("div", { className: `flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center ${itemCompleted ? "bg-emerald-500 border-emerald-600" : "border-slate-300 bg-slate-50"}`, children: itemCompleted && /* @__PURE__ */ jsx(CheckCircle, { size: 12, className: "text-white" }) }),
                            /* @__PURE__ */ jsx("span", { className: `text-sm font-medium ${itemCompleted ? "text-slate-700 line-through opacity-70" : "text-slate-700"}`, children: item })
                          ]
                        }
                      ),
                      canUploadVisaDocs && /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", onClick: () => setUploadModal({ isOpen: true, item, stageIndex: index }), children: [
                        /* @__PURE__ */ jsx(Upload, { size: 14, className: "mr-2" }),
                        " Upload"
                      ] })
                    ] }),
                    itemDocuments.length > 0 && /* @__PURE__ */ jsx("div", { className: "space-y-2", children: itemDocuments.map((doc) => /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 p-2 rounded-lg flex items-center justify-between", children: [
                      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
                        /* @__PURE__ */ jsx(FileText, { size: 14, className: "text-slate-500 shrink-0" }),
                        /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                          /* @__PURE__ */ jsx("p", { className: "text-xs font-medium text-slate-700 truncate", children: doc.name }),
                          /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400", children: doc.uploadedAt })
                        ] })
                      ] }),
                      doc.url && /* @__PURE__ */ jsxs(Fragment, { children: [
                        /* @__PURE__ */ jsx("a", { href: doc.url, target: "_blank", rel: "noopener noreferrer", className: "p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900", title: "Preview", children: /* @__PURE__ */ jsx(Eye, { size: 14 }) }),
                        /* @__PURE__ */ jsx("a", { href: doc.url, target: "_blank", rel: "noopener noreferrer", className: "p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900", title: "Download", children: /* @__PURE__ */ jsx(Download, { size: 14 }) })
                      ] })
                    ] }, doc.id || `${doc.name}-${doc.uploadedAt}`)) })
                  ]
                },
                item
              );
            }) }),
            isActive && !isCompleted && /* @__PURE__ */ jsxs("div", { className: "mt-5 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2", children: [
              /* @__PURE__ */ jsx(AlertCircle, { size: 16, className: "text-amber-600 flex-shrink-0 mt-0.5" }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-amber-800 font-medium leading-relaxed", children: stage.blockerMessage })
            ] })
          ]
        },
        stage.name
      );
    }) }),
    uploadModal.isOpen && uploadModal.item && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "p-5 border-b border-gray-100 flex justify-between items-center bg-slate-50", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-slate-900", children: "Upload Visa Document" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: uploadModal.item })
        ] }),
        !isUploading && /* @__PURE__ */ jsx("button", { onClick: () => setUploadModal({ isOpen: false, item: "", stageIndex: 0 }), className: "p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors", children: /* @__PURE__ */ jsx(X, { size: 18 }) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "p-6", children: !isUploading ? /* @__PURE__ */ jsxs(
        "label",
        {
          className: "border-2 border-dashed border-indigo-200 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-300 transition-colors group",
          children: [
            /* @__PURE__ */ jsx("input", { type: "file", accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx", className: "hidden", onChange: handleUploadFileChange }),
            /* @__PURE__ */ jsx("div", { className: "w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform", children: /* @__PURE__ */ jsx(FileUp, { size: 24 }) }),
            /* @__PURE__ */ jsx("h4", { className: "text-sm font-medium text-slate-900 mb-1", children: "Click to browse file" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Supports PDF, JPG, PNG, DOC, DOCX (Max 10MB)" }),
            uploadError ? /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-600 mt-3", children: uploadError }) : null
          ]
        }
      ) : /* @__PURE__ */ jsxs("div", { className: "py-8 flex flex-col items-center justify-center text-center", children: [
        /* @__PURE__ */ jsx("div", { className: "w-16 h-16 rounded-full mb-6 bg-indigo-100 text-indigo-600 flex items-center justify-center animate-pulse", children: /* @__PURE__ */ jsx(FileUp, { size: 24 }) }),
        /* @__PURE__ */ jsx("h4", { className: "text-sm font-medium text-slate-900 mb-1", children: "Uploading Document..." }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Please wait while we process your file." })
      ] }) })
    ] }) })
  ] });
};
export {
  VisaPilot
};
