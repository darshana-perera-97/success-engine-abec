import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useMemo } from "react";
import { Upload, FileText, Check, X, AlertCircle, Eye, Hourglass, Download, MessageCircle, FileUp, Trash2, Plus, FolderOpen } from "lucide-react";
import { Button } from "./Button";
import {
  filterChecklistForStudent,
  shouldShowUniversityOfferLetters,
  isOfferLetterChecklistGroup
} from "../docMappingConfig";
import { useCountryDocConfig } from "../hooks/useCountryDocConfig";
import { areAllTaskDocumentSlotsVerified } from "../taskDocumentRequests";
import { isCounselorEquivalentPortalRole } from "../roles";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "../uploadLimits";

/** Short label for long filenames: first few stem chars + extension (full name in title/tooltip). */
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

function canStaffDeleteStudentDocuments(userRole) {
  return String(userRole || "").trim() !== "Student";
}

function isDeletableDocumentStatus(status) {
  return status === "Rejected" || status === "Verified";
}
function canStaffUploadOfferLetters(userRole) {
  return isCounselorEquivalentPortalRole(userRole) || userRole === "Manager" || userRole === "Admin";
}

function DocumentRequirementBadge({ required }) {
  const isRequired = required !== false;
  return jsx("span", {
    className: `inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
      isRequired
        ? "bg-rose-50 text-rose-700 border-rose-200"
        : "bg-emerald-50 text-emerald-700 border-emerald-200"
    }`,
    children: isRequired ? "Required" : "Optional",
  });
}
const OFFER_LETTER_STATUSES = ["Unconditional", "Conditional", "Rejected"];
const PROFILE_OTHER_DOCUMENTS_MAX_SLOT = 25;

/** Match backend: legacy index-based rows become 1-based .slot; list is sorted by slot. */
function migrateProfileOtherDocumentsToSlotEntries(value) {
  if (!Array.isArray(value)) return [];
  const bySlot = /* @__PURE__ */ new Map();
  for (let i = 0; i < value.length; i++) {
    const e = value[i];
    if (!e || typeof e !== "object" || !String(e.url || "").trim()) continue;
    const slotRaw = Number(e.slot);
    const slot =
      Number.isFinite(slotRaw) && slotRaw >= 1 && Math.floor(slotRaw) === slotRaw ? Math.floor(slotRaw) : i + 1;
    bySlot.set(slot, { ...e, slot });
  }
  return [...bySlot.keys()].sort((a, b) => a - b).map((k) => bySlot.get(k));
}
const DocumentManager = ({
  student,
  userRole,
  onUpdateDocument,
  onDeleteDocument,
  tasks = [],
  onUpdateTasks,
  onUploadDocument,
  onUploadProfileOtherDocument,
  onUploadUniversityOfferLetters,
  showPipelineChecklist = true,
  showUniversityOfferLettersBlock = true,
  showProfileOtherDocuments = true,
  countryDocConfig: countryDocConfigProp = null
}) => {
  const { config: loadedCountryConfig } = useCountryDocConfig(countryDocConfigProp ? "" : student?.country);
  const countryDocConfig = countryDocConfigProp || loadedCountryConfig;
  const [rejectionModal, setRejectionModal] = useState({ isOpen: false, doc: null });
  const [deleteDocumentModal, setDeleteDocumentModal] = useState({ isOpen: false, doc: null });
  const [rejectionReason, setRejectionReason] = useState("");
  const [uploadModal, setUploadModal] = useState({ isOpen: false, docType: null });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [otherDocModal, setOtherDocModal] = useState({ open: false, slot: null, label: "", error: "", append: false });
  const [otherDocUploading, setOtherDocUploading] = useState(false);
  const [offerLetterModal, setOfferLetterModal] = useState({
    open: false,
    offerStatus: "Unconditional",
    error: "",
    pendingFiles: []
  });
  const [offerLetterUploading, setOfferLetterUploading] = useState(false);
  const [whatsappNotification, setWhatsappNotification] = useState({ show: false, message: "" });
  const studentDocuments = useMemo(() => student.documents || [], [student.documents]);
  const profileOtherSlotEntries = useMemo(
    () => migrateProfileOtherDocumentsToSlotEntries(student.profileOtherDocuments),
    [student.profileOtherDocuments]
  );
  const approvedTaskRequestDocuments = useMemo(() => {
    const sid = String(student?.id || "").trim();
    if (!sid) return [];
    const taskLookup = new Map();
    for (const task of tasks || []) {
      if (!task || typeof task !== "object") continue;
      const taskId = String(task.id || "").trim();
      const taskStudentId = String(task.student_id || task.studentId || "").trim();
      if (!taskId || taskStudentId !== sid || task.requiresStudentDocuments !== true) continue;
      taskLookup.set(taskId, task);
    }
    return (studentDocuments || [])
      .filter((doc) => {
        if (!doc || String(doc.status || "") !== "Verified") return false;
        const link = doc.taskDocumentLink;
        if (!link || typeof link !== "object") return false;
        const taskId = String(link.taskId || "").trim();
        return taskLookup.has(taskId);
      })
      .map((doc) => {
        const link = doc.taskDocumentLink || {};
        const task = taskLookup.get(String(link.taskId || "").trim());
        const taskName = String(task?.task || "").trim();
        const slotLabel = String(link.label || "").trim();
        return {
          ...doc,
          _taskName: taskName,
          _taskSlotLabel: slotLabel || "Requested document",
        };
      })
      .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
  }, [student?.id, studentDocuments, tasks]);
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
    const wa = result?.documentUploadWhatsapp;
    const docLabel = uploadModal.docType;
    if (wa?.status === "sent") {
      showWhatsappNotification(`Document "${docLabel}" uploaded. WhatsApp sent to the student from your counselor account.`);
    } else if (wa?.status === "failed" || wa?.status === "skipped") {
      const reason = wa?.reason ? ` ${wa.reason}` : "";
      showWhatsappNotification(`Document "${docLabel}" uploaded. WhatsApp was not sent.${reason}`);
    } else {
      showWhatsappNotification(`Document "${docLabel}" uploaded successfully.`);
    }
  };
  const handleProfileOtherFileChange = async (event) => {
    const file = event.target.files?.[0];
    const slot = otherDocModal.slot;
    const labelForUpload = otherDocModal.label.trim() || "Other document";
    if (!file || (!otherDocModal.append && slot == null)) return;
    if (!onUploadProfileOtherDocument) {
      setOtherDocModal((prev) => ({ ...prev, error: "Document upload service is unavailable." }));
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
      setOtherDocModal((prev) => ({ ...prev, error: "Unsupported format. Use PDF, JPG, PNG, DOC, or DOCX." }));
      event.target.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setOtherDocModal((prev) => ({ ...prev, error: `File must be under ${MAX_UPLOAD_LABEL}.` }));
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
      slot,
      append: otherDocModal.append === true
    });
    setOtherDocUploading(false);
    event.target.value = "";
    if (!result?.ok) {
      setOtherDocModal((prev) => ({ ...prev, error: result?.error || "Failed to upload document." }));
      return;
    }
    setOtherDocModal({ open: false, slot: null, label: "", error: "", append: false });
    showWhatsappNotification(
      otherDocModal.append
        ? `Other document "${labelForUpload}" added.`
        : `Other document "${labelForUpload}" saved (slot ${slot}).`
    );
  };
  const universityOfferLetters = useMemo(() => {
    const raw = student.universityOfferLetters;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((entry) => entry && typeof entry === "object" && entry.url)
      .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
  }, [student.universityOfferLetters]);
  const showUniversityOfferLetters = useMemo(() => {
    return shouldShowUniversityOfferLetters(student.status, countryDocConfig);
  }, [student.status, countryDocConfig]);
  const canUploadOfferLetters = canStaffUploadOfferLetters(userRole) && typeof onUploadUniversityOfferLetters === "function";
  const getOfferStatusBadgeClass = (status) => {
    if (status === "Unconditional" || status === "Approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status === "Rejected") return "bg-rose-50 text-rose-700 border-rose-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
  };
  const handleOfferLetterFilesSelected = (event) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    const allowedTypes = new Set([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]);
    const files = Array.from(fileList);
    for (const file of files) {
      if (!allowedTypes.has(file.type)) {
        setOfferLetterModal((prev) => ({ ...prev, error: "Unsupported format. Use PDF, JPG, PNG, DOC, or DOCX." }));
        event.target.value = "";
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setOfferLetterModal((prev) => ({ ...prev, error: `Each file must be under ${MAX_UPLOAD_LABEL}.` }));
        event.target.value = "";
        return;
      }
    }
    setOfferLetterModal((prev) => ({ ...prev, error: "", pendingFiles: files }));
    event.target.value = "";
  };
  const handleOfferLetterUploadDocuments = async () => {
    const files = offerLetterModal.pendingFiles;
    if (!files?.length) return;
    if (!onUploadUniversityOfferLetters) {
      setOfferLetterModal((prev) => ({ ...prev, error: "Offer letter upload is unavailable." }));
      return;
    }
    setOfferLetterModal((prev) => ({ ...prev, error: "" }));
    setOfferLetterUploading(true);
    const payloadFiles = [];
    for (const file of files) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("read_error"));
        reader.readAsDataURL(file);
      }).catch(() => "");
      if (!dataUrl) {
        setOfferLetterUploading(false);
        setOfferLetterModal((prev) => ({ ...prev, error: `Unable to read "${file.name}". Try again.` }));
        return;
      }
      payloadFiles.push({ dataUrl, fileName: file.name });
    }
    const result = await onUploadUniversityOfferLetters({
      studentId: student.id,
      offerStatus: offerLetterModal.offerStatus,
      files: payloadFiles
    });
    setOfferLetterUploading(false);
    if (!result?.ok) {
      setOfferLetterModal((prev) => ({ ...prev, error: result?.error || "Failed to upload offer letters." }));
      return;
    }
    const count = payloadFiles.length;
    const statusLabel = offerLetterModal.offerStatus;
    setOfferLetterModal({ open: false, offerStatus: "Unconditional", error: "", pendingFiles: [] });
    const notifs = result?.offerLetterWhatsappNotifications || [];
    const sentCount = notifs.filter((n) => n?.whatsapp?.status === "sent").length;
    const failed = notifs.filter((n) => n?.whatsapp?.status === "failed" || n?.whatsapp?.status === "skipped");
    if (sentCount > 0) {
      showWhatsappNotification(
        sentCount === 1
          ? `Offer letter (${statusLabel}) uploaded. WhatsApp sent to the student from your counselor account.`
          : `${count} offer letters (${statusLabel}) uploaded. WhatsApp sent for ${sentCount} letter(s) from your counselor account.`
      );
    } else if (failed.length > 0) {
      const reason = failed[0]?.whatsapp?.reason ? ` ${failed[0].whatsapp.reason}` : "";
      showWhatsappNotification(
        count === 1
          ? `Offer letter (${statusLabel}) uploaded. WhatsApp was not sent.${reason}`
          : `${count} offer letters (${statusLabel}) uploaded. WhatsApp was not sent.${reason}`
      );
    } else {
      showWhatsappNotification(
        count === 1
          ? `University offer letter uploaded as ${statusLabel}.`
          : `${count} university offer letters uploaded as ${statusLabel}.`
      );
    }
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
      const link = doc?.taskDocumentLink;
      if (link && typeof link === "object") {
        const tid = String(link.taskId || "").trim();
        const task = tasks.find(
          (t) =>
            String(t.id || "").trim() === tid &&
            String(t.student_id || t.studentId || "").trim() === String(student.id || "").trim() &&
            t.requiresStudentDocuments === true
        );
        if (task && task.requiresStudentDocuments) {
          const docsFromServer =
            persistResult && persistResult.ok === true && Array.isArray(persistResult.data?.documents)
              ? persistResult.data.documents
              : null;
          const nextDocs =
            docsFromServer ||
            (student.documents || []).map((d) => (String(d.id) === String(updatedDoc.id) ? updatedDoc : d));
          if (areAllTaskDocumentSlotsVerified(task, nextDocs)) {
            onUpdateTasks([{ ...task, status: "Completed" }]);
          }
        }
      } else {
        const linkedTask = tasks.find(
          (t) => t.student_id === student.id && t.documentType === doc.type && t.status !== "Completed"
        );
        if (linkedTask) {
          onUpdateTasks([{ ...linkedTask, status: "Completed" }]);
        }
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
    const visible = filterChecklistForStudent(
      countryDocConfig?.checklist,
      student.status,
      countryDocConfig?.stages
    );
    return visible.map((category) => ({
      ...category,
      items: category.items.map((item) => ({
        ...item,
        uploadedFiles: studentDocuments
          .filter(
            (d) =>
              d.type === item.docType ||
              d.type.includes(item.docType) ||
              item.docType.includes(d.type)
          )
          .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()),
      })),
    }));
  }, [countryDocConfig, student.status, studentDocuments]);
  const isStaff = userRole !== "Student";
  const maxProfileOtherSlotUsed = profileOtherSlotEntries.length
    ? Math.max(...profileOtherSlotEntries.map((e) => Number(e.slot) || 0))
    : 0;
  const canStaffAppendOtherDocument =
    isStaff && onUploadProfileOtherDocument && maxProfileOtherSlotUsed < PROFILE_OTHER_DOCUMENTS_MAX_SLOT;
  const canDeleteDocument =
    canStaffDeleteStudentDocuments(userRole) && typeof onDeleteDocument === "function";
  const flatItems = checklist.flatMap((cat) => cat.items);
  const requiredItems = flatItems.filter((item) => item.required !== false);
  const optionalItems = flatItems.filter((item) => item.required === false);
  const verifiedRequired = requiredItems.filter((item) =>
    item.uploadedFiles.some((f) => f.status === "Verified")
  ).length;
  const showUniversityOfferLettersInline =
    showUniversityOfferLettersBlock && showUniversityOfferLetters;
  const otherDocumentsSectionClass =
    showPipelineChecklist ? "mt-10 pt-8 border-t border-slate-200" : "mt-2 pt-0";
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    showPipelineChecklist && /* @__PURE__ */ jsx("div", { key: "pipeline-header", className: "flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-indigo-50 p-4 rounded-lg border border-indigo-100", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("h4", { className: "text-indigo-900 font-semibold", children: [
          "Paperless Pipeline: ",
          student.country
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "text-indigo-700 text-xs mt-1", children: [
          verifiedRequired,
          " / ",
          requiredItems.length,
          " required verified",
          optionalItems.length > 0 ? ` · ${optionalItems.length} optional` : ""
        ] })
      ] }),
      flatItems.length > 0 && /* @__PURE__ */ jsxs("div", { key: "pipeline-badges", className: "flex flex-wrap items-center gap-2 text-[10px]", children: [
        /* @__PURE__ */ jsx(DocumentRequirementBadge, { key: "badge-required", required: true }),
        /* @__PURE__ */ jsx(DocumentRequirementBadge, { key: "badge-optional", required: false })
      ] })
    ] }),
    showPipelineChecklist && /* @__PURE__ */ jsx("div", { key: "pipeline-checklist", className: "space-y-4", children: checklist.length === 0 ? /* @__PURE__ */ jsx("div", { className: "rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500", children: "Document requirements appear when the student reaches the Application stage." }) : (() => {
      let offerLettersInlineRendered = false;
      return checklist.map((category) => {
      if (isOfferLetterChecklistGroup(category.stage)) {
        if (!showUniversityOfferLettersInline || offerLettersInlineRendered) return null;
        offerLettersInlineRendered = true;
        return /* @__PURE__ */ jsxs("div", { key: "university-offer-letters", className: "rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h3", { className: "text-xs font-bold text-indigo-800 uppercase tracking-wider", children: "University Offer Letters" }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-indigo-700/80 mt-1", children: "Upload one or more offer letters and mark each batch as Unconditional, Conditional, or Rejected." })
            ] }),
            canUploadOfferLetters && /* @__PURE__ */ jsxs(Button, {
              size: "sm",
              className: "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-100 border-none",
              onClick: () => setOfferLetterModal({ open: true, offerStatus: "Unconditional", error: "", pendingFiles: [] }),
              children: [
                /* @__PURE__ */ jsx(Upload, { size: 14, className: "mr-2" }),
                "Upload offer letters"
              ]
            })
          ] }),
          universityOfferLetters.length > 0 ? /* @__PURE__ */ jsx("div", { className: "space-y-2", children: universityOfferLetters.map((letter, idx) => /* @__PURE__ */ jsxs("div", { key: letter.id || `offer-letter-${letter.name}-${idx}`, className: "bg-white border border-gray-200 p-3 rounded-lg flex items-center justify-between hover:shadow-sm transition-all", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
              /* @__PURE__ */ jsx("div", { className: `w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${letter.offerStatus === "Unconditional" || letter.offerStatus === "Approved" ? "bg-emerald-100 text-emerald-600" : letter.offerStatus === "Rejected" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"}`, children: /* @__PURE__ */ jsx(FileText, { size: 18 }) }),
              /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900 truncate", title: letter.name, children: shortDisplayFileName(letter.name) }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: letter.uploadedAt ? new Date(letter.uploadedAt).toLocaleString() : "" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [
              /* @__PURE__ */ jsx("span", { className: `px-2 py-0.5 rounded-full text-[10px] font-bold border ${getOfferStatusBadgeClass(letter.offerStatus)}`, children: letter.offerStatus === "Approved" ? "Unconditional" : letter.offerStatus || "Conditional" }),
              letter.url && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("a", { href: letter.url, target: "_blank", rel: "noopener noreferrer", title: "Preview", className: "p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900", children: /* @__PURE__ */ jsx(Eye, { size: 16 }) }),
                /* @__PURE__ */ jsx("a", { href: letter.url, target: "_blank", rel: "noopener noreferrer", title: "Download", className: "p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900", children: /* @__PURE__ */ jsx(Download, { size: 16 }) })
              ] })
            ] })
          ] })) }) : /* @__PURE__ */ jsx("div", { className: "bg-white/70 border-2 border-dashed border-indigo-200 p-4 rounded-lg text-center", children: /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: canUploadOfferLetters ? "No offer letters uploaded yet." : "No offer letters uploaded yet. Counselors, managers, and admins can upload them." }) })
        ] });
      }
      const groupRequired = category.items.filter((item) => item.required !== false);
      const groupVerified = groupRequired.filter((item) =>
        item.uploadedFiles.some((f) => f.status === "Verified")
      ).length;
      return /* @__PURE__ */ jsxs("div", {
        key: category.stage,
        className: "rounded-xl border border-slate-200 bg-slate-50/40 shadow-sm overflow-hidden",
        children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-white/80", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
              /* @__PURE__ */ jsx(FolderOpen, { size: 16, className: "text-indigo-500 shrink-0" }),
              /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-slate-800 truncate", children: category.stage })
            ] }),
            groupRequired.length > 0 && /* @__PURE__ */ jsx("span", { className: "text-[11px] font-medium text-slate-500 shrink-0", children: `${groupVerified} / ${groupRequired.length} required verified` })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "p-4 space-y-4", children: category.items.map(({ docType, description, uploadedFiles, required }) => {
        const hasVerifiedUpload = uploadedFiles.some((f) => f.status === "Verified");
        const isRequired = required !== false;
        return /* @__PURE__ */ jsxs("div", { key: docType, className: "space-y-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start gap-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
              /* @__PURE__ */ jsx("h4", { className: "text-sm font-medium text-slate-700", children: docType }),
              /* @__PURE__ */ jsx(DocumentRequirementBadge, { required: isRequired })
            ] }),
            description ? /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: description }) : null
          ] }),
          /* @__PURE__ */ jsxs(Button, { size: "sm", className: "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-100 border-none", onClick: () => setUploadModal({ isOpen: true, docType }), children: [
            /* @__PURE__ */ jsx(Upload, { size: 14, className: "mr-2" }),
            " Upload"
          ] })
        ] }),
        uploadedFiles.length > 0 && uploadedFiles.map((uploadedFile, idx) => /* @__PURE__ */ jsxs("div", { key: uploadedFile.id || `${docType}-${uploadedFile.name}-${idx}`, className: "bg-white border border-gray-200 p-3 rounded-lg flex items-center justify-between group hover:shadow-sm transition-all", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("div", { className: `w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${uploadedFile.status === "Verified" ? "bg-emerald-100 text-emerald-600" : uploadedFile.status === "Rejected" ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-500"}`, children: /* @__PURE__ */ jsx(FileText, { size: 18 }) }),
            /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900 truncate", title: uploadedFile.name, children: shortDisplayFileName(uploadedFile.name) }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: uploadedFile.uploadedAt })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: `px-2 py-0.5 rounded-full text-[10px] font-bold border ${uploadedFile.status === "Verified" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : uploadedFile.status === "Rejected" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`, children: uploadedFile.status }),
            uploadedFile.status === "Rejected" && uploadedFile.rejectionReason && /* @__PURE__ */ jsxs("div", { className: "relative group/tip", children: [
              /* @__PURE__ */ jsx(AlertCircle, { size: 14, className: "text-rose-500 cursor-help" }),
              /* @__PURE__ */ jsx("div", { className: "absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-2 bg-slate-800 text-white text-xs rounded shadow-lg z-10 hidden group-hover/tip:block animate-in fade-in zoom-in-95", children: uploadedFile.rejectionReason })
            ] }),
            canDeleteDocument && isDeletableDocumentStatus(uploadedFile.status) && /* @__PURE__ */ jsxs(
              Button,
              {
                size: "sm",
                variant: "secondary",
                onClick: () => setDeleteDocumentModal({ isOpen: true, doc: uploadedFile }),
                title: uploadedFile.status === "Verified" ? "Delete approved upload" : "Delete rejected upload",
                className: "hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 shrink-0",
                children: [
                  /* @__PURE__ */ jsx(Trash2, { size: 14, className: "mr-2 shrink-0" }),
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
        ] })),
        !hasVerifiedUpload && /* @__PURE__ */ jsx("div", { className: `border-2 border-dashed p-3 rounded-lg flex items-center justify-between group transition-colors ${uploadedFiles.length > 0 ? "bg-amber-50/80 border-amber-200 hover:border-amber-300" : isRequired ? "bg-slate-50 border-gray-200 hover:border-indigo-200" : "bg-emerald-50/40 border-emerald-100 hover:border-emerald-200"}`, children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: `w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${uploadedFiles.length > 0 ? "bg-amber-100 border-amber-200 text-amber-600" : isRequired ? "bg-white border-gray-200 text-slate-400" : "bg-emerald-50 border-emerald-200 text-emerald-500"}`, children: /* @__PURE__ */ jsx(Hourglass, { size: 18 }) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: `text-sm font-medium ${uploadedFiles.length > 0 ? "text-amber-900" : isRequired ? "text-slate-500" : "text-emerald-800"}`, children: uploadedFiles.length > 0 ? "Awaiting approved document" : isRequired ? "Pending upload" : "Optional — not uploaded" }),
            /* @__PURE__ */ jsx("p", { className: `text-xs ${uploadedFiles.length > 0 ? "text-amber-800/80" : isRequired ? "text-slate-400" : "text-emerald-700/80"}`, children: uploadedFiles.length > 0 ? isStaff ? "Upload a new file or approve a pending submission for this requirement." : "Your counselor is reviewing your upload. You can submit a new file if needed." : isRequired ? "Awaiting submission" : isStaff ? "Upload only if needed for this student." : "Optional — upload only if you have this document." })
          ] })
        ] }) })
      ] });
      }) })
        ]
      });
    });
    })() }),
    showProfileOtherDocuments && /* @__PURE__ */ jsxs("div", { key: "profile-other-documents", className: otherDocumentsSectionClass, children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "text-xs font-bold text-slate-400 uppercase tracking-wider", children: "Other documents" }),
          !isStaff && /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: "Up to three files with your own labels. View or download anytime." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 justify-end", children: [
          canStaffAppendOtherDocument && /* @__PURE__ */ jsxs(Button, {
            size: "sm",
            className: "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-100 border-none",
            onClick: () => setOtherDocModal({ open: true, slot: null, label: "", error: "", append: true }),
            children: [
              /* @__PURE__ */ jsx(Plus, { size: 14, className: "mr-2" }),
              "Add document"
            ]
          }),
          !onUploadProfileOtherDocument && /* @__PURE__ */ jsx("span", { className: "text-[10px] text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-md", children: "Upload unavailable" })
        ] })
      ] }),
      userRole === "Student"
        ? /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-3", children: [1, 2, 3].map((slotNum) => {
            const entry = profileOtherSlotEntries.find((e) => Number(e.slot) === slotNum) || null;
            return /* @__PURE__ */ jsxs("div", { key: `profile-other-${slotNum}`, className: "rounded-xl border border-slate-200 bg-slate-50/80 p-4 flex flex-col gap-3 min-h-[140px]", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
                /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wide", children: ["Slot ", slotNum] }),
                /* @__PURE__ */ jsx(Button, {
                  size: "sm",
                  className: "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-100 border-none",
                  disabled: !onUploadProfileOtherDocument,
                  onClick: () => setOtherDocModal({
                    open: true,
                    slot: slotNum,
                    label: entry?.label || "",
                    error: "",
                    append: false
                  }),
                  children: entry ? "Replace" : "Upload"
                })
              ] }),
              entry ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-900 truncate", title: entry.label, children: entry.label }),
                  /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-500 truncate mt-0.5", title: entry.name, children: shortDisplayFileName(entry.name) }),
                  /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400 mt-1", children: entry.uploadedAt ? new Date(entry.uploadedAt).toLocaleString() : "" })
                ] }),
                entry.url && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mt-auto pt-2 border-t border-slate-200/80", children: [
                  /* @__PURE__ */ jsx("a", { href: entry.url, target: "_blank", rel: "noopener noreferrer", title: "View", className: "p-1.5 rounded text-slate-500 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200", children: /* @__PURE__ */ jsx(Eye, { size: 16 }) }),
                  /* @__PURE__ */ jsx("a", { href: entry.url, download: entry.name || "document", target: "_blank", rel: "noopener noreferrer", title: "Download", className: "p-1.5 rounded text-slate-500 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200", children: /* @__PURE__ */ jsx(Download, { size: 16 }) })
                ] })
              ] }) : /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic mt-1", children: "No file yet. Choose Upload, add a name, then pick a file." })
            ] });
          }) })
        : /* @__PURE__ */ jsxs(Fragment, { children: [
            profileOtherSlotEntries.length === 0
              ? /* @__PURE__ */ jsx("div", { className: "rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-500", children: "No other documents yet. Use Add document to upload the first file." })
              : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3", children: profileOtherSlotEntries.map((entry) => /* @__PURE__ */ jsxs("div", { key: entry.id || `profile-other-slot-${entry.slot}`, className: "rounded-xl border border-slate-200 bg-slate-50/80 p-4 flex flex-col gap-3 min-h-[140px]", children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
                    /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wide", children: ["Slot ", entry.slot] }),
                    /* @__PURE__ */ jsx(Button, {
                      size: "sm",
                      className: "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-100 border-none",
                      disabled: !onUploadProfileOtherDocument,
                      onClick: () => setOtherDocModal({
                        open: true,
                        slot: Number(entry.slot),
                        label: entry?.label || "",
                        error: "",
                        append: false
                      }),
                      children: "Replace"
                    })
                  ] }),
                  /* @__PURE__ */ jsxs(Fragment, { children: [
                    /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                      /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-900 truncate", title: entry.label, children: entry.label }),
                      /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-500 truncate mt-0.5", title: entry.name, children: shortDisplayFileName(entry.name) }),
                      /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400 mt-1", children: entry.uploadedAt ? new Date(entry.uploadedAt).toLocaleString() : "" })
                    ] }),
                    entry.url && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mt-auto pt-2 border-t border-slate-200/80", children: [
                      /* @__PURE__ */ jsx("a", { href: entry.url, target: "_blank", rel: "noopener noreferrer", title: "View", className: "p-1.5 rounded text-slate-500 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200", children: /* @__PURE__ */ jsx(Eye, { size: 16 }) }),
                      /* @__PURE__ */ jsx("a", { href: entry.url, download: entry.name || "document", target: "_blank", rel: "noopener noreferrer", title: "Download", className: "p-1.5 rounded text-slate-500 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200", children: /* @__PURE__ */ jsx(Download, { size: 16 }) })
                    ] })
                  ] })
                ] })) })
            ,
            approvedTaskRequestDocuments.length > 0 && /* @__PURE__ */ jsxs("div", { className: "mt-4 space-y-3", children: [
              /* @__PURE__ */ jsx("p", { className: "text-[11px] font-semibold text-slate-500 uppercase tracking-wider", children: "Approved task-requested documents" }),
              /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3", children: approvedTaskRequestDocuments.map((doc, idx) => /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 flex flex-col gap-3 min-h-[140px]", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
                  /* @__PURE__ */ jsx("span", { className: "text-[10px] font-bold text-emerald-700 uppercase tracking-wide", children: "Approved" }),
                  /* @__PURE__ */ jsx("span", { className: "px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200", children: "Verified" })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-900 truncate", title: doc._taskSlotLabel, children: doc._taskSlotLabel }),
                  doc._taskName && /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-500 truncate mt-0.5", title: doc._taskName, children: doc._taskName }),
                  /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-500 truncate mt-0.5", title: doc.name, children: shortDisplayFileName(doc.name) }),
                  /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400 mt-1", children: doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : "" })
                ] }),
                doc.url && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mt-auto pt-2 border-t border-emerald-100", children: [
                  /* @__PURE__ */ jsx("a", { href: doc.url, target: "_blank", rel: "noopener noreferrer", title: "View", className: "p-1.5 rounded text-slate-500 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200", children: /* @__PURE__ */ jsx(Eye, { size: 16 }) }),
                  /* @__PURE__ */ jsx("a", { href: doc.url, download: doc.name || "document", target: "_blank", rel: "noopener noreferrer", title: "Download", className: "p-1.5 rounded text-slate-500 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200", children: /* @__PURE__ */ jsx(Download, { size: 16 }) })
                ] })
              ] }, doc.id || `approved-task-doc-${idx}`)) })
            ] })
          ] })
    ] }),
    deleteDocumentModal.isOpen && deleteDocumentModal.doc && /* @__PURE__ */ jsx("div", { key: "delete-document-modal", className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "p-5 border-b border-gray-100", children: [
        /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-slate-900", children: deleteDocumentModal.doc.status === "Verified" ? "Delete approved document?" : "Delete rejected document?" }),
        /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
          "Remove ",
          /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-700", children: deleteDocumentModal.doc.name }),
          deleteDocumentModal.doc.status === "Verified"
            ? " from this student’s record. The stored file will be deleted. Upload a replacement if the checklist still requires this document."
            : " from this student’s record. The stored file will be deleted to free space. The student can upload again when ready."
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
            const persistResult = await onDeleteDocument?.(doc);
            if (persistResult && persistResult.ok === false) {
              showWhatsappNotification(`Could not delete: ${persistResult.error || "Save failed."}`);
            } else {
              const label = doc.status === "Verified" ? "Approved" : "Rejected";
              showWhatsappNotification(`${label} upload "${doc.name}" was removed.`);
            }
          },
          children: "Delete"
        })
      ] })
    ] }) }),
    rejectionModal.isOpen && rejectionModal.doc && /* @__PURE__ */ jsx("div", { key: "rejection-modal", className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
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
    otherDocModal.open && (otherDocModal.append === true || otherDocModal.slot != null) && /* @__PURE__ */ jsx("div", { key: "other-doc-modal", className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "p-5 border-b border-gray-100 flex justify-between items-center bg-slate-50", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-slate-900", children: otherDocModal.append ? "Add other document" : "Other document" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: otherDocModal.append ? "A new slot will be assigned automatically after upload." : `Slot ${otherDocModal.slot} — name this file for your records.` })
        ] }),
        !otherDocUploading && /* @__PURE__ */ jsx("button", { onClick: () => setOtherDocModal({ open: false, slot: null, label: "", error: "", append: false }), className: "p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors", children: /* @__PURE__ */ jsx(X, { size: 18 }) })
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
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: `PDF, JPG, PNG, DOC, DOCX — max ${MAX_UPLOAD_LABEL}` })
            ]
          }
        ) : /* @__PURE__ */ jsxs("div", { className: "py-6 flex flex-col items-center text-center", children: [
          /* @__PURE__ */ jsx("div", { className: "w-14 h-14 rounded-full mb-4 bg-indigo-100 text-indigo-600 flex items-center justify-center animate-pulse", children: /* @__PURE__ */ jsx(FileUp, { size: 22 }) }),
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900", children: "Uploading…" })
        ] }),
        otherDocModal.error && /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-600", children: otherDocModal.error })
      ] })
    ] }) }),
    offerLetterModal.open && /* @__PURE__ */ jsx("div", { key: "offer-letter-modal", className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "p-5 border-b border-gray-100 flex justify-between items-center bg-slate-50", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-slate-900", children: "Upload University Offer Letters" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: "Choose offer status, add your files, then click Upload Documents." })
        ] }),
        !offerLetterUploading && /* @__PURE__ */ jsx("button", { onClick: () => setOfferLetterModal({ open: false, offerStatus: "Unconditional", error: "", pendingFiles: [] }), className: "p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors", children: /* @__PURE__ */ jsx(X, { size: 18 }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-5 space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-slate-700", children: "Offer status" }),
          /* @__PURE__ */ jsx("div", { className: "mt-2 grid grid-cols-1 gap-2", children: OFFER_LETTER_STATUSES.map((status) => /* @__PURE__ */ jsxs("label", { key: status, className: `flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${offerLetterModal.offerStatus === status ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`, children: [
            /* @__PURE__ */ jsx("input", { type: "radio", name: "offerStatus", value: status, checked: offerLetterModal.offerStatus === status, disabled: offerLetterUploading, onChange: () => setOfferLetterModal((prev) => ({ ...prev, offerStatus: status, error: "" })), className: "text-indigo-600 focus:ring-indigo-500" }),
            /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-slate-800", children: status })
          ] })) })
        ] }),
        !offerLetterUploading ? /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxs("label", { className: "border-2 border-dashed border-indigo-200 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-300 transition-colors", children: [
            /* @__PURE__ */ jsx("input", { type: "file", accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx", multiple: true, className: "hidden", onChange: handleOfferLetterFilesSelected }),
            /* @__PURE__ */ jsx("div", { className: "w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-3", children: /* @__PURE__ */ jsx(FileUp, { size: 20 }) }),
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900", children: "Choose one or more offer letters" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: `PDF, JPG, PNG, DOC, DOCX — max ${MAX_UPLOAD_LABEL} each` })
          ] }),
          /* @__PURE__ */ jsx(Button, {
            type: "button",
            className: "w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-100 border-none",
            size: "sm",
            disabled: !offerLetterModal.pendingFiles?.length,
            onClick: handleOfferLetterUploadDocuments,
            children: "Upload Documents"
          })
        ] }) : /* @__PURE__ */ jsxs("div", { className: "py-6 flex flex-col items-center text-center", children: [
          /* @__PURE__ */ jsx("div", { className: "w-14 h-14 rounded-full mb-4 bg-indigo-100 text-indigo-600 flex items-center justify-center animate-pulse", children: /* @__PURE__ */ jsx(FileUp, { size: 22 }) }),
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900", children: "Uploading offer letters…" })
        ] }),
        offerLetterModal.error && /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-600", children: offerLetterModal.error })
      ] })
    ] }) }),
    uploadModal.isOpen && uploadModal.docType && /* @__PURE__ */ jsx("div", { key: "upload-modal", className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
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
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: `Supports PDF, JPG, PNG, DOC, DOCX (Max ${MAX_UPLOAD_LABEL})` }),
            uploadError ? /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-600 mt-3", children: uploadError }) : null
          ]
        }
      ) : /* @__PURE__ */ jsxs("div", { className: "py-8 flex flex-col items-center justify-center text-center", children: [
        /* @__PURE__ */ jsx("div", { className: "w-16 h-16 rounded-full mb-6 bg-indigo-100 text-indigo-600 flex items-center justify-center animate-pulse", children: /* @__PURE__ */ jsx(FileUp, { size: 24 }) }),
        /* @__PURE__ */ jsx("h4", { className: "text-sm font-medium text-slate-900 mb-1", children: "Uploading Document..." }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Please wait while we process your file." })
      ] }) })
    ] }) }),
    whatsappNotification.show && /* @__PURE__ */ jsx("div", { key: "whatsapp-notification", className: "fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300", children: /* @__PURE__ */ jsxs("div", { className: "bg-white border border-emerald-100 shadow-xl rounded-lg p-4 flex items-start gap-3 max-w-sm", children: [
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
