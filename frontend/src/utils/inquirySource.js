export const INQUIRY_SOURCE_OPTIONS = [
  { value: "referral", label: "Referral" },
  { value: "marketing-team", label: "Marketing team" },
  { value: "import", label: "Import" },
  { value: "walking", label: "Walking" }
];

const INQUIRY_SOURCE_LABEL_BY_VALUE = Object.fromEntries(
  INQUIRY_SOURCE_OPTIONS.map((option) => [option.value, option.label])
);

const LEGACY_SOURCE_ALIASES = {
  "meta-leads-import": "marketing-team",
  "web-form": "marketing-team",
  "student-reg-form": "walking",
  "counselor-reassignment": "import",
  "custom-input": "import",
  "team-progress": "import"
};

export function normalizeInquirySource(raw) {
  const source = String(raw || "").trim().toLowerCase();
  if (!source) return "";
  if (INQUIRY_SOURCE_LABEL_BY_VALUE[source]) return source;
  return LEGACY_SOURCE_ALIASES[source] || source;
}

export function formatInquirySource(raw) {
  const normalized = normalizeInquirySource(raw);
  if (!normalized) return "—";
  return INQUIRY_SOURCE_LABEL_BY_VALUE[normalized] || String(raw || "").trim() || "—";
}

export function isValidInquirySource(raw) {
  const normalized = normalizeInquirySource(raw);
  return Boolean(normalized && INQUIRY_SOURCE_LABEL_BY_VALUE[normalized]);
}
