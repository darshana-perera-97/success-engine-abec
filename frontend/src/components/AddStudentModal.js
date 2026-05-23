import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { getBranches, getCountries } from "../authApi";
import { branchesMatch } from "../pipeline";
import { InlineLoading } from "./LoadingPlaceholder";
import { Button } from "./Button";
import {
  emptyInquiryForm,
  InquiryIntakeForm,
  inquiryFormToStudentFields,
  sanitizeInquiryExamResults,
  validateInquiryFormRequired
} from "./InquiryIntakeForm";
import { isCounselorEquivalentPortalRole } from "../roles";

function resolveCounselorId(userRole, currentUser, counselorOptions) {
  if (!isCounselorEquivalentPortalRole(userRole)) return "";
  const currentUserId = currentUser?.id || "";
  const byId = counselorOptions.find((item) => item.id === currentUserId);
  const byEmail = counselorOptions.find(
    (item) => String(item.email || "").toLowerCase() === String(currentUser?.email || "").toLowerCase()
  );
  return byId?.id || byEmail?.id || currentUserId || "";
}

function filterAssignableCounselors(userRole, scopeBranch, counselorOptions) {
  const list = counselorOptions || [];
  if (userRole === "Admin") return list;
  if (userRole === "Manager") {
    const branch = String(scopeBranch || "").trim();
    if (!branch) return list;
    return list.filter((c) => branchesMatch(c.branch, branch));
  }
  return list;
}

function ieltsFromExamResults(examResults) {
  const rows = sanitizeInquiryExamResults(examResults);
  const ieltsRow = rows.find((r) => /ielts/i.test(r.examName));
  return ieltsRow?.result || "Pending";
}

function counselorOptionLabel(item) {
  const name = item.name || item.email || item.id;
  const branch = String(item.branch || "").trim();
  return branch ? `${name} (${branch})` : name;
}

const AddStudentModal = ({
  isOpen,
  onClose,
  onSubmit,
  onUpdateStudent,
  userRole,
  currentUser,
  counselorOptions = [],
  scopeBranch = null
}) => {
  const [countries, setCountries] = useState([]);
  const [offices, setOffices] = useState([]);
  const [optionsReady, setOptionsReady] = useState(false);
  const [form, setForm] = useState(() => emptyInquiryForm());
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [assignedCounselorId, setAssignedCounselorId] = useState("");
  const [step, setStep] = useState(1);
  const wasOpenRef = useRef(false);

  const showAssignStep = userRole === "Admin" || userRole === "Manager";
  const totalSteps = showAssignStep ? 2 : 1;

  const assignableCounselors = useMemo(
    () => filterAssignableCounselors(userRole, scopeBranch, counselorOptions),
    [userRole, scopeBranch, counselorOptions]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [countriesRes, branchesRes] = await Promise.all([getCountries(), getBranches()]);
        if (cancelled) return;
        const countryList = countriesRes.ok ? countriesRes.data || [] : [];
        const officeList = branchesRes.ok
          ? (branchesRes.data || []).map((b) => String(b?.location || "").trim()).filter(Boolean)
          : [];
        setCountries(countryList);
        setOffices(officeList);
      } finally {
        if (!cancelled) setOptionsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!justOpened) return;
    setFormError("");
    setForm(emptyInquiryForm({ countries, offices }));
    setAssignedCounselorId("");
    setStep(1);
  }, [isOpen, countries, offices]);

  useEffect(() => {
    if (!isOpen || !optionsReady) return;
    setForm((prev) => {
      const countryToVisit = prev.countryToVisit || countries[0] || "";
      const nearestOffice = prev.nearestOffice || offices[0] || "";
      if (countryToVisit === prev.countryToVisit && nearestOffice === prev.nearestOffice) return prev;
      return { ...prev, countryToVisit, nearestOffice };
    });
  }, [isOpen, optionsReady, countries, offices]);

  useEffect(() => {
    if (!isOpen || showAssignStep) return;
    setAssignedCounselorId((prev) => prev || resolveCounselorId(userRole, currentUser, counselorOptions));
  }, [isOpen, showAssignStep, userRole, currentUser?.id, currentUser?.email, counselorOptions]);

  useEffect(() => {
    if (!isOpen || step !== 2 || !showAssignStep) return;
    if (assignedCounselorId) return;
    if (assignableCounselors.length === 1) {
      setAssignedCounselorId(String(assignableCounselors[0].id || ""));
    }
  }, [isOpen, step, showAssignStep, assignableCounselors, assignedCounselorId]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  const resolveCounselorForSubmit = () => {
    if (showAssignStep) {
      return assignedCounselorId || "Unassigned";
    }
    return assignedCounselorId || resolveCounselorId(userRole, currentUser, counselorOptions) || "Unassigned";
  };

  const handleFinalSubmit = async () => {
    setFormError("");
    const validation = validateInquiryFormRequired(form, { requireBudget: false });
    if (!validation.ok) {
      setFormError(validation.error);
      return;
    }
    if (showAssignStep && !String(assignedCounselorId || "").trim()) {
      setFormError("Please select a counselor to assign this lead.");
      return;
    }

    const random = Math.random().toString(36).slice(-5);
    const password = `Stu@${new Date().getFullYear()}${random}`;
    const counselorId = resolveCounselorForSubmit();
    const selectedCounselor = assignableCounselors.find((c) => String(c.id) === String(counselorId))
      || counselorOptions.find((c) => String(c.id) === String(counselorId));
    const fields = inquiryFormToStudentFields(form);
    const createPayload = {
      name: fields.name,
      country: fields.country,
      branch: fields.branch,
      email: fields.email,
      phone: fields.phone,
      password,
      ielts: ieltsFromExamResults(form.examResults),
      gpa: "0.0",
      status: "Inquiry",
      budget: fields.budget || "",
      budgetCurrency: fields.budgetCurrency || "LKR",
      priority: fields.priority,
      counselor: counselorId,
      counselorName: selectedCounselor?.name || "",
      notes: "Newly added via CRM.",
      city: fields.city,
      currentEducationLevel: fields.currentEducationLevel,
      intendedProgram: fields.intendedProgram,
      message: fields.message,
      lastEducationDate: new Date().toISOString().split("T")[0],
      documents: []
    };
    setIsSaving(true);
    try {
      const result = await onSubmit(createPayload);
      if (!result?.ok) {
        setFormError(result?.error || "Failed to create student.");
        return;
      }
      const created = result.data;
      if (created?.id && onUpdateStudent) {
        const fullStudent = inquiryFormToStudentFields(form, {
          ...created,
          status: created.status || "Inquiry",
          notes: created.notes || "Newly added via CRM.",
          counselor: counselorId,
          counselorName: selectedCounselor?.name || created.counselorName || ""
        });
        const updated = await onUpdateStudent(fullStudent);
        if (updated?.ok === false) {
          setFormError(updated.error || "Student was created but extra details could not be saved.");
          return;
        }
      }
      onClose();
    } catch {
      setFormError("Failed to create student.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStep1Continue = (e) => {
    e.preventDefault();
    setFormError("");
    const validation = validateInquiryFormRequired(form, { requireBudget: false });
    if (!validation.ok) {
      setFormError(validation.error);
      return;
    }
    if (showAssignStep) {
      setAssignedCounselorId("");
      setStep(2);
      return;
    }
    handleFinalSubmit();
  };

  const assignStepDescription =
    userRole === "Manager" && scopeBranch
      ? `Counselors at ${scopeBranch}.`
      : userRole === "Admin"
        ? "All counselors in the organization."
        : "Select a counselor for this lead.";

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[85vh] flex flex-col my-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Onboard New Student</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {step === 1
                ? showAssignStep
                  ? `Step 1 of ${totalSteps} — collect student details.`
                  : "Enter student details — you will be assigned as the counselor."
                : `Step 2 of ${totalSteps} — assign lead to a counselor.`}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  step === 1 ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-500"
                }`}
              >
                1. Details
              </span>
              {showAssignStep ? (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    step === 2 ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  2. Assign
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {!optionsReady ? (
          <InlineLoading label="Loading form options…" className="py-16" />
        ) : step === 1 ? (
          <InquiryIntakeForm
            form={form}
            setForm={setForm}
            countries={countries}
            offices={offices}
            error={formError}
            isSaving={isSaving}
            onSubmit={handleStep1Continue}
            onCancel={handleClose}
            submitLabel={showAssignStep ? "Continue" : "Add Student"}
            cancelLabel="Cancel"
            showBudgetField={false}
          />
        ) : (
          <form
            className="flex flex-col flex-1 min-h-0"
            onSubmit={(e) => {
              e.preventDefault();
              handleFinalSubmit();
            }}
          >
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">{form.name || "—"}</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {form.email || "—"}
                  {form.nearestOffice ? ` · ${form.nearestOffice}` : ""}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Assign counselor
                </label>
                <p className="mb-2 text-xs text-slate-500">{assignStepDescription}</p>
                {assignableCounselors.length === 0 ? (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    No counselors available for this branch. Add counselors in team management first.
                  </p>
                ) : (
                  <select
                    value={assignedCounselorId}
                    onChange={(e) => setAssignedCounselorId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:border-indigo-500 bg-white"
                    disabled={isSaving}
                  >
                    <option value="">Select counselor</option>
                    {assignableCounselors.map((item) => (
                      <option key={item.id} value={item.id}>
                        {counselorOptionLabel(item)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {formError ? (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                  {formError}
                </p>
              ) : null}
            </div>
            <div className="flex justify-between gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFormError("");
                  setStep(1);
                }}
                disabled={isSaving}
              >
                <ChevronLeft size={16} className="mr-1" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={handleClose} disabled={isSaving}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isLoading={isSaving}
                  disabled={assignableCounselors.length === 0 || !assignedCounselorId}
                >
                  Add Student
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export { AddStudentModal };
