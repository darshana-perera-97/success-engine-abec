import React from "react";
import {
  INTAKE_MONTHS,
  buildIntakeYearOptions,
} from "../utils/intakeFields";

const defaultFieldClass =
  "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500";

const invalidFieldHighlight = "border-rose-500 ring-2 ring-rose-200 bg-rose-50/40 focus:border-rose-500";

function fieldClassWithError(baseClass, hasError) {
  return hasError ? `${baseClass} ${invalidFieldHighlight}` : baseClass;
}

export function IntakeFields({
  intakeMonth = "",
  intakeYear = "",
  onIntakeMonthChange,
  onIntakeYearChange,
  required = false,
  fieldClassName = defaultFieldClass,
  monthHasError = false,
  yearHasError = false,
  className = "grid grid-cols-1 sm:grid-cols-2 gap-3",
  monthLabel = "Intake month",
  yearLabel = "Intake year",
  monthOptions = INTAKE_MONTHS,
  yearOptions = null,
}) {
  const resolvedYearOptions = React.useMemo(
    () => (Array.isArray(yearOptions) && yearOptions.length ? yearOptions : buildIntakeYearOptions()),
    [yearOptions]
  );
  const resolvedMonthOptions = Array.isArray(monthOptions) && monthOptions.length ? monthOptions : INTAKE_MONTHS;

  return (
    <div className={className}>
      <div>
        <label className="text-xs font-semibold text-slate-700 mb-1 block">
          {monthLabel}
          {required ? <span className="text-rose-500"> *</span> : null}
        </label>
        <select
          required={required}
          className={fieldClassWithError(fieldClassName, monthHasError)}
          value={intakeMonth}
          onChange={(e) => onIntakeMonthChange?.(e.target.value)}
        >
          <option value="">{required ? "Select month…" : "Optional"}</option>
          {resolvedMonthOptions.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-700 mb-1 block">
          {yearLabel}
          {required ? <span className="text-rose-500"> *</span> : null}
        </label>
        <select
          required={required}
          className={fieldClassWithError(fieldClassName, yearHasError)}
          value={intakeYear}
          onChange={(e) => onIntakeYearChange?.(e.target.value)}
        >
          <option value="">{required ? "Select year…" : "Optional"}</option>
          {resolvedYearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
