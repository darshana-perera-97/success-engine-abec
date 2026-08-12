import { jsx, jsxs } from "react/jsx-runtime";
import { motion } from "framer-motion";
import { Mail, Phone, MapPin } from "lucide-react";
import {
  CV_TEMPLATE_CLASSIC_PROFESSIONAL,
  CV_TEMPLATES,
  buildCvTemplateMockData,
  resolveCvTemplateId,
} from "../utils/cvTemplates";
import { CheckCircle } from "lucide-react";

const DEFAULT_SKILLS = ["AI Product Design", "GTM Strategy", "B2B Growth", "UI/UX", "SaaS", "Framer", "Product Management"];

function ModernEditorialPreview({ data, activeFlow }) {
  return /* @__PURE__ */ jsxs("div", { className: "p-12 bg-white min-h-[800px]", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start border-b-2 border-slate-900 pb-8 mb-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex gap-6 items-start", children: [
        data.profilePicture && /* @__PURE__ */ jsx("div", { className: "w-24 h-24 rounded-2xl overflow-hidden border-2 border-slate-900 flex-shrink-0", children: /* @__PURE__ */ jsx("img", { src: data.profilePicture, alt: "Profile", className: "w-full h-full object-cover" }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-slate-900 uppercase tracking-tighter", children: data.name }),
          /* @__PURE__ */ jsx("p", { className: "text-indigo-600 font-bold mt-1", children: data.role })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "text-right text-xs text-slate-500 space-y-1", children: [
        /* @__PURE__ */ jsx("p", { children: data.email }),
        /* @__PURE__ */ jsx("p", { children: data.phone }),
        /* @__PURE__ */ jsx("p", { children: "Colombo, Sri Lanka" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-12 gap-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "col-span-4 space-y-8 border-r border-slate-100 pr-8", children: [
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-4", children: "Contact" }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-2 text-[11px] text-slate-600 font-medium", children: [
            /* @__PURE__ */ jsxs("p", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(Mail, { size: 12, className: "text-indigo-400" }),
              " ",
              data.email
            ] }),
            /* @__PURE__ */ jsxs("p", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(Phone, { size: 12, className: "text-indigo-400" }),
              " ",
              data.phone
            ] }),
            /* @__PURE__ */ jsxs("p", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(MapPin, { size: 12, className: "text-indigo-400" }),
              " Colombo, Sri Lanka"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-4", children: "Skills" }),
          /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1.5", children: DEFAULT_SKILLS.map((skill) => /* @__PURE__ */ jsx("span", { className: "text-[9px] font-bold bg-slate-50 text-slate-700 px-2 py-1 rounded border border-slate-100 uppercase", children: skill }, skill)) })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-4", children: "Test Scores" }),
          /* @__PURE__ */ jsx("div", { className: "space-y-3", children: data.testScores.map((score, i) => /* @__PURE__ */ jsxs("div", { className: "bg-slate-50 p-3 rounded-xl border border-slate-100", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-[10px] font-bold mb-1", children: [
              /* @__PURE__ */ jsx("span", { children: score.name }),
              /* @__PURE__ */ jsxs("span", { className: "text-indigo-600", children: [
                score.score,
                " Overall"
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "w-full bg-slate-200 h-1 rounded-full overflow-hidden", children: /* @__PURE__ */ jsx("div", { className: "bg-indigo-500 h-full", style: { width: `${Math.min(100, parseFloat(score.score) / 9 * 100)}%` } }) })
          ] }, i)) })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-4", children: "Languages" }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-[10px] font-bold", children: [
              /* @__PURE__ */ jsx("span", { className: "text-slate-600", children: "English" }),
              /* @__PURE__ */ jsx("span", { className: "text-indigo-600", children: "Native" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-[10px] font-bold", children: [
              /* @__PURE__ */ jsx("span", { className: "text-slate-600", children: "Sinhala" }),
              /* @__PURE__ */ jsx("span", { className: "text-indigo-600", children: "Native" })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "col-span-8 space-y-10", children: [
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsxs("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-6 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "w-6 h-[1px] bg-slate-900" }),
            " Professional Experience"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "space-y-8", children: data.experience.map((exp, i) => /* @__PURE__ */ jsxs("div", { className: "relative pl-6 border-l border-slate-100", children: [
            /* @__PURE__ */ jsx("div", { className: "absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-indigo-600" }),
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-baseline mb-1", children: [
              /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 text-base", children: exp.title }),
              /* @__PURE__ */ jsx("span", { className: "text-[10px] font-black text-slate-400 uppercase tracking-wider", children: exp.period })
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-indigo-600 font-bold mb-3", children: exp.company }),
            /* @__PURE__ */ jsxs("ul", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxs("li", { className: "text-xs text-slate-600 leading-relaxed flex gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "text-indigo-400 mt-1.5 w-1 h-1 rounded-full bg-indigo-400 shrink-0" }),
                "Spearheaded GTM strategies resulting in 40% market share growth within the first year."
              ] }),
              /* @__PURE__ */ jsxs("li", { className: "text-xs text-slate-600 leading-relaxed flex gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "text-indigo-400 mt-1.5 w-1 h-1 rounded-full bg-indigo-400 shrink-0" }),
                "Orchestrated cross-functional teams to deliver AI-driven B2B solutions for global clients."
              ] })
            ] })
          ] }, i)) })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsxs("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-6 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "w-6 h-[1px] bg-slate-900" }),
            " Education"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-6", children: [
            activeFlow === "update" && /* @__PURE__ */ jsxs(
              motion.div,
              {
                initial: { opacity: 0, x: -10 },
                animate: { opacity: 1, x: 0 },
                className: "p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl relative overflow-hidden",
                children: [
                  /* @__PURE__ */ jsx("div", { className: "absolute top-0 right-0 p-2", children: /* @__PURE__ */ jsx("span", { className: "text-[8px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase", children: "New" }) }),
                  /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 text-sm", children: "Master of Business Administration (MBA)" }),
                  /* @__PURE__ */ jsx("p", { className: "text-xs text-indigo-600 font-bold", children: "In Progress - 2026" }),
                  /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-500 mt-1 italic", children: "Specializing in AI Strategy & Digital Transformation" })
                ]
              }
            ),
            data.education.map((edu, i) => /* @__PURE__ */ jsxs("div", { className: "pl-6 border-l border-slate-100", children: [
              /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 text-sm", children: edu.degree }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 font-medium", children: edu.school })
            ] }, i))
          ] })
        ] }),
        data.customSections.map((section) => /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsxs("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-6 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "w-6 h-[1px] bg-slate-900" }),
            " ",
            section.title
          ] }),
          /* @__PURE__ */ jsx("div", { className: "pl-6 border-l border-slate-100", children: /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-600 leading-relaxed whitespace-pre-wrap", children: section.content }) })
        ] }, section.id))
      ] })
    ] })
  ] });
}

function ClassicProfessionalPreview({ data, activeFlow }) {
  return /* @__PURE__ */ jsxs("div", { className: "bg-white min-h-[800px]", children: [
    /* @__PURE__ */ jsxs("div", { className: "bg-slate-800 text-white px-12 py-10", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-8", children: [
        data.profilePicture && /* @__PURE__ */ jsx("div", { className: "w-28 h-28 rounded-full overflow-hidden border-4 border-white/20 flex-shrink-0", children: /* @__PURE__ */ jsx("img", { src: data.profilePicture, alt: "Profile", className: "w-full h-full object-cover" }) }),
        /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsx("h1", { className: "text-4xl font-serif font-bold tracking-tight", children: data.name }),
          /* @__PURE__ */ jsx("p", { className: "text-slate-300 text-lg mt-2", children: data.role }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-x-6 gap-y-1 mt-4 text-sm text-slate-300", children: [
            data.email && /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
              /* @__PURE__ */ jsx(Mail, { size: 14 }),
              data.email
            ] }),
            data.phone && /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
              /* @__PURE__ */ jsx(Phone, { size: 14 }),
              data.phone
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
              /* @__PURE__ */ jsx(MapPin, { size: 14 }),
              "Colombo, Sri Lanka"
            ] })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-12 gap-0", children: [
      /* @__PURE__ */ jsxs("div", { className: "col-span-8 px-12 py-10 space-y-10", children: [
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-sm font-bold text-slate-800 uppercase tracking-widest border-b border-slate-300 pb-2 mb-5", children: "Professional Experience" }),
          /* @__PURE__ */ jsx("div", { className: "space-y-7", children: data.experience.map((exp, i) => /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-baseline gap-4", children: [
              /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900", children: exp.title }),
              /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-500 whitespace-nowrap", children: exp.period })
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 font-medium mt-0.5", children: exp.company }),
            /* @__PURE__ */ jsxs("ul", { className: "mt-3 space-y-1.5 list-disc list-inside text-xs text-slate-600 leading-relaxed", children: [
              /* @__PURE__ */ jsx("li", { children: "Led cross-functional initiatives and delivered measurable outcomes for stakeholders." }),
              /* @__PURE__ */ jsx("li", { children: "Applied structured problem-solving to improve process efficiency and quality." })
            ] })
          ] }, i)) })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-sm font-bold text-slate-800 uppercase tracking-widest border-b border-slate-300 pb-2 mb-5", children: "Education" }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
            activeFlow === "update" && /* @__PURE__ */ jsxs("div", { className: "p-4 bg-slate-50 border border-slate-200 rounded-lg", children: [
              /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 text-sm", children: "Master of Business Administration (MBA)" }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-600 mt-1", children: "In Progress — 2026 · AI Strategy & Digital Transformation" })
            ] }),
            data.education.map((edu, i) => /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 text-sm", children: edu.degree }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-600 mt-0.5", children: edu.school })
            ] }, i))
          ] })
        ] }),
        data.customSections.map((section) => /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-sm font-bold text-slate-800 uppercase tracking-widest border-b border-slate-300 pb-2 mb-5", children: section.title }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-600 leading-relaxed whitespace-pre-wrap", children: section.content })
        ] }, section.id))
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "col-span-4 bg-slate-50 px-8 py-10 space-y-8 border-l border-slate-200", children: [
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-xs font-bold text-slate-700 uppercase tracking-widest mb-4", children: "Test Scores" }),
          /* @__PURE__ */ jsx("div", { className: "space-y-3", children: data.testScores.map((score, i) => /* @__PURE__ */ jsxs("div", { className: "bg-white border border-slate-200 rounded-lg px-3 py-2", children: [
            /* @__PURE__ */ jsx("p", { className: "text-[10px] font-bold text-slate-500 uppercase", children: score.name }),
            /* @__PURE__ */ jsx("p", { className: "text-lg font-bold text-slate-800", children: score.score })
          ] }, i)) })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-xs font-bold text-slate-700 uppercase tracking-widest mb-4", children: "Core Skills" }),
          /* @__PURE__ */ jsx("ul", { className: "space-y-2 text-xs text-slate-700", children: DEFAULT_SKILLS.slice(0, 6).map((skill) => /* @__PURE__ */ jsx("li", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" }),
            skill
          ] }, skill)) })
        ] }),
        /* @__PURE__ */ jsxs("section", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-xs font-bold text-slate-700 uppercase tracking-widest mb-4", children: "Languages" }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-2 text-xs text-slate-700", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx("span", { children: "English" }),
              /* @__PURE__ */ jsx("span", { className: "font-semibold", children: "Native" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx("span", { children: "Sinhala" }),
              /* @__PURE__ */ jsx("span", { className: "font-semibold", children: "Native" })
            ] })
          ] })
        ] })
      ] })
    ] })
  ] });
}

export function CvTemplatePreview({ templateId, data, activeFlow }) {
  const resolvedId = resolveCvTemplateId(templateId);
  if (resolvedId === CV_TEMPLATE_CLASSIC_PROFESSIONAL) {
    return /* @__PURE__ */ jsx(ClassicProfessionalPreview, { data, activeFlow });
  }
  return /* @__PURE__ */ jsx(ModernEditorialPreview, { data, activeFlow });
}

export function CvTemplateGallery({ value, onChange, mockData }) {
  const previewData = mockData || buildCvTemplateMockData();
  return /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: CV_TEMPLATES.map((template) => {
    const selected = resolveCvTemplateId(value) === template.id;
    return /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: () => onChange(template.id),
        className: `group text-left rounded-2xl border-2 overflow-hidden transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${selected ? "border-indigo-600 shadow-lg shadow-indigo-100 ring-2 ring-indigo-100" : "border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md"}`,
        children: [
          /* @__PURE__ */ jsxs("div", { className: "relative bg-slate-100 border-b border-slate-200", children: [
            /* @__PURE__ */ jsx("div", { className: "absolute top-3 right-3 z-10", children: selected ? /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 shadow-sm", children: [
              /* @__PURE__ */ jsx(CheckCircle, { size: 12 }),
              " Selected"
            ] }) : /* @__PURE__ */ jsx("span", { className: "inline-flex rounded-full bg-white/90 text-slate-500 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 border border-slate-200", children: "Preview" }) }),
            /* @__PURE__ */ jsx("div", { className: "h-72 overflow-hidden", children: /* @__PURE__ */ jsx("div", { className: "origin-top-left scale-[0.34] w-[294%] pointer-events-none select-none", children: /* @__PURE__ */ jsx("div", { className: "bg-white shadow-sm", children: /* @__PURE__ */ jsx(CvTemplatePreview, { templateId: template.id, data: previewData }) }) }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "p-4 bg-white", children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-bold text-slate-900", children: template.name }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1 leading-relaxed", children: template.description }),
            /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400 mt-2 uppercase tracking-wider font-semibold", children: "Sample preview with mock data" })
          ] })
        ]
      },
      template.id
    );
  }) });
}

export function CvTemplatePicker({ value, onChange, compact = false }) {
  if (compact) {
    return /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: CV_TEMPLATES.map((template) => {
      const selected = resolveCvTemplateId(value) === template.id;
      return /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => onChange(template.id),
          className: `px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${selected ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`,
          children: template.name
        },
        template.id
      );
    }) });
  }
  return /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: CV_TEMPLATES.map((template) => {
    const selected = resolveCvTemplateId(value) === template.id;
    return /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: () => onChange(template.id),
        className: `text-left p-4 rounded-xl border-2 transition-all ${selected ? "border-indigo-600 bg-indigo-50/50 shadow-sm" : "border-slate-200 bg-white hover:border-indigo-300"}`,
        children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm font-bold text-slate-900", children: template.name }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: template.description })
        ]
      },
      template.id
    );
  }) });
}
