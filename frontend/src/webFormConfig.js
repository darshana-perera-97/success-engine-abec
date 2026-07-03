import { API_BASE } from "./apiConfig";

export const WEB_FORM_FIELD_CATALOG = [
  {
    key: "name",
    defaultLabel: "Full name",
    defaultPlaceholder: "As on your passport or ID",
    type: "text",
    defaultRequired: true,
    defaultWidth: "full",
  },
  {
    key: "email",
    defaultLabel: "Email",
    defaultPlaceholder: "you@example.com",
    type: "email",
    defaultRequired: true,
    defaultWidth: "full",
  },
  {
    key: "phone",
    defaultLabel: "Contact number",
    defaultPlaceholder: "Include country code if applicable",
    type: "tel",
    defaultRequired: true,
    defaultWidth: "full",
  },
  {
    key: "countryToVisit",
    defaultLabel: "Country you wish to visit",
    defaultPlaceholder: "",
    type: "country",
    defaultRequired: true,
    defaultWidth: "full",
  },
  {
    key: "nearestOffice",
    defaultLabel: "Preferred branch",
    defaultPlaceholder: "",
    type: "office",
    defaultRequired: true,
    defaultWidth: "full",
  },
  {
    key: "city",
    defaultLabel: "City / location",
    defaultPlaceholder: "Where you currently live",
    type: "text",
    defaultRequired: false,
    defaultWidth: "full",
  },
  {
    key: "livingStatus",
    defaultLabel: "Living status",
    defaultPlaceholder: "",
    type: "livingStatus",
    defaultRequired: true,
    defaultWidth: "half",
  },
  {
    key: "visaRejectionAnyCountry",
    defaultLabel: "Any visa rejection for any country",
    defaultPlaceholder: "",
    type: "yesNo",
    defaultRequired: true,
    defaultWidth: "half",
  },
  {
    key: "currentEducationLevel",
    defaultLabel: "Current education level",
    defaultPlaceholder: "",
    type: "education",
    defaultRequired: false,
    defaultWidth: "full",
  },
  {
    key: "intendedProgram",
    defaultLabel: "Intended program of study",
    defaultPlaceholder: "e.g. BSc Computer Science, MBA, A-levels",
    type: "text",
    defaultRequired: false,
    defaultWidth: "full",
  },
  {
    key: "intake",
    defaultLabel: "Target intake",
    defaultPlaceholder: "",
    type: "intake",
    defaultRequired: false,
    defaultWidth: "full",
  },
  {
    key: "message",
    defaultLabel: "Additional message",
    defaultPlaceholder: "Goals, timeline, questions…",
    type: "textarea",
    defaultRequired: false,
    defaultWidth: "full",
  },
];

export const DEFAULT_WEB_FORM_APPEARANCE = {
  pageBackground: "#f8fafc",
  formBackground: "#ffffff",
  primaryColor: "#4f46e5",
  textColor: "#0f172a",
  labelColor: "#334155",
  borderColor: "#e2e8f0",
  inputBackground: "#f8fafc",
  borderRadius: 8,
  fontFamily: "system-ui, -apple-system, sans-serif",
  maxWidthDesktop: 512,
  maxWidthTablet: 480,
  maxWidthMobile: 100,
  formPadding: 24,
  fieldGap: 20,
};

export function buildDefaultWebFormFields() {
  return WEB_FORM_FIELD_CATALOG.map((field, index) => ({
    key: field.key,
    enabled: true,
    label: field.defaultLabel,
    placeholder: field.defaultPlaceholder,
    required: field.defaultRequired,
    width: field.defaultWidth,
    order: index,
  }));
}

export function createDefaultWebFormDesign(name = "New form") {
  return {
    name: String(name || "New form").trim() || "New form",
    title: "Student interest form",
    subtitle: "Share your basic details so we can follow up about studying abroad.",
    appearance: { ...DEFAULT_WEB_FORM_APPEARANCE },
    fields: buildDefaultWebFormFields(),
    submitButtonText: "Submit",
    successTitle: "Thank you",
    successMessage:
      "We have received your details. Our team will contact you using the email or phone number you provided.",
  };
}

export function normalizeWebFormFields(fields) {
  const catalogByKey = new Map(WEB_FORM_FIELD_CATALOG.map((f) => [f.key, f]));
  const src = Array.isArray(fields) ? fields : [];
  const seen = new Set();
  const normalized = [];

  for (const entry of src) {
    const key = String(entry?.key || "").trim();
    if (!key || !catalogByKey.has(key) || seen.has(key)) continue;
    seen.add(key);
    const catalog = catalogByKey.get(key);
    normalized.push({
      key,
      enabled: entry?.enabled !== false,
      label: String(entry?.label || catalog.defaultLabel).trim() || catalog.defaultLabel,
      placeholder: String(entry?.placeholder ?? catalog.defaultPlaceholder).trim(),
      required: entry?.required === true || (entry?.required !== false && catalog.defaultRequired),
      width: entry?.width === "half" ? "half" : "full",
      order: Number.isFinite(Number(entry?.order)) ? Number(entry.order) : normalized.length,
    });
  }

  for (const catalog of WEB_FORM_FIELD_CATALOG) {
    if (!seen.has(catalog.key)) {
      normalized.push({
        key: catalog.key,
        enabled: true,
        label: catalog.defaultLabel,
        placeholder: catalog.defaultPlaceholder,
        required: catalog.defaultRequired,
        width: catalog.defaultWidth,
        order: normalized.length,
      });
    }
  }

  return normalized.sort((a, b) => a.order - b.order);
}

export function normalizeWebFormAppearance(appearance) {
  const src = appearance && typeof appearance === "object" ? appearance : {};
  const defaults = DEFAULT_WEB_FORM_APPEARANCE;
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    pageBackground: String(src.pageBackground || defaults.pageBackground).trim() || defaults.pageBackground,
    formBackground: String(src.formBackground || defaults.formBackground).trim() || defaults.formBackground,
    primaryColor: String(src.primaryColor || defaults.primaryColor).trim() || defaults.primaryColor,
    textColor: String(src.textColor || defaults.textColor).trim() || defaults.textColor,
    labelColor: String(src.labelColor || defaults.labelColor).trim() || defaults.labelColor,
    borderColor: String(src.borderColor || defaults.borderColor).trim() || defaults.borderColor,
    inputBackground: String(src.inputBackground || defaults.inputBackground).trim() || defaults.inputBackground,
    borderRadius: num(src.borderRadius, defaults.borderRadius),
    fontFamily: String(src.fontFamily || defaults.fontFamily).trim() || defaults.fontFamily,
    maxWidthDesktop: num(src.maxWidthDesktop, defaults.maxWidthDesktop),
    maxWidthTablet: num(src.maxWidthTablet, defaults.maxWidthTablet),
    maxWidthMobile: num(src.maxWidthMobile, defaults.maxWidthMobile),
    formPadding: num(src.formPadding, defaults.formPadding),
    fieldGap: num(src.fieldGap, defaults.fieldGap),
  };
}

export function normalizeWebFormRecord(input) {
  const src = input && typeof input === "object" ? input : {};
  const defaults = createDefaultWebFormDesign();
  return {
    id: String(src.id || "").trim(),
    name: String(src.name || defaults.name).trim() || defaults.name,
    title: String(src.title || defaults.title).trim() || defaults.title,
    subtitle: String(src.subtitle || defaults.subtitle).trim(),
    appearance: normalizeWebFormAppearance(src.appearance),
    fields: normalizeWebFormFields(src.fields),
    submitButtonText: String(src.submitButtonText || defaults.submitButtonText).trim() || defaults.submitButtonText,
    successTitle: String(src.successTitle || defaults.successTitle).trim() || defaults.successTitle,
    successMessage: String(src.successMessage || defaults.successMessage).trim() || defaults.successMessage,
    createdAt: String(src.createdAt || "").trim() || new Date().toISOString(),
    updatedAt: String(src.updatedAt || "").trim() || new Date().toISOString(),
  };
}

export function buildWebFormEmbedUrl(formId, origin = "") {
  const base = String(
    origin || API_BASE || (typeof window !== "undefined" ? window.location.origin : "")
  ).replace(/\/+$/, "");
  return `${base}/web-form/${encodeURIComponent(formId)}`;
}

export function buildWebFormEmbedSnippet(formId, origin = "") {
  const url = buildWebFormEmbedUrl(formId, origin);
  return `<iframe src="${url}" title="Student interest form" width="100%" height="900" frameborder="0" style="border:0;max-width:100%;"></iframe>`;
}
