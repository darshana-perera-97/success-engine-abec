const fs = require("fs/promises");
const path = require("path");
const {
  ASSETS_DIR,
  CHAT_FILES_DIR,
  PAYMENTS_DIR,
  STUDENT_CV_DIR,
  STUDENT_PERMISSIONS_DIR,
} = require("../config");
const { readStudemts, writeStudemts } = require("../models/students");
const { readTasks, writeTasks } = require("../models/tasks");
const { readInvoices, writeInvoices } = require("../models/invoices");
const { readChats, writeChats } = require("../models/chats");
const { readAppointments, writeAppointments } = require("../models/appointments");
const { safeUnlinkStoredPermissionDoc } = require("./uploads");

function extractBackendRelativePath(filePath) {
  const value = String(filePath || "").trim();
  if (!value) return "";
  const prefixes = ["/student-docs/", "/payments/", "/chat-files/", "/assets/"];
  for (const prefix of prefixes) {
    if (value.startsWith(prefix)) return value;
  }
  for (const prefix of prefixes) {
    const idx = value.indexOf(prefix);
    if (idx !== -1) return value.slice(idx);
  }
  try {
    const parsed = new URL(value);
    const pathname = `${parsed.pathname || ""}${parsed.search || ""}${parsed.hash || ""}`;
    for (const prefix of prefixes) {
      if (pathname.startsWith(prefix)) return pathname;
    }
  } catch {
    // ignore
  }
  return "";
}

async function safeUnlinkByRelativePath(relativePath) {
  const rel = extractBackendRelativePath(relativePath);
  if (!rel) return;
  let diskPath = "";
  if (rel.startsWith("/student-docs/permissions/")) {
    const fileName = path.basename(rel);
    if (!fileName || fileName.includes("..")) return;
    diskPath = path.join(STUDENT_PERMISSIONS_DIR, fileName);
  } else if (rel.startsWith("/student-docs/cv/")) {
    const fileName = path.basename(rel);
    if (!fileName || fileName.includes("..")) return;
    diskPath = path.join(STUDENT_CV_DIR, fileName);
  } else if (rel.startsWith("/payments/")) {
    const fileName = path.basename(rel);
    if (!fileName || fileName.includes("..")) return;
    diskPath = path.join(PAYMENTS_DIR, fileName);
  } else if (rel.startsWith("/chat-files/")) {
    const fileName = path.basename(rel);
    if (!fileName || fileName.includes("..")) return;
    diskPath = path.join(CHAT_FILES_DIR, fileName);
  } else if (rel.startsWith("/assets/")) {
    const fileName = path.basename(rel);
    if (!fileName || fileName.includes("..")) return;
    diskPath = path.join(ASSETS_DIR, fileName);
  }
  if (!diskPath) return;
  try {
    await fs.unlink(diskPath);
  } catch {
    // ignore missing files
  }
}

function collectStudentFileUrls(student) {
  const urls = new Set();
  const push = (value) => {
    const rel = extractBackendRelativePath(value);
    if (rel) urls.add(rel);
  };
  if (!student || typeof student !== "object") return urls;
  push(student.avatar);
  if (student.cvFile && typeof student.cvFile === "object") push(student.cvFile.url);
  for (const doc of Array.isArray(student.documents) ? student.documents : []) {
    if (doc && typeof doc === "object") push(doc.url);
  }
  for (const entry of Array.isArray(student.profileOtherDocuments) ? student.profileOtherDocuments : []) {
    if (entry && typeof entry === "object") push(entry.url);
  }
  for (const entry of Array.isArray(student.universityOfferLetters) ? student.universityOfferLetters : []) {
    if (entry && typeof entry === "object") push(entry.url);
  }
  return urls;
}

function collectInvoiceFileUrls(invoice) {
  const urls = [];
  if (!invoice || typeof invoice !== "object") return urls;
  if (invoice.paymentProofUrl) urls.push(invoice.paymentProofUrl);
  if (invoice.attachmentFileUrl) urls.push(invoice.attachmentFileUrl);
  if (invoice.generatedReceiptUrl) urls.push(invoice.generatedReceiptUrl);
  for (const entry of Array.isArray(invoice.paymentProofHistory) ? invoice.paymentProofHistory : []) {
    if (entry && typeof entry === "object" && entry.url) urls.push(entry.url);
  }
  return urls;
}

async function deleteStudentStoredFiles(student) {
  const urls = collectStudentFileUrls(student);
  for (const url of urls) {
    if (url.startsWith("/student-docs/permissions/")) {
      await safeUnlinkStoredPermissionDoc(url);
    } else {
      await safeUnlinkByRelativePath(url);
    }
  }
}

async function purgeStudentFromSystem(studentId) {
  const sid = String(studentId || "").trim();
  if (!sid) return { ok: false, error: "Student id is required." };

  const studemts = await readStudemts();
  const student = studemts.find((item) => String(item.id || "") === sid);
  if (!student) return { ok: false, error: "Student not found." };

  await deleteStudentStoredFiles(student);

  const invoices = await readInvoices();
  const remainingInvoices = [];
  for (const invoice of invoices) {
    if (String(invoice.studentId || "") === sid) {
      for (const url of collectInvoiceFileUrls(invoice)) {
        await safeUnlinkByRelativePath(url);
      }
      continue;
    }
    remainingInvoices.push(invoice);
  }
  await writeInvoices(remainingInvoices);

  const chats = await readChats();
  const remainingChats = [];
  for (const chat of chats) {
    const senderId = String(chat.senderId || "");
    const receiverId = String(chat.receiverId || "");
    if (senderId === sid || receiverId === sid) {
      const attachmentUrl = chat.attachment && typeof chat.attachment === "object" ? chat.attachment.url : "";
      if (attachmentUrl) await safeUnlinkByRelativePath(attachmentUrl);
      continue;
    }
    remainingChats.push(chat);
  }
  await writeChats(remainingChats);

  const tasks = await readTasks();
  await writeTasks(
    tasks.filter((task) => {
      const taskStudentId = String(task.student_id || task.studentId || "");
      return taskStudentId !== sid;
    })
  );

  const appointments = await readAppointments();
  await writeAppointments(appointments.filter((item) => String(item.studentId || "") !== sid));

  await writeStudemts(studemts.filter((item) => String(item.id || "") !== sid));

  return {
    ok: true,
    studentId: sid,
    studentName: String(student.name || "").trim(),
  };
}

module.exports = {
  collectStudentFileUrls,
  purgeStudentFromSystem,
};
