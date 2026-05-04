import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { CheckCircle, AlertCircle, Lock, Unlock } from "lucide-react";
const VISA_WORKFLOWS = {
  Australia: [
    { name: "Pre-Flight Check", description: "Compliance Verification", items: ["FAR (Financial Audit)", "GTE/GS Approval", "OSHC"], blockerMessage: "Cannot proceed to Launch without FAR and GTE." },
    { name: "Launch", description: "Lodgment & Biometrics", items: ["ImmiAccount Lodgment", "HAP ID (Medical)", "Biometrics"], blockerMessage: "Cannot proceed to Landing without Biometrics." },
    { name: "Landing", description: "Decision & Pre-Departure", items: ["Visa Grant Notice", "VEVO Check", "Flight Ticket"], blockerMessage: "Cannot complete without Visa Grant Notice." }
  ],
  Canada: [
    { name: "Pre-Flight Check", description: "Compliance Verification", items: ["PAL (Provincial Attestation)", "GIC Certificate", "Upfront Medicals"], blockerMessage: "Cannot proceed to Launch without PAL and GIC." },
    { name: "Launch", description: "Lodgment & Biometrics", items: ["IRCC Portal Lodgment", "Biometrics Instruction Letter (BIL)"], blockerMessage: "Cannot proceed to Landing without BIL." },
    { name: "Landing", description: "Decision & Pre-Departure", items: ["Passport Request (PPR)", "POE Letter", "Flight Ticket"], blockerMessage: "Cannot complete without POE Letter." }
  ],
  UK: [
    { name: "Pre-Flight Check", description: "Compliance Verification", items: ["CAS Issuance", "TB Test Certificate", "Financials (28-day rule)"], blockerMessage: "Cannot proceed to Launch without CAS and TB Test." },
    { name: "Launch", description: "Lodgment & Biometrics", items: ["UKVI Lodgment", "IHS Payment", "VFS Appointment"], blockerMessage: "Cannot proceed to Landing without VFS Appointment." },
    { name: "Landing", description: "Decision & Pre-Departure", items: ["BRP Collection Letter", "Vignette", "Flight Ticket"], blockerMessage: "Cannot complete without Vignette." }
  ],
  Default: [
    { name: "Pre-Flight Check", description: "Compliance Verification", items: ["Financial Clearance", "Medical Check"], blockerMessage: "Cannot proceed to Launch without Financial Clearance." },
    { name: "Launch", description: "Lodgment & Biometrics", items: ["Portal Lodgment", "Biometrics"], blockerMessage: "Cannot proceed to Landing without Biometrics." },
    { name: "Landing", description: "Decision & Pre-Departure", items: ["Visa Decision", "Flight Ticket"], blockerMessage: "Cannot complete without Visa Decision." }
  ]
};
const VisaPilot = ({ student, onUpdateStudent }) => {
  const workflow = VISA_WORKFLOWS[student.country] || VISA_WORKFLOWS.Default;
  const [visaState, setVisaState] = useState(student.visa || {});
  let currentStageIndex = 0;
  for (let i = 0; i < workflow.length; i++) {
    const stage = workflow[i];
    const allCompleted = stage.items.every((item) => visaState[item] === "Completed");
    if (allCompleted) {
      currentStageIndex = i + 1;
    } else {
      break;
    }
  }
  if (currentStageIndex >= workflow.length) {
    currentStageIndex = workflow.length - 1;
  }
  const handleToggleItem = (item) => {
    const newState = {
      ...visaState,
      [item]: visaState[item] === "Completed" ? "Pending" : "Completed"
    };
    setVisaState(newState);
    if (onUpdateStudent) {
      onUpdateStudent({ ...student, visa: newState });
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-8", children: [
    /* @__PURE__ */ jsx("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-slate-800", children: "Visa Pilot Engine" }),
      /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-500 mt-1", children: [
        "Country-specific state machine for ",
        student.country
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "flex flex-col gap-6", children: workflow.map((stage, index) => {
      const isLocked = index > currentStageIndex;
      const isActive = index === currentStageIndex;
      const isCompleted = index < currentStageIndex || index === workflow.length - 1 && stage.items.every((item) => visaState[item] === "Completed");
      return /* @__PURE__ */ jsxs(
        "div",
        {
          className: `relative rounded-xl border p-5 transition-all ${isLocked ? "bg-slate-50 border-slate-200 opacity-60" : isActive ? "bg-white border-nexgenai-navy shadow-md ring-1 ring-nexgenai-navy/20" : "bg-emerald-50/30 border-emerald-200"}`,
          children: [
            /* @__PURE__ */ jsx("div", { className: "flex items-start justify-between mb-4", children: /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
                /* @__PURE__ */ jsxs("span", { className: `text-xs font-bold px-2 py-0.5 rounded-full ${isLocked ? "bg-slate-200 text-slate-500" : isActive ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`, children: [
                  "STAGE ",
                  index + 1
                ] }),
                isLocked && /* @__PURE__ */ jsx(Lock, { size: 14, className: "text-slate-400" }),
                isActive && /* @__PURE__ */ jsx(Unlock, { size: 14, className: "text-indigo-500" }),
                isCompleted && /* @__PURE__ */ jsx(CheckCircle, { size: 14, className: "text-emerald-500" })
              ] }),
              /* @__PURE__ */ jsx("h3", { className: `font-bold ${isLocked ? "text-slate-500" : "text-slate-800"}`, children: stage.name }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: stage.description })
            ] }) }),
            /* @__PURE__ */ jsx("div", { className: "space-y-3 mt-6", children: stage.items.map((item) => {
              const itemStatus = visaState[item] || "Pending";
              const itemCompleted = itemStatus === "Completed";
              return /* @__PURE__ */ jsx(
                "div",
                {
                  className: `flex items-center justify-between p-3 rounded-lg border ${isLocked ? "border-slate-200 bg-slate-100/50" : itemCompleted ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white hover:border-indigo-300 cursor-pointer transition-colors"}`,
                  onClick: () => !isLocked && handleToggleItem(item),
                  children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
                    /* @__PURE__ */ jsx("div", { className: `flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center ${itemCompleted ? "bg-emerald-500 border-emerald-600" : "border-slate-300 bg-slate-50"}`, children: itemCompleted && /* @__PURE__ */ jsx(CheckCircle, { size: 12, className: "text-white" }) }),
                    /* @__PURE__ */ jsx("span", { className: `text-sm font-medium ${itemCompleted ? "text-slate-700 line-through opacity-70" : "text-slate-700"}`, children: item })
                  ] })
                },
                item
              );
            }) }),
            isActive && !isCompleted && /* @__PURE__ */ jsxs("div", { className: "mt-5 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2", children: [
              /* @__PURE__ */ jsx(AlertCircle, { size: 16, className: "text-amber-600 flex-shrink-0 mt-0.5" }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-amber-800 font-medium leading-relaxed", children: stage.blockerMessage })
            ] })
          ]
        },
        stage.name
      );
    }) })
  ] });
};
export {
  VisaPilot
};
