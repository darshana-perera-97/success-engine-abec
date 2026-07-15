import { useEffect, useMemo, useState } from "react";
import { getBranches, getCountries, submitStudentRegFormRequest } from "../authApi";
import { resolveCountriesForOffice } from "../utils/branchCountries";
import { resolveFormWhatsappNumber, validateWhatsappFields } from "../utils/phoneWhatsapp";
import { LIVING_STATUSES, YES_NO_OPTIONS } from "./InquiryIntakeForm";
import { IntakeFields } from "./IntakeFields";
import { validateIntakeFields } from "../utils/intakeFields";
import { useIntakeOptionsForCountry } from "../hooks/useIntakeOptionsForCountry";
import { Button } from "./Button";
import { PhoneWhatsappFields } from "./PhoneWhatsappFields";
import { CourseUniversityFields } from "./CourseUniversityFields";
import { preferredCoursesFromRows, summarizePreferredCourses } from "../utils/preferredCourses";

const EDUCATION_LEVELS = [
  "High school",
  "Foundation / pathway",
  "Diploma",
  "Bachelor's degree",
  "Master's degree",
  "Doctorate / PhD",
  "Professional qualification",
  "Other"
];

export function StudentRegistrationForm() {
  const [branchRecords, setBranchRecords] = useState([]);
  const [globalCountries, setGlobalCountries] = useState([]);
  const [branchCountriesEnabled, setBranchCountriesEnabled] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchesReady, setBranchesReady] = useState(false);
  const [countriesError, setCountriesError] = useState("");
  const [branchesError, setBranchesError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    whatsappSameAsPhone: true,
    whatsappNumber: "",
    countryToVisit: "",
    city: "",
    nearestOffice: "",
    livingStatus: "",
    visaRejectionAnyCountry: "No",
    currentEducationLevel: "",
    courseEntries: [],
    intakeMonth: "",
    intakeYear: "",
    message: ""
  });

  const intakeOptions = useIntakeOptionsForCountry(form.countryToVisit);

  useEffect(() => {
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
          nearestOffice: prev.nearestOffice || locations[0] || ""
        }));
      }
      setBranchesReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const countries = useMemo(
    () => resolveCountriesForOffice(branchRecords, form.nearestOffice, globalCountries, { branchCountriesEnabled }),
    [branchRecords, form.nearestOffice, globalCountries, branchCountriesEnabled]
  );

  useEffect(() => {
    setForm((prev) => {
      const nextCountry = countries.includes(prev.countryToVisit) ? prev.countryToVisit : countries[0] || "";
      if (nextCountry === prev.countryToVisit) return prev;
      return { ...prev, countryToVisit: nextCountry };
    });
  }, [countries, form.nearestOffice]);

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (form.name.trim() && !/^[a-zA-Z\s]+$/.test(form.name.trim())) {
      setFormError("Name must contain only letters (a-z).");
      return;
    }
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError("Please enter a valid email address.");
      return;
    }
    const whatsappValidation = validateWhatsappFields(form);
    if (!whatsappValidation.ok) {
      setFormError(whatsappValidation.error);
      return;
    }
    const intakeValidation = validateIntakeFields(form.intakeMonth, form.intakeYear, { required: false });
    if (!intakeValidation.ok) {
      setFormError(intakeValidation.error);
      return;
    }
    setIsSaving(true);
    const preferredCourses = preferredCoursesFromRows(form.courseEntries);
    const result = await submitStudentRegFormRequest({
      name: form.name.trim(),
      email,
      phone: form.phone.trim(),
      whatsappNumber: resolveFormWhatsappNumber(form),
      countryToVisit: form.countryToVisit.trim(),
      city: form.city.trim(),
      nearestOffice: form.nearestOffice.trim(),
      livingStatus: form.livingStatus.trim(),
      visaRejectionAnyCountry: form.visaRejectionAnyCountry.trim(),
      currentEducationLevel: form.currentEducationLevel,
      preferredCourses,
      intendedProgram: summarizePreferredCourses(preferredCourses),
      intakeMonth: intakeValidation.intakeMonth,
      intakeYear: intakeValidation.intakeYear,
      message: form.message.trim()
    });
    setIsSaving(false);
    if (!result.ok) {
      setFormError(result.error || "Something went wrong.");
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Thank you</h1>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            We have received your details. Our team will contact you using the email or phone number you provided.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Student interest form</h1>
          <p className="mt-2 text-sm text-slate-600">
            Share your basic details so we can follow up about studying abroad.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-5"
        >
          {countriesError ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {countriesError} You can still try submitting if the list loaded partially.
            </p>
          ) : null}
          {branchesError ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {branchesError} You can still try submitting if the list loaded partially.
            </p>
          ) : null}
          {formError ? (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{formError}</p>
          ) : null}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
              Full name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoComplete="name"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={form.name}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^[a-zA-Z\s]+$/.test(val)) {
                  update("name", val);
                }
              }}
              placeholder="As on your passport or ID"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PhoneWhatsappFields
              phone={form.phone}
              whatsappNumber={form.whatsappNumber}
              whatsappSameAsPhone={form.whatsappSameAsPhone}
              phoneLabel="Contact number"
              onPhoneChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  phone: value,
                  whatsappNumber: prev.whatsappSameAsPhone !== false ? value : prev.whatsappNumber
                }))
              }
              onWhatsappNumberChange={(value) => update("whatsappNumber", value)}
              onWhatsappSameAsPhoneChange={(checked) =>
                setForm((prev) => ({
                  ...prev,
                  whatsappSameAsPhone: checked,
                  whatsappNumber: checked ? prev.phone : prev.whatsappNumber
                }))
              }
              compactLabels
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
              Country you wish to visit <span className="text-rose-500">*</span>
            </label>
            <select
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={form.countryToVisit}
              onChange={(e) => update("countryToVisit", e.target.value)}
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
            <p className="mt-1 text-[11px] text-slate-500">{branchCountriesEnabled ? "Options depend on the preferred branch you select." : "Showing the global destination list."}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
              Preferred branch <span className="text-rose-500">*</span>
            </label>
            <select
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={form.nearestOffice}
              onChange={(e) => update("nearestOffice", e.target.value)}
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
            <p className="mt-1 text-[11px] text-slate-500">Choose your preferred branch. Options come from branch settings.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
              City / location
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="Where you currently live"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
              Living status <span className="text-rose-500">*</span>
            </label>
            <select
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={form.livingStatus}
              onChange={(e) => update("livingStatus", e.target.value)}
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

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
              Any visa rejection for any country <span className="text-rose-500">*</span>
            </label>
            <select
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={form.visaRejectionAnyCountry}
              onChange={(e) => update("visaRejectionAnyCountry", e.target.value)}
            >
              {YES_NO_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
              Current education level
            </label>
            <select
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={form.currentEducationLevel}
              onChange={(e) => update("currentEducationLevel", e.target.value)}
            >
              <option value="">Select…</option>
              {EDUCATION_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          <CourseUniversityFields
            rows={form.courseEntries}
            onChange={(courseEntries) => update("courseEntries", courseEntries)}
          />

          <IntakeFields
            intakeMonth={form.intakeMonth}
            intakeYear={form.intakeYear}
            onIntakeMonthChange={(value) => update("intakeMonth", value)}
            onIntakeYearChange={(value) => update("intakeYear", value)}
            fieldClassName="w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            monthOptions={intakeOptions.months}
            yearOptions={intakeOptions.years}
          />

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
              Additional message
            </label>
            <textarea
              rows={4}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-y min-h-[96px]"
              value={form.message}
              onChange={(e) => update("message", e.target.value)}
              placeholder="Goals, timeline, questions…"
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isSaving}
              disabled={countries.length === 0 || !branchesReady || branches.length === 0}
            >
              Submit
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
