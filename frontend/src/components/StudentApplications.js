import { useMemo, useState } from "react";
import { Calendar, GraduationCap, Plus, Trash2, University, X } from "lucide-react";
import { Button } from "./Button";

function newApplicationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `app-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeApplications(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const course = String(item.course || item.programName || "").trim();
      const university = String(item.university || "").trim();
      const appliedDate = String(item.appliedDate || "").trim();
      if (!course && !university) return null;
      return {
        id: String(item.id || "").trim() || newApplicationId(),
        course,
        university,
        appliedDate,
        createdAt: String(item.createdAt || "").trim() || undefined
      };
    })
    .filter(Boolean);
}

function formatAppliedDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const d = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Student profile tab: track university applications (course, university, applied date).
 */
export function StudentApplications({ student, userRole, onUpdateStudent }) {
  const isStaff = userRole !== "Student";
  const applications = useMemo(
    () => normalizeApplications(student?.applications),
    [student?.applications]
  );

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [course, setCourse] = useState("");
  const [university, setUniversity] = useState("");
  const [appliedDate, setAppliedDate] = useState(todayInputValue);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCourse("");
    setUniversity("");
    setAppliedDate(todayInputValue());
    setFormError("");
    setSaving(false);
  };

  const openCreateModal = () => {
    setCourse("");
    setUniversity("");
    setAppliedDate(todayInputValue());
    setFormError("");
    setSaving(false);
    setIsCreateOpen(true);
  };

  const persistApplications = async (nextList) => {
    if (!student || typeof onUpdateStudent !== "function") {
      return { ok: false, error: "Unable to save applications." };
    }
    const result = await onUpdateStudent({
      ...student,
      applications: nextList
    });
    if (result && result.ok === false) {
      return { ok: false, error: result.error || "Failed to save application." };
    }
    return { ok: true };
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    const nextCourse = String(course || "").trim();
    const nextUniversity = String(university || "").trim();
    const nextDate = String(appliedDate || "").trim();
    if (!nextCourse) {
      setFormError("Course is required.");
      return;
    }
    if (!nextUniversity) {
      setFormError("University is required.");
      return;
    }
    if (!nextDate) {
      setFormError("Applied date is required.");
      return;
    }
    setSaving(true);
    setFormError("");
    const entry = {
      id: newApplicationId(),
      course: nextCourse,
      university: nextUniversity,
      appliedDate: nextDate,
      createdAt: new Date().toISOString()
    };
    const result = await persistApplications([entry, ...applications]);
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error || "Failed to save application.");
      return;
    }
    closeCreateModal();
  };

  const handleRemove = async (applicationId) => {
    const id = String(applicationId || "").trim();
    if (!id || !isStaff) return;
    await persistApplications(applications.filter((app) => app.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <GraduationCap size={20} />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase">Total Applications</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{applications.length}</div>
          <p className="text-xs text-slate-500 mt-1">
            {applications.length === 1 ? "application on file" : "applications on file"}
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="space-y-1">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap size={18} className="text-slate-500" />
            Applications
          </h3>
          <p className="text-xs text-slate-400">
            Track courses and universities this student has applied to.
          </p>
        </div>
        {isStaff ? (
          <Button size="sm" onClick={openCreateModal}>
            <Plus size={16} className="mr-2" />
            Add Application
          </Button>
        ) : null}
      </div>

      {applications.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center">
          <div className="mx-auto mb-3 w-12 h-12 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center">
            <GraduationCap size={24} />
          </div>
          <p className="text-sm font-medium text-slate-700">No applications yet</p>
          <p className="text-xs text-slate-500 mt-1">
            {isStaff
              ? "Add a course, university, and applied date to start tracking."
              : "Applications added by your counselor will appear here."}
          </p>
          {isStaff ? (
            <Button size="sm" className="mt-4" onClick={openCreateModal}>
              <Plus size={16} className="mr-2" />
              Add Application
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {applications.map((app) => (
            <div
              key={app.id}
              className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                      <GraduationCap size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                        Course
                      </p>
                      <p className="text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                        {app.course || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                      <University size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                        University
                      </p>
                      <p className="text-sm font-medium text-slate-800 [overflow-wrap:anywhere]">
                        {app.university || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg shrink-0">
                      <Calendar size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                        Applied date
                      </p>
                      <p className="text-sm font-medium text-slate-800">
                        {formatAppliedDate(app.appliedDate)}
                      </p>
                    </div>
                  </div>
                </div>
                {isStaff ? (
                  <button
                    type="button"
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                    title="Remove application"
                    aria-label="Remove application"
                    onClick={() => handleRemove(app.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {isCreateOpen ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={closeCreateModal}
        >
          <div
            className="bg-white rounded-xl border border-gray-100 shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-bold text-lg text-slate-900">New Application</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter the course, university, and date applied.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <span className="sr-only">Close</span>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {formError ? (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                  {formError}
                </div>
              ) : null}

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">
                  Course
                </label>
                <input
                  required
                  type="text"
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md outline-none focus:border-indigo-500"
                  placeholder="e.g. MSc Computer Science"
                  value={course}
                  onChange={(e) => {
                    setCourse(e.target.value);
                    setFormError("");
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">
                  University
                </label>
                <input
                  required
                  type="text"
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md outline-none focus:border-indigo-500"
                  placeholder="e.g. University of Toronto"
                  value={university}
                  onChange={(e) => {
                    setUniversity(e.target.value);
                    setFormError("");
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">
                  Applied date
                </label>
                <input
                  required
                  type="date"
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md outline-none focus:border-indigo-500"
                  value={appliedDate}
                  onChange={(e) => {
                    setAppliedDate(e.target.value);
                    setFormError("");
                  }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" size="sm" variant="outline" onClick={closeCreateModal} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={saving} disabled={saving}>
                  Save application
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default StudentApplications;
