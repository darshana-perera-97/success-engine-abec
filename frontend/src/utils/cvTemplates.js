export const CV_TEMPLATE_MODERN_EDITORIAL = "modern-editorial";
export const CV_TEMPLATE_CLASSIC_PROFESSIONAL = "classic-professional";
export const DEFAULT_CV_TEMPLATE_ID = CV_TEMPLATE_MODERN_EDITORIAL;

export const CV_TEMPLATES = [
  {
    id: CV_TEMPLATE_MODERN_EDITORIAL,
    name: "Modern Editorial",
    description: "Bold sidebar layout with accent colors and skill tags.",
  },
  {
    id: CV_TEMPLATE_CLASSIC_PROFESSIONAL,
    name: "Classic Professional",
    description: "Traditional header band with a clean, formal two-column body.",
  },
];

export function resolveCvTemplateId(templateId) {
  const id = String(templateId || "").trim();
  return CV_TEMPLATES.some((template) => template.id === id) ? id : DEFAULT_CV_TEMPLATE_ID;
}

export function getCvTemplateMeta(templateId) {
  const id = resolveCvTemplateId(templateId);
  return CV_TEMPLATES.find((template) => template.id === id) || CV_TEMPLATES[0];
}

/** Sample resume content used for template gallery previews only. */
export function buildCvTemplateMockData(companyName = "Sample Company") {
  return {
    name: "Alex Morgan",
    role: "Computer Science Graduate",
    email: "alex.morgan@email.com",
    phone: "(+94) 77 123 4567",
    experience: [
      { title: "Software Engineering Intern", company: companyName, period: "JUN 2024 – AUG 2024" },
      { title: "Research Assistant", company: "State University", period: "JAN 2023 – MAY 2024" },
    ],
    education: [
      { degree: "BSc Computer Science", school: "State University" },
      { degree: "Advanced Level", school: "Central College" },
    ],
    testScores: [
      { name: "IELTS", score: "7.0" },
      { name: "PTE", score: "68" },
    ],
    profilePicture: null,
    customSections: [
      {
        id: "mock-projects",
        title: "Projects",
        icon: "Award",
        content: "Built a student portal web app and contributed to an open-source analytics dashboard.",
      },
    ],
  };
}
