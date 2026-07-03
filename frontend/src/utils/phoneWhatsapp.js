export function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function phonesMatch(a, b) {
  const left = normalizePhoneDigits(a);
  const right = normalizePhoneDigits(b);
  return Boolean(left && right && left === right);
}

export function isValidWhatsappNumber(value) {
  const digits = normalizePhoneDigits(value);
  return digits.length >= 8 && digits.length <= 15;
}

export function normalizeWhatsappNumberInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = normalizePhoneDigits(raw);
  if (!isValidWhatsappNumber(raw)) return "";
  return `+${digits}`;
}

export function resolveFormWhatsappNumber(form) {
  const phone = String(form?.phone || "").trim();
  if (form?.whatsappSameAsPhone !== false) return phone;
  return String(form?.whatsappNumber || "").trim();
}

export function whatsappFieldsFromStudent(student) {
  const phone = String(student?.phone || "").trim();
  const whatsappNumber = String(student?.whatsappNumber || "").trim();
  const whatsappSameAsPhone = !whatsappNumber || phonesMatch(phone, whatsappNumber);
  return {
    whatsappSameAsPhone,
    whatsappNumber: whatsappSameAsPhone ? phone : whatsappNumber
  };
}

export function validateWhatsappFields(form) {
  const phone = String(form?.phone || "").trim();
  if (!phone) {
    return { ok: false, error: "Phone number is required." };
  }
  if (form?.whatsappSameAsPhone === false) {
    const whatsappNumber = String(form?.whatsappNumber || "").trim();
    if (!whatsappNumber) {
      return { ok: false, error: "Enter a WhatsApp number or tick Same as phone." };
    }
    if (!isValidWhatsappNumber(whatsappNumber)) {
      return {
        ok: false,
        error: "Enter a valid WhatsApp number with country code (e.g. +94771234567 or +14155552671)."
      };
    }
  }
  return { ok: true };
}
