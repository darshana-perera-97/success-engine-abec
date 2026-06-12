const crypto = require("crypto");
const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { WEB_FORMS_FILE } = require("../config");

function genWebFormId() {
  return `wf-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeWebFormRecord(input) {
  const src = input && typeof input === "object" ? input : {};
  const now = new Date().toISOString();
  const fields = Array.isArray(src.fields) ? src.fields : [];
  const appearance = src.appearance && typeof src.appearance === "object" ? src.appearance : {};
  return {
    id: String(src.id || "").trim() || genWebFormId(),
    name: String(src.name || "Untitled form").trim() || "Untitled form",
    title: String(src.title || "Student interest form").trim() || "Student interest form",
    subtitle: String(src.subtitle || "").trim(),
    appearance,
    fields,
    submitButtonText: String(src.submitButtonText || "Submit").trim() || "Submit",
    successTitle: String(src.successTitle || "Thank you").trim() || "Thank you",
    successMessage: String(
      src.successMessage ||
        "We have received your details. Our team will contact you using the email or phone number you provided."
    ).trim(),
    createdAt: String(src.createdAt || now).trim() || now,
    updatedAt: String(src.updatedAt || now).trim() || now,
  };
}

async function readWebFormsStore() {
  try {
    const raw = await fs.readFile(WEB_FORMS_FILE, "utf8");
    const parsed = safeJsonParse(raw, WEB_FORMS_FILE);
    if (!parsed || !Array.isArray(parsed.forms)) return { forms: [] };
    return {
      forms: parsed.forms.map((form) => normalizeWebFormRecord(form)),
    };
  } catch (error) {
    if (error && error.code === "ENOENT") return { forms: [] };
    throw error;
  }
}

async function writeWebFormsStore(store) {
  const normalized = {
    forms: (store?.forms || []).map((form) => normalizeWebFormRecord(form)),
  };
  return withFileLock(WEB_FORMS_FILE, () =>
    atomicWriteFile(WEB_FORMS_FILE, JSON.stringify(normalized, null, 2))
  );
}

async function listWebForms() {
  const store = await readWebFormsStore();
  return store.forms.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function getWebFormById(id) {
  const target = String(id || "").trim();
  if (!target) return null;
  const store = await readWebFormsStore();
  return store.forms.find((form) => form.id === target) || null;
}

async function createWebForm(payload) {
  const now = new Date().toISOString();
  const record = normalizeWebFormRecord({ ...payload, createdAt: now, updatedAt: now });
  const store = await readWebFormsStore();
  store.forms.push(record);
  await writeWebFormsStore(store);
  return record;
}

async function updateWebForm(id, payload) {
  const target = String(id || "").trim();
  if (!target) return null;
  const store = await readWebFormsStore();
  const index = store.forms.findIndex((form) => form.id === target);
  if (index < 0) return null;
  const existing = store.forms[index];
  const updated = normalizeWebFormRecord({
    ...existing,
    ...payload,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });
  store.forms[index] = updated;
  await writeWebFormsStore(store);
  return updated;
}

async function deleteWebForm(id) {
  const target = String(id || "").trim();
  if (!target) return false;
  const store = await readWebFormsStore();
  const next = store.forms.filter((form) => form.id !== target);
  if (next.length === store.forms.length) return false;
  await writeWebFormsStore({ forms: next });
  return true;
}

module.exports = {
  genWebFormId,
  normalizeWebFormRecord,
  listWebForms,
  getWebFormById,
  createWebForm,
  updateWebForm,
  deleteWebForm,
};
