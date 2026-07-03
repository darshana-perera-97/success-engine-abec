const INTAKE_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function normalizeIntakeMonth(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = INTAKE_MONTHS.find((month) => month.toLowerCase() === raw.toLowerCase());
  return match || "";
}

function normalizeIntakeYear(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}$/.test(raw)) return "";
  const year = Number(raw);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return "";
  return String(year);
}

function formatIntakeLabel(month, year) {
  const normalizedMonth = normalizeIntakeMonth(month);
  const normalizedYear = normalizeIntakeYear(year);
  if (!normalizedMonth && !normalizedYear) return "";
  if (normalizedMonth && normalizedYear) return `${normalizedMonth} ${normalizedYear}`;
  return normalizedMonth || normalizedYear;
}

function intakeValuesMatch(monthA, yearA, monthB, yearB) {
  return (
    normalizeIntakeMonth(monthA).toLowerCase() === normalizeIntakeMonth(monthB).toLowerCase() &&
    normalizeIntakeYear(yearA) === normalizeIntakeYear(yearB)
  );
}

function buildDefaultIntakeYears({ startOffset = -1, count = 8 } = {}) {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear + startOffset;
  const years = [];
  for (let i = 0; i < count; i += 1) {
    years.push(String(startYear + i));
  }
  return years;
}

function defaultCountryIntakeOptions() {
  return {
    months: [...INTAKE_MONTHS],
    years: buildDefaultIntakeYears(),
  };
}

function normalizeCountryIntakeOptions(raw) {
  const defaults = defaultCountryIntakeOptions();
  const months = Array.isArray(raw?.months)
    ? raw.months.map(normalizeIntakeMonth).filter(Boolean)
    : defaults.months;
  const years = Array.isArray(raw?.years)
    ? raw.years.map(normalizeIntakeYear).filter(Boolean)
    : defaults.years;
  const uniqueMonths = [...new Set(months)].sort(
    (a, b) => INTAKE_MONTHS.indexOf(a) - INTAKE_MONTHS.indexOf(b)
  );
  const uniqueYears = [...new Set(years)].sort((a, b) => Number(a) - Number(b));
  return {
    months: uniqueMonths.length ? uniqueMonths : defaults.months,
    years: uniqueYears.length ? uniqueYears : defaults.years,
  };
}

function validateIntakeFields(month, year, { required = false } = {}) {
  const normalizedMonth = normalizeIntakeMonth(month);
  const normalizedYear = normalizeIntakeYear(year);
  if (required) {
    if (!normalizedMonth || !normalizedYear) {
      return { ok: false, error: "Intake month and year are required." };
    }
    return { ok: true, intakeMonth: normalizedMonth, intakeYear: normalizedYear };
  }
  if ((normalizedMonth && !normalizedYear) || (!normalizedMonth && normalizedYear)) {
    return { ok: false, error: "Select both intake month and year, or leave both empty." };
  }
  return {
    ok: true,
    intakeMonth: normalizedMonth || null,
    intakeYear: normalizedYear || null,
  };
}

module.exports = {
  INTAKE_MONTHS,
  normalizeIntakeMonth,
  normalizeIntakeYear,
  formatIntakeLabel,
  intakeValuesMatch,
  validateIntakeFields,
  buildDefaultIntakeYears,
  defaultCountryIntakeOptions,
  normalizeCountryIntakeOptions,
};
