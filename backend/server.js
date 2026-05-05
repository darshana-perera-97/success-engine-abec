require("dotenv").config();

const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT || "", 10) || 3334;
const USERS_FILE = path.join(__dirname, "data", "users.json");
const STUDEMTS_FILE = path.join(__dirname, "data", "studemts.json");
const BRANCHES_FILE = path.join(__dirname, "data", "branches.json");
const COUNTRIES_FILE = path.join(__dirname, "data", "countries.json");
const UNIVERSITY_FILE = path.join(__dirname, "data", "university.json");
const CHATS_FILE = path.join(__dirname, "data", "chats.json");
const ACTIVITIES_FILE = path.join(__dirname, "data", "activities.json");
const MEETING_DATA_FILE = path.join(__dirname, "data", "meetingData.json");
const BOOKINGS_FILE = path.join(__dirname, "data", "bookings.json");
const APPOINTMENTS_FILE = path.join(__dirname, "data", "appointments.json");
const INVOICES_FILE = path.join(__dirname, "data", "invoices.json");
const TASKS_FILE = path.join(__dirname, "data", "tasks.json");
const REQ_STUDENTS_FILE = path.join(__dirname, "data", "req-students.json");
const CHAT_FILES_DIR = path.join(__dirname, "data", "chats");
const ASSETS_DIR = path.join(__dirname, "data", "assets");
const STUDENT_CV_DIR = path.join(__dirname, "data", "studentDocs", "cv");
const STUDENT_PERMISSIONS_DIR = path.join(__dirname, "data", "studentDocs", "permissions");
const PAYMENTS_DIR = path.join(__dirname, "data", "payments");
const DEFAULT_MALE_AVATAR_PATH = "/assets/default-male-avatar.svg";
const DEFAULT_DAY_SCHEDULE = {
  isOpen: true,
  startHour: 8,
  endHour: 17,
};
const DEFAULT_MEETING_SETTINGS = {
  meetingDurationMinutes: 30,
  daySchedules: {
    0: { ...DEFAULT_DAY_SCHEDULE },
    1: { ...DEFAULT_DAY_SCHEDULE },
    2: { ...DEFAULT_DAY_SCHEDULE },
    3: { ...DEFAULT_DAY_SCHEDULE },
    4: { ...DEFAULT_DAY_SCHEDULE },
    5: { ...DEFAULT_DAY_SCHEDULE },
    6: { ...DEFAULT_DAY_SCHEDULE },
  },
};

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ALLOWED_ROLES = new Set(["Manager", "Team Lead", "Counselor", "Consultor", "Admin", "Country Coordinator"]);
const DEFAULT_COUNTRY_NAMES = ["UK", "USA", "Canada", "Australia", "New Zealand"];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStoredRole(role) {
  if (role === "Counselor" || role === "Consultor") return "Consultor";
  return role;
}

function normalizeLoginRole(role) {
  if (role === "Consultor") return "Counselor";
  return role;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

async function readUsers() {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeUsers(users) {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

async function readStudemts() {
  try {
    const raw = await fs.readFile(STUDEMTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeStudemts(studemts) {
  await fs.mkdir(path.dirname(STUDEMTS_FILE), { recursive: true });
  await fs.writeFile(STUDEMTS_FILE, JSON.stringify(studemts, null, 2));
}

async function readBranches() {
  try {
    const raw = await fs.readFile(BRANCHES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeBranches(branches) {
  await fs.mkdir(path.dirname(BRANCHES_FILE), { recursive: true });
  await fs.writeFile(BRANCHES_FILE, JSON.stringify(branches, null, 2));
}

async function readCountries() {
  try {
    const raw = await fs.readFile(COUNTRIES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      await writeCountries([...DEFAULT_COUNTRY_NAMES]);
      return [...DEFAULT_COUNTRY_NAMES];
    }
    const names = parsed
      .map((x) => (typeof x === "string" ? x : String(x?.name || "")).trim())
      .filter(Boolean);
    if (names.length === 0) {
      await writeCountries([...DEFAULT_COUNTRY_NAMES]);
      return [...DEFAULT_COUNTRY_NAMES];
    }
    return Array.from(new Map(names.map((n) => [n.toLowerCase(), n])).values()).sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      await writeCountries([...DEFAULT_COUNTRY_NAMES]);
      return [...DEFAULT_COUNTRY_NAMES];
    }
    throw error;
  }
}

async function writeCountries(list) {
  await fs.mkdir(path.dirname(COUNTRIES_FILE), { recursive: true });
  const unique = Array.from(
    new Map(
      (list || [])
        .map((n) => String(n || "").trim())
        .filter(Boolean)
        .map((n) => [n.toLowerCase(), n])
    ).values()
  ).sort((a, b) => a.localeCompare(b));
  await fs.writeFile(COUNTRIES_FILE, JSON.stringify(unique, null, 2));
}

async function readReqStudents() {
  try {
    const raw = await fs.readFile(REQ_STUDENTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function appendReqStudent(entry) {
  const list = await readReqStudents();
  list.push(entry);
  await fs.mkdir(path.dirname(REQ_STUDENTS_FILE), { recursive: true });
  await fs.writeFile(REQ_STUDENTS_FILE, JSON.stringify(list, null, 2));
}

async function removeReqStudentById(requestId) {
  const id = String(requestId || "").trim();
  if (!id) return { ok: false, error: "Request id is required." };
  const list = await readReqStudents();
  const next = list.filter((entry) => String(entry.id || "") !== id);
  if (next.length === list.length) {
    return { ok: false, error: "Request not found." };
  }
  await fs.mkdir(path.dirname(REQ_STUDENTS_FILE), { recursive: true });
  await fs.writeFile(REQ_STUDENTS_FILE, JSON.stringify(next, null, 2));
  return { ok: true };
}

async function readUniversityPrograms() {
  try {
    const raw = await fs.readFile(UNIVERSITY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeUniversityPrograms(programs) {
  await fs.mkdir(path.dirname(UNIVERSITY_FILE), { recursive: true });
  await fs.writeFile(UNIVERSITY_FILE, JSON.stringify(programs, null, 2));
}

async function readChats() {
  try {
    const raw = await fs.readFile(CHATS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeChats(chats) {
  await fs.mkdir(path.dirname(CHATS_FILE), { recursive: true });
  await fs.writeFile(CHATS_FILE, JSON.stringify(chats, null, 2));
}

async function readActivities() {
  try {
    const raw = await fs.readFile(ACTIVITIES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeActivities(activities) {
  await fs.mkdir(path.dirname(ACTIVITIES_FILE), { recursive: true });
  await fs.writeFile(ACTIVITIES_FILE, JSON.stringify(activities, null, 2));
}

async function readBookings() {
  try {
    const raw = await fs.readFile(BOOKINGS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeBookings(bookings) {
  await fs.mkdir(path.dirname(BOOKINGS_FILE), { recursive: true });
  await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

async function readAppointments() {
  try {
    const raw = await fs.readFile(APPOINTMENTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeAppointments(appointments) {
  await fs.mkdir(path.dirname(APPOINTMENTS_FILE), { recursive: true });
  await fs.writeFile(APPOINTMENTS_FILE, JSON.stringify(appointments, null, 2));
}

async function readInvoices() {
  try {
    const raw = await fs.readFile(INVOICES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeInvoices(invoices) {
  await fs.mkdir(path.dirname(INVOICES_FILE), { recursive: true });
  await fs.writeFile(INVOICES_FILE, JSON.stringify(invoices, null, 2));
}

async function readTasks() {
  try {
    const raw = await fs.readFile(TASKS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeTasks(tasks) {
  await fs.mkdir(path.dirname(TASKS_FILE), { recursive: true });
  await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

function normalizeMeetingSettings(input) {
  const src = input && typeof input === "object" ? input : {};
  const meetingDurationMinutes = Number(src.meetingDurationMinutes);
  const incomingDaySchedules = src.daySchedules && typeof src.daySchedules === "object" ? src.daySchedules : {};
  const daySchedules = {};
  for (let day = 0; day <= 6; day++) {
    const incomingDay = incomingDaySchedules[day] && typeof incomingDaySchedules[day] === "object" ? incomingDaySchedules[day] : {};
    const isOpen = incomingDay.isOpen !== false;
    const startHour = Number(incomingDay.startHour);
    const endHour = Number(incomingDay.endHour);
    daySchedules[day] = {
      isOpen,
      startHour:
        Number.isFinite(startHour) && startHour >= 0 && startHour <= 23
          ? Math.floor(startHour)
          : DEFAULT_DAY_SCHEDULE.startHour,
      endHour:
        Number.isFinite(endHour) && endHour >= 1 && endHour <= 24
          ? Math.floor(endHour)
          : DEFAULT_DAY_SCHEDULE.endHour,
    };
  }
  return {
    meetingDurationMinutes:
      Number.isFinite(meetingDurationMinutes) && meetingDurationMinutes > 0
        ? Math.floor(meetingDurationMinutes)
        : DEFAULT_MEETING_SETTINGS.meetingDurationMinutes,
    daySchedules,
  };
}

async function readMeetingSettings() {
  try {
    const raw = await fs.readFile(MEETING_DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeMeetingSettings(parsed);
  } catch (error) {
    if (error && error.code === "ENOENT") return { ...DEFAULT_MEETING_SETTINGS };
    throw error;
  }
}

async function writeMeetingSettings(settings) {
  await fs.mkdir(path.dirname(MEETING_DATA_FILE), { recursive: true });
  await fs.writeFile(MEETING_DATA_FILE, JSON.stringify(normalizeMeetingSettings(settings), null, 2));
}

function sanitizeAccount(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone || "",
    role: user.role,
    branch: user.branch,
    country: user.country || "",
    teamLeadId: user.teamLeadId,
    teamLeadName: user.teamLeadName,
    teamLeadEmail: user.teamLeadEmail,
    avatar: user.avatar,
  };
}

function detectImageExtension(dataUrl) {
  const mimeMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl);
  if (!mimeMatch) return null;
  const mime = mimeMatch[1].toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return null;
}

async function storeImageDataUrl(dataUrl, prefix) {
  const ext = detectImageExtension(dataUrl);
  if (!ext) return null;
  const base64 = dataUrl.split(",")[1] || "";
  if (!base64) return null;
  const buffer = Buffer.from(base64, "base64");
  const fileName = `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  await fs.writeFile(path.join(ASSETS_DIR, fileName), buffer);
  return `/assets/${fileName}`;
}

function publicAssetUrl(req, avatar) {
  if (!avatar) return avatar;
  if (avatar.startsWith("/assets/")) {
    return `http://${req.headers.host}${avatar}`;
  }
  return avatar;
}

function publicChatFileUrl(req, filePath) {
  if (!filePath) return filePath;
  if (filePath.startsWith("/chat-files/")) {
    return `http://${req.headers.host}${filePath}`;
  }
  return filePath;
}

function publicStudentDocUrl(req, filePath) {
  if (!filePath) return filePath;
  if (filePath.startsWith("/student-docs/")) {
    return `http://${req.headers.host}${filePath}`;
  }
  return filePath;
}

function publicStudentRecord(req, student) {
  if (!student || typeof student !== "object") return student;
  const next = { ...student };
  next.avatar = publicAssetUrl(req, next.avatar);
  if (next.cvFile && typeof next.cvFile === "object") {
    next.cvFile = {
      ...next.cvFile,
      url: publicStudentDocUrl(req, String(next.cvFile.url || "")),
    };
  }
  if (Array.isArray(next.documents)) {
    next.documents = next.documents.map((doc) => {
      if (!doc || typeof doc !== "object") return doc;
      return {
        ...doc,
        url: publicStudentDocUrl(req, String(doc.url || "")),
      };
    });
  }
  return next;
}

function getDataUrlMime(dataUrl) {
  const mimeMatch = /^data:([^;]+);base64,/.exec(String(dataUrl || ""));
  return mimeMatch ? String(mimeMatch[1] || "").toLowerCase() : "";
}

function extensionFromMime(mime) {
  if (!mime) return "";
  const known = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  return known[mime] || "";
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

async function storeChatAttachmentDataUrl(dataUrl, originalName) {
  const mime = getDataUrlMime(dataUrl);
  const ext = extensionFromMime(mime);
  if (!mime || !ext) return null;
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (!base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  if (buffer.length > 10 * 1024 * 1024) return { error: "File is too large. Max 10MB allowed." };

  const originalBase = sanitizeFileName(path.parse(String(originalName || "attachment")).name) || "attachment";
  const fileName = `chat-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${originalBase}.${ext}`;
  await fs.mkdir(CHAT_FILES_DIR, { recursive: true });
  await fs.writeFile(path.join(CHAT_FILES_DIR, fileName), buffer);
  return {
    url: `/chat-files/${fileName}`,
    mime,
    size: buffer.length,
    name: `${originalBase}.${ext}`,
  };
}

async function storeStudentCvDataUrl(dataUrl, originalName) {
  const mime = getDataUrlMime(dataUrl);
  const allowed = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  if (!allowed.has(mime)) return null;
  const ext = extensionFromMime(mime);
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (!ext || !base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  if (buffer.length > 10 * 1024 * 1024) {
    return { error: "CV file is too large. Max 10MB allowed." };
  }
  const originalBase = sanitizeFileName(path.parse(String(originalName || "cv")).name) || "cv";
  const fileName = `cv-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${originalBase}.${ext}`;
  await fs.mkdir(STUDENT_CV_DIR, { recursive: true });
  await fs.writeFile(path.join(STUDENT_CV_DIR, fileName), buffer);
  return {
    url: `/student-docs/cv/${fileName}`,
    mime,
    size: buffer.length,
    name: `${originalBase}.${ext}`,
  };
}

async function storeStudentPermissionDataUrl(dataUrl, originalName) {
  const mime = getDataUrlMime(dataUrl);
  const allowed = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  if (!allowed.has(mime)) return null;
  const ext = extensionFromMime(mime);
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (!ext || !base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  if (buffer.length > 10 * 1024 * 1024) {
    return { error: "Document file is too large. Max 10MB allowed." };
  }
  const originalBase = sanitizeFileName(path.parse(String(originalName || "document")).name) || "document";
  const fileName = `perm-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${originalBase}.${ext}`;
  await fs.mkdir(STUDENT_PERMISSIONS_DIR, { recursive: true });
  await fs.writeFile(path.join(STUDENT_PERMISSIONS_DIR, fileName), buffer);
  return {
    url: `/student-docs/permissions/${fileName}`,
    mime,
    size: buffer.length,
    name: `${originalBase}.${ext}`,
  };
}

async function storePaymentProofDataUrl(dataUrl, originalName) {
  const mime = getDataUrlMime(dataUrl);
  const allowed = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
  ]);
  if (!allowed.has(mime)) return null;
  const ext = extensionFromMime(mime);
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (!ext || !base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  if (buffer.length > 10 * 1024 * 1024) {
    return { error: "Payment proof file is too large. Max 10MB allowed." };
  }
  const originalBase = sanitizeFileName(path.parse(String(originalName || "payment-proof")).name) || "payment-proof";
  const fileName = `pay-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${originalBase}.${ext}`;
  await fs.mkdir(PAYMENTS_DIR, { recursive: true });
  await fs.writeFile(path.join(PAYMENTS_DIR, fileName), buffer);
  return {
    url: `/payments/${fileName}`,
    mime,
    size: buffer.length,
    name: `${originalBase}.${ext}`,
  };
}

function splitAdminRecord(users) {
  const adminIndex = users.findIndex(
    (u) => (u.id === "ADM001" || String(u.email || "").toLowerCase() === ADMIN_EMAIL) && u.role === "Admin"
  );
  if (adminIndex === -1) {
    return { adminRecord: null, others: users };
  }
  return {
    adminRecord: users[adminIndex],
    others: users.filter((_, idx) => idx !== adminIndex),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
    res.end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");

      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        sendJson(res, 500, {
          ok: false,
          error: "Server is not configured with admin credentials.",
        });
        return;
      }

      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        sendJson(res, 200, { ok: true, user: { id: "ADM001", username: "admin", email: ADMIN_EMAIL, role: "Admin" } });
        return;
      }

      const users = await readUsers();
      const matchedUser = users.find((u) => normalizeEmail(u.email) === email && String(u.password || "") === password);
      if (matchedUser) {
        sendJson(res, 200, {
          ok: true,
          user: {
            id: matchedUser.id,
            username: matchedUser.username || "",
            email: matchedUser.email,
            role: normalizeLoginRole(matchedUser.role),
            branch: matchedUser.branch || null,
            country: matchedUser.country || null,
          },
        });
        return;
      }

      const studemts = await readStudemts();
      const matchedStudent = studemts.find(
        (s) => normalizeEmail(s.email) === email && String(s.password || "") === password
      );
      if (matchedStudent) {
        sendJson(res, 200, {
          ok: true,
          user: {
            id: matchedStudent.id,
            username: matchedStudent.name || "",
            email: matchedStudent.email,
            role: "Student",
            branch: matchedStudent.branch || null,
          },
        });
        return;
      }

      sendJson(res, 401, { ok: false, error: "Invalid email or password." });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/accounts") {
    try {
      const users = await readUsers();
      const { adminRecord, others } = splitAdminRecord(users);
      const adminAccount = {
        id: "ADM001",
        username: "admin",
        email: ADMIN_EMAIL || "admin@gmail.com",
        role: "Admin",
        avatar: (adminRecord && adminRecord.avatar) || "/CEO.png",
      };
      const safeUsers = others.map(sanitizeAccount).map((u) => ({ ...u, avatar: publicAssetUrl(req, u.avatar) }));
      sendJson(res, 200, {
        ok: true,
        data: [{ ...adminAccount, avatar: publicAssetUrl(req, adminAccount.avatar) }, ...safeUsers],
      });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load accounts." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts") {
    try {
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const role = normalizeStoredRole(String(body.role || "").trim());
      const branch = String(body.branch || "").trim();
      const teamLeadId = String(body.teamLeadId || "").trim();
      const teamLeadName = String(body.teamLeadName || "").trim();
      const teamLeadEmail = normalizeEmail(body.teamLeadEmail);
      const avatarDataUrl = String(body.avatar || "");
      const country = String(body.country || "").trim();

      if (!username || !email || !password || !role) {
        sendJson(res, 400, { ok: false, error: "Username, email, password, and role are required." });
        return;
      }

      if (role !== "Admin" && !branch) {
        sendJson(res, 400, { ok: false, error: "Branch is required for this role." });
        return;
      }

      if (!ALLOWED_ROLES.has(role)) {
        sendJson(res, 400, { ok: false, error: "Invalid role." });
        return;
      }

      if (role === "Country Coordinator") {
        if (!country) {
          sendJson(res, 400, { ok: false, error: "Country is required for Country Coordinator accounts." });
          return;
        }
        const countriesList = await readCountries();
        const allowedCountry = countriesList.some((c) => String(c).trim().toLowerCase() === country.toLowerCase());
        if (!allowedCountry) {
          sendJson(res, 400, { ok: false, error: "Please select a country from the saved list (Settings)." });
          return;
        }
      }

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        sendJson(res, 400, { ok: false, error: "Enter a valid email." });
        return;
      }

      const users = await readUsers();
      const studemts = await readStudemts();
      if (email === ADMIN_EMAIL || users.some((u) => normalizeEmail(u.email) === email)) {
        sendJson(res, 409, { ok: false, error: "Account email already exists." });
        return;
      }
      if (studemts.some((s) => normalizeEmail(s.email) === email)) {
        sendJson(res, 409, { ok: false, error: "Email is already used by a student profile." });
        return;
      }
      let linkedTeamLead = null;
      if (role === "Consultor" && teamLeadId) {
        linkedTeamLead = users.find((u) => String(u.id || "") === teamLeadId && String(u.role || "") === "Team Lead");
        if (!linkedTeamLead) {
          sendJson(res, 400, { ok: false, error: "Selected Team Lead is invalid." });
          return;
        }
      }

      if (role !== "Admin") {
        const savedBranches = await readBranches();
        const branchExists = savedBranches.some(
          (b) => String(b.location || "").toLowerCase() === branch.toLowerCase()
        );
        if (!branchExists) {
          sendJson(res, 400, { ok: false, error: "Please select a valid saved branch." });
          return;
        }
      }

      let avatarPath = DEFAULT_MALE_AVATAR_PATH;
      if (avatarDataUrl) {
        const storedAvatarPath = await storeImageDataUrl(avatarDataUrl, "user-avatar");
        if (!storedAvatarPath) {
          sendJson(res, 400, { ok: false, error: "Unsupported avatar image format." });
          return;
        }
        avatarPath = storedAvatarPath;
      }

      const account = {
        id: `USR-${crypto.randomUUID().slice(0, 8)}`,
        username,
        email,
        password,
        role,
        branch: role === "Admin" ? "" : branch,
        country: role === "Country Coordinator" ? country : "",
        teamLeadId: role === "Consultor" && linkedTeamLead ? teamLeadId : "",
        teamLeadName: role === "Consultor" && linkedTeamLead ? teamLeadName || String(linkedTeamLead?.username || "").trim() : "",
        teamLeadEmail: role === "Consultor" && linkedTeamLead ? teamLeadEmail || normalizeEmail(linkedTeamLead?.email) : "",
        avatar: avatarPath,
        createdAt: new Date().toISOString(),
      };

      const updated = [...users, account];
      await writeUsers(updated);
      sendJson(res, 201, {
        ok: true,
        data: { ...sanitizeAccount(account), avatar: publicAssetUrl(req, account.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/accounts/") && url.pathname.endsWith("/team-lead")) {
    try {
      const accountId = decodeURIComponent(url.pathname.replace("/api/accounts/", "").replace("/team-lead", "").trim()).replace(/\/+$/, "");
      if (!accountId) {
        sendJson(res, 400, { ok: false, error: "Account ID is required." });
        return;
      }
      const body = await parseBody(req);
      const teamLeadId = String(body.teamLeadId || "").trim();
      if (!teamLeadId) {
        sendJson(res, 400, { ok: false, error: "Team Lead is required." });
        return;
      }

      const users = await readUsers();
      const counselorIndex = users.findIndex((u) => String(u.id || "") === accountId);
      if (counselorIndex === -1) {
        sendJson(res, 404, { ok: false, error: "Counselor account not found." });
        return;
      }
      const counselor = users[counselorIndex];
      if (String(counselor.role || "") !== "Consultor" && String(counselor.role || "") !== "Counselor") {
        sendJson(res, 400, { ok: false, error: "Team Lead can only be assigned to counselor accounts." });
        return;
      }

      const teamLead = users.find((u) => String(u.id || "") === teamLeadId && String(u.role || "") === "Team Lead");
      if (!teamLead) {
        sendJson(res, 400, { ok: false, error: "Selected Team Lead is invalid." });
        return;
      }

      const updatedCounselor = {
        ...counselor,
        teamLeadId: teamLead.id,
        teamLeadName: String(teamLead.username || "").trim(),
        teamLeadEmail: normalizeEmail(teamLead.email),
        updatedAt: new Date().toISOString(),
      };
      const updatedUsers = [...users];
      updatedUsers[counselorIndex] = updatedCounselor;
      await writeUsers(updatedUsers);
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(updatedCounselor), avatar: publicAssetUrl(req, updatedCounselor.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts/admin/avatar") {
    try {
      const body = await parseBody(req);
      const avatar = String(body.avatar || "");
      if (!avatar.startsWith("data:image/")) {
        sendJson(res, 400, { ok: false, error: "Invalid image payload." });
        return;
      }
      if (avatar.length > 4_000_000) {
        sendJson(res, 400, { ok: false, error: "Image is too large." });
        return;
      }

      const users = await readUsers();
      const storedAvatarPath = await storeImageDataUrl(avatar, "admin-avatar");
      if (!storedAvatarPath) {
        sendJson(res, 400, { ok: false, error: "Unsupported image format." });
        return;
      }
      const { adminRecord, others } = splitAdminRecord(users);
      const adminAccount = {
        id: "ADM001",
        username: "admin",
        email: ADMIN_EMAIL || "admin@gmail.com",
        role: "Admin",
        avatar: storedAvatarPath,
        updatedAt: new Date().toISOString(),
      };
      const nextUsers = [...others, { ...(adminRecord || {}), ...adminAccount }];
      await writeUsers(nextUsers);
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(adminAccount), avatar: publicAssetUrl(req, adminAccount.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts/avatar") {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const avatar = String(body.avatar || "");
      if (!email) {
        sendJson(res, 400, { ok: false, error: "Email is required." });
        return;
      }
      if (!avatar.startsWith("data:image/")) {
        sendJson(res, 400, { ok: false, error: "Invalid image payload." });
        return;
      }
      if (avatar.length > 4_000_000) {
        sendJson(res, 400, { ok: false, error: "Image is too large." });
        return;
      }
      const storedAvatarPath = await storeImageDataUrl(avatar, "user-avatar");
      if (!storedAvatarPath) {
        sendJson(res, 400, { ok: false, error: "Unsupported image format." });
        return;
      }
      const users = await readUsers();
      const isAdminEmail = email === ADMIN_EMAIL;
      if (isAdminEmail) {
        const { adminRecord, others } = splitAdminRecord(users);
        const adminAccount = {
          id: "ADM001",
          username: "admin",
          email: ADMIN_EMAIL || "admin@gmail.com",
          role: "Admin",
          avatar: storedAvatarPath,
          updatedAt: new Date().toISOString(),
        };
        const nextUsers = [...others, { ...(adminRecord || {}), ...adminAccount }];
        await writeUsers(nextUsers);
        sendJson(res, 200, {
          ok: true,
          data: { ...sanitizeAccount(adminAccount), avatar: publicAssetUrl(req, adminAccount.avatar) },
        });
        return;
      }
      const accountIndex = users.findIndex((u) => normalizeEmail(u.email) === email);
      if (accountIndex === -1) {
        sendJson(res, 404, { ok: false, error: "Account not found." });
        return;
      }
      const updatedAccount = {
        ...users[accountIndex],
        avatar: storedAvatarPath,
        updatedAt: new Date().toISOString(),
      };
      const updatedUsers = [...users];
      updatedUsers[accountIndex] = updatedAccount;
      await writeUsers(updatedUsers);
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(updatedAccount), avatar: publicAssetUrl(req, updatedAccount.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts/profile-contact") {
    try {
      const body = await parseBody(req);
      const currentEmail = normalizeEmail(body.currentEmail);
      const nextEmail = normalizeEmail(body.email);
      const nextPhone = String(body.phone || "").trim();
      if (!currentEmail) {
        sendJson(res, 400, { ok: false, error: "Current email is required." });
        return;
      }
      if (!nextEmail) {
        sendJson(res, 400, { ok: false, error: "Email is required." });
        return;
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(nextEmail)) {
        sendJson(res, 400, { ok: false, error: "Enter a valid email." });
        return;
      }
      const users = await readUsers();
      const accountIndex = users.findIndex((u) => normalizeEmail(u.email) === currentEmail);
      if (accountIndex === -1) {
        sendJson(res, 404, { ok: false, error: "Account not found." });
        return;
      }
      const duplicate = users.find(
        (u, idx) => idx !== accountIndex && normalizeEmail(u.email) === nextEmail
      );
      if (duplicate) {
        sendJson(res, 409, { ok: false, error: "Account email already exists." });
        return;
      }
      const merged = {
        ...users[accountIndex],
        email: nextEmail,
        phone: nextPhone,
        updatedAt: new Date().toISOString(),
      };
      const updatedUsers = [...users];
      updatedUsers[accountIndex] = merged;
      await writeUsers(updatedUsers);
      sendJson(res, 200, {
        ok: true,
        data: { ...sanitizeAccount(merged), avatar: publicAssetUrl(req, merged.avatar) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/branches") {
    try {
      const branches = await readBranches();
      sendJson(res, 200, { ok: true, data: branches });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load branches." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/countries") {
    try {
      const countries = await readCountries();
      sendJson(res, 200, { ok: true, data: countries });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load countries." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/student-registration") {
    try {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const phone = String(body.phone || body.contactNumber || "").trim();
      const countryToVisitRaw = String(body.countryToVisit || "").trim();
      const city = String(body.city || "").trim();
      const nearestOfficeRaw = String(body.nearestOffice || "").trim();
      const currentEducationLevel = String(body.currentEducationLevel || "").trim();
      const intendedProgram = String(body.intendedProgram || "").trim();
      const message = String(body.message || "").trim();

      if (!name || !email || !phone || !countryToVisitRaw) {
        sendJson(res, 400, {
          ok: false,
          error: "Name, email, contact number, and country to visit are required.",
        });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(res, 400, { ok: false, error: "Please enter a valid email address." });
        return;
      }
      if (!currentEducationLevel || !intendedProgram) {
        sendJson(res, 400, {
          ok: false,
          error: "Current education level and intended program of study are required.",
        });
        return;
      }

      const countriesList = await readCountries();
      const matchedCountry = countriesList.find(
        (c) => String(c).trim().toLowerCase() === countryToVisitRaw.toLowerCase()
      );
      if (!matchedCountry) {
        sendJson(res, 400, {
          ok: false,
          error: "Please choose a valid country to visit from the list.",
        });
        return;
      }

      const branchesList = await readBranches();
      const branchLocations = branchesList
        .map((b) => String(b?.location || "").trim())
        .filter(Boolean);
      let nearestOffice = null;
      if (branchLocations.length > 0) {
        if (!nearestOfficeRaw) {
          sendJson(res, 400, {
            ok: false,
            error: "Please choose your nearest office from the list.",
          });
          return;
        }
        const matchedOffice = branchLocations.find(
          (loc) => loc.toLowerCase() === nearestOfficeRaw.toLowerCase()
        );
        if (!matchedOffice) {
          sendJson(res, 400, {
            ok: false,
            error: "Please choose a valid nearest office from the list.",
          });
          return;
        }
        nearestOffice = matchedOffice;
      }

      const entry = {
        id: `REQ-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        submittedAt: new Date().toISOString(),
        name,
        email,
        phone,
        countryToVisit: String(matchedCountry).trim(),
        city: city || null,
        nearestOffice,
        currentEducationLevel,
        intendedProgram,
        message: message || null,
        source: "student-reg-form",
      };

      await appendReqStudent(entry);
      sendJson(res, 201, {
        ok: true,
        data: { id: entry.id, submittedAt: entry.submittedAt },
      });
    } catch (e) {
      if (e && e.message === "Invalid JSON") {
        sendJson(res, 400, { ok: false, error: "Invalid request body." });
        return;
      }
      sendJson(res, 500, { ok: false, error: "Could not save your registration. Please try again later." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/req-students") {
    try {
      const branchParam = String(url.searchParams.get("branch") || "").trim();
      const all = await readReqStudents();
      if (!branchParam) {
        sendJson(res, 200, { ok: true, data: all });
        return;
      }
      const key = branchParam.toLowerCase();
      const filtered = all.filter((entry) => {
        const office = String(entry.nearestOffice || "").trim().toLowerCase();
        // Older submissions have no nearest office — still surface them so managers can add to pipeline.
        if (!office) return true;
        if (office === key) return true;
        if (key.includes(office) || office.includes(key)) return true;
        return false;
      });
      sendJson(res, 200, { ok: true, data: filtered });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load requested students." });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/req-students/")) {
    try {
      const requestId = decodeURIComponent(url.pathname.replace("/api/req-students/", "").trim()).replace(/\/+$/, "");
      if (!requestId) {
        sendJson(res, 400, { ok: false, error: "Request id is required." });
        return;
      }
      const removed = await removeReqStudentById(requestId);
      if (!removed.ok) {
        sendJson(res, 404, { ok: false, error: removed.error || "Request not found." });
        return;
      }
      sendJson(res, 200, { ok: true, data: { id: requestId } });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to remove request." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/countries") {
    try {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      if (!name) {
        sendJson(res, 400, { ok: false, error: "Country name is required." });
        return;
      }
      const existing = await readCountries();
      if (existing.some((c) => String(c).toLowerCase() === name.toLowerCase())) {
        sendJson(res, 409, { ok: false, error: "This country is already in the list." });
        return;
      }
      const next = [...existing, name].sort((a, b) => a.localeCompare(b));
      await writeCountries(next);
      sendJson(res, 201, { ok: true, data: next });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/meeting-settings") {
    try {
      const settings = await readMeetingSettings();
      sendJson(res, 200, { ok: true, data: settings });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load meeting settings." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/meeting-settings") {
    try {
      const body = await parseBody(req);
      const normalized = normalizeMeetingSettings(body);
      if (normalized.meetingDurationMinutes !== 30) {
        sendJson(res, 400, { ok: false, error: "Meeting duration must be 30 minutes." });
        return;
      }
      for (let day = 0; day <= 6; day++) {
        const schedule = normalized.daySchedules[day];
        if (!schedule) {
          sendJson(res, 400, { ok: false, error: "All 7 days must have a schedule." });
          return;
        }
        if (schedule.endHour <= schedule.startHour) {
          sendJson(res, 400, { ok: false, error: `End time must be after start time for day ${day}.` });
          return;
        }
      }
      await writeMeetingSettings(normalized);
      sendJson(res, 200, { ok: true, data: normalized });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/bookings") {
    try {
      const counselorId = String(url.searchParams.get("counselorId") || "").trim();
      const date = String(url.searchParams.get("date") || "").trim();
      const bookings = await readBookings();
      const filtered = bookings.filter((booking) => {
        if (counselorId && String(booking.counselorId || "") !== counselorId) return false;
        if (date && String(booking.date || "") !== date) return false;
        return true;
      });
      sendJson(res, 200, { ok: true, data: filtered });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load bookings." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    try {
      const body = await parseBody(req);
      const counselorId = String(body.counselorId || "").trim();
      const date = String(body.date || "").trim();
      const startTime = String(body.startTime || "").trim();
      const endTime = String(body.endTime || "").trim();
      const reason = String(body.reason || "").trim() || "Busy";
      if (!counselorId || !date || !startTime || !endTime) {
        sendJson(res, 400, { ok: false, error: "counselorId, date, startTime, and endTime are required." });
        return;
      }
      const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
        sendJson(res, 400, { ok: false, error: "Time format must be HH:MM." });
        return;
      }
      if (endTime <= startTime) {
        sendJson(res, 400, { ok: false, error: "End time must be after start time." });
        return;
      }
      const bookings = await readBookings();
      const booking = {
        id: `BLK-${crypto.randomUUID().slice(0, 8)}`,
        type: "busy",
        counselorId,
        date,
        startTime,
        endTime,
        reason,
        createdAt: new Date().toISOString(),
      };
      await writeBookings([...bookings, booking]);
      sendJson(res, 201, { ok: true, data: booking });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/bookings/")) {
    try {
      const bookingId = decodeURIComponent(url.pathname.replace("/api/bookings/", "").trim()).replace(/\/+$/, "");
      if (!bookingId) {
        sendJson(res, 400, { ok: false, error: "Booking ID is required." });
        return;
      }
      const bookings = await readBookings();
      const existing = bookings.find((item) => String(item.id || "") === bookingId);
      if (!existing) {
        sendJson(res, 404, { ok: false, error: "Booking not found." });
        return;
      }
      const updatedBookings = bookings.filter((item) => String(item.id || "") !== bookingId);
      await writeBookings(updatedBookings);
      sendJson(res, 200, { ok: true, data: existing });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/appointments") {
    try {
      const appointments = await readAppointments();
      sendJson(res, 200, { ok: true, data: appointments });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load appointments." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/invoices") {
    try {
      const invoices = await readInvoices();
      sendJson(res, 200, { ok: true, data: invoices });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load invoices." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tasks") {
    try {
      const tasks = await readTasks();
      sendJson(res, 200, { ok: true, data: tasks });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load tasks." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    try {
      const body = await parseBody(req);
      const taskName = String(body.task || "").trim();
      const studentId = String(body.student_id || "").trim();
      const assignedTo = Array.isArray(body.assigned_to) ? body.assigned_to.map((id) => String(id || "").trim()).filter(Boolean) : [];
      const priority = String(body.priority || "Medium").trim() || "Medium";
      const status = String(body.status || "Pending").trim() || "Pending";
      const dueDate = String(body.dueDate || "").trim();
      const isPrivate = body.isPrivate === true;
      if (!taskName || !studentId || !dueDate) {
        sendJson(res, 400, { ok: false, error: "task, student_id and dueDate are required." });
        return;
      }
      if (!isPrivate && assignedTo.length === 0) {
        sendJson(res, 400, { ok: false, error: "assigned_to is required for non-private tasks." });
        return;
      }
      const nowIso = new Date().toISOString();
      const task = {
        id: String(body.id || `T-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`),
        task: taskName,
        student_id: studentId,
        assigned_to: assignedTo,
        priority,
        status,
        dueDate,
        isPrivate,
        tier: String(body.tier || "Global"),
        phase: Number.isFinite(Number(body.phase)) ? Number(body.phase) : 1,
        isBlocking: body.isBlocking === true,
        documentType: body.documentType ? String(body.documentType) : undefined,
        createdBy: body.createdBy ? String(body.createdBy) : "",
        createdAt: String(body.createdAt || nowIso),
        updatedAt: nowIso
      };
      const tasks = await readTasks();
      await writeTasks([task, ...tasks]);
      sendJson(res, 201, { ok: true, data: task });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/tasks/")) {
    try {
      const taskId = decodeURIComponent(url.pathname.replace("/api/tasks/", "").trim()).replace(/\/+$/, "");
      if (!taskId) {
        sendJson(res, 400, { ok: false, error: "Task ID is required." });
        return;
      }
      const body = await parseBody(req);
      const tasks = await readTasks();
      const idx = tasks.findIndex((item) => String(item.id || "") === taskId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Task not found." });
        return;
      }
      const merged = {
        ...tasks[idx],
        ...body,
        id: tasks[idx].id,
        updatedAt: new Date().toISOString()
      };
      const updatedTasks = [...tasks];
      updatedTasks[idx] = merged;
      await writeTasks(updatedTasks);
      sendJson(res, 200, { ok: true, data: merged });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/invoices") {
    try {
      const body = await parseBody(req);
      const studentId = String(body.studentId || "").trim();
      const description = String(body.description || "").trim();
      const currency = String(body.currency || "LKR").trim().toUpperCase();
      const amountNum = Number(body.amount);
      const dueDate = String(body.dueDate || "").trim();
      if (!studentId || !description || !dueDate || !Number.isFinite(amountNum) || amountNum <= 0) {
        sendJson(res, 400, { ok: false, error: "Invalid invoice payload." });
        return;
      }
      const invoice = {
        id: String(body.id || `INV-${Date.now()}`),
        studentId,
        amount: Number(amountNum),
        currency,
        description,
        createdByName: String(body.createdByName || "").trim(),
        createdById: String(body.createdById || "").trim(),
        issueDate: String(body.issueDate || new Date().toISOString().split("T")[0]),
        dueDate,
        status: String(body.status || "Pending"),
        paymentMethod: body.paymentMethod ? String(body.paymentMethod) : undefined,
        generatedReceiptUrl: body.generatedReceiptUrl ? String(body.generatedReceiptUrl) : undefined,
        paymentProofUrl: body.paymentProofUrl ? String(body.paymentProofUrl) : undefined,
        paymentProofName: body.paymentProofName ? String(body.paymentProofName) : undefined,
        updatedAt: new Date().toISOString(),
      };
      const invoices = await readInvoices();
      await writeInvoices([invoice, ...invoices]);
      sendJson(res, 201, { ok: true, data: invoice });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/invoices/") && !url.pathname.endsWith("/payment-proof")) {
    try {
      const invoiceId = decodeURIComponent(url.pathname.replace("/api/invoices/", "").trim()).replace(/\/+$/, "");
      if (!invoiceId) {
        sendJson(res, 400, { ok: false, error: "Invoice ID is required." });
        return;
      }
      const body = await parseBody(req);
      const invoices = await readInvoices();
      const idx = invoices.findIndex((inv) => String(inv.id || "") === invoiceId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Invoice not found." });
        return;
      }
      const currentInvoice = invoices[idx];
      const actorRole = String(body.actorRole || "").trim();
      const isAcceptingPayment = String(body.status || "") === "Paid" && String(currentInvoice.status || "") === "Verifying";
      if (isAcceptingPayment && actorRole !== "Admin" && actorRole !== "Manager") {
        sendJson(res, 403, { ok: false, error: "Only Admin or Manager can accept invoice payments." });
        return;
      }
      const { actorRole: _actorRole, actorId: _actorId, ...safeBody } = body;
      const merged = {
        ...currentInvoice,
        ...safeBody,
        id: currentInvoice.id,
        updatedAt: new Date().toISOString(),
      };
      const updated = [...invoices];
      updated[idx] = merged;
      await writeInvoices(updated);
      sendJson(res, 200, { ok: true, data: merged });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/invoices/") && url.pathname.endsWith("/payment-proof")) {
    try {
      const invoiceId = decodeURIComponent(url.pathname.replace("/api/invoices/", "").replace("/payment-proof", "").trim()).replace(/\/+$/, "");
      if (!invoiceId) {
        sendJson(res, 400, { ok: false, error: "Invoice ID is required." });
        return;
      }
      const body = await parseBody(req);
      const dataUrl = String(body.dataUrl || "");
      const fileName = String(body.fileName || "payment-proof");
      if (!dataUrl.startsWith("data:")) {
        sendJson(res, 400, { ok: false, error: "Invalid payment proof payload." });
        return;
      }
      const stored = await storePaymentProofDataUrl(dataUrl, fileName);
      if (!stored) {
        sendJson(res, 400, { ok: false, error: "Unsupported payment proof format. Use PDF, JPG, or PNG." });
        return;
      }
      if (stored.error) {
        sendJson(res, 400, { ok: false, error: stored.error });
        return;
      }
      const invoices = await readInvoices();
      const idx = invoices.findIndex((inv) => String(inv.id || "") === invoiceId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Invoice not found." });
        return;
      }
      const merged = {
        ...invoices[idx],
        status: "Verifying",
        paymentMethod: "Bank Transfer",
        paymentProofUrl: `http://${req.headers.host}${stored.url}`,
        paymentProofName: stored.name,
        updatedAt: new Date().toISOString(),
      };
      const updated = [...invoices];
      updated[idx] = merged;
      await writeInvoices(updated);
      sendJson(res, 200, { ok: true, data: merged });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/appointments") {
    try {
      const body = await parseBody(req);
      const counselorId = String(body.counselorId || "").trim();
      const studentId = String(body.studentId || "").trim();
      const title = String(body.title || "").trim();
      const date = String(body.date || "").trim();
      const time = String(body.time || "").trim();
      const type = String(body.type || "").trim() || "Counseling";
      const status = String(body.status || "").trim() || "Scheduled";
      const duration = Number(body.duration) || 30;
      if (!counselorId || !studentId || !title || !date || !time) {
        sendJson(res, 400, { ok: false, error: "counselorId, studentId, title, date, and time are required." });
        return;
      }
      const appointment = {
        id: `APT-${crypto.randomUUID().slice(0, 8)}`,
        counselorId,
        studentId,
        title,
        date,
        time,
        duration,
        type,
        status,
        meetingLink: String(body.meetingLink || "https://meet.google.com/abc-defg-hij"),
        createdAt: new Date().toISOString(),
      };
      const appointments = await readAppointments();
      const upcomingScheduledForStudent = appointments.filter((item) => {
        if (String(item.studentId || "") !== studentId) return false;
        if (String(item.status || "") !== "Scheduled") return false;
        const itemDateTime = new Date(`${item.date}T${item.time}`).getTime();
        return Number.isFinite(itemDateTime) && itemDateTime > Date.now();
      }).length;
      if (upcomingScheduledForStudent >= 3) {
        sendJson(res, 400, { ok: false, error: "Students can only have up to 3 upcoming meetings." });
        return;
      }
      await writeAppointments([...appointments, appointment]);
      sendJson(res, 201, { ok: true, data: appointment });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/appointments/")) {
    try {
      const appointmentId = decodeURIComponent(url.pathname.replace("/api/appointments/", "").trim()).replace(/\/+$/, "");
      if (!appointmentId) {
        sendJson(res, 400, { ok: false, error: "Appointment ID is required." });
        return;
      }
      const body = await parseBody(req);
      const appointments = await readAppointments();
      const idx = appointments.findIndex((item) => String(item.id || "") === appointmentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Appointment not found." });
        return;
      }
      const updatedAppointment = {
        ...appointments[idx],
        ...body,
        id: appointments[idx].id,
        updatedAt: new Date().toISOString(),
      };
      const updatedAppointments = [...appointments];
      updatedAppointments[idx] = updatedAppointment;
      await writeAppointments(updatedAppointments);
      sendJson(res, 200, { ok: true, data: updatedAppointment });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/students") {
    try {
      const studemts = await readStudemts();
      sendJson(res, 200, { ok: true, data: studemts.map((student) => publicStudentRecord(req, student)) });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load students." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/university-programs") {
    try {
      const programs = await readUniversityPrograms();
      const includeHidden = url.searchParams.get("includeHidden") === "1";
      const visiblePrograms = includeHidden ? programs : programs.filter((program) => !program.isHidden);
      sendJson(res, 200, { ok: true, data: visiblePrograms });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load university programs." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/chats") {
    try {
      const userId = String(url.searchParams.get("userId") || "").trim();
      const shouldMarkRead = url.searchParams.get("markRead") !== "0";
      const chats = await readChats();
      let chatsForResponse = chats;
      if (userId && shouldMarkRead) {
        // Mark messages as read when the receiver opens their chat inbox.
        let hasReadUpdates = false;
        chatsForResponse = chats.map((chat) => {
          if (String(chat.receiverId || "") === userId && chat.read !== true) {
            hasReadUpdates = true;
            return { ...chat, read: true, readAt: new Date().toISOString() };
          }
          return chat;
        });
        if (hasReadUpdates) {
          await writeChats(chatsForResponse);
        }
      }
      const withPublicUrls = chatsForResponse.map((chat) => {
        if (!chat || !chat.attachment || !chat.attachment.url) return chat;
        return {
          ...chat,
          attachment: {
            ...chat.attachment,
            url: publicChatFileUrl(req, chat.attachment.url),
          },
        };
      });
      if (!userId) {
        sendJson(res, 200, { ok: true, data: withPublicUrls });
        return;
      }
      const scopedChats = withPublicUrls.filter(
        (chat) => String(chat.senderId || "") === userId || String(chat.receiverId || "") === userId
      );
      sendJson(res, 200, { ok: true, data: scopedChats });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load chats." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/activities") {
    try {
      const activities = await readActivities();
      sendJson(res, 200, { ok: true, data: activities });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load activities." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/activities") {
    try {
      const body = await parseBody(req);
      const action = String(body.action || "").trim();
      if (!action) {
        sendJson(res, 400, { ok: false, error: "Activity action is required." });
        return;
      }
      const nowIso = new Date().toISOString();
      const activity = {
        id: String(body.id || `act-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`),
        user: String(body.user || "System"),
        role: String(body.role || "System"),
        action,
        target: String(body.target || ""),
        type: String(body.type || "system"),
        timestamp: String(body.timestamp || "Just now"),
        createdAt: String(body.createdAt || nowIso),
        actorName: String(body.actorName || body.user || "System"),
        counselorName: String(body.counselorName || ""),
        studentName: String(body.studentName || ""),
        studentId: String(body.studentId || ""),
      };
      const activities = await readActivities();
      await writeActivities([activity, ...activities]);
      sendJson(res, 201, { ok: true, data: activity });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chats") {
    try {
      const body = await parseBody(req);
      const senderId = String(body.senderId || "").trim();
      const receiverId = String(body.receiverId || "").trim();
      const content = String(body.content || "").trim();
      const platform = String(body.platform || "portal").trim();
      const incomingAttachment =
        body.attachment && typeof body.attachment === "object" ? body.attachment : null;
      let attachment = null;
      if (incomingAttachment && incomingAttachment.dataUrl) {
        const stored = await storeChatAttachmentDataUrl(
          String(incomingAttachment.dataUrl || ""),
          String(incomingAttachment.name || "attachment")
        );
        if (!stored) {
          sendJson(res, 400, { ok: false, error: "Unsupported file type for chat attachment." });
          return;
        }
        if (stored.error) {
          sendJson(res, 400, { ok: false, error: stored.error });
          return;
        }
        attachment = {
          name: stored.name,
          mime: stored.mime,
          size: stored.size,
          url: stored.url,
        };
      }
      if (!senderId || !receiverId || (!content && !attachment)) {
        sendJson(res, 400, { ok: false, error: "senderId, receiverId and message content or attachment are required." });
        return;
      }
      const chats = await readChats();
      const chat = {
        id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
        senderId,
        receiverId,
        content,
        timestamp: new Date().toISOString(),
        read: false,
        platform: platform || "portal",
        attachment,
      };
      await writeChats([...chats, chat]);
      sendJson(res, 201, {
        ok: true,
        data: {
          ...chat,
          attachment: chat.attachment
            ? { ...chat.attachment, url: publicChatFileUrl(req, chat.attachment.url) }
            : null,
        },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/university-programs") {
    try {
      const body = await parseBody(req);
      const university = String(body.university || "").trim();
      const programName = String(body.programName || "").trim();
      const country = String(body.country || "").trim();
      const tuition = Number(body.tuition);
      const currency = String(body.currency || "").trim().toUpperCase();
      const duration = String(body.duration || "").trim();
      const intake = String(body.intake || "").trim();
      const minGPA = Number(body.minGPA);
      const minIELTS = Number(body.minIELTS);
      const qualificationName = String(body.qualificationName || "").trim();
      const qualificationMinValue = Number(body.qualificationMinValue);
      const ranking = Number(body.ranking);
      const tags = Array.isArray(body.tags) ? body.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
      const logoColor = String(body.logoColor || "").trim() || "bg-slate-700";

      if (!university || !programName || !country || !currency || !duration || !intake) {
        sendJson(res, 400, { ok: false, error: "University, program, country, currency, duration, and intake are required." });
        return;
      }
      if (!Number.isFinite(tuition) || tuition <= 0) {
        sendJson(res, 400, { ok: false, error: "Tuition must be a positive number." });
        return;
      }
      const hasQualification = !!qualificationName;
      if (hasQualification && (!Number.isFinite(qualificationMinValue) || qualificationMinValue < 0)) {
        sendJson(res, 400, { ok: false, error: "Qualification minimum value must be 0 or higher." });
        return;
      }
      if (!hasQualification) {
        if (!Number.isFinite(minGPA) || minGPA < 0) {
          sendJson(res, 400, { ok: false, error: "Minimum GPA must be 0 or higher." });
          return;
        }
        if (!Number.isFinite(minIELTS) || minIELTS < 0) {
          sendJson(res, 400, { ok: false, error: "Minimum IELTS must be 0 or higher." });
          return;
        }
      }
      if (!Number.isFinite(ranking) || ranking <= 0) {
        sendJson(res, 400, { ok: false, error: "Ranking must be a positive number." });
        return;
      }

      const programs = await readUniversityPrograms();
      const program = {
        id: `UP-${crypto.randomUUID().slice(0, 8)}`,
        university,
        programName,
        country,
        tuition,
        currency,
        duration,
        intake,
        minGPA: hasQualification ? 0 : minGPA,
        minIELTS: hasQualification ? 0 : minIELTS,
        qualificationName: hasQualification ? qualificationName : "",
        qualificationMinValue: hasQualification ? qualificationMinValue : 0,
        ranking: Math.floor(ranking),
        tags,
        logoColor,
        isHidden: false,
        createdAt: new Date().toISOString(),
      };
      await writeUniversityPrograms([program, ...programs]);
      sendJson(res, 201, { ok: true, data: program });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/university-programs/") && url.pathname.endsWith("/visibility")) {
    try {
      const programId = decodeURIComponent(url.pathname.replace("/api/university-programs/", "").replace("/visibility", "").trim()).replace(/\/+$/, "");
      if (!programId) {
        sendJson(res, 400, { ok: false, error: "Program ID is required." });
        return;
      }
      const body = await parseBody(req);
      const isHidden = Boolean(body.isHidden);
      const programs = await readUniversityPrograms();
      const index = programs.findIndex((program) => String(program.id || "") === programId);
      if (index === -1) {
        sendJson(res, 404, { ok: false, error: "University program not found." });
        return;
      }
      const updatedProgram = {
        ...programs[index],
        isHidden,
        updatedAt: new Date().toISOString(),
      };
      const updatedPrograms = [...programs];
      updatedPrograms[index] = updatedProgram;
      await writeUniversityPrograms(updatedPrograms);
      sendJson(res, 200, { ok: true, data: updatedProgram });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/university-programs/")) {
    try {
      const programId = decodeURIComponent(url.pathname.replace("/api/university-programs/", "").trim()).replace(/\/+$/, "");
      if (!programId) {
        sendJson(res, 400, { ok: false, error: "Program ID is required." });
        return;
      }
      const programs = await readUniversityPrograms();
      const index = programs.findIndex((program) => String(program.id || "") === programId);
      if (index === -1) {
        sendJson(res, 404, { ok: false, error: "University program not found." });
        return;
      }
      const removedProgram = programs[index];
      const updatedPrograms = programs.filter((program) => String(program.id || "") !== programId);
      await writeUniversityPrograms(updatedPrograms);
      sendJson(res, 200, { ok: true, data: removedProgram });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/students") {
    try {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const country = String(body.country || "").trim();
      const branch = String(body.branch || "").trim();
      const email = normalizeEmail(body.email);
      const phone = String(body.phone || "").trim();
      const password = String(body.password || "").trim();
      const ielts = String(body.ielts || "").trim() || "Pending";
      const gpa = String(body.gpa || "").trim();
      const status = String(body.status || "").trim() || "Inquiry";
      const budget = String(body.budget || "").trim();
      const priority = String(body.priority || "").trim() || "Medium";
      const counselor = String(body.counselor || "").trim() || "Unassigned";
      const notes = String(body.notes || "").trim() || "Newly added via CRM.";
      const lastEducationDate =
        String(body.lastEducationDate || "").trim() || new Date().toISOString().split("T")[0];
      const documents = Array.isArray(body.documents) ? body.documents : [];

      if (!name || !country || !branch || !email || !phone || !gpa || !password) {
        sendJson(res, 400, { ok: false, error: "Name, country, branch, email, phone, GPA and password are required." });
        return;
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        sendJson(res, 400, { ok: false, error: "Enter a valid email." });
        return;
      }

      const studemts = await readStudemts();
      if (studemts.some((s) => normalizeEmail(s.email) === email)) {
        sendJson(res, 409, { ok: false, error: "Student email already exists." });
        return;
      }
      const users = await readUsers();
      if (email === ADMIN_EMAIL || users.some((u) => normalizeEmail(u.email) === email)) {
        sendJson(res, 409, { ok: false, error: "Email is already used by an account." });
        return;
      }

      const maxStudentNumber = studemts.reduce((max, student) => {
        const match = String(student.id || "").match(/^STU(\d+)$/);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 999);
      const nowIso = new Date().toISOString();
      const student = {
        id: `STU${maxStudentNumber + 1}`,
        name,
        country,
        branch,
        email,
        phone,
        password,
        ielts,
        gpa,
        status,
        budget,
        priority,
        counselor,
        notes,
        lastEducationDate,
        documents,
        createdAt: nowIso,
        stageEnteredAt: nowIso
      };
      const updated = [...studemts, student];
      await writeStudemts(updated);
      sendJson(res, 201, { ok: true, data: publicStudentRecord(req, student) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/students/")) {
    try {
      const studentId = decodeURIComponent(url.pathname.replace("/api/students/", "").trim());
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return;
      }
      const body = await parseBody(req);
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return;
      }
      const merged = {
        ...studemts[idx],
        ...body,
        id: studemts[idx].id,
        updatedAt: new Date().toISOString(),
      };
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, { ok: true, data: publicStudentRecord(req, merged) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/avatar")) {
    try {
      const studentId = decodeURIComponent(url.pathname.replace("/api/students/", "").replace("/avatar", "").trim()).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return;
      }
      const body = await parseBody(req);
      const avatar = String(body.avatar || "");
      if (!avatar.startsWith("data:image/")) {
        sendJson(res, 400, { ok: false, error: "Invalid image payload." });
        return;
      }
      if (avatar.length > 4_000_000) {
        sendJson(res, 400, { ok: false, error: "Image is too large." });
        return;
      }
      const storedAvatarPath = await storeImageDataUrl(avatar, "student-avatar");
      if (!storedAvatarPath) {
        sendJson(res, 400, { ok: false, error: "Unsupported image format." });
        return;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return;
      }
      const merged = {
        ...studemts[idx],
        avatar: storedAvatarPath,
        updatedAt: new Date().toISOString(),
      };
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, { ok: true, data: publicStudentRecord(req, merged) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/cv")) {
    try {
      const studentId = decodeURIComponent(url.pathname.replace("/api/students/", "").replace("/cv", "").trim()).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return;
      }
      const body = await parseBody(req);
      const dataUrl = String(body.dataUrl || "");
      const fileName = String(body.fileName || "cv");
      if (!dataUrl.startsWith("data:")) {
        sendJson(res, 400, { ok: false, error: "Invalid CV payload." });
        return;
      }
      const stored = await storeStudentCvDataUrl(dataUrl, fileName);
      if (!stored) {
        sendJson(res, 400, { ok: false, error: "Unsupported CV format. Use PDF, DOC, or DOCX." });
        return;
      }
      if (stored.error) {
        sendJson(res, 400, { ok: false, error: stored.error });
        return;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return;
      }
      const merged = {
        ...studemts[idx],
        cvFile: {
          name: stored.name,
          mime: stored.mime,
          size: stored.size,
          url: stored.url,
          uploadedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, { ok: true, data: publicStudentRecord(req, merged) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/documents")) {
    try {
      const studentId = decodeURIComponent(url.pathname.replace("/api/students/", "").replace("/documents", "").trim()).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return;
      }
      const body = await parseBody(req);
      const dataUrl = String(body.dataUrl || "");
      const fileName = String(body.fileName || "document");
      const docType = String(body.docType || "").trim();
      const tier = String(body.tier || "Global").trim() || "Global";
      const phaseNumber = Number(body.phase);
      const phase = Number.isFinite(phaseNumber) ? Math.max(1, Math.floor(phaseNumber)) : 1;
      if (!docType) {
        sendJson(res, 400, { ok: false, error: "Document type is required." });
        return;
      }
      if (!dataUrl.startsWith("data:")) {
        sendJson(res, 400, { ok: false, error: "Invalid document payload." });
        return;
      }
      const stored = await storeStudentPermissionDataUrl(dataUrl, fileName);
      if (!stored) {
        sendJson(res, 400, { ok: false, error: "Unsupported document format. Use PDF, JPG, PNG, DOC, or DOCX." });
        return;
      }
      if (stored.error) {
        sendJson(res, 400, { ok: false, error: stored.error });
        return;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return;
      }
      const newDocument = {
        id: `doc-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
        name: stored.name,
        type: docType,
        status: "Pending",
        uploadedAt: new Date().toISOString(),
        phase,
        tier,
        mime: stored.mime,
        size: stored.size,
        url: stored.url,
      };
      const existingDocuments = Array.isArray(studemts[idx].documents) ? studemts[idx].documents : [];
      const merged = {
        ...studemts[idx],
        documents: [...existingDocuments, newDocument],
        updatedAt: new Date().toISOString(),
      };
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, {
        ok: true,
        data: publicStudentRecord(req, merged),
        document: { ...newDocument, url: publicStudentDocUrl(req, newDocument.url) },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/branches") {
    try {
      const body = await parseBody(req);
      const location = String(body.location || "").trim();
      const totalInquiries = Number.isFinite(Number(body.totalInquiries)) ? Number(body.totalInquiries) : 0;
      const successes = Number.isFinite(Number(body.successes)) ? Number(body.successes) : 0;
      const revenue = Number.isFinite(Number(body.revenue)) ? Number(body.revenue) : 0;
      if (!location) {
        sendJson(res, 400, { ok: false, error: "Branch location is required." });
        return;
      }

      const branches = await readBranches();
      if (branches.some((b) => String(b.location || "").toLowerCase() === location.toLowerCase())) {
        sendJson(res, 409, { ok: false, error: "Branch location already exists." });
        return;
      }

      const branch = {
        id: `BR-${crypto.randomUUID().slice(0, 8)}`,
        location,
        totalInquiries: Math.max(0, Math.floor(totalInquiries)),
        successes: Math.max(0, Math.floor(successes)),
        revenue: Math.max(0, revenue),
        createdAt: new Date().toISOString(),
      };
      const updated = [...branches, branch];
      await writeBranches(updated);
      sendJson(res, 201, { ok: true, data: branch });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
    try {
      const fileName = path.basename(url.pathname);
      const filePath = path.join(ASSETS_DIR, fileName);
      const file = await fs.readFile(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const contentType =
        ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".svg"
              ? "image/svg+xml"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".gif"
                ? "image/gif"
                : "application/octet-stream";
      Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.end(file);
    } catch {
      sendJson(res, 404, { ok: false, error: "Asset not found." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/chat-files/")) {
    try {
      const fileName = path.basename(url.pathname);
      const filePath = path.join(CHAT_FILES_DIR, fileName);
      const file = await fs.readFile(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const contentType =
        ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".gif"
                ? "image/gif"
                : ext === ".pdf"
                  ? "application/pdf"
                  : ext === ".txt"
                    ? "text/plain; charset=utf-8"
                    : ext === ".doc"
                      ? "application/msword"
                      : ext === ".docx"
                        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        : ext === ".xls"
                          ? "application/vnd.ms-excel"
                          : ext === ".xlsx"
                            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            : "application/octet-stream";
      Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.end(file);
    } catch {
      sendJson(res, 404, { ok: false, error: "Chat file not found." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/student-docs/cv/")) {
    try {
      const fileName = path.basename(url.pathname);
      const filePath = path.join(STUDENT_CV_DIR, fileName);
      const file = await fs.readFile(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const contentType =
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".doc"
            ? "application/msword"
            : ext === ".docx"
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : "application/octet-stream";
      Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.end(file);
    } catch {
      sendJson(res, 404, { ok: false, error: "CV file not found." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/student-docs/permissions/")) {
    try {
      const fileName = path.basename(url.pathname);
      const filePath = path.join(STUDENT_PERMISSIONS_DIR, fileName);
      const file = await fs.readFile(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const contentType =
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".png"
            ? "image/png"
            : ext === ".jpg" || ext === ".jpeg"
              ? "image/jpeg"
              : ext === ".doc"
                ? "application/msword"
                : ext === ".docx"
                  ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  : "application/octet-stream";
      Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.end(file);
    } catch {
      sendJson(res, 404, { ok: false, error: "Permission document not found." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/payments/")) {
    try {
      const fileName = path.basename(url.pathname);
      const filePath = path.join(PAYMENTS_DIR, fileName);
      const file = await fs.readFile(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const contentType =
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".png"
            ? "image/png"
            : ext === ".jpg" || ext === ".jpeg"
              ? "image/jpeg"
              : "application/octet-stream";
      Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.end(file);
    } catch {
      sendJson(res, 404, { ok: false, error: "Payment proof not found." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.statusCode = 200;
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`Server is running on port ${PORT}\n`);
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found." });
});

server.listen(PORT, () => {
  console.log(`Backend listening at http://localhost:${PORT}`);
});
