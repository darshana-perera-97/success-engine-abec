import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "./Button";
import {
  MAX_PREFERRED_COURSE_ROWS,
  emptyCourseUniversityRow,
  formatCourseUniversityLine,
  parseCourseUniversityLine
} from "../utils/preferredCourses";

const defaultFieldClass =
  "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";

/**
 * Type course + university in one field, press Add to push into a list (max 5).
 * Each list item can be removed with the X button.
 */
export function CourseUniversityFields({
  rows,
  onChange,
  fieldClassName = defaultFieldClass,
  compactLabels = false,
  required = false,
  label = "Preferred courses & universities"
}) {
  const list = (Array.isArray(rows) ? rows : []).filter((row) =>
    String(formatCourseUniversityLine(row) || "").trim()
  );
  const [draft, setDraft] = useState("");
  const canAdd = list.length < MAX_PREFERRED_COURSE_ROWS;

  const addFromDraft = () => {
    const line = String(draft || "").trim();
    if (!line || !canAdd) return;
    const parsed = parseCourseUniversityLine(line);
    const next = emptyCourseUniversityRow();
    next.line = line;
    next.programName = parsed.programName;
    next.university = parsed.university;
    onChange?.([...list, next]);
    setDraft("");
  };

  const removeItem = (id) => {
    onChange?.(list.filter((row) => row.id !== id));
  };

  const labelClass = compactLabels
    ? "mb-1 block text-xs font-semibold text-slate-700"
    : "block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5";

  return (
    <div>
      <label className={labelClass}>
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </label>
      <p className="mb-2 text-[11px] text-slate-500">
        Type course and university, then Add (up to {MAX_PREFERRED_COURSE_ROWS}). Remove with ×.
      </p>

      {list.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {list.map((row, index) => {
            const text = formatCourseUniversityLine(row);
            return (
              <li
                key={row.id || `course-item-${index}`}
                className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <span className="min-w-0 flex-1 text-sm text-slate-800 [overflow-wrap:anywhere]">
                  {text}
                </span>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Remove ${text}`}
                  title="Remove"
                  onClick={() => removeItem(row.id)}
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          type="text"
          className={`${fieldClassName} min-w-0 flex-1`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFromDraft();
            }
          }}
          placeholder="e.g. BSc Computer Science — University of Melbourne"
          disabled={!canAdd}
          required={required && list.length === 0}
          aria-label="Course and university"
        />
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          onClick={addFromDraft}
          disabled={!canAdd || !String(draft || "").trim()}
        >
          <Plus size={14} className="mr-1" />
          Add
        </Button>
      </div>

      {!canAdd ? (
        <p className="mt-2 text-[11px] text-amber-700">Maximum of {MAX_PREFERRED_COURSE_ROWS} preferences added.</p>
      ) : null}
    </div>
  );
}
