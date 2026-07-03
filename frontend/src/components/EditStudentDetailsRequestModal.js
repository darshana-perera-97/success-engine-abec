import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";
import { PhoneWhatsappFields } from "./PhoneWhatsappFields";
import { EDUCATION_LEVELS } from "./InquiryIntakeForm";
import {
  resolveFormWhatsappNumber,
  validateWhatsappFields,
  whatsappFieldsFromStudent,
} from "../utils/phoneWhatsapp";
import { getStudentDetailChangeRows } from "../utils/studentDetailChangeRequests";

const fieldClass =
  "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 bg-white";

function buildFormFromStudent(student) {
  const whatsapp = whatsappFieldsFromStudent(student);
  return {
    name: String(student?.name || "").trim(),
    email: String(student?.email || "").trim(),
    phone: String(student?.phone || "").trim(),
    whatsappSameAsPhone: whatsapp.whatsappSameAsPhone,
    whatsappNumber: whatsapp.whatsappNumber,
    currentEducationLevel: String(student?.currentEducationLevel || "").trim(),
  };
}

function hasDetailChanges(student, form) {
  const base = buildFormFromStudent(student);
  const nextWhatsapp = resolveFormWhatsappNumber(form);
  const baseWhatsapp = resolveFormWhatsappNumber(base);
  return (
    form.name.trim() !== base.name ||
    form.email.trim() !== base.email ||
    form.phone.trim() !== base.phone ||
    nextWhatsapp.trim() !== baseWhatsapp.trim() ||
    form.currentEducationLevel.trim() !== base.currentEducationLevel
  );
}

export function EditStudentDetailsRequestModal({
  student,
  open = false,
  onClose,
  onSubmit,
  saving = false,
  error = "",
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => buildFormFromStudent(student));
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (open && student) {
      setStep(1);
      setForm(buildFormFromStudent(student));
      setReason("");
      setLocalError("");
    }
  }, [open, student]);

  const previewChanges = useMemo(() => {
    if (!student) return [];
    const base = buildFormFromStudent(student);
    const nextWhatsapp = resolveFormWhatsappNumber(form);
    const baseWhatsapp = resolveFormWhatsappNumber(base);
    const draft = {
      requestType: "student-details",
      currentName: base.name,
      requestedName: form.name.trim(),
      currentEmail: base.email,
      requestedEmail: form.email.trim(),
      currentPhone: base.phone,
      requestedPhone: form.phone.trim(),
      currentWhatsappNumber: baseWhatsapp,
      requestedWhatsappNumber: nextWhatsapp,
      currentEducationLevel: base.currentEducationLevel,
      requestedEducationLevel: form.currentEducationLevel.trim(),
    };
    return getStudentDetailChangeRows(draft);
  }, [student, form]);

  if (!open || !student) return null;

  const handleClose = () => {
    if (saving) return;
    setStep(1);
    setForm(buildFormFromStudent(student));
    setReason("");
    setLocalError("");
    onClose?.();
  };

  const handleContinue = () => {
    setLocalError("");
    const name = String(form.name || "").trim();
    const email = String(form.email || "").trim();
    const education = String(form.currentEducationLevel || "").trim();
    if (!name) {
      setLocalError("Student name is required.");
      return;
    }
    if (!email) {
      setLocalError("Email is required.");
      return;
    }
    const whatsappCheck = validateWhatsappFields(form);
    if (!whatsappCheck.ok) {
      setLocalError(whatsappCheck.error);
      return;
    }
    if (!education) {
      setLocalError("Education level is required.");
      return;
    }
    if (!hasDetailChanges(student, form)) {
      setLocalError("Update at least one field before continuing.");
      return;
    }
    setStep(2);
  };

  const handleSubmit = () => {
    setLocalError("");
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) {
      setLocalError("Enter a reason for this change.");
      return;
    }
    const whatsappNumber = resolveFormWhatsappNumber(form);
    onSubmit?.({
      requestedName: String(form.name || "").trim(),
      requestedEmail: String(form.email || "").trim(),
      requestedPhone: String(form.phone || "").trim(),
      requestedWhatsappNumber: whatsappNumber,
      requestedEducationLevel: String(form.currentEducationLevel || "").trim(),
      reason: trimmedReason,
    });
  };

  const displayError = localError || error;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Request student detail change</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Step {step} of 2 — {step === 1 ? "Edit details" : "Reason for change"}
            </p>
          </div>
          <button type="button" className="p-1 rounded-md text-slate-500 hover:bg-slate-100" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        {step === 1 ? (
          <>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Full name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className={`mt-1 ${fieldClass}`}
                  placeholder="Student full name"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className={`mt-1 ${fieldClass}`}
                  placeholder="student@email.com"
                />
              </label>
              <PhoneWhatsappFields
                phone={form.phone}
                whatsappNumber={form.whatsappNumber}
                whatsappSameAsPhone={form.whatsappSameAsPhone}
                onPhoneChange={(value) => setForm((prev) => ({ ...prev, phone: value }))}
                onWhatsappNumberChange={(value) => setForm((prev) => ({ ...prev, whatsappNumber: value }))}
                onWhatsappSameAsPhoneChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    whatsappSameAsPhone: checked,
                    whatsappNumber: checked ? prev.phone : prev.whatsappNumber,
                  }))
                }
                fieldClassName={fieldClass}
              />
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Education level</span>
                <select
                  value={form.currentEducationLevel}
                  onChange={(e) => setForm((prev) => ({ ...prev, currentEducationLevel: e.target.value }))}
                  className={`mt-1 ${fieldClass}`}
                >
                  <option value="" disabled>
                    Select education level…
                  </option>
                  {EDUCATION_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
              {displayError ? <p className="text-xs text-rose-600">{displayError}</p> : null}
              <p className="text-[11px] text-slate-500">
                Changes require approval from a Manager, Team Lead, or Admin before they are applied.
              </p>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleContinue}>
                Continue
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 space-y-1.5">
                <p className="text-xs font-semibold text-slate-700">Summary of changes</p>
                {previewChanges.map((item) => (
                  <p key={item.field} className="text-xs text-slate-600">
                    <span className="font-medium text-slate-800">{item.label}:</span>{" "}
                    <span className="text-slate-500">{item.current}</span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span className="font-medium text-slate-800">{item.requested}</span>
                  </p>
                ))}
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Reason for change</span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 resize-y"
                  placeholder="Explain why these student details should be updated…"
                />
              </label>
              {displayError ? <p className="text-xs text-rose-600">{displayError}</p> : null}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-between gap-2">
              <Button size="sm" variant="outline" onClick={() => setStep(1)} disabled={saving}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleClose} disabled={saving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSubmit} disabled={saving || !String(reason || "").trim()}>
                  {saving ? "Submitting…" : "Submit request"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
