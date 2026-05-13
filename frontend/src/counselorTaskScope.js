/**
 * Task visibility for counselors: keep in sync with Task Manager (Counselor role).
 * A task counts if the counselor is in assigned_to / counselor_ids, or the task
 * belongs to a monitored student and every assignee is either the counselor (any
 * linked id/email/name) or the student id (portal convention for shared queues).
 * Tasks assigned only to other counselors on the same student are excluded.
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
    const relatedCounselorIds = Array.isArray(task.counselor_ids) ? task.counselor_ids : [];
    const isAssigned = assignedTo.some((assignee) => identitySet.has(normalize(assignee)));
    const isRelatedCounselorTask = relatedCounselorIds.some((counselorId) => identitySet.has(normalize(counselorId)));
    if (isAssigned || isRelatedCounselorTask) return true;
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
