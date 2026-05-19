import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getBranches, getCountries } from "../authApi";
import { InlineLoading } from "./LoadingPlaceholder";
import {
  emptyInquiryForm,
  InquiryIntakeForm,
  inquiryFormToStudentFields,
  sanitizeInquiryExamResults,
  validateInquiryFormRequired
} from "./InquiryIntakeForm";

function resolveCounselorId(userRole, currentUser, counselorOptions) {
  if (userRole !== "Counselor") return "";
  const currentUserId = currentUser?.id || "";
  const byId = counselorOptions.find((item) => item.id === currentUserId);
  const byEmail = counselorOptions.find(
    (item) => String(item.email || "").toLowerCase() === String(currentUser?.email || "").toLowerCase()
  );
  return byId?.id || byEmail?.id || currentUserId || "";
}

function ieltsFromExamResults(examResults) {
  const rows = sanitizeInquiryExamResults(examResults);
  const ieltsRow = rows.find((r) => /ielts/i.test(r.examName));
  return ieltsRow?.result || "Pending";
}

const AddStudentModal = ({
  isOpen,
  onClose,
  onSubmit,
  onUpdateStudent,
  userRole,
  currentUser,
  counselorOptions = []
}) => {
  const [countries, setCountries] = useState([]);
  const [offices, setOffices] = useState([]);
  const [optionsReady, setOptionsReady] = useState(false);
  const [form, setForm] = useState(() => emptyInquiryForm());
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [assignedCounselorId, setAssignedCounselorId] = useState("");
  const wasOpenRef = useRef(false);

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
    if (!isOpen) return;
    setAssignedCounselorId((prev) => prev || resolveCounselorId(userRole, currentUser, counselorOptions));
  }, [isOpen, userRole, currentUser?.id, currentUser?.email, counselorOptions]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    const validation = validateInquiryFormRequired(form);
    if (!validation.ok) {
      setFormError(validation.error);
      return;
    }
    const random = Math.random().toString(36).slice(-5);
    const password = `Stu@${new Date().getFullYear()}${random}`;
    const counselor = assignedCounselorId || "Unassigned";
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
      budget: fields.budget,
      priority: fields.priority,
      counselor,
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
          notes: created.notes || "Newly added via CRM."
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[85vh] flex flex-col my-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Onboard New Student</h3>
            <p className="text-xs text-slate-500 mt-0.5">Enter student details to onboard.</p>
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
        ) : (
          <InquiryIntakeForm
            form={form}
            setForm={setForm}
            countries={countries}
            offices={offices}
            error={formError}
            isSaving={isSaving}
            onSubmit={handleSubmit}
            onCancel={handleClose}
            submitLabel="Add Student"
            cancelLabel="Cancel"
          />
        )}
      </div>
    </div>
  );
};

export { AddStudentModal };
