import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useMemo } from "react";
import { Upload, FileText, Check, X, AlertCircle, Eye, Hourglass, Download, MessageCircle, FileUp, Trash2 } from "lucide-react";
import { Button } from "./Button";
import { COUNTRY_CHECKLISTS } from "../constants";
const DELETE_REJECTED_ROLES = new Set(["Counselor", "Manager", "Admin"]);
const DocumentManager = ({
  student,
  userRole,
  onUpdateDocument,
  onDeleteDocument,
  tasks = [],
  onUpdateTasks,
  onUploadDocument,
  onUploadProfileOtherDocument
}) => {
  const [rejectionModal, setRejectionModal] = useState({ isOpen: false, doc: null });
  const [deleteRejectedModal, setDeleteRejectedModal] = useState({ isOpen: false, doc: null });
  const [rejectionReason, setRejectionReason] = useState("");
  const [uploadModal, setUploadModal] = useState({ isOpen: false, docType: null });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [otherDocModal, setOtherDocModal] = useState({ open: false, slot: null, label: "", error: "" });
  const [otherDocUploading, setOtherDocUploading] = useState(false);
  const [whatsappNotification, setWhatsappNotification] = useState({ show: false, message: "" });
  const studentDocuments = useMemo(() => student.documents || [], [student.documents]);
  const profileOtherSlots = useMemo(() => {
    const raw = student.profileOtherDocuments;
    const out = [null, null, null];
    if (Array.isArray(raw)) {
      for (let i = 0; i < 3; i++) {
        if (raw[i] && typeof raw[i] === "object" && raw[i].url) {
          out[i] = raw[i];
        }
      }
    }
    return out;
  }, [student.profileOtherDocuments]);
  const showWhatsappNotification = (message) => {
    setWhatsappNotification({ show: true, message });
    setTimeout(() => setWhatsappNotification({ show: false, message: "" }), 4e3);
  };
  const handleUploadFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !uploadModal.docType) return;
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
      docType: uploadModal.docType,
      phase: 1,
      tier: "Global"
    });
    setIsUploading(false);
    event.target.value = "";
    if (!result?.ok) {
      setUploadError(result?.error || "Failed to upload document.");
      return;
    }
    if (onUpdateTasks) {
      const linkedTask = tasks.find(
        (t) => t.student_id === student.id && t.documentType === uploadModal.docType && t.status !== "Completed"
      );
      if (linkedTask) {
        onUpdateTasks([{ ...linkedTask, status: "In Review" }]);
      }
    }
    setUploadModal({ isOpen: false, docType: null });
    showWhatsappNotification(`Document "${uploadModal.docType}" uploaded successfully.`);
  };
  const handleProfileOtherFileChange = async (event) => {
    const file = event.target.files?.[0];
    const slot = otherDocModal.slot;
    const labelForUpload = otherDocModal.label.trim() || "Other document";
    if (!file || slot == null) return;
    if (!onUploadProfileOtherDocument) {
      setOtherDocModal((prev) => ({ ...prev, error: "Document upload service is unavailable." }));
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
      setOtherDocModal((prev) => ({ ...prev, error: "Unsupported format. Use PDF, JPG, PNG, DOC, or DOCX." }));
      event.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setOtherDocModal((prev) => ({ ...prev, error: "File must be under 10MB." }));
      event.target.value = "";
      return;
    }
    setOtherDocModal((prev) => ({ ...prev, error: "" }));
    setOtherDocUploading(true);
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read_error"));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) {
      setOtherDocUploading(false);
      setOtherDocModal((prev) => ({ ...prev, error: "Unable to read file. Try again." }));
      event.target.value = "";
      return;
    }
    const result = await onUploadProfileOtherDocument({
      studentId: student.id,
      dataUrl,
      fileName: file.name,
      label: labelForUpload,
      slot
    });
    setOtherDocUploading(false);
    event.target.value = "";
    if (!result?.ok) {
      setOtherDocModal((prev) => ({ ...prev, error: result?.error || "Failed to upload document." }));
      return;
    }
    setOtherDocModal({ open: false, slot: null, label: "", error: "" });
    showWhatsappNotification(`Other document "${labelForUpload}" saved (slot ${slot}).`);
  };
  const handleReview = async (doc, status, reason) => {
    const updatedDoc = { ...doc, status, rejectionReason: status === "Rejected" ? reason : void 0 };
    setRejectionModal({ isOpen: false, doc: null });
    setRejectionReason("");
    const actionText = status === "Verified" ? "approved" : "rejected";
    const persistResult = await onUpdateDocument?.(updatedDoc);
    if (persistResult && persistResult.ok === false) {
      showWhatsappNotification(`Save failed: ${persistResult.error || "Could not save changes."}`);
      return;
    }
    if (status === "Verified" && onUpdateTasks) {
      const linkedTask = tasks.find(
        (t) => t.student_id === student.id && t.documentType === doc.type && t.status !== "Completed"
      );
      if (linkedTask) {
        onUpdateTasks([{ ...linkedTask, status: "Completed" }]);
      }
    }
    const notifs = persistResult?.documentWhatsappNotifications || [];
    const mine = notifs.find((n) => String(n.docId) === String(updatedDoc.id));
    const ws = mine?.whatsapp;
    if (ws?.status === "sent") {
      showWhatsappNotification(`Document "${doc.name}" was ${actionText}. WhatsApp sent to the student from your linked account.`);
    } else if (ws?.status === "failed" || ws?.status === "skipped") {
      const detail = ws.reason ? ` ${ws.reason}` : "";
      showWhatsappNotification(`Document "${doc.name}" was ${actionText}. WhatsApp was not sent.${detail}`);
    } else {
      showWhatsappNotification(`Document "${doc.name}" was ${actionText}.`);
    }
  };
  const checklist = useMemo(() => {
    const countryChecklist = COUNTRY_CHECKLISTS[student.country] || COUNTRY_CHECKLISTS["Default"];
    return countryChecklist.map((category) => ({
      ...category,
      items: category.items.map((item) => ({
        ...item,
        uploadedFiles: studentDocuments.filter((d) => d.type === item.docType || d.type.includes(item.docType) || item.docType.includes(d.type)).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      }))
    }));
  }, [student.country, studentDocuments]);
  const isStaff = userRole !== "Student";
  const canDeleteRejectedUpload = DELETE_REJECTED_ROLES.has(userRole) && typeof onDeleteDocument === "function";
  const totalRequired = checklist.reduce((acc, cat) => acc + cat.items.length, 0);
  const totalVerified = checklist.reduce((acc, cat) => acc + cat.items.filter((item) => item.uploadedFiles.some((f) => f.status === "Verified")).length, 0);
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsx("div", { className: "flex justify-between items-center bg-indigo-50 p-4 rounded-lg border border-indigo-100", children: /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("h4", { className: "text-indigo-900 font-semibold", children: [
        "Paperless Pipeline: ",
        student.country
      ] }),
      /* @__PURE__ */ jsxs("p", { className: "text-indigo-700 text-xs mt-1", children: [
        totalVerified,
        " / ",
        totalRequired,
        " Verified"
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "space-y-6", children: checklist.map((category) => /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("h3", { className: "text-xs font-bold text-slate-400 uppercase tracking-wider mb-2", children: [
        category.stage,
        " Requirements"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "space-y-3", children: category.items.map(({ docType, description, uploadedFiles }) => /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h4", { className: "text-sm font-medium text-slate-700", children: docType }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: description })
          ] }),
          /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", onClick: () => setUploadModal({ isOpen: true, docType }), children: [
            /* @__PURE__ */ jsx(Upload, { size: 14, className: "mr-2" }),
            " Upload"
          ] })
        ] }),
        uploadedFiles.length > 0 ? uploadedFiles.map((uploadedFile, idx) => /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 p-3 rounded-lg flex items-center justify-between group hover:shadow-sm transition-all", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("div", { className: `w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${uploadedFile.status === "Verified" ? "bg-emerald-100 text-emerald-600" : uploadedFile.status === "Rejected" ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-500"}`, children: /* @__PURE__ */ jsx(FileText, { size: 18 }) }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900", children: uploadedFile.name }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: uploadedFile.uploadedAt })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: `px-2 py-0.5 rounded-full text-[10px] font-bold border ${uploadedFile.status === "Verified" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : uploadedFile.status === "Rejected" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`, children: uploadedFile.status }),
            uploadedFile.status === "Rejected" && uploadedFile.rejectionReason && /* @__PURE__ */ jsxs("div", { className: "relative group/tip", children: [
              /* @__PURE__ */ jsx(AlertCircle, { size: 14, className: "text-rose-500 cursor-help" }),
              /* @__PURE__ */ jsx("div", { className: "absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-2 bg-slate-800 text-white text-xs rounded shadow-lg z-10 hidden group-hover/tip:block animate-in fade-in zoom-in-95", children: uploadedFile.rejectionReason })
            ] }),
            canDeleteRejectedUpload && uploadedFile.status === "Rejected" && /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                onClick: () => setDeleteRejectedModal({ isOpen: true, doc: uploadedFile }),
                title: "Delete rejected upload",
                className: "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700 border border-transparent hover:border-rose-200 text-sm font-medium shrink-0",
                children: [
                  /* @__PURE__ */ jsx(Trash2, { size: 18, strokeWidth: 2.25, className: "shrink-0" }),
                  "Delete"
                ]
              }
            ),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 ml-2 pl-2 border-l border-gray-200", children: [
              uploadedFile.url && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("a", { href: uploadedFile.url, target: "_blank", rel: "noopener noreferrer", title: "Preview", className: "p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900", children: /* @__PURE__ */ jsx(Eye, { size: 16 }) }),
                /* @__PURE__ */ jsx("a", { href: uploadedFile.url, target: "_blank", rel: "noopener noreferrer", title: "Download", className: "p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900", children: /* @__PURE__ */ jsx(Download, { size: 16 }) })
              ] }),
              isStaff && (uploadedFile.status === "Pending" || uploadedFile.status === "Reviewing") && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("div", { className: "w-px h-5 bg-gray-200" }),
                /* @__PURE__ */ jsx("button", { onClick: () => handleReview(uploadedFile, "Verified"), title: "Approve", className: "p-1.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100", children: /* @__PURE__ */ jsx(Check, { size: 16 }) }),
                /* @__PURE__ */ jsx("button", { onClick: () => setRejectionModal({ isOpen: true, doc: uploadedFile }), title: "Reject", className: "p-1.5 rounded bg-rose-50 text-rose-600 hover:bg-rose-100", children: /* @__PURE__ */ jsx(X, { size: 16 }) })
              ] })
            ] })
          ] })
        ] }, uploadedFile.id || `${uploadedFile.name}-${idx}`)) : /* @__PURE__ */ jsx("div", { className: "bg-slate-50 border-2 border-dashed border-gray-200 p-3 rounded-lg flex items-center justify-between group hover:border-indigo-200 transition-colors", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "w-9 h-9 rounded-lg flex items-center justify-center bg-white border border-gray-200 text-slate-400 shrink-0", children: /* @__PURE__ */ jsx(Hourglass, { size: 18 }) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-500", children: "Pending Upload" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400", children: "Awaiting submission" })
          ] })
        ] }) })
      ] }, docType)) })
    ] }, category.stage)) }),
    /* @__PURE__ */ jsxs("div", { className: "mt-10 pt-8 border-t border-slate-200", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "text-xs font-bold text-slate-400 uppercase tracking-wider", children: "Other documents" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: "Up to three files with your own labels. View or download anytime." })
        ] }),
        !onUploadProfileOtherDocument && /* @__PURE__ */ jsx("span", { className: "text-[10px] text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-md", children: "Upload unavailable" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-3", children: [1, 2, 3].map((slotNum) => {
        const entry = profileOtherSlots[slotNum - 1];
        return /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-slate-200 bg-slate-50/80 p-4 flex flex-col gap-3 min-h-[140px]", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
            /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wide", children: ["Slot ", slotNum] }),
            /* @__PURE__ */ jsx(Button, {
              size: "sm",
              variant: "secondary",
              disabled: !onUploadProfileOtherDocument,
              onClick: () => setOtherDocModal({
                open: true,
                slot: slotNum,
                label: entry?.label || "",
                error: ""
              }),
              children: entry ? "Replace" : "Upload"
            })
          ] }),
          entry ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-900 truncate", title: entry.label, children: entry.label }),
              /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-500 truncate mt-0.5", title: entry.name, children: entry.name }),
              /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400 mt-1", children: entry.uploadedAt ? new Date(entry.uploadedAt).toLocaleString() : "" })
            ] }),
            entry.url && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mt-auto pt-2 border-t border-slate-200/80", children: [
              /* @__PURE__ */ jsx("a", { href: entry.url, target: "_blank", rel: "noopener noreferrer", title: "View", className: "p-1.5 rounded text-slate-500 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200", children: /* @__PURE__ */ jsx(Eye, { size: 16 }) }),
              /* @__PURE__ */ jsx("a", { href: entry.url, download: entry.name || "document", target: "_blank", rel: "noopener noreferrer", title: "Download", className: "p-1.5 rounded text-slate-500 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200", children: /* @__PURE__ */ jsx(Download, { size: 16 }) })
            ] })
          ] }) : /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic mt-1", children: "No file yet. Choose Upload, add a name, then pick a file." })
        ] }, `profile-other-${slotNum}`);
      }) })
    ] }),
    deleteRejectedModal.isOpen && deleteRejectedModal.doc && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "p-5 border-b border-gray-100", children: [
        /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-slate-900", children: "Delete rejected document?" }),
        /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
          "Remove ",
          /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-700", children: deleteRejectedModal.doc.name }),
          " from this student’s record. The stored file will be deleted to free space. The student can upload again when ready."
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-5 flex justify-end gap-2", children: [
        /* @__PURE__ */ jsx(Button, { variant: "ghost", onClick: () => setDeleteRejectedModal({ isOpen: false, doc: null }), children: "Cancel" }),
        /* @__PURE__ */ jsx(Button, {
          variant: "danger",
          onClick: async () => {
            const doc = deleteRejectedModal.doc;
            setDeleteRejectedModal({ isOpen: false, doc: null });
            if (!doc) return;
            const persistResult = await onDeleteDocument?.(doc);
            if (persistResult && persistResult.ok === false) {
              showWhatsappNotification(`Could not delete: ${persistResult.error || "Save failed."}`);
            } else {
              showWhatsappNotification(`Rejected upload "${doc.name}" was removed.`);
            }
          },
          children: "Delete"
        })
      ] })
    ] }) }),
    rejectionModal.isOpen && rejectionModal.doc && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "p-5 border-b border-gray-100", children: [
        /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-rose-900", children: "Rejection Reason" }),
        /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
          'Provide a clear reason for rejecting "',
          rejectionModal.doc.name,
          '". This will be visible to the student.'
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-5 space-y-4", children: [
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: rejectionReason,
            onChange: (e) => setRejectionReason(e.target.value),
            rows: 3,
            className: "w-full p-2 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-rose-300 outline-none",
            placeholder: "e.g., 'Document is blurry', 'Passport is expired'..."
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2", children: [
          /* @__PURE__ */ jsx(Button, { variant: "ghost", onClick: () => setRejectionModal({ isOpen: false, doc: null }), children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { variant: "danger", disabled: !rejectionReason.trim(), onClick: () => handleReview(rejectionModal.doc, "Rejected", rejectionReason), children: "Confirm Rejection" })
        ] })
      ] })
    ] }) }),
    otherDocModal.open && otherDocModal.slot != null && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "p-5 border-b border-gray-100 flex justify-between items-center bg-slate-50", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-slate-900", children: "Other document" }),
          /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
            "Slot ",
            otherDocModal.slot,
            " — name this file for your records."
          ] })
        ] }),
        !otherDocUploading && /* @__PURE__ */ jsx("button", { onClick: () => setOtherDocModal({ open: false, slot: null, label: "", error: "" }), className: "p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors", children: /* @__PURE__ */ jsx(X, { size: 18 }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-5 space-y-4", children: [
        /* @__PURE__ */ jsxs("label", { className: "block", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-slate-700", children: "Display name" }),
          /* @__PURE__ */ jsx("input", {
            type: "text",
            value: otherDocModal.label,
            onChange: (e) => setOtherDocModal((prev) => ({ ...prev, label: e.target.value, error: "" })),
            disabled: otherDocUploading,
            maxLength: 120,
            placeholder: "e.g. Scholarship letter, Medical report…",
            className: "mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          })
        ] }),
        !otherDocUploading ? /* @__PURE__ */ jsxs(
          "label",
          {
            className: "border-2 border-dashed border-indigo-200 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-300 transition-colors",
            children: [
              /* @__PURE__ */ jsx("input", { type: "file", accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx", className: "hidden", onChange: handleProfileOtherFileChange }),
              /* @__PURE__ */ jsx("div", { className: "w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-3", children: /* @__PURE__ */ jsx(FileUp, { size: 20 }) }),
              /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900", children: "Choose file to upload" }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: "PDF, JPG, PNG, DOC, DOCX — max 10MB" })
            ]
          }
        ) : /* @__PURE__ */ jsxs("div", { className: "py-6 flex flex-col items-center text-center", children: [
          /* @__PURE__ */ jsx("div", { className: "w-14 h-14 rounded-full mb-4 bg-indigo-100 text-indigo-600 flex items-center justify-center animate-pulse", children: /* @__PURE__ */ jsx(FileUp, { size: 22 }) }),
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900", children: "Uploading…" })
        ] }),
        otherDocModal.error && /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-600", children: otherDocModal.error })
      ] })
    ] }) }),
    uploadModal.isOpen && uploadModal.docType && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "p-5 border-b border-gray-100 flex justify-between items-center bg-slate-50", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-slate-900", children: "Upload Document" }),
            /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
            "Uploading: ",
            /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-700", children: uploadModal.docType })
          ] })
        ] }),
        !isUploading && /* @__PURE__ */ jsx("button", { onClick: () => setUploadModal({ isOpen: false, docType: null }), className: "p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors", children: /* @__PURE__ */ jsx(X, { size: 18 }) })
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
    ] }) }),
    whatsappNotification.show && /* @__PURE__ */ jsx("div", { className: "fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300", children: /* @__PURE__ */ jsxs("div", { className: "bg-white border border-emerald-100 shadow-xl rounded-lg p-4 flex items-start gap-3 max-w-sm", children: [
      /* @__PURE__ */ jsx("div", { className: "w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0", children: /* @__PURE__ */ jsx(MessageCircle, { size: 20 }) }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsxs("h4", { className: "text-sm font-semibold text-slate-900 flex items-center gap-2", children: [
          "WhatsApp Sent",
          /* @__PURE__ */ jsxs("span", { className: "flex h-2 w-2", children: [
            /* @__PURE__ */ jsx("span", { className: "animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" }),
            /* @__PURE__ */ jsx("span", { className: "relative inline-flex rounded-full h-2 w-2 bg-emerald-500" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-600 mt-1 leading-relaxed", children: whatsappNotification.message })
      ] }),
      /* @__PURE__ */ jsx("button", { onClick: () => setWhatsappNotification({ show: false, message: "" }), className: "text-slate-400 hover:text-slate-600", children: /* @__PURE__ */ jsx(X, { size: 16 }) })
    ] }) })
  ] });
};
export {
  DocumentManager
};
