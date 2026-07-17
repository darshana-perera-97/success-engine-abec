import React, { useState } from "react";
import { Eye, FileText, Pencil, Trash2, X } from "lucide-react";
import { Button } from "./Button";

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

  const handleAddSummary = () => {
    const text = draft.trim();
    if (!text) return;
    const newSummary = {
      id: `sum-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      text,
      createdAt: new Date().toISOString(),
      author: authorLabel,
      authorId: currentUser?.id ? String(currentUser.id) : "",
    };
    persistSummaries([newSummary, ...summaries]);
    setDraft("");
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
        {summaries.map((entry) => (
          <div
            key={entry.id}
            className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs flex gap-2 items-start justify-between group"
          >
            <div className="min-w-0 flex-1">
              <p className="text-slate-700 line-clamp-2">{preview(entry.text)}</p>
              <div className="flex flex-wrap gap-x-2 mt-1 text-[10px] text-slate-400">
                <span>{entry.author || authorLabel}</span>
                <span>{formatWhen(entry.updatedAt || entry.createdAt)}</span>
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
                      setDialog({ kind: "edit", summary: entry, draft: entry.text })
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
        ))}
      </div>
      {!readOnly && (
        <div className="space-y-2">
          <textarea
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 min-h-[72px] focus:outline-none focus:border-indigo-500 resize-y"
            placeholder="Add a summary..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button
            size="sm"
            className="w-full sm:w-auto"
            onClick={handleAddSummary}
            disabled={!draft.trim()}
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
                  <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">
                    {dialog.summary.text}
                  </p>
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
                <div className="p-4">
                  <textarea
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 min-h-[140px] focus:outline-none focus:border-indigo-500"
                    value={dialog.draft}
                    onChange={(e) => setDialog({ ...dialog, draft: e.target.value })}
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
                      if (!text) return;
                      const id = dialog.summary.id;
                      const next = summaries.map((item) =>
                        item.id === id
                          ? { ...item, text, updatedAt: new Date().toISOString() }
                          : item,
                      );
                      persistSummaries(next);
                      setDialog(null);
                    }}
                    disabled={!String(dialog.draft || "").trim()}
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
                  <p className="text-xs text-slate-600 whitespace-pre-wrap break-words">
                    {preview(dialog.summary.text)}
                  </p>
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
