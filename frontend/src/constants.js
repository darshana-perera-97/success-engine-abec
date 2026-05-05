import { PIPELINE_STEPS } from "./pipeline";
/** @deprecated Use STAGE_CONFIG in pipeline.js for SLA durations */
const STAGE_SLA_DAYS = {
  Inquiry: 1 / 24,
  Application: 1,
  Documentation: 7,
  "Interview training": 3,
  Visa: 30,
  Enrolled: 14
};

const COUNTRY_CHECKLISTS = {
  "Australia": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "High-resolution color scan (All pages)." },
        { docType: "National ID", description: "Front/Back + Certified Translation." },
        { docType: "Birth Certificate", description: "Original + Certified Translation." },
        { docType: "Academic", description: "A/L & O/L authenticated by MFA (e-DAS)." },
        { docType: "English", description: "IELTS/PTE Academic Result." },
        { docType: "Professional CV", description: "Chronological with no gaps." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "Direct or Authorized Agent portal." },
        { docType: "Backlog Summary", description: "(Mandatory for PG/Master's)." },
        { docType: "References", description: "Two Academic Reference Letters." },
        { docType: "Draft GS", description: 'Preliminary "Genuine Student" statement.' }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "Offer Letter Acceptance", description: "Offer Letter Acceptance." },
        { docType: "CoE", description: "Confirmation of Enrolment issued." },
        { docType: "Financials", description: "AUD 29,710 + Tuition (3-month history/Loan)." },
        { docType: "OSHC", description: "Health cover for full visa duration." },
        { docType: "HAP ID", description: "Medical examination generated." },
        { docType: "Final GS", description: "Finalized 2026 Genuine Student prompts." }
      ]
    }
  ],
  "Canada": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "All pages (Travel History focused)." },
        { docType: "National ID & Birth Certificate", description: "National ID & Translated Birth Certificate." },
        { docType: "Academic", description: "A/L & O/L Transcripts." },
        { docType: "English", description: "IELTS (6.0 min band) or PTE." },
        { docType: "WES Evaluation", description: "(If required for specific Master's)." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Predicted Grade Form", description: "(If currently in school)." },
        { docType: "References", description: "Employment/Academic letters." },
        { docType: "Portal Submission", description: "OUAC or Direct DLI Portal." },
        { docType: "Draft SOP", description: "Focus on program choice logic." }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "LOA", description: "Letter of Acceptance from DLI." },
        { docType: "PAL", description: "Provincial Attestation Letter facilitated by Uni." },
        { docType: "GIC Receipt", description: "Proof of CAD 20,635 deposit." },
        { docType: "Tuition Receipt", description: "First-year fee payment." },
        { docType: "Final SOP", description: 'Focus on "Temporary Resident Intent."' }
      ]
    }
  ],
  "UK": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "Bio-data + all stamped pages." },
        { docType: "National ID & Birth Certificate", description: "National ID & Translated Birth Certificate." },
        { docType: "Academic", description: "O/L & A/L Final Certificates." },
        { docType: "English", description: "SELT (IELTS for UKVI)." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "UCAS/Direct Portal Submission." },
        { docType: "Personal Statement", description: "(2026 Undergraduate 3-question format)." },
        { docType: "References", description: "1 for UG / 2 for PG." }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "CAS", description: "Confirmation of Acceptance for Studies Reference." },
        { docType: "Financials", description: "\xA313,761 (London) / \xA310,539 (Outside) held for 28 days." },
        { docType: "IHS Payment", description: "Immigration Health Surcharge reference." },
        { docType: "TB Test", description: "Certificate from approved clinic." },
        { docType: "ATAS Certificate", description: "(If required for specific Science/Tech subjects)." }
      ]
    }
  ],
  "New Zealand": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "All pages + 2-3 Photos." },
        { docType: "National ID & Birth Certificate", description: "National ID & Translated Birth Certificate." },
        { docType: "Academic", description: "A/L (3 'C' passes min) & O/L." },
        { docType: "English", description: "IELTS/PTE Official Result." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "Portal Submission." },
        { docType: "References", description: "Academic/Employment." },
        { docType: "Work Experience Evidence", description: "(For PG pathways)." }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "Offer of Place", description: "From NZQA-approved provider." },
        { docType: "Tuition Receipt", description: "Payment for first year." },
        { docType: "Financials", description: "NZD 20,000 + 6-month source history." },
        { docType: "X-Ray Certificate", description: "(For stays > 6 months)." },
        { docType: "Final SOP", description: '"Genuine Intending Student" focus.' }
      ]
    }
  ],
  "Japan": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "All pages + Family Registry." },
        { docType: "Birth Certificate", description: "Original + Notarized Translation." },
        { docType: "Academic", description: "O/L & A/L Original + Translation." },
        { docType: "Language", description: "150-hour Japanese study cert or JLPT N5." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "University-specific Portal Submission (T-ADS/PEAK/G30)." },
        { docType: "Research Plan", description: "(Postgraduate only)." },
        { docType: "English", description: "TOEFL iBT preferred/accepted." }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "COE", description: "Certificate of Eligibility issued." },
        { docType: "Financial Sponsor Docs", description: "3yr Tax Returns + Income Cert + Employment Letter." },
        { docType: "Final SOP", description: "Study logic in English/Japanese." }
      ]
    }
  ],
  "Singapore": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "Bio-data + all pages." },
        { docType: "Birth Certificate", description: "Notarized English translation." },
        { docType: "Academic", description: "O/L & A/L Certificates + Transcripts." },
        { docType: "English", description: "IELTS/TOEFL." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "SAT/ACT Scores", description: "(For NUS/NTU/SMU)." },
        { docType: "CCA/Leadership List", description: "Co-curricular records." },
        { docType: "MTL Exemption Request", description: "Mother Tongue Exemption Request." }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "IPA", description: "In-Principle Approval via SOLAR system." },
        { docType: "SOLAR eForm 16", description: "Printed/Signed." },
        { docType: "Tuition Grant Decision", description: "MOE Bond commitment." },
        { docType: "Medical Report", description: "HIV/TB screening results." }
      ]
    }
  ],
  "Default": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "High-resolution color scan of bio-data page." },
        { docType: "National ID", description: "Front and back." },
        { docType: "Academic", description: "O/L and A/L Certificates." },
        { docType: "English", description: "IELTS/PTE Result." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "Portal Submission." },
        { docType: "SOP", description: "Statement of Purpose." }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "Offer Letter", description: "Offer Letter Acceptance." },
        { docType: "Financials", description: "Bank Balance Certificate." }
      ]
    }
  ]
};

export {
  COUNTRY_CHECKLISTS,
  PIPELINE_STEPS,
  STAGE_SLA_DAYS
};
