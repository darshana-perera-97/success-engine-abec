import { useEffect, useMemo, useState } from "react";
import { getBranches, getCountries, submitStudentRegFormRequest } from "../authApi";
import { resolveCountriesForOffice } from "../utils/branchCountries";
import { EDUCATION_LEVELS, LIVING_STATUSES, YES_NO_OPTIONS } from "./InquiryIntakeForm";
import { Button } from "./Button";
import { normalizeWebFormAppearance, normalizeWebFormFields } from "../webFormConfig";

const EDUCATION_LEVELS_LOCAL = [
  "High school",
  "Foundation / pathway",
  "Diploma",
  "Bachelor's degree",
  "Master's degree",
  "Doctorate / PhD",
  "Professional qualification",
  "Other",
];

function emptyFormValues() {
  return {
    name: "",
    email: "",
    phone: "",
    countryToVisit: "",
    city: "",
    nearestOffice: "",
    livingStatus: "",
    visaRejectionAnyCountry: "No",
    currentEducationLevel: "",
    intendedProgram: "",
    message: "",
  };
}

function resolveMaxWidth(device, appearance) {
  if (device === "mobile") return `${appearance.maxWidthMobile}%`;
  if (device === "tablet") return `${appearance.maxWidthTablet}px`;
  return `${appearance.maxWidthDesktop}px`;
}

function fieldWidthClass(width) {
  return width === "half" ? "sm:w-[calc(50%-0.5rem)] w-full" : "w-full";
}

export function EmbeddableWebForm({
  formConfig,
  formId = "",
  previewDevice = "desktop",
  isPreview = false,
  className = "",
}) {
  const normalized = useMemo(() => {
    const src = formConfig && typeof formConfig === "object" ? formConfig : {};
    return {
      title: String(src.title || "Student interest form").trim(),
      subtitle: String(src.subtitle || "").trim(),
      appearance: normalizeWebFormAppearance(src.appearance),
      fields: normalizeWebFormFields(src.fields).filter((field) => field.enabled),
      submitButtonText: String(src.submitButtonText || "Submit").trim() || "Submit",
      successTitle: String(src.successTitle || "Thank you").trim() || "Thank you",
      successMessage:
        String(src.successMessage || "").trim() ||
        "We have received your details. Our team will contact you using the email or phone number you provided.",
    };
  }, [formConfig]);

  const { appearance, fields } = normalized;
  const [branchRecords, setBranchRecords] = useState([]);
  const [globalCountries, setGlobalCountries] = useState([]);
  const [branchCountriesEnabled, setBranchCountriesEnabled] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchesReady, setBranchesReady] = useState(isPreview);
  const [countriesError, setCountriesError] = useState("");
  const [branchesError, setBranchesError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(emptyFormValues);

  useEffect(() => {
    if (isPreview) return undefined;
    let cancelled = false;
    (async () => {
      const [countriesRes, branchesRes] = await Promise.all([getCountries(), getBranches()]);
      if (cancelled) return;
      if (!countriesRes.ok) {
        setCountriesError(countriesRes.error || "Could not load countries.");
      } else {
        setGlobalCountries(countriesRes.data || []);
        setBranchCountriesEnabled(countriesRes.branchCountriesEnabled === true);
      }
      if (!branchesRes.ok) {
        setBranchesError(branchesRes.error || "Could not load offices.");
        setBranches([]);
        setBranchRecords([]);
      } else {
        const records = branchesRes.data || [];
        setBranchRecords(records);
        const locations = records
          .map((b) => String(b?.location || "").trim())
          .filter(Boolean);
        setBranches(locations);
        setForm((prev) => ({
          ...prev,
          nearestOffice: prev.nearestOffice || locations[0] || "",
        }));
      }
      setBranchesReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isPreview]);

  const countries = useMemo(
    () => (isPreview ? ["UK", "USA", "Canada", "Australia"] : resolveCountriesForOffice(branchRecords, form.nearestOffice, globalCountries, { branchCountriesEnabled })),
    [isPreview, branchRecords, form.nearestOffice, globalCountries, branchCountriesEnabled]
  );

  useEffect(() => {
    if (isPreview) return;
    setForm((prev) => {
      const nextCountry = countries.includes(prev.countryToVisit) ? prev.countryToVisit : countries[0] || "";
      if (nextCountry === prev.countryToVisit) return prev;
      return { ...prev, countryToVisit: nextCountry };
    });
  }, [isPreview, countries, form.nearestOffice]);

  useEffect(() => {
    if (!isPreview) return;
    setBranches(["Colombo", "Kandy"]);
    setBranchesReady(true);
    setForm((prev) => ({
      ...prev,
      countryToVisit: prev.countryToVisit || "UK",
      nearestOffice: prev.nearestOffice || "Colombo",
      livingStatus: prev.livingStatus || "Single",
    }));
  }, [isPreview]);

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isPreview) return;
    setFormError("");
    setIsSaving(true);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      countryToVisit: form.countryToVisit.trim(),
      city: form.city.trim(),
      nearestOffice: form.nearestOffice.trim(),
      livingStatus: form.livingStatus.trim(),
      visaRejectionAnyCountry: form.visaRejectionAnyCountry.trim(),
      currentEducationLevel: form.currentEducationLevel,
      intendedProgram: form.intendedProgram.trim(),
      message: form.message.trim(),
    };
    if (formId) payload.webFormId = formId;
    const result = await submitStudentRegFormRequest(payload);
    setIsSaving(false);
    if (!result.ok) {
      setFormError(result.error || "Something went wrong.");
      return;
    }
    setSubmitted(true);
  };

  const inputStyle = {
    backgroundColor: appearance.inputBackground,
    borderColor: appearance.borderColor,
    borderRadius: `${appearance.borderRadius}px`,
    color: appearance.textColor,
  };

  const labelStyle = {
    color: appearance.labelColor,
  };

  const pageStyle = {
    backgroundColor: appearance.pageBackground,
    fontFamily: appearance.fontFamily,
    color: appearance.textColor,
  };

  const formShellStyle = {
    backgroundColor: appearance.formBackground,
    borderColor: appearance.borderColor,
    borderRadius: `${Math.max(appearance.borderRadius + 4, 12)}px`,
    padding: `${appearance.formPadding}px`,
    maxWidth: resolveMaxWidth(previewDevice, appearance),
  };

  const buttonStyle = {
    backgroundColor: appearance.primaryColor,
    borderRadius: `${appearance.borderRadius}px`,
  };

  const renderField = (field) => {
    const required = field.required;
    const commonClass =
      "w-full px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-offset-0";
    const ringStyle = { boxShadow: `0 0 0 2px ${appearance.primaryColor}33` };

    const label = (
      <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={labelStyle}>
        {field.label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </label>
    );

    if (field.key === "countryToVisit") {
      return (
        <div key={field.key} className={fieldWidthClass(field.width)}>
          {label}
          <select
            required={required}
            className={commonClass}
            style={inputStyle}
            value={form.countryToVisit}
            onChange={(e) => update("countryToVisit", e.target.value)}
            disabled={isPreview}
          >
            {countries.length === 0 ? (
              <option value="">Loading destinations…</option>
            ) : (
              countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))
            )}
          </select>
        </div>
      );
    }

    if (field.key === "nearestOffice") {
      return (
        <div key={field.key} className={fieldWidthClass(field.width)}>
          {label}
          <select
            required={required}
            className={commonClass}
            style={inputStyle}
            value={form.nearestOffice}
            onChange={(e) => update("nearestOffice", e.target.value)}
            disabled={isPreview}
          >
            {!branchesReady ? (
              <option value="">Loading offices…</option>
            ) : branches.length === 0 ? (
              <option value="">No offices available yet</option>
            ) : (
              branches.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))
            )}
          </select>
        </div>
      );
    }

    if (field.key === "livingStatus") {
      return (
        <div key={field.key} className={fieldWidthClass(field.width)}>
          {label}
          <select
            required={required}
            className={commonClass}
            style={inputStyle}
            value={form.livingStatus}
            onChange={(e) => update("livingStatus", e.target.value)}
            disabled={isPreview}
          >
            <option value="" disabled>
              Select…
            </option>
            {LIVING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.key === "visaRejectionAnyCountry") {
      return (
        <div key={field.key} className={fieldWidthClass(field.width)}>
          {label}
          <select
            required={required}
            className={commonClass}
            style={inputStyle}
            value={form.visaRejectionAnyCountry}
            onChange={(e) => update("visaRejectionAnyCountry", e.target.value)}
            disabled={isPreview}
          >
            {YES_NO_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.key === "currentEducationLevel") {
      return (
        <div key={field.key} className={fieldWidthClass(field.width)}>
          {label}
          <select
            required={required}
            className={commonClass}
            style={inputStyle}
            value={form.currentEducationLevel}
            onChange={(e) => update("currentEducationLevel", e.target.value)}
            disabled={isPreview}
          >
            <option value="">Select…</option>
            {(EDUCATION_LEVELS.length ? EDUCATION_LEVELS : EDUCATION_LEVELS_LOCAL).map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.key === "message") {
      return (
        <div key={field.key} className={fieldWidthClass(field.width)}>
          {label}
          <textarea
            rows={4}
            required={required}
            className={`${commonClass} resize-y min-h-[96px]`}
            style={inputStyle}
            value={form.message}
            onChange={(e) => update("message", e.target.value)}
            placeholder={field.placeholder}
            disabled={isPreview}
          />
        </div>
      );
    }

    const inputType = field.key === "email" ? "email" : field.key === "phone" ? "tel" : "text";
    return (
      <div key={field.key} className={fieldWidthClass(field.width)}>
        {label}
        <input
          type={inputType}
          required={required}
          className={commonClass}
          style={inputStyle}
          value={form[field.key] || ""}
          onChange={(e) => update(field.key, e.target.value)}
          placeholder={field.placeholder}
          disabled={isPreview}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = appearance.primaryColor;
            Object.assign(e.currentTarget.style, ringStyle);
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = appearance.borderColor;
            e.currentTarget.style.boxShadow = "none";
          }}
        />
      </div>
    );
  };

  if (submitted) {
    return (
      <div className={`min-h-full flex flex-col items-center justify-center p-6 ${className}`} style={pageStyle}>
        <div
          className="w-full border p-8 shadow-sm text-center"
          style={{
            ...formShellStyle,
            maxWidth: resolveMaxWidth(previewDevice, appearance),
          }}
        >
          <h1 className="text-xl font-bold tracking-tight" style={{ color: appearance.textColor }}>
            {normalized.successTitle}
          </h1>
          <p className="mt-3 text-sm leading-relaxed opacity-80">{normalized.successMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-full py-8 px-4 ${className}`} style={pageStyle}>
      <div className="mx-auto w-full" style={{ maxWidth: resolveMaxWidth(previewDevice, appearance) }}>
        {(normalized.title || normalized.subtitle) && (
          <header className="mb-6 text-center">
            {normalized.title ? (
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: appearance.textColor }}>
                {normalized.title}
              </h1>
            ) : null}
            {normalized.subtitle ? (
              <p className="mt-2 text-sm opacity-75">{normalized.subtitle}</p>
            ) : null}
          </header>
        )}

        <form
          onSubmit={handleSubmit}
          className="border shadow-sm"
          style={formShellStyle}
        >
          {countriesError ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
              {countriesError}
            </p>
          ) : null}
          {branchesError ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
              {branchesError}
            </p>
          ) : null}
          {formError ? (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 mb-4">
              {formError}
            </p>
          ) : null}

          <div
            className="flex flex-wrap"
            style={{ gap: `${appearance.fieldGap}px` }}
          >
            {fields.map((field) => renderField(field))}
          </div>

          <div className="pt-4 mt-2">
            {isPreview ? (
              <button
                type="button"
                className="w-full px-6 py-3 text-base font-semibold text-white"
                style={buttonStyle}
                disabled
              >
                {normalized.submitButtonText}
              </button>
            ) : (
              <Button
                type="submit"
                className="w-full !text-white border-0"
                size="lg"
                isLoading={isSaving}
                disabled={countries.length === 0 || !branchesReady || branches.length === 0}
                style={buttonStyle}
              >
                {normalized.submitButtonText}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export function PublicWebFormPage({ formId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formConfig, setFormConfig] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/web-forms/public/${encodeURIComponent(formId)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setError(data.error || "Form not found.");
          setFormConfig(null);
        } else {
          setFormConfig(data.data);
        }
      } catch {
        if (!cancelled) {
          setError("Cannot load this form.");
          setFormConfig(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Loading form…
      </div>
    );
  }

  if (error || !formConfig) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="rounded-xl border border-rose-100 bg-white px-6 py-8 text-center text-sm text-rose-700 shadow-sm">
          {error || "Form not found."}
        </div>
      </div>
    );
  }

  return <EmbeddableWebForm formConfig={formConfig} formId={formId} />;
}
