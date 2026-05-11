/**
 * Task visibility for counselors: keep in sync with Task Manager (Counselor role).
 * A task counts if the counselor is in assigned_to (id, email, or name) or the
 * student is in the monitored student list.
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
 * @returns {Array}
 */
export function filterTasksForCounselor(tasks, currentUser, monitoredStudents) {
  const identitySet = buildCounselorIdentitySet(currentUser);
  const studentIds = buildMonitoredStudentIdSet(monitoredStudents);
  return (tasks || []).filter((task) => {
    const assignedTo = Array.isArray(task.assigned_to) ? task.assigned_to : [];
    const relatedCounselorIds = Array.isArray(task.counselor_ids) ? task.counselor_ids : [];
    const isAssigned = assignedTo.some((assignee) => identitySet.has(normalize(assignee)));
    const isRelatedCounselorTask = relatedCounselorIds.some((counselorId) => identitySet.has(normalize(counselorId)));
    const isMonitoredStudentTask = studentIds.has(String(task.student_id || "").trim());
    return isAssigned || isRelatedCounselorTask || isMonitoredStudentTask;
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
