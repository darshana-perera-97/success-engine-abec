/** Country-specific visa checklist (Visa Pilot). Shared by VisaPilot and enrolment gate. */
export const VISA_WORKFLOWS = {
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
