import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { X, User, MapPin, DollarSign, Phone, Mail, KeyRound } from "lucide-react";
import { Button } from "./Button";
const AddStudentModal = ({ isOpen, onClose, onSubmit, userRole, currentUser, counselorOptions = [] }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    country: "UK",
    branch: "Colombo HQ",
    email: "",
    phone: "",
    ielts: "",
    gpa: "",
    password: "",
    status: "Inquiry",
    budget: "",
    priority: "Medium",
    counselor: ""
  });
  const generatePassword = () => {
    const random = Math.random().toString(36).slice(-4);
    const nextPassword = `Stu@${new Date().getFullYear()}${random}`;
    setFormData((prev) => ({ ...prev, password: nextPassword }));
  };
  useEffect(() => {
    if (!isOpen) return;
    if (userRole !== "Counselor") return;
    const currentUserId = currentUser?.id || "";
    const byId = counselorOptions.find((item) => item.id === currentUserId);
    const byEmail = counselorOptions.find(
      (item) => String(item.email || "").toLowerCase() === String(currentUser?.email || "").toLowerCase()
    );
    const selectedCounselorId = byId?.id || byEmail?.id || currentUserId;
    if (!selectedCounselorId) return;
    setFormData((prev) => ({ ...prev, counselor: selectedCounselorId }));
  }, [isOpen, userRole, currentUser, counselorOptions]);
  if (!isOpen) return null;
  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    const newStudent = {
      name: formData.name,
      country: formData.country,
      branch: formData.branch,
      email: formData.email,
      phone: formData.phone,
      password: formData.password,
      ielts: formData.ielts || "Pending",
      gpa: formData.gpa,
      status: formData.status,
      budget: formData.budget,
      priority: formData.priority,
      counselor: formData.counselor || "Unassigned",
      notes: "Newly added via CRM.",
      lastEducationDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      // Default to today
      documents: []
    };
    setIsSaving(true);
    const result = await onSubmit(newStudent);
    setIsSaving(false);
    if (!result?.ok) {
      setFormError(result?.error || "Failed to create student.");
      return;
    }
    onClose();
  };
  return /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 scale-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] my-auto", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50 flex-shrink-0", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-[#0F172A]", children: "Onboard New Student" }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Enter initial details to start the success engine." })
      ] }),
      /* @__PURE__ */ jsx("button", { onClick: onClose, className: "text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-md", children: /* @__PURE__ */ jsx(X, { size: 20 }) })
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "p-6 space-y-6 overflow-y-auto flex-1 min-h-0", children: [
      formError ? /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: formError }) : null,
      /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsx("h4", { className: "text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-gray-100 pb-2 mb-3", children: "Personal Details" }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "col-span-1 sm:col-span-2", children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Full Name" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(User, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  required: true,
                  className: "w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none",
                  value: formData.name,
                  onChange: (e) => handleChange("name", e.target.value),
                  placeholder: "e.g. Jane Doe"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Email" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(Mail, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "email",
                  required: true,
                  className: "w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none",
                  value: formData.email,
                  onChange: (e) => handleChange("email", e.target.value),
                  placeholder: "jane@example.com"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Phone" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(Phone, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "tel",
                  required: true,
                  className: "w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none",
                  value: formData.phone,
                  onChange: (e) => handleChange("phone", e.target.value),
                  placeholder: "+94 77 ..."
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "col-span-1 sm:col-span-2", children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Student Portal Password" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(KeyRound, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  required: true,
                  className: "w-full pl-9 pr-28 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none",
                  value: formData.password,
                  onChange: (e) => handleChange("password", e.target.value),
                  placeholder: "Set password or auto-generate"
                }
              ),
              /* @__PURE__ */ jsx(Button, { type: "button", size: "sm", className: "absolute right-1.5 top-1.5", onClick: generatePassword, children: "Auto Generate" })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsx("h4", { className: "text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-gray-100 pb-2 mb-3", children: "Academic & Preferences" }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Target Country" }),
            /* @__PURE__ */ jsx(
              "select",
              {
                className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                value: formData.country,
                onChange: (e) => handleChange("country", e.target.value),
                children: ["UK", "Canada", "Australia", "New Zealand", "USA"].map((c) => /* @__PURE__ */ jsx("option", { value: c, children: c }, c))
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Origin Branch" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(MapPin, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
              /* @__PURE__ */ jsx(
                "select",
                {
                  className: "w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                  value: formData.branch,
                  onChange: (e) => handleChange("branch", e.target.value),
                  children: ["Colombo HQ", "Kandy", "Galle", "Jaffna"].map((b) => /* @__PURE__ */ jsx("option", { value: b, children: b }, b))
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "IELTS Score" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                value: formData.ielts,
                onChange: (e) => handleChange("ielts", e.target.value),
                placeholder: "e.g. 7.0 or Pending"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "GPA" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                required: true,
                className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                value: formData.gpa,
                onChange: (e) => handleChange("gpa", e.target.value),
                placeholder: "e.g. 3.5"
              }
            )
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsx("h4", { className: "text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-gray-100 pb-2 mb-3", children: "CRM Configuration" }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Annual Budget (USD)" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(DollarSign, { className: "absolute left-3 top-2.5 text-slate-400", size: 14 }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  className: "w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                  value: formData.budget,
                  onChange: (e) => handleChange("budget", e.target.value),
                  placeholder: "25000"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Lead Priority" }),
            /* @__PURE__ */ jsxs(
              "select",
              {
                className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                value: formData.priority,
                onChange: (e) => handleChange("priority", e.target.value),
                children: [
                  /* @__PURE__ */ jsx("option", { value: "Low", children: "Low" }),
                  /* @__PURE__ */ jsx("option", { value: "Medium", children: "Medium" }),
                  /* @__PURE__ */ jsx("option", { value: "High", children: "High" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 mb-1 block", children: "Assign Counselor" }),
            /* @__PURE__ */ jsxs(
              "select",
              {
                className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                value: formData.counselor,
                onChange: (e) => handleChange("counselor", e.target.value),
                disabled: userRole === "Counselor",
                children: [
                  userRole === "Counselor" ? /* @__PURE__ */ jsx("option", { value: formData.counselor || "", children: currentUser?.name || "Logged Counselor" }) : /* @__PURE__ */ jsx("option", { value: "", children: "Auto-Assign" }),
                  counselorOptions.length === 0 ? /* @__PURE__ */ jsx("option", { value: "", disabled: true, children: "No counselors available" }) : null,
                  ...counselorOptions.map((item) => /* @__PURE__ */ jsx("option", { value: item.id, children: item.name }, item.id))
                ]
              }
            )
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "pt-4 flex flex-wrap gap-3 justify-end items-center border-t border-gray-100 mt-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
          /* @__PURE__ */ jsx(Button, { type: "button", variant: "ghost", onClick: onClose, disabled: isSaving, children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { type: "submit", isLoading: isSaving, className: "px-6 bg-[#0F172A]", children: "Add Student" })
        ] })
      ] })
    ] })
  ] }) });
};
export {
  AddStudentModal
};
