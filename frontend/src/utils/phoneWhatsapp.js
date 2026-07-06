export function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function phonesMatch(a, b) {
  const left = normalizePhoneDigits(a);
  const right = normalizePhoneDigits(b);
  return Boolean(left && right && left === right);
}

export function normalizeSriLankaStudentPhone(phone) {
  const digitsOnly = normalizePhoneDigits(phone);
  if (!digitsOnly) return "";

  let localMobileDigits = "";
  if (/^94[7]\d{8}$/.test(digitsOnly)) {
    localMobileDigits = digitsOnly.slice(2);
  } else if (/^0[7]\d{8}$/.test(digitsOnly)) {
    localMobileDigits = digitsOnly.slice(1);
  } else if (/^[7]\d{8}$/.test(digitsOnly)) {
    localMobileDigits = digitsOnly;
  } else {
    return "";
  }

  return `+94${localMobileDigits}`;
}

export function normalizeStudentPhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const sriLanka = normalizeSriLankaStudentPhone(raw);
  if (sriLanka) return sriLanka;
  const digits = normalizePhoneDigits(raw);
  if (digits.length < 8 || digits.length > 15) return "";
  return `+${digits}`;
}

export function isValidStudentPhone(value) {
  return Boolean(normalizeStudentPhone(value));
}

export function isValidWhatsappNumber(value) {
  return isValidStudentPhone(value);
}

export function normalizeWhatsappNumberInput(value) {
  return normalizeStudentPhone(value);
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

const PHONE_FORMAT_ERROR =
  "Enter a valid phone number (e.g. +94771234567, 0771234567, 771234567, or +14155552671).";

const WHATSAPP_FORMAT_ERROR =
  "Enter a valid WhatsApp number (e.g. +94771234567, 0771234567, or +14155552671).";

export function validateWhatsappFields(form) {
  const phone = String(form?.phone || "").trim();
  if (!phone) {
    return { ok: false, error: "Phone number is required." };
  }
  if (!isValidStudentPhone(phone)) {
    return { ok: false, error: PHONE_FORMAT_ERROR };
  }
  if (form?.whatsappSameAsPhone === false) {
    const whatsappNumber = String(form?.whatsappNumber || "").trim();
    if (!whatsappNumber) {
      return { ok: false, error: "Enter a WhatsApp number or tick Same as phone." };
    }
    if (!isValidWhatsappNumber(whatsappNumber)) {
      return { ok: false, error: WHATSAPP_FORMAT_ERROR };
    }
  }
  return { ok: true };
}
