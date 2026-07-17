import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useMemo, useRef, useState } from "react";
import { Upload, FileText, Check, X, AlertCircle, Download, Hourglass } from "lucide-react";
import { Button } from "./Button";
import { DocumentViewButton, documentDownloadProps, useDocumentPreview } from "./DocumentPreviewModal";
import {
  areAllTaskDocumentSlotsVerified,
  canUploadTaskDocumentSlot,
  canUploadTaskRequestedDocuments,
  findTaskDocumentForSlot,
  taskDocumentSlotUploadLabel
} from "../taskDocumentRequests";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "../uploadLimits";
import { toAbsoluteAssetUrl } from "../apiConfig";

function studentDocumentUrl(url) {
  const resolved = toAbsoluteAssetUrl(String(url || "").trim());
  return resolved || url;
}

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

export function TaskDocumentRequestsPanel({
  student,
  tasks = [],
  userRole,
  onUploadDocument,
  onUpdateDocument,
  onUpdateTasks
}) {
  const [rejectionModal, setRejectionModal] = useState({ open: false, doc: null });
  const [rejectionReason, setRejectionReason] = useState("");
  const [uploadingKey, setUploadingKey] = useState("");
  const [uploadError, setUploadError] = useState("");
  const { openDocumentPreview, documentPreviewModal } = useDocumentPreview();
  const fileInputRefs = useRef({});
  const sid = String(student?.id || "").trim();
  const isStaff = userRole !== "Student";
  const staffCanUploadTaskDocs = canUploadTaskRequestedDocuments(userRole) && isStaff;
  const showTaskDocUpload = canUploadTaskRequestedDocuments(userRole);
  const studentTasks = useMemo(() => {
    if (!sid) return [];
    const documents = student?.documents || [];
    return (tasks || []).filter((t) => {
      if (String(t.student_id || t.studentId || "").trim() !== sid) return false;
      if (!t.requiresStudentDocuments) return false;
      if (!Array.isArray(t.taskDocumentRequests) || t.taskDocumentRequests.length === 0) return false;
      if (t.isPrivate) return false;
      const isCompleted = String(t.status || "") === "Completed";
      if (!isCompleted) return true;
      return (t.taskDocumentRequests || []).some((slot) => {
        const doc = findTaskDocumentForSlot(documents, t.id, slot.id);
        if (userRole === "Student") return Boolean(doc);
        if (staffCanUploadTaskDocs) return canUploadTaskDocumentSlot(doc);
        if (isStaff) {
          return Boolean(doc) && (doc.status === "Pending" || doc.status === "Reviewing");
        }
        return false;
      });
    });
  }, [tasks, sid, student?.documents, userRole, staffCanUploadTaskDocs, isStaff]);

  if (studentTasks.length === 0) return null;

  const setRef = (key, el) => {
    if (el) fileInputRefs.current[key] = el;
  };

  const handleSlotUpload = async (task, slot, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !student?.id || !onUploadDocument) return;
    const key = `${task.id}::${slot.id}`;
    setUploadError("");
    if (!ALLOWED_TYPES.has(file.type)) {
      setUploadError("Use PDF, JPG, PNG, DOC, or DOCX.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`File must be under ${MAX_UPLOAD_LABEL}.`);
      return;
    }
    setUploadingKey(key);
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read_error"));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) {
      setUploadingKey("");
      setUploadError("Unable to read file. Try again.");
      return;
    }
    const taskDocumentLink = {
      taskId: String(task.id || ""),
      slotId: String(slot.id || ""),
      label: String(slot.label || "").trim()
    };
    const result = await onUploadDocument({
      studentId: student.id,
      dataUrl,
      fileName: file.name,
      docType: `taskDoc__${taskDocumentLink.taskId}__${taskDocumentLink.slotId}`,
      phase: 1,
      tier: "TaskRequest",
      taskDocumentLink
    });
    setUploadingKey("");
    if (!result?.ok) {
      setUploadError(result?.error || "Upload failed.");
      return;
    }
    if (onUpdateTasks && String(task.status || "") !== "Completed") {
      onUpdateTasks([{ ...task, status: "In Review" }]);
    }
  };

  const handleReview = async (doc, status, reason) => {
    if (!onUpdateDocument) return;
    const updatedDoc = { ...doc, status, rejectionReason: status === "Rejected" ? reason : void 0 };
    setRejectionModal({ open: false, doc: null });
    setRejectionReason("");
    const persistResult = await onUpdateDocument(updatedDoc);
    if (persistResult && persistResult.ok === false) {
      return;
    }
    if (status === "Verified" && onUpdateTasks) {
      const link = doc?.taskDocumentLink;
      const taskId = String(link?.taskId || "").trim();
      if (!taskId || !sid) return;
      const task = (tasks || []).find(
        (t) =>
          String(t.id || "").trim() === taskId &&
          String(t.student_id || t.studentId || "").trim() === sid &&
          t.requiresStudentDocuments === true
      );
      if (!task) return;
      const docsFromServer =
        persistResult && persistResult.ok === true && Array.isArray(persistResult.data?.documents)
          ? persistResult.data.documents
          : null;
      const docs =
        docsFromServer ||
        (student.documents || []).map((d) => (String(d.id) === String(updatedDoc.id) ? updatedDoc : d));
      if (areAllTaskDocumentSlotsVerified(task, docs)) {
        onUpdateTasks([{ ...task, status: "Completed" }]);
      }
    }
  };

  return /* @__PURE__ */ jsxs("div", {
    className: "mb-6 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-4",
    children: [
      /* @__PURE__ */ jsxs("div", {
        className: "flex items-start gap-2",
        children: [
          /* @__PURE__ */ jsx(FileText, { className: "w-5 h-5 text-indigo-600 shrink-0 mt-0.5" }),
          /* @__PURE__ */ jsxs("div", {
            children: [
              /* @__PURE__ */ jsx("h3", {
                className: "text-sm font-bold text-indigo-900",
                children: "Documents requested with your tasks"
              }),
              /* @__PURE__ */ jsx("p", {
                className: "text-xs text-indigo-800/90 mt-0.5",
                children: staffCanUploadTaskDocs
                  ? "Upload on behalf of the student when needed, or review their uploads and approve or reject each file."
                  : isStaff
                    ? "Review uploads from the student. Approve or reject each file."
                    : "Upload each item your counselor asked for. You can replace a file until it is verified."
              })
            ]
          })
        ]
      }),
      uploadError && /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-600", children: uploadError }),
      studentTasks.map((task) =>
        /* @__PURE__ */ jsxs(
          "div",
          {
            className: "rounded-lg border border-indigo-100 bg-white p-3 space-y-3",
            children: [
              /* @__PURE__ */ jsxs("div", {
                className: "flex flex-wrap justify-between gap-2",
                children: [
                  /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-900", children: task.task }),
                  /* @__PURE__ */ jsx("span", {
                    className: "text-[10px] font-bold uppercase text-slate-500",
                    children: task.dueDate ? `Due ${task.dueDate}` : ""
                  })
                ]
              }),
              (task.taskDocumentRequests || []).map((slot) => {
                const doc = findTaskDocumentForSlot(student.documents, task.id, slot.id);
                const key = `${task.id}::${slot.id}`;
                const busy = uploadingKey === key;
                return /* @__PURE__ */ jsxs(
                  "div",
                  {
                    className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-slate-100 bg-slate-50/80 p-3",
                    children: [
                      /* @__PURE__ */ jsxs("div", {
                        className: "min-w-0 flex-1",
                        children: [
                          /* @__PURE__ */ jsx("p", {
                            className: "text-sm font-medium text-slate-800",
                            children: slot.label
                          }),
                          !doc &&
                            /* @__PURE__ */ jsx("p", {
                              className: "text-xs text-slate-500 mt-0.5",
                              children: "No file uploaded yet."
                            }),
                          doc &&
                            /* @__PURE__ */ jsxs("div", {
                              className: "mt-1 flex flex-wrap items-center gap-2",
                              children: [
                                /* @__PURE__ */ jsx("span", {
                                  className: `text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    doc.status === "Verified"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : doc.status === "Rejected"
                                        ? "bg-rose-50 text-rose-700 border-rose-200"
                                        : "bg-amber-50 text-amber-800 border-amber-200"
                                  }`,
                                  children: doc.status || "Pending"
                                }),
                                doc.status === "Rejected" && doc.rejectionReason &&
                                  /* @__PURE__ */ jsxs("span", {
                                    className: "text-xs text-rose-600",
                                    children: ["Reason: ", doc.rejectionReason]
                                  })
                              ]
                            })
                        ]
                      }),
                      /* @__PURE__ */ jsxs("div", {
                        className: "flex flex-wrap items-center gap-2 shrink-0",
                        children: [
                          showTaskDocUpload &&
                            canUploadTaskDocumentSlot(doc) &&
                            /* @__PURE__ */ jsxs(Fragment, {
                              children: [
                                /* @__PURE__ */ jsx("input", {
                                  ref: (el) => setRef(key, el),
                                  type: "file",
                                  accept: ".pdf,.png,.jpg,.jpeg,.doc,.docx",
                                  className: "hidden",
                                  onChange: (e) => handleSlotUpload(task, slot, e)
                                }),
                                /* @__PURE__ */ jsxs(Button, {
                                  size: "sm",
                                  variant: "secondary",
                                  disabled: busy,
                                  onClick: () => fileInputRefs.current[key]?.click(),
                                  children: [
                                    /* @__PURE__ */ jsx(Upload, { size: 14, className: "mr-1" }),
                                    busy ? "Uploading…" : taskDocumentSlotUploadLabel(doc)
                                  ]
                                })
                              ]
                            }),
                          doc?.url &&
                            /* @__PURE__ */ jsxs(Fragment, {
                              children: [
                                /* @__PURE__ */ jsx(DocumentViewButton, {
                                  url: doc.url,
                                  name: doc.name,
                                  title: "View",
                                  onOpen: openDocumentPreview,
                                  className: "p-1.5 rounded text-slate-500 hover:bg-slate-100"
                                }),
                                /* @__PURE__ */ jsx("a", {
                                  ...documentDownloadProps(doc.url, doc.name),
                                  className: "p-1.5 rounded text-slate-500 hover:bg-slate-100",
                                  title: "Download",
                                  children: /* @__PURE__ */ jsx(Download, { size: 16 })
                                })
                              ]
                            }),
                          isStaff &&
                            doc &&
                            (doc.status === "Pending" || doc.status === "Reviewing") &&
                            /* @__PURE__ */ jsxs(Fragment, {
                              children: [
                                /* @__PURE__ */ jsx("button", {
                                  type: "button",
                                  title: "Approve",
                                  onClick: () => handleReview(doc, "Verified"),
                                  className: "p-1.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100",
                                  children: /* @__PURE__ */ jsx(Check, { size: 16 })
                                }),
                                /* @__PURE__ */ jsx("button", {
                                  type: "button",
                                  title: "Reject",
                                  onClick: () => setRejectionModal({ open: true, doc }),
                                  className: "p-1.5 rounded bg-rose-50 text-rose-600 hover:bg-rose-100",
                                  children: /* @__PURE__ */ jsx(X, { size: 16 })
                                })
                              ]
                            }),
                          doc &&
                            doc.status === "Pending" &&
                            userRole === "Student" &&
                            /* @__PURE__ */ jsxs("span", {
                              className: "text-[10px] text-amber-700 flex items-center gap-1",
                              children: [
                                /* @__PURE__ */ jsx(Hourglass, { size: 12 }),
                                "Awaiting counselor review"
                              ]
                            })
                        ]
                      })
                    ]
                  },
                  key
                );
              })
            ]
          },
          task.id
        )
      ),
      rejectionModal.open &&
        rejectionModal.doc &&
        /* @__PURE__ */ jsx("div", {
          className: "fixed inset-0 z-[180] flex items-center justify-center p-4 bg-slate-900/50",
          onClick: () => setRejectionModal({ open: false, doc: null }),
          children: /* @__PURE__ */ jsxs("div", {
            className: "bg-white rounded-xl shadow-xl max-w-md w-full p-5 border border-slate-200",
            onClick: (e) => e.stopPropagation(),
            children: [
              /* @__PURE__ */ jsxs("div", {
                className: "flex items-center gap-2 text-rose-600 mb-3",
                children: [
                  /* @__PURE__ */ jsx(AlertCircle, { size: 18 }),
                  /* @__PURE__ */ jsx("h4", { className: "font-semibold text-slate-900", children: "Reject document" })
                ]
              }),
              /* @__PURE__ */ jsx("p", {
                className: "text-xs text-slate-600 mb-2",
                children: "Give the student a short reason so they can fix and re-upload."
              }),
              /* @__PURE__ */ jsx("textarea", {
                className: "w-full border border-slate-200 rounded-lg p-2 text-sm min-h-[88px]",
                value: rejectionReason,
                onChange: (e) => setRejectionReason(e.target.value),
                placeholder: "Reason for rejection…"
              }),
              /* @__PURE__ */ jsxs("div", {
                className: "flex justify-end gap-2 mt-4",
                children: [
                  /* @__PURE__ */ jsx(Button, {
                    variant: "ghost",
                    size: "sm",
                    onClick: () => setRejectionModal({ open: false, doc: null }),
                    children: "Cancel"
                  }),
                  /* @__PURE__ */ jsx(Button, {
                    size: "sm",
                    variant: "danger",
                    disabled: !String(rejectionReason || "").trim(),
                    onClick: () => handleReview(rejectionModal.doc, "Rejected", rejectionReason.trim()),
                    children: "Reject"
                  })
                ]
              })
            ]
          })
        }),
      documentPreviewModal
    ]
  });
}
