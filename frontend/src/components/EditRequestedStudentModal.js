import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { getBranches, getCountries, updateReqStudent } from "../authApi";
import { Button } from "./Button";
import { IntakeFields } from "./IntakeFields";
import { PhoneWhatsappFields } from "./PhoneWhatsappFields";
import { EDUCATION_LEVELS, LIVING_STATUSES, YES_NO_OPTIONS } from "./InquiryIntakeForm";
import { resolveCountriesForOffice } from "../utils/branchCountries";
import { resolveFormWhatsappNumber, validateWhatsappFields, whatsappFieldsFromStudent } from "../utils/phoneWhatsapp";
import { validateIntakeFields } from "../utils/intakeFields";

const fieldClass =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30";

function formFromReqStudent(row) {
  if (!row) return null;
  const { whatsappSameAsPhone, whatsappNumber } = whatsappFieldsFromStudent(row);
  return {
    name: row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    whatsappSameAsPhone,
    whatsappNumber,
    countryToVisit: row.countryToVisit || "",
    nearestOffice: row.nearestOffice || "",
    city: row.city || "",
    livingStatus: row.livingStatus || "",
    visaRejectionAnyCountry: row.visaRejectionAnyCountry || "No",
    currentEducationLevel: row.currentEducationLevel || "",
    intendedProgram: row.intendedProgram || "",
    intakeMonth: row.intakeMonth || "",
    intakeYear: row.intakeYear || "",
    message: row.message || ""
  };
}

export function EditRequestedStudentModal({ row, branchCountriesEnabled = false, onClose, onSaved }) {
  const [form, setForm] = useState(() => formFromReqStudent(row));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);
  const [branchRecords, setBranchRecords] = useState([]);
  const [globalCountries, setGlobalCountries] = useState([]);

  useEffect(() => {
    setForm(formFromReqStudent(row));
    setError("");
  }, [row]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMetaLoading(true);
      const [branchesRes, countriesRes] = await Promise.all([getBranches(), getCountries()]);
      if (cancelled) return;
      setBranchRecords(branchesRes.ok ? branchesRes.data || [] : []);
      setGlobalCountries(countriesRes.ok ? countriesRes.data || [] : []);
      setMetaLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const officeOptions = useMemo(() => {
    const locations = (branchRecords || [])
      .map((branch) => String(branch?.location || "").trim())
      .filter(Boolean);
    const current = String(form?.nearestOffice || "").trim();
    if (current && !locations.some((loc) => loc.toLowerCase() === current.toLowerCase())) {
      return [current, ...locations];
    }
    return locations;
  }, [branchRecords, form?.nearestOffice]);

  const countryOptions = useMemo(() => {
    const office = String(form?.nearestOffice || "").trim();
    const resolved = resolveCountriesForOffice(branchRecords, office, globalCountries, {
      branchCountriesEnabled
    });
    const current = String(form?.countryToVisit || "").trim();
    if (current && !resolved.some((name) => String(name).trim().toLowerCase() === current.toLowerCase())) {
      return [current, ...resolved];
    }
    return resolved;
  }, [branchRecords, globalCountries, branchCountriesEnabled, form?.nearestOffice, form?.countryToVisit]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!row?.id || !form) return;

    const name = String(form.name || "").trim();
    const email = String(form.email || "").trim();
    if (!name) {
      setError("Name is required.");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    const whatsappValidation = validateWhatsappFields(form);
    if (!whatsappValidation.ok) {
      setError(whatsappValidation.error || "Please check phone and WhatsApp fields.");
      return;
    }
    const intakeValidation = validateIntakeFields(form.intakeMonth, form.intakeYear, { required: false });
    if (!intakeValidation.ok) {
      setError(intakeValidation.error || "Please check intake fields.");
      return;
    }

    setSaving(true);
    setError("");
    const payload = {
      name,
      email,
      phone: String(form.phone || "").trim(),
      whatsappNumber: resolveFormWhatsappNumber(form),
      countryToVisit: String(form.countryToVisit || "").trim(),
      nearestOffice: String(form.nearestOffice || "").trim(),
      city: String(form.city || "").trim(),
      livingStatus: String(form.livingStatus || "").trim(),
      visaRejectionAnyCountry: String(form.visaRejectionAnyCountry || "No").trim(),
      currentEducationLevel: String(form.currentEducationLevel || "").trim(),
      intendedProgram: String(form.intendedProgram || "").trim(),
      intakeMonth: form.intakeMonth || null,
      intakeYear: form.intakeYear || null,
      message: String(form.message || "").trim()
    };
    const result = await updateReqStudent(row.id, payload);
    setSaving(false);
    if (!result.ok) {
      setError(result.error || "Could not save changes.");
      return;
    }
    onSaved?.(result.data || { ...row, ...payload });
    onClose?.();
  };

  if (!row || !form) return null;

  return (
    <div
      className="fixed inset-0 z-[146] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/60 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Edit requested student</h2>
            <p className="mt-1 text-xs text-slate-500">
              {row.name || "Lead"} · {row.id || "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[min(72vh,640px)] overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                className={fieldClass}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Email</label>
              <input
                type="email"
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
              <label className="mb-1 block text-xs font-semibold text-slate-700">Preferred branch</label>
              <select
                className={fieldClass}
                value={form.nearestOffice}
                onChange={(e) => setForm((prev) => ({ ...prev, nearestOffice: e.target.value }))}
                disabled={metaLoading}
              >
                <option value="">Optional</option>
                {officeOptions.map((office) => (
                  <option key={office} value={office}>
                    {office}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Country to visit</label>
              <select
                className={fieldClass}
                value={form.countryToVisit}
                onChange={(e) => setForm((prev) => ({ ...prev, countryToVisit: e.target.value }))}
                disabled={metaLoading}
              >
                <option value="">Optional</option>
                {countryOptions.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">City</label>
              <input
                type="text"
                className={fieldClass}
                value={form.city}
                onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Living status</label>
              <select
                className={fieldClass}
                value={form.livingStatus}
                onChange={(e) => setForm((prev) => ({ ...prev, livingStatus: e.target.value }))}
              >
                <option value="">Optional</option>
                {LIVING_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Visa rejection (any country)</label>
              <select
                className={fieldClass}
                value={form.visaRejectionAnyCountry}
                onChange={(e) => setForm((prev) => ({ ...prev, visaRejectionAnyCountry: e.target.value }))}
              >
                {YES_NO_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Current education</label>
              <select
                className={fieldClass}
                value={form.currentEducationLevel}
                onChange={(e) => setForm((prev) => ({ ...prev, currentEducationLevel: e.target.value }))}
              >
                <option value="">Optional</option>
                {EDUCATION_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Intended program</label>
              <input
                type="text"
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
                fieldClassName={fieldClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700">Message</label>
              <textarea
                rows={3}
                className={fieldClass}
                value={form.message}
                onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving} disabled={saving || metaLoading}>
              Save changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
