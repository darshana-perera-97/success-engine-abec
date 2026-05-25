import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { CheckCircle, AlertCircle, Lock, Unlock, Upload, FileText, Eye, Download, X, FileUp, Trash2, Hourglass } from "lucide-react";
import { Button } from "./Button";
import { VISA_WORKFLOWS } from "../visaWorkflows";
import { isVisaPilotUnlocked, normalizePipelineStatus } from "../pipeline";
import { buildVisaPilotDocType } from "../studentEnrolledGate";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "../uploadLimits";
/** Short label for long filenames (matches Paperless Pipeline / DocumentManager). */
function shortDisplayFileName(name, maxStem = 8) {
  const s = String(name || "").trim();
  if (!s) return "";
  const dot = s.lastIndexOf(".");
  const hasExt = dot > 0 && dot < s.length - 1;
  const ext = hasExt ? s.slice(dot) : "";
  const base = hasExt ? s.slice(0, dot) : s;
  if (base.length <= maxStem) return s;
  return `${base.slice(0, maxStem)}…${ext}`;
}
function isDeletableVisaDocumentStatus(status) {
  return status === "Rejected" || status === "Verified";
}

const VisaPilot = ({ student, userRole = "Admin", onUpdateStudent, onUploadDocument, onDeleteDocument }) => {
  const workflow = VISA_WORKFLOWS[student.country] || VISA_WORKFLOWS.Default;
  const visaPilotUnlocked = isVisaPilotUnlocked(student.status);
  const isDocumentationStage = normalizePipelineStatus(student.status) === "Documentation";
  const [visaState, setVisaState] = useState(student.visa || {});
  const [uploadModal, setUploadModal] = useState({ isOpen: false, item: "", stageIndex: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [deleteDocumentModal, setDeleteDocumentModal] = useState({ isOpen: false, doc: null });
  const visaDocuments = useMemo(() => student.documents?.filter((doc) => String(doc.tier || "").toLowerCase() === "visapilot") || [], [student.documents]);
  const canUploadVisaDocs = userRole !== "Student" && visaPilotUnlocked;
  const canDeleteVisaDoc = userRole !== "Student" && typeof onDeleteDocument === "function";
  const buildVisaDocType = (item) => buildVisaPilotDocType(item);
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
    if (!visaPilotUnlocked) return;
    const newState = {
      ...visaState,
      [item]: visaState[item] === "Completed" ? "Pending" : "Completed"
    };
    setVisaState(newState);
    if (onUpdateStudent) {
      onUpdateStudent({ ...student, visa: newState });
    }
  };
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
      "image/jpg",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]);
    if (!allowedTypes.has(file.type)) {
      setUploadError("Unsupported format. Use PDF, JPG, PNG, DOC, or DOCX.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`File must be under ${MAX_UPLOAD_LABEL}.`);
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
    isDocumentationStage && /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900", children: [
      /* @__PURE__ */ jsx("p", { className: "font-semibold", children: "Documentation stage — submit Visa Pilot documents now" }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-indigo-800 mt-1", children: "Upload each required visa document before advancing to the Visa stage." })
    ] }),
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
              const hasVerifiedVisaDoc = itemDocuments.some((d) => d.status === "Verified");
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
                      canUploadVisaDocs && /* @__PURE__ */ jsxs(Button, { size: "sm", className: "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-100 border-none", onClick: () => setUploadModal({ isOpen: true, item, stageIndex: index }), children: [
                        /* @__PURE__ */ jsx(Upload, { size: 14, className: "mr-2" }),
                        " Upload"
                      ] })
                    ] }),
                    (itemDocuments.length > 0 || !hasVerifiedVisaDoc) && /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
                    itemDocuments.length > 0 && itemDocuments.map((doc) => {
                      const docStatus = doc.status;
                      const iconBoxClass = docStatus === "Verified" ? "bg-emerald-100 text-emerald-600" : docStatus === "Rejected" ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-500";
                      return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 p-3 rounded-lg flex items-center justify-between group hover:shadow-sm transition-all", children: [
                        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
                          /* @__PURE__ */ jsx("div", { className: `w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBoxClass}`, children: /* @__PURE__ */ jsx(FileText, { size: 18 }) }),
                          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900 truncate", title: doc.name, children: shortDisplayFileName(doc.name) }),
                            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: doc.uploadedAt })
                          ] })
                        ] }),
                        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 ml-2 pl-2 border-l border-gray-200 shrink-0", children: [
                          doc.status && /* @__PURE__ */ jsx("span", { className: `px-2 py-0.5 rounded-full text-[10px] font-bold border ${docStatus === "Verified" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : docStatus === "Rejected" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`, children: docStatus }),
                          canDeleteVisaDoc && isDeletableVisaDocumentStatus(docStatus) && /* @__PURE__ */ jsxs(
                            "button",
                            {
                              type: "button",
                              onClick: () => setDeleteDocumentModal({ isOpen: true, doc }),
                              title: docStatus === "Verified" ? "Delete approved upload" : "Delete rejected upload",
                              className: "inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700 text-xs font-medium",
                              children: [
                                /* @__PURE__ */ jsx(Trash2, { size: 14, className: "shrink-0" }),
                                "Delete"
                              ]
                            }
                          ),
                          doc.url && /* @__PURE__ */ jsxs(Fragment, { children: [
                            /* @__PURE__ */ jsx("a", { href: doc.url, target: "_blank", rel: "noopener noreferrer", title: "Preview", className: "p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900", children: /* @__PURE__ */ jsx(Eye, { size: 16 }) }),
                            /* @__PURE__ */ jsx("a", { href: doc.url, target: "_blank", rel: "noopener noreferrer", title: "Download", className: "p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900", children: /* @__PURE__ */ jsx(Download, { size: 16 }) })
                          ] })
                        ] })
                      ] }, doc.id || `${doc.name}-${doc.uploadedAt}`);
                    }),
                    !hasVerifiedVisaDoc && /* @__PURE__ */ jsx("div", { className: `border-2 border-dashed p-3 rounded-lg ${itemDocuments.length > 0 ? "bg-amber-50/80 border-amber-200" : "bg-slate-50 border-gray-200"}`, children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
                      /* @__PURE__ */ jsx("div", { className: `w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${itemDocuments.length > 0 ? "bg-amber-100 border-amber-200 text-amber-600" : "bg-white border-gray-200 text-slate-400"}`, children: /* @__PURE__ */ jsx(Hourglass, { size: 18 }) }),
                      /* @__PURE__ */ jsxs("div", { children: [
                        /* @__PURE__ */ jsx("p", { className: `text-sm font-medium ${itemDocuments.length > 0 ? "text-amber-900" : "text-slate-500"}`, children: itemDocuments.length > 0 ? "Awaiting approved document" : "Pending upload" }),
                        /* @__PURE__ */ jsx("p", { className: `text-xs ${itemDocuments.length > 0 ? "text-amber-800/80" : "text-slate-400"}`, children: itemDocuments.length > 0 ? "Upload a new file or approve a pending submission for this visa item." : "No file uploaded yet for this requirement." })
                      ] })
                    ] }) })
                    ] })
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
    deleteDocumentModal.isOpen && deleteDocumentModal.doc && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "p-5 border-b border-gray-100", children: [
        /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-slate-900", children: deleteDocumentModal.doc.status === "Verified" ? "Delete approved visa document?" : "Delete rejected visa document?" }),
        /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
          "Remove ",
          /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-700", children: deleteDocumentModal.doc.name }),
          " from this student’s record. The stored file will be deleted."
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-5 flex justify-end gap-2", children: [
        /* @__PURE__ */ jsx(Button, { variant: "ghost", onClick: () => setDeleteDocumentModal({ isOpen: false, doc: null }), children: "Cancel" }),
        /* @__PURE__ */ jsx(Button, {
          variant: "danger",
          onClick: async () => {
            const doc = deleteDocumentModal.doc;
            setDeleteDocumentModal({ isOpen: false, doc: null });
            if (!doc) return;
            await onDeleteDocument?.(doc);
          },
          children: "Delete"
        })
      ] })
    ] }) }),
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
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: `Supports PDF, JPG, PNG, DOC, DOCX (Max ${MAX_UPLOAD_LABEL})` }),
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
