const { readUsers, stripUserSecrets } = require("../models/users");
const { readStudemts, stripStudentSecrets } = require("../models/students");
const { readBranches } = require("../models/branches");
const { readTasks } = require("../models/tasks");
const { readActivities } = require("../models/activities");
const { readAppointments } = require("../models/appointments");
const { readCountries } = require("../models/countries");
const { readChats } = require("../models/chats");

async function readSafe(reader, fallback) {
  try {
    const value = await reader();
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function documentTypeMatchesSlaRequirement(docType, requiredDocType) {
  const dt = String(docType || "");
  const req = String(requiredDocType || "");
  if (!req) return false;
  return dt === req || dt.includes(req) || req.includes(dt);
}

function slaRequirementSatisfiedByVerifiedDocument(documents, requiredDocType) {
  const docs = Array.isArray(documents) ? documents : [];
  for (const d of docs) {
    if (!d || typeof d !== "object") continue;
    if (!documentTypeMatchesSlaRequirement(d.type, requiredDocType)) continue;
    const st = String(d.status || "").trim().toLowerCase();
    if (st === "verified") return true;
  }
  return false;
}

function effectiveSlaMissingItemsForViolation(violation, documents) {
  if (!violation || typeof violation !== "object") return [];
  const missingItems = Array.isArray(violation.missingItems) ? violation.missingItems.filter(Boolean) : [];
  return missingItems.filter((req) => !slaRequirementSatisfiedByVerifiedDocument(documents, req));
}

function reconcileSlaViolationsOnStudentRecord(student) {
  const raw = student?.slaViolations;
  if (!Array.isArray(raw) || raw.length === 0) return raw;
  const docs = Array.isArray(student?.documents) ? student.documents : [];
  return raw.map((v) => {
    if (!v || typeof v !== "object") return v;
    const remaining = effectiveSlaMissingItemsForViolation(v, docs);
    return { ...v, resolved: remaining.length === 0 };
  });
}

function countActiveSlaViolationsOnStudent(student) {
  const raw = student?.slaViolations;
  if (!Array.isArray(raw) || raw.length === 0) return 0;
  const docs = Array.isArray(student?.documents) ? student.documents : [];
  let n = 0;
  for (const v of raw) {
    if (!v) continue;
    if (effectiveSlaMissingItemsForViolation(v, docs).length > 0) n += 1;
  }
  return n;
}

function buildAdminDataSummary({ users, students, branches, tasks, activities, appointments, countries, reqStudents, chats }) {
  const studentsByBranch = {};
  const studentsByStage = {};
  const studentsByCountry = {};
  let unresolvedSlaViolations = 0;
  for (const s of students) {
    const b = String(s.branch || "Unassigned");
    const stage = String(s.status || "Unknown");
    const c = String(s.country || "Unassigned");
    studentsByBranch[b] = (studentsByBranch[b] || 0) + 1;
    studentsByStage[stage] = (studentsByStage[stage] || 0) + 1;
    studentsByCountry[c] = (studentsByCountry[c] || 0) + 1;
    if (Array.isArray(s.slaViolations)) {
      unresolvedSlaViolations += countActiveSlaViolationsOnStudent(s);
    }
  }

  const tasksByStatus = {};
  let overdueTasks = 0;
  let pendingReviews = 0;
  const todayIso = new Date().toISOString().slice(0, 10);
  for (const t of tasks) {
    const status = String(t.status || "Unknown");
    tasksByStatus[status] = (tasksByStatus[status] || 0) + 1;
    if (status === "Overdue") overdueTasks += 1;
    else if (t.dueDate && String(t.dueDate) < todayIso && status !== "Completed" && status !== "Done") {
      overdueTasks += 1;
    }
    if (status === "In Review") pendingReviews += 1;
  }

  const usersByRole = {};
  for (const u of users) {
    const r = String(u.role || "Unknown");
    usersByRole[r] = (usersByRole[r] || 0) + 1;
  }

  const appointmentsByStatus = {};
  for (const a of appointments) {
    const s = String(a.status || "Unknown");
    appointmentsByStatus[s] = (appointmentsByStatus[s] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      users: users.length,
      students: students.length,
      branches: branches.length,
      tasks: tasks.length,
      activities: activities.length,
      appointments: appointments.length,
      countries: countries.length,
      reqStudents: reqStudents.length,
      chatMessages: chats.length,
    },
    studentsByBranch,
    studentsByStage,
    studentsByCountry,
    tasksByStatus,
    overdueTasks,
    pendingReviews,
    unresolvedSlaViolations,
    usersByRole,
    appointmentsByStatus,
  };
}

async function buildAdminAiContext() {
  const [usersRaw, studentsRaw, branches, tasks, activities, appointments, countries, chats] =
    await Promise.all([
      readSafe(readUsers, []),
      readSafe(readStudemts, []),
      readSafe(readBranches, []),
      readSafe(readTasks, []),
      readSafe(readActivities, []),
      readSafe(readAppointments, []),
      readSafe(readCountries, []),
      readSafe(readChats, []),
    ]);

  const users = (usersRaw || []).map(stripUserSecrets);
  const students = (studentsRaw || []).map(stripStudentSecrets);

  const recentActivities = (activities || [])
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 30);

  const recentChats = (chats || [])
    .slice()
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
    .slice(0, 25)
    .map((c) => ({
      id: c.id,
      senderId: c.senderId,
      receiverId: c.receiverId,
      content: typeof c.content === "string" ? c.content.slice(0, 240) : "",
      timestamp: c.timestamp,
      platform: c.platform || "portal",
      read: c.read === true,
    }));

  const reqStudents = [];

  const summary = buildAdminDataSummary({
    users,
    students,
    branches: branches || [],
    tasks: tasks || [],
    activities: activities || [],
    appointments: appointments || [],
    countries: countries || [],
    reqStudents,
    chats: chats || [],
  });

  return {
    summary,
    branches: branches || [],
    countries: countries || [],
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      branch: u.branch,
      country: u.country,
      teamLeadId: u.teamLeadId || "",
      teamLeadName: u.teamLeadName || "",
      createdAt: u.createdAt,
    })),
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      country: s.country,
      branch: s.branch,
      email: s.email,
      phone: s.phone,
      status: s.status,
      priority: s.priority,
      ielts: s.ielts,
      gpa: s.gpa,
      budget: s.budget,
      counselor: s.counselor,
      counselorName: s.counselorName,
      stageEnteredAt: s.stageEnteredAt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      notes: typeof s.notes === "string" ? s.notes.slice(0, 400) : s.notes,
      documentsCount: Array.isArray(s.documents) ? s.documents.length : 0,
      slaViolations: Array.isArray(s.slaViolations)
        ? s.slaViolations.map((v) => ({
            id: v.id,
            stage: v.stage,
            missingItems: v.missingItems,
            timestamp: v.timestamp,
            resolved: v.resolved === true,
          }))
        : [],
    })),
    tasks: (tasks || []).map((t) => ({
      id: t.id,
      task: t.task,
      student_id: t.student_id,
      assigned_to: t.assigned_to,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      tier: t.tier,
      phase: t.phase,
      isBlocking: t.isBlocking,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    appointments: (appointments || []).map((a) => ({
      id: a.id,
      counselorId: a.counselorId,
      studentId: a.studentId,
      title: a.title,
      date: a.date,
      time: a.time,
      duration: a.duration,
      type: a.type,
      status: a.status,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    reqStudents,
    recentActivities,
    recentChats,
  };
}

module.exports = {
  readSafe,
  documentTypeMatchesSlaRequirement,
  slaRequirementSatisfiedByVerifiedDocument,
  effectiveSlaMissingItemsForViolation,
  reconcileSlaViolationsOnStudentRecord,
  countActiveSlaViolationsOnStudent,
  buildAdminDataSummary,
  buildAdminAiContext,
};
