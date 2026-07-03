import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "./Button";
import { dt } from "./DataTable";
import { PhoneWhatsappFields } from "./PhoneWhatsappFields";
import { IntakeFields } from "./IntakeFields";
import { resolveFormWhatsappNumber, validateWhatsappFields } from "../utils/phoneWhatsapp";
import { validateIntakeFields } from "../utils/intakeFields";
import { useIntakeOptionsForCountry } from "../hooks/useIntakeOptionsForCountry";
import { INQUIRY_SOURCE_OPTIONS, isValidInquirySource, normalizeInquirySource } from "../utils/inquirySource";

export const EDUCATION_LEVELS = [
  "High school",
  "Foundation / pathway",
  "Diploma",
  "Bachelor's degree",
  "Master's degree",
  "Doctorate / PhD",
  "Professional qualification",
  "Other"
];

export const LIVING_STATUSES = ["Married", "Single"];

export const BUDGET_CURRENCIES = [
  { value: "LKR", label: "LKR" },
  { value: "USD", label: "USD" },
  { value: "GBP", label: "GBP" },
  { value: "CAD", label: "CAD" },
  { value: "AUD", label: "AUD" },
  { value: "EUR", label: "EUR" },
  { value: "NZD", label: "NZD" }
];

export const YES_NO_OPTIONS = ["Yes", "No"];

export function newInquiryExamResultRow() {
  return { id: `er-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, examName: "", result: "" };
}

export function examResultsRowsFromStudent(student) {
  const raw = student?.examResults;
  if (!Array.isArray(raw) || raw.length === 0) return [newInquiryExamResultRow()];
  const rows = raw.map((r, idx) => ({
    id: String(r?.id || "").trim() || `er-${idx}-${Date.now()}`,
    examName: String(r?.examName ?? r?.exam ?? r?.name ?? ""),
    result: String(r?.result ?? r?.score ?? "")
  }));
  return rows.length ? rows : [newInquiryExamResultRow()];
}

export function emptyInquiryForm({ countries = [], offices = [] } = {}) {
  return {
    name: "",
    email: "",
    phone: "",
    whatsappSameAsPhone: true,
    whatsappNumber: "",
    countryToVisit: countries[0] || "",
    nearestOffice: offices[0] || "",
    city: "",
    livingStatus: "",
    budget: "",
    budgetCurrency: "LKR",
    visaRejectionAnyCountry: "No",
    currentEducationLevel: "",
    intendedProgram: "",
    intakeMonth: "",
    intakeYear: "",
    message: "",
    priority: "Medium",
    inquirySource: "",
    examResults: [newInquiryExamResultRow()]
  };
}

export function sanitizeInquiryExamResults(examResults) {
  return (examResults || [])
    .map((row) => ({
      examName: String(row.examName || "").trim(),
      result: String(row.result || "").trim()
    }))
    .filter((row) => row.examName || row.result);
}

export function validateInquiryFormRequired(form, { requireBudget = true, requireSource = false } = {}) {
  if (requireSource && !isValidInquirySource(form.inquirySource)) {
    return { ok: false, error: "Please select how this student heard about us." };
  }
  if (
    !String(form.name || "").trim() ||
    !String(form.email || "").trim() ||
    !String(form.phone || "").trim() ||
    !String(form.countryToVisit || "").trim() ||
    !String(form.nearestOffice || "").trim() ||
    !String(form.livingStatus || "").trim() ||
    (requireBudget && !String(form.budget || "").trim()) ||
    (requireBudget && !String(form.budgetCurrency || "").trim()) ||
    !String(form.visaRejectionAnyCountry || "").trim() ||
    !String(form.currentEducationLevel || "").trim() ||
    !String(form.intendedProgram || "").trim()
  ) {
    return { ok: false, error: "Please fill all required interest form fields." };
  }
  const intakeValidation = validateIntakeFields(form.intakeMonth, form.intakeYear, { required: true });
  if (!intakeValidation.ok) return intakeValidation;
  const whatsappValidation = validateWhatsappFields(form);
  if (!whatsappValidation.ok) return whatsappValidation;
  return { ok: true };
}

export function inquiryFormToStudentFields(form, baseStudent = {}, { requireIntake = true } = {}) {
  const sanitizedExamResults = sanitizeInquiryExamResults(form.examResults);
  const intakeValidation = validateIntakeFields(form.intakeMonth, form.intakeYear, { required: requireIntake });
  const formBudget = String(form.budget || "").trim();
  const budget = formBudget || String(baseStudent.budget || "").trim();
  const budgetCurrency = (
    formBudget
      ? String(form.budgetCurrency || "LKR").trim().toUpperCase()
      : String(baseStudent.budgetCurrency || form.budgetCurrency || "LKR").trim().toUpperCase()
  ) || "LKR";
  return {
    ...baseStudent,
    name: String(form.name || "").trim(),
    email: String(form.email || "").trim(),
    phone: String(form.phone || "").trim(),
    whatsappNumber: resolveFormWhatsappNumber(form),
    countryToVisit: String(form.countryToVisit || "").trim(),
    nearestOffice: String(form.nearestOffice || "").trim(),
    city: String(form.city || "").trim(),
    livingStatus: String(form.livingStatus || "").trim(),
    budget,
    budgetCurrency,
    visaRejectionAnyCountry: String(form.visaRejectionAnyCountry || "").trim(),
    currentEducationLevel: String(form.currentEducationLevel || "").trim(),
    intendedProgram: String(form.intendedProgram || "").trim(),
    intakeMonth: intakeValidation.ok ? intakeValidation.intakeMonth : String(form.intakeMonth || "").trim() || null,
    intakeYear: intakeValidation.ok ? intakeValidation.intakeYear : String(form.intakeYear || "").trim() || null,
    message: String(form.message || "").trim(),
    examResults: sanitizedExamResults,
    inquirySource: normalizeInquirySource(form.inquirySource) || baseStudent.inquirySource || null,
    country: String(form.countryToVisit || "").trim() || baseStudent.country,
    branch: String(form.nearestOffice || "").trim() || baseStudent.branch,
    priority: String(form.priority || "").trim() || baseStudent.priority || "Medium"
  };
}

/** Merge inquiry form into student without requiring every intake field (for Schedule Later). */
export function mergeInquiryFormForScheduleLater(form, baseStudent = {}) {
  const intakeValidation = validateIntakeFields(form.intakeMonth, form.intakeYear, { required: false });
  if (!intakeValidation.ok) return intakeValidation;
  const phone = String(form.phone || "").trim();
  if (phone) {
    const whatsappValidation = validateWhatsappFields(form);
    if (!whatsappValidation.ok) return whatsappValidation;
  }
  return {
    ok: true,
    student: inquiryFormToStudentFields(form, baseStudent, { requireIntake: false })
  };
}

const fieldClass =
  "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500";

export function InquirySourceField({ value, onChange, className = fieldClass }) {
  return (
    <div className="sm:col-span-2">
      <label className="text-xs font-semibold text-slate-700 mb-1 block">Source</label>
      <select
        required
        className={className}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          Select...
        </option>
        {INQUIRY_SOURCE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function InquiryIntakeForm({
  form,
  setForm,
  countries = [],
  offices = [],
  error = "",
  isSaving = false,
  onSubmit,
  onCancel,
  onScheduleLater,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  scheduleLaterLabel = "Schedule Later",
  showBudgetField = true,
  showSourceField = false,
  intakeCountry = ""
}) {
  const intakeOptions = useIntakeOptionsForCountry(intakeCountry);
  const updateInquiryExamRow = (id, field, value) => {
    setForm((prev) => ({
      ...prev,
      examResults: (prev.examResults || []).map((row) => (row.id === id ? { ...row, [field]: value } : row))
    }));
  };

  const addInquiryExamRow = () => {
    setForm((prev) => ({
      ...prev,
      examResults: [...(prev.examResults || []), newInquiryExamResultRow()]
    }));
  };

  const removeInquiryExamRow = (id) => {
    setForm((prev) => {
      const rows = prev.examResults || [];
      if (rows.length <= 1) {
        return { ...prev, examResults: [newInquiryExamResultRow()] };
      }
      return { ...prev, examResults: rows.filter((r) => r.id !== id) };
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
      {error ? (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</div>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {showSourceField ? (
          <InquirySourceField
            value={form.inquirySource}
            onChange={(nextValue) => setForm((prev) => ({ ...prev, inquirySource: nextValue }))}
          />
        ) : null}
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Name</label>
          <input
            type="text"
            required
            className={fieldClass}
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Email</label>
          <input
            type="email"
            required
            className={fieldClass}
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
        </div>
        <PhoneWhatsappFields
          phone={form.phone}
          whatsappNumber={form.whatsappNumber}
          whatsappSameAsPhone={form.whatsappSameAsPhone}
          onPhoneChange={(value) =>
            setForm((prev) => ({
              ...prev,
              phone: value,
              whatsappNumber: prev.whatsappSameAsPhone !== false ? value : prev.whatsappNumber
            }))
          }
          onWhatsappNumberChange={(value) => setForm((prev) => ({ ...prev, whatsappNumber: value }))}
          onWhatsappSameAsPhoneChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              whatsappSameAsPhone: checked,
              whatsappNumber: checked ? prev.phone : prev.whatsappNumber
            }))
          }
          fieldClassName={fieldClass}
        />
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Country you wish to visit</label>
          <select
            required
            className={fieldClass}
            value={form.countryToVisit}
            onChange={(e) => setForm((prev) => ({ ...prev, countryToVisit: e.target.value }))}
          >
            {(countries || []).length === 0 ? (
              <option value="">No destinations configured</option>
            ) : (
              <>
                {!form.countryToVisit ? (
                  <option value="" disabled>
                    Select...
                  </option>
                ) : null}
                {(countries || []).map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Preferred branch</label>
          <select
            required
            className={fieldClass}
            value={form.nearestOffice}
            onChange={(e) => setForm((prev) => ({ ...prev, nearestOffice: e.target.value }))}
          >
            {(offices || []).length === 0 ? (
              <option value="">No offices configured</option>
            ) : (
              <>
                {!form.nearestOffice ? (
                  <option value="" disabled>
                    Select...
                  </option>
                ) : null}
                {(offices || []).map((office) => (
                  <option key={office} value={office}>
                    {office}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">City / location</label>
          <input
            type="text"
            className={fieldClass}
            value={form.city}
            onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Living status</label>
          <select
            required
            className={fieldClass}
            value={form.livingStatus}
            onChange={(e) => setForm((prev) => ({ ...prev, livingStatus: e.target.value }))}
          >
            <option value="" disabled>
              Select...
            </option>
            {LIVING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        {showBudgetField ? (
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">Annual budget</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="any"
                required
                className={`min-w-0 flex-1 ${fieldClass}`}
                value={form.budget}
                onChange={(e) => setForm((prev) => ({ ...prev, budget: e.target.value }))}
                placeholder="e.g. 25000"
              />
              <select
                required
                className="w-28 shrink-0 px-2 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500"
                aria-label="Currency"
                value={form.budgetCurrency}
                onChange={(e) => setForm((prev) => ({ ...prev, budgetCurrency: e.target.value }))}
              >
                {BUDGET_CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Any visa rejection for any country</label>
          <select
            required
            className={fieldClass}
            value={form.visaRejectionAnyCountry}
            onChange={(e) => setForm((prev) => ({ ...prev, visaRejectionAnyCountry: e.target.value }))}
          >
            <option value="" disabled>
              Select...
            </option>
            {YES_NO_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Priority</label>
          <select
            className={fieldClass}
            value={form.priority}
            onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Current education level</label>
          <select
            required
            className={fieldClass}
            value={form.currentEducationLevel}
            onChange={(e) => setForm((prev) => ({ ...prev, currentEducationLevel: e.target.value }))}
          >
            <option value="" disabled>
              Select...
            </option>
            {EDUCATION_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Intended program of study</label>
          <input
            type="text"
            required
            className={fieldClass}
            value={form.intendedProgram}
            onChange={(e) => setForm((prev) => ({ ...prev, intendedProgram: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-2">
          <IntakeFields
            intakeMonth={form.intakeMonth}
            intakeYear={form.intakeYear}
            onIntakeMonthChange={(value) => setForm((prev) => ({ ...prev, intakeMonth: value }))}
            onIntakeYearChange={(value) => setForm((prev) => ({ ...prev, intakeYear: value }))}
            required
            fieldClassName={fieldClass}
            monthOptions={intakeOptions.months}
            yearOptions={intakeOptions.years}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Additional message</label>
          <textarea
            rows={3}
            className={fieldClass}
            value={form.message}
            onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <label className="text-xs font-semibold text-slate-700">Exam results</label>
            <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={addInquiryExamRow}>
              <Plus size={14} className="mr-1" />
              Add row
            </Button>
          </div>
          <p className="text-[11px] text-slate-500 mb-2">
            Optional. Add as many rows as you need (exam or qualification name and score or grade).
          </p>
          <div className={dt.embedded}>
            <table className={dt.tableCompact}>
              <thead className={dt.head}>
                <tr>
                  <th className={dt.thCompact}>Exam name</th>
                  <th className={dt.thCompact}>Result</th>
                  <th className="w-11 px-1 py-2" />
                </tr>
              </thead>
              <tbody className={dt.body}>
                {(form.examResults || []).map((row) => (
                  <tr key={row.id}>
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        type="text"
                        className="w-full min-w-0 px-2 py-1.5 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500"
                        value={row.examName}
                        onChange={(e) => updateInquiryExamRow(row.id, "examName", e.target.value)}
                        placeholder="e.g. IELTS"
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        type="text"
                        className="w-full min-w-0 px-2 py-1.5 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500"
                        value={row.result}
                        onChange={(e) => updateInquiryExamRow(row.id, "result", e.target.value)}
                        placeholder="e.g. 7.5"
                      />
                    </td>
                    <td className="px-1 py-1.5 align-middle text-center">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        aria-label="Remove row"
                        onClick={() => removeInquiryExamRow(row.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-100 flex-shrink-0">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
          {cancelLabel}
        </Button>
        {onScheduleLater ? (
          <Button
            type="button"
            variant="secondary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onScheduleLater();
            }}
            disabled={isSaving}
          >
            {scheduleLaterLabel}
          </Button>
        ) : null}
        <Button type="submit" isLoading={isSaving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
