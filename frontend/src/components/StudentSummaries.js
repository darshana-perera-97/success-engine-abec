import React, { useRef, useState } from "react";
import { Eye, FileText, ImagePlus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "./Button";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "../uploadLimits";

const MAX_SUMMARY_IMAGES = 3;
const SUMMARY_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

function normalizeSummaryImages(entry) {
  return Array.isArray(entry?.images)
    ? entry.images.filter((img) => String(img?.dataUrl || img?.url || "").trim())
    : [];
}

function buildSummaryImageName(file, mime) {
  const existing = String(file?.name || "").trim();
  if (existing) return existing;
  const subtype = String(mime || file?.type || "image/png").split("/")[1] || "png";
  const ext = subtype === "jpeg" ? "jpg" : subtype.replace(/[^a-z0-9]/gi, "") || "png";
  return `summary-image-${Date.now()}.${ext}`;
}

async function readSummaryImageFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  if (!SUMMARY_IMAGE_MIME_TYPES.has(mime)) {
    return { ok: false, error: "Unsupported format. Use PNG, JPG, or WebP." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `Each image must be under ${MAX_UPLOAD_LABEL}.` };
  }
  const reader = new FileReader();
  const rawDataUrl = await new Promise((resolve) => {
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
  if (!rawDataUrl) {
    return { ok: false, error: "Unable to read image. Try again." };
  }
  const dataUrl = rawDataUrl.replace(/^data:[^;]*;base64,/, `data:${mime};base64,`);
  return {
    ok: true,
    image: {
      id: `img-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      name: buildSummaryImageName(file, mime),
      mime,
      dataUrl,
    },
  };
}

function SummaryImageGrid({ images, compact = false }) {
  if (!images.length) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "mt-1.5" : "mt-3"}`}>
      {images.map((img) => {
        const src = String(img.dataUrl || img.url || "").trim();
        if (!src) return null;
        return (
          <a
            key={img.id || src}
            href={src}
            target="_blank"
            rel="noreferrer"
            className="block"
            title={img.name || "Summary image"}
          >
            <img
              src={src}
              alt={img.name || "Summary image"}
              className={
                compact
                  ? "h-10 w-10 rounded-md border border-slate-200 object-cover bg-white"
                  : "max-h-48 rounded-lg border border-slate-200 object-contain bg-slate-50"
              }
            />
          </a>
        );
      })}
    </div>
  );
}

function PendingImagesPicker({
  images,
  onAdd,
  onRemove,
  maxCount = MAX_SUMMARY_IMAGES,
  inputId,
}) {
  const fileInputRef = useRef(null);

  const handlePick = () => {
    if (images.length >= maxCount) {
      window.alert(`You can attach up to ${maxCount} images per summary.`);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleChange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const slotsLeft = maxCount - images.length;
    if (slotsLeft <= 0) {
      window.alert(`You can attach up to ${maxCount} images per summary.`);
      return;
    }
    const selected = files.slice(0, slotsLeft);
    if (files.length > slotsLeft) {
      window.alert(`Only ${slotsLeft} more image(s) can be added (maximum ${maxCount} per summary).`);
    }
    for (const file of selected) {
      const result = await readSummaryImageFile(file);
      if (!result.ok) {
        window.alert(result.error);
        continue;
      }
      const added = onAdd(result.image);
      if (!added) break;
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        multiple
        className="hidden"
        onChange={handleChange}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handlePick}
          disabled={images.length >= maxCount}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 disabled:text-slate-400 disabled:cursor-not-allowed"
        >
          <ImagePlus size={14} />
          Add image{images.length > 0 ? ` (${images.length}/${maxCount})` : ""}
        </button>
        <span className="text-[10px] text-slate-400">PNG, JPG, or WebP · up to {MAX_UPLOAD_LABEL} each</span>
      </div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div
              key={img.id}
              className="relative rounded-lg border border-slate-200 bg-slate-50 p-1"
            >
              <img
                src={img.dataUrl}
                alt={img.name || "Attached image"}
                className="h-16 w-16 rounded-md object-cover bg-white"
              />
              <button
                type="button"
                title="Remove image"
                onClick={() => onRemove(img.id)}
                className="absolute -top-1.5 -right-1.5 rounded-full bg-white border border-slate-200 p-0.5 text-slate-500 hover:text-rose-600 shadow-sm"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Shared summaries on a student record — visible to staff and students.
 * Staff can add, edit, and delete; students can view only.
 */
export function StudentSummaries({
  student,
  onUpdateStudent,
  currentUser,
  authenticatedUser,
  userRole,
}) {
  const [draft, setDraft] = useState("");
  const [pendingImages, setPendingImages] = useState([]);
  const [dialog, setDialog] = useState(null);
  const readOnly = userRole === "Student";
  const authorLabel =
    String(
      currentUser?.name ||
        currentUser?.username ||
        authenticatedUser?.username ||
        authenticatedUser?.email ||
        "Staff",
    ).trim() || "Staff";
  const summaries = Array.isArray(student?.summaries) ? student.summaries : [];

  const persistSummaries = (next) => {
    onUpdateStudent?.({ ...student, summaries: next });
  };

  const canSaveDraft = Boolean(draft.trim()) || pendingImages.length > 0;

  const addPendingImage = (image) => {
    let added = false;
    setPendingImages((prev) => {
      if (prev.length >= MAX_SUMMARY_IMAGES) return prev;
      added = true;
      return [...prev, image];
    });
    if (!added) {
      window.alert(`You can attach up to ${MAX_SUMMARY_IMAGES} images per summary.`);
    }
    return added;
  };

  const handleAddSummary = () => {
    const text = draft.trim();
    if (!text && pendingImages.length === 0) return;
    const newSummary = {
      id: `sum-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      text,
      images: pendingImages,
      createdAt: new Date().toISOString(),
      author: authorLabel,
      authorId: currentUser?.id ? String(currentUser.id) : "",
    };
    persistSummaries([newSummary, ...summaries]);
    setDraft("");
    setPendingImages([]);
  };

  const formatWhen = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
  };

  const preview = (text) => {
    const t = String(text || "").trim();
    if (t.length <= 90) return t;
    return `${t.slice(0, 87)}...`;
  };

  const handleAddFormPaste = async (e) => {
    if (readOnly || pendingImages.length >= MAX_SUMMARY_IMAGES) return;
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind !== "file" || !String(item.type || "").startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      const result = await readSummaryImageFile(file);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      addPendingImage(result.image);
      return;
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <FileText size={16} className="text-indigo-600" />
        Summaries
      </h3>
      <p className="text-[10px] text-slate-500 mb-3">
        {readOnly
          ? "Updates and notes from your counselor team."
          : "Visible to the student and staff on this profile."}
      </p>
      <div className="space-y-2 mb-4 max-h-52 overflow-y-auto pr-1">
        {summaries.length === 0 && (
          <p className="text-xs text-slate-400 italic">No summaries yet.</p>
        )}
        {summaries.map((entry) => {
          const entryImages = normalizeSummaryImages(entry);
          return (
            <div
              key={entry.id}
              className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs flex gap-2 items-start justify-between group"
            >
              <div className="min-w-0 flex-1">
                {entry.text ? (
                  <p className="text-slate-700 line-clamp-2">{preview(entry.text)}</p>
                ) : entryImages.length > 0 ? (
                  <p className="text-slate-500 italic">Image summary</p>
                ) : null}
                {entryImages.length > 0 && (
                  <SummaryImageGrid images={entryImages.slice(0, 3)} compact />
                )}
                <div className="flex flex-wrap gap-x-2 mt-1 text-[10px] text-slate-400">
                  <span>{entry.author || authorLabel}</span>
                  <span>{formatWhen(entry.updatedAt || entry.createdAt)}</span>
                  {entryImages.length > 0 && (
                    <span>
                      {entryImages.length} image{entryImages.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  title="View"
                  className="p-1.5 rounded-md text-slate-500 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200"
                  onClick={() => setDialog({ kind: "view", summary: entry })}
                >
                  <Eye size={14} />
                </button>
                {!readOnly && (
                  <>
                    <button
                      type="button"
                      title="Edit"
                      className="p-1.5 rounded-md text-slate-500 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200"
                      onClick={() =>
                        setDialog({
                          kind: "edit",
                          summary: entry,
                          draft: entry.text || "",
                          draftImages: normalizeSummaryImages(entry),
                        })
                      }
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      className="p-1.5 rounded-md text-slate-500 hover:bg-white hover:text-rose-600 border border-transparent hover:border-slate-200"
                      onClick={() => setDialog({ kind: "delete", summary: entry })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <div className="space-y-2">
          <textarea
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 min-h-[72px] focus:outline-none focus:border-indigo-500 resize-y"
            placeholder="Add a summary..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={handleAddFormPaste}
          />
          <PendingImagesPicker
            inputId="summary-add-images"
            images={pendingImages}
            onAdd={addPendingImage}
            onRemove={(id) => setPendingImages((prev) => prev.filter((img) => img.id !== id))}
          />
          <Button
            size="sm"
            className="w-full sm:w-auto"
            onClick={handleAddSummary}
            disabled={!canSaveDraft}
          >
            Save summary
          </Button>
        </div>
      )}
      {dialog && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setDialog(null)}
        >
          <div
            className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {dialog.kind === "view" && (
              <>
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80">
                  <h4 className="text-sm font-semibold text-slate-900">Summary</h4>
                  <button
                    type="button"
                    className="p-1 rounded-md text-slate-500 hover:bg-slate-100"
                    onClick={() => setDialog(null)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="p-4 overflow-y-auto flex-1">
                  {dialog.summary.text ? (
                    <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">
                      {dialog.summary.text}
                    </p>
                  ) : (
                    !normalizeSummaryImages(dialog.summary).length && (
                      <p className="text-sm text-slate-500 italic">No text.</p>
                    )
                  )}
                  <SummaryImageGrid images={normalizeSummaryImages(dialog.summary)} />
                  <div className="mt-4 text-[11px] text-slate-500 space-y-1">
                    <p>
                      <span className="font-semibold text-slate-600">Author: </span>
                      {dialog.summary.author || "—"}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-600">Created: </span>
                      {formatWhen(dialog.summary.createdAt)}
                    </p>
                    {dialog.summary.updatedAt && (
                      <p>
                        <span className="font-semibold text-slate-600">Updated: </span>
                        {formatWhen(dialog.summary.updatedAt)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setDialog(null)}>
                    Close
                  </Button>
                </div>
              </>
            )}
            {dialog.kind === "edit" && (
              <>
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80">
                  <h4 className="text-sm font-semibold text-slate-900">Edit summary</h4>
                  <button
                    type="button"
                    className="p-1 rounded-md text-slate-500 hover:bg-slate-100"
                    onClick={() => setDialog(null)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                  <textarea
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 min-h-[140px] focus:outline-none focus:border-indigo-500"
                    placeholder="Add summary text..."
                    value={dialog.draft}
                    onChange={(e) => setDialog({ ...dialog, draft: e.target.value })}
                    onPaste={async (e) => {
                      const draftImages = Array.isArray(dialog.draftImages) ? dialog.draftImages : [];
                      if (draftImages.length >= MAX_SUMMARY_IMAGES) return;
                      const items = e.clipboardData?.items;
                      if (!items?.length) return;
                      for (let i = 0; i < items.length; i += 1) {
                        const item = items[i];
                        if (item.kind !== "file" || !String(item.type || "").startsWith("image/")) continue;
                        const file = item.getAsFile();
                        if (!file) continue;
                        e.preventDefault();
                        const result = await readSummaryImageFile(file);
                        if (!result.ok) {
                          window.alert(result.error);
                          return;
                        }
                        if (draftImages.length >= MAX_SUMMARY_IMAGES) {
                          window.alert(`You can attach up to ${MAX_SUMMARY_IMAGES} images per summary.`);
                          return;
                        }
                        setDialog({
                          ...dialog,
                          draftImages: [...draftImages, result.image],
                        });
                        return;
                      }
                    }}
                  />
                  <PendingImagesPicker
                    inputId="summary-edit-images"
                    images={Array.isArray(dialog.draftImages) ? dialog.draftImages : []}
                    onAdd={(image) => {
                      const draftImages = Array.isArray(dialog.draftImages) ? dialog.draftImages : [];
                      if (draftImages.length >= MAX_SUMMARY_IMAGES) {
                        window.alert(`You can attach up to ${MAX_SUMMARY_IMAGES} images per summary.`);
                        return false;
                      }
                      setDialog({ ...dialog, draftImages: [...draftImages, image] });
                      return true;
                    }}
                    onRemove={(id) => {
                      const draftImages = Array.isArray(dialog.draftImages) ? dialog.draftImages : [];
                      setDialog({
                        ...dialog,
                        draftImages: draftImages.filter((img) => img.id !== id),
                      });
                    }}
                  />
                </div>
                <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDialog(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const text = String(dialog.draft || "").trim();
                      const draftImages = Array.isArray(dialog.draftImages) ? dialog.draftImages : [];
                      if (!text && draftImages.length === 0) return;
                      const id = dialog.summary.id;
                      const next = summaries.map((item) =>
                        item.id === id
                          ? {
                              ...item,
                              text,
                              images: draftImages,
                              updatedAt: new Date().toISOString(),
                            }
                          : item,
                      );
                      persistSummaries(next);
                      setDialog(null);
                    }}
                    disabled={
                      !String(dialog.draft || "").trim() &&
                      !(Array.isArray(dialog.draftImages) && dialog.draftImages.length > 0)
                    }
                  >
                    Save changes
                  </Button>
                </div>
              </>
            )}
            {dialog.kind === "delete" && (
              <>
                <div className="px-4 py-3 border-b border-gray-100 bg-slate-50/80">
                  <h4 className="text-sm font-semibold text-slate-900">Delete summary?</h4>
                  <p className="text-xs text-slate-500 mt-1">This cannot be undone.</p>
                </div>
                <div className="p-4 max-h-40 overflow-y-auto">
                  {dialog.summary.text ? (
                    <p className="text-xs text-slate-600 whitespace-pre-wrap break-words">
                      {preview(dialog.summary.text)}
                    </p>
                  ) : null}
                  <SummaryImageGrid images={normalizeSummaryImages(dialog.summary)} compact />
                </div>
                <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDialog(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-rose-600 hover:bg-rose-700 border-none text-white"
                    onClick={() => {
                      persistSummaries(summaries.filter((item) => item.id !== dialog.summary.id));
                      setDialog(null);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
