import React from "react";

const fieldClass =
  "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";

export function PhoneWhatsappFields({
  phone,
  whatsappNumber,
  whatsappSameAsPhone = true,
  onPhoneChange,
  onWhatsappNumberChange,
  onWhatsappSameAsPhoneChange,
  phoneLabel = "Phone",
  whatsappLabel = "WhatsApp number",
  phoneRequired = true,
  fieldClassName = fieldClass,
  compactLabels = false
}) {
  const labelClass = compactLabels
    ? "text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5 block"
    : "text-xs font-semibold text-slate-700 mb-1 block";
  const sameAsPhone = whatsappSameAsPhone !== false;
  const displayedWhatsapp = sameAsPhone ? phone : whatsappNumber;

  return (
    <>
      <div>
        <label className={labelClass}>
          {phoneLabel}
          {phoneRequired ? <span className="text-rose-500"> *</span> : null}
        </label>
        <input
          type="tel"
          required={phoneRequired}
          autoComplete="tel"
          className={fieldClassName}
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="Include country code if applicable"
        />
      </div>
      <div>
        <label className={labelClass}>
          {whatsappLabel}
          {!sameAsPhone ? <span className="text-rose-500"> *</span> : null}
        </label>
        <input
          type="tel"
          required={!sameAsPhone}
          autoComplete="tel"
          className={`${fieldClassName}${sameAsPhone ? " opacity-70" : ""}`}
          value={displayedWhatsapp}
          onChange={(e) => onWhatsappNumberChange(e.target.value)}
          disabled={sameAsPhone}
          placeholder={sameAsPhone ? "Same as phone" : "e.g. +94771234567 or +14155552671"}
        />
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            checked={sameAsPhone}
            onChange={(e) => onWhatsappSameAsPhoneChange(e.target.checked)}
          />
          Same as phone number
        </label>
      </div>
    </>
  );
}
