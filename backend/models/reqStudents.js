const crypto = require("crypto");
const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { REQ_STUDENTS_FILE } = require("../config");
const { normalizeIntakeMonth, normalizeIntakeYear } = require("../lib/intakeUtils");

async function readReqStudents() {
  try {
    const raw = await fs.readFile(REQ_STUDENTS_FILE, "utf8");
    const parsed = safeJsonParse(raw, REQ_STUDENTS_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function appendReqStudent(entry) {
  return withFileLock(REQ_STUDENTS_FILE, async () => {
    const list = await readReqStudents();
    list.push(entry);
    await atomicWriteFile(REQ_STUDENTS_FILE, JSON.stringify(list, null, 2));
  });
}

async function removeReqStudentById(requestId) {
  const id = String(requestId || "").trim();
  if (!id) return { ok: false, error: "Request id is required." };
  return withFileLock(REQ_STUDENTS_FILE, async () => {
    const list = await readReqStudents();
    const next = list.filter((entry) => String(entry.id || "") !== id);
    if (next.length === list.length) {
      return { ok: false, error: "Request not found." };
    }
    await atomicWriteFile(REQ_STUDENTS_FILE, JSON.stringify(next, null, 2));
    return { ok: true };
  });
}

async function appendReqStudentsBulk(entries) {
  const incoming = Array.isArray(entries) ? entries : [];
  if (!incoming.length) {
    return { ok: false, error: "At least one lead is required." };
  }
  return withFileLock(REQ_STUDENTS_FILE, async () => {
    const list = await readReqStudents();
    const existingMetaIds = new Set(
      list.map((entry) => String(entry.metaLeadId || "").trim()).filter(Boolean)
    );
    const existingPhones = new Set(
      list.map((entry) => String(entry.phone || "").replace(/\D/g, "")).filter(Boolean)
    );
    const added = [];
    const skipped = [];

    for (const raw of incoming) {
      const name = String(raw.name || "").trim();
      const phone = String(raw.phone || "").trim();
      const metaLeadId = String(raw.metaLeadId || "").trim();
      if (!name && !phone) {
        skipped.push({ reason: "missing_name_phone", metaLeadId, name });
        continue;
      }
      const phoneDigits = phone.replace(/\D/g, "");
      if (metaLeadId && existingMetaIds.has(metaLeadId)) {
        skipped.push({ reason: "duplicate_meta_id", metaLeadId, name });
        continue;
      }
      if (phoneDigits && existingPhones.has(phoneDigits)) {
        skipped.push({ reason: "duplicate_phone", metaLeadId, name, phone });
        continue;
      }

      const entry = {
        id: raw.id || `REQ-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        submittedAt: raw.submittedAt || new Date().toISOString(),
        name,
        email: String(raw.email || "").trim().toLowerCase(),
        phone,
        whatsappNumber: String(raw.whatsappNumber || raw.phone || "").trim(),
        countryToVisit: String(raw.countryToVisit || "").trim() || "UAE",
        city: raw.city || null,
        nearestOffice: raw.nearestOffice || null,
        livingStatus: raw.livingStatus || null,
        visaRejectionAnyCountry: raw.visaRejectionAnyCountry || "No",
        currentEducationLevel: raw.currentEducationLevel || null,
        intendedProgram: raw.intendedProgram || null,
        intakeMonth: normalizeIntakeMonth(raw.intakeMonth) || null,
        intakeYear: normalizeIntakeYear(raw.intakeYear) || null,
        message: raw.message || null,
        source: raw.source || "marketing-team",
        metaLeadId: metaLeadId || null,
        platform: raw.platform || null,
        campaignName: raw.campaignName || null,
        formName: raw.formName || null,
      };

      list.push(entry);
      added.push(entry);
      if (metaLeadId) existingMetaIds.add(metaLeadId);
      if (phoneDigits) existingPhones.add(phoneDigits);
    }

    if (!added.length) {
      return { ok: false, error: "No new leads were added.", skipped };
    }

    await atomicWriteFile(REQ_STUDENTS_FILE, JSON.stringify(list, null, 2));
    return { ok: true, data: added, skipped };
  });
}

module.exports = {
  readReqStudents,
  appendReqStudent,
  appendReqStudentsBulk,
  removeReqStudentById,
};
