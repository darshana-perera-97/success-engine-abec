/**
 * Task visibility for counselors: keep in sync with Task Manager (Counselor role).
 * A task counts if the counselor is in assigned_to, or the task
 * belongs to a monitored student and every assignee is either the counselor (any
 * linked id/email/name) or the student id (portal convention for shared queues).
 * Tasks assigned only to other counselors on the same student are excluded.
 * Student-upload request tasks (requiresStudentDocuments) are excluded from this
 * fallback unless the counselor is directly assigned/linked.
 */

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function buildCounselorIdentitySet(currentUser) {
  const set = new Set();
  const add = (v) => {
    const n = normalize(v);
    if (n) set.add(n);
  };
  if (currentUser) {
    add(currentUser.id);
    add(currentUser.email);
    add(currentUser.name);
  }
  return set;
}

/**
 * Normalized ids/emails/names for the signed-in counselor (or explicit override from App).
 */
export function resolveCounselorIdentitySet(currentUser, identitySetOverride) {
  if (identitySetOverride instanceof Set && identitySetOverride.size > 0) {
    return identitySetOverride;
  }
  return buildCounselorIdentitySet(currentUser);
}

/** True when the task lists the counselor in assigned_to. */
export function isTaskDirectlyAssignedToIdentities(task, identitySet) {
  if (!(identitySet instanceof Set) || identitySet.size === 0) return false;
  const assignedTo = Array.isArray(task.assigned_to) ? task.assigned_to : [];
  return assignedTo.some((assignee) => identitySet.has(normalize(assignee)));
}

/**
 * Same visibility rules as {@link filterTasksForCounselor}, but uses an explicit
 * identity set (e.g. merged account + employee aliases for manager roster math).
 *
 * @param {Array} tasks
 * @param {Set<string>} identitySet  normalized lowercase ids/emails/names
 * @param {Array} monitoredStudents
 * @returns {Array}
 */
export function filterTasksForCounselorIdentities(tasks, identitySet, monitoredStudents) {
  const studentIds = buildMonitoredStudentIdSet(monitoredStudents);
  return (tasks || []).filter((task) => {
    const assignedTo = Array.isArray(task.assigned_to) ? task.assigned_to : [];
    const isAssigned = assignedTo.some((assignee) => identitySet.has(normalize(assignee)));
    if (isAssigned) return true;
    if (task?.requiresStudentDocuments === true) return false;
    const sid = String(task.student_id || task.studentId || "").trim();
    const isMonitoredStudentTask = sid ? studentIds.has(sid) : false;
    if (!isMonitoredStudentTask) return false;
    const sidNorm = normalize(sid);
    const assigneesAreOnlyMeOrStudent =
      assignedTo.length === 0 ||
      assignedTo.every((a) => {
        const n = normalize(a);
        if (!n) return true;
        return identitySet.has(n) || (sidNorm && n === sidNorm);
      });
    return assigneesAreOnlyMeOrStudent;
  });
}

function buildMonitoredStudentIdSet(monitoredStudents) {
  return new Set(
    (monitoredStudents || [])
      .map((item) => String(item?.id || "").trim())
      .filter(Boolean)
  );
}

/** All tasks linked to students in the counselor/coordinator monitored list (any assignee). */
export function filterTasksForMonitoredStudents(tasks, monitoredStudents) {
  const studentIds = buildMonitoredStudentIdSet(monitoredStudents);
  return (tasks || []).filter((task) => {
    const sid = String(task.student_id || task.studentId || "").trim();
    return sid && studentIds.has(sid);
  });
}

/**
 * @param {Array} tasks
 * @param {object} currentUser
 * @param {Array} monitoredStudents  Same list passed to Task Manager as monitoredStudents
 * @param {Set<string>|null|undefined} identitySetOverride  Optional normalized identities
 *   (e.g. account id + employee id + email from App) for reliable assignee matching
 * @returns {Array}
 */
export function filterTasksForCounselor(tasks, currentUser, monitoredStudents, identitySetOverride) {
  const identitySet =
    identitySetOverride instanceof Set && identitySetOverride.size > 0
      ? identitySetOverride
      : buildCounselorIdentitySet(currentUser);
  return filterTasksForCounselorIdentities(tasks, identitySet, monitoredStudents);
}

export function isNewStudentIntakeTask(task) {
  return String(task?.task || "").trim().startsWith("New student intake");
}

export function findPendingStudentIntakeTasks(tasks, studentId) {
  const sid = String(studentId || "").trim();
  if (!sid) return [];
  return (tasks || []).filter((t) => {
    const tid = String(t.student_id || t.studentId || "").trim();
    if (tid !== sid) return false;
    if (!isNewStudentIntakeTask(t)) return false;
    return String(t.status || "").trim().toLowerCase() !== "completed";
  });
}

export function isTaskOverdueByDate(task) {
  if (task.status === "Overdue") return true;
  if (task.status === "Completed") return false;
  if (!task.dueDate) return false;
  const d = new Date(String(task.dueDate));
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

const MS_DAY = 864e5;

function startOfLocalDay(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Human-readable calendar slack until the due date (local midnight), matching Task Manager.
 */
export function formatCalendarDaysRemainingLabel(dueDateRaw, now = new Date()) {
  if (dueDateRaw == null || String(dueDateRaw).trim() === "") return "No due date";
  const dueStart = startOfLocalDay(String(dueDateRaw));
  const todayStart = startOfLocalDay(now);
  if (dueStart == null || todayStart == null) return "—";
  const diffDays = Math.round((dueStart - todayStart) / MS_DAY);
  if (diffDays < 0) {
    const od = -diffDays;
    return od === 1 ? "Overdue · 1 day" : `Overdue · ${od} days`;
  }
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "1 day left";
  return `${diffDays} days left`;
}
