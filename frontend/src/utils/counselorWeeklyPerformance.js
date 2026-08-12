import { normalizePipelineStatus } from "../pipeline";
import { isCounselorEquivalentAccountRole } from "../roles";

const normalize = (value) => String(value || "").trim().toLowerCase();

export function getCounselorStudents(counselor, students = []) {
  const counselorId = normalize(counselor.id);
  const counselorEmail = normalize(counselor.email);
  const counselorName = normalize(counselor.name || counselor.username);
  return (students || []).filter((student) => {
    const studentCounselorId = normalize(student.counselor || student.inquiryCounselorId);
    const studentCounselorName = normalize(student.counselorName);
    if (studentCounselorId && studentCounselorId === counselorId) return true;
    if (studentCounselorName && counselorName && studentCounselorName === counselorName) return true;
    if (Array.isArray(student.counselorHistory) && counselorId) {
      return student.counselorHistory.some((id) => normalize(id) === counselorId);
    }
    if (studentCounselorName && counselorEmail) {
      return studentCounselorName === counselorEmail;
    }
    return false;
  });
}

export function computeWeeklyPerformanceScore(students = []) {
  let score = 0;
  let visas = 0;
  (students || []).forEach((s) => {
    const x = normalizePipelineStatus(s.status);
    const hasVisaOutcome = x === "Visa" || x === "Enrolled" || s.status === "Visa Pilot";
    if (hasVisaOutcome) {
      score += 50;
      visas += 1;
    } else if (x === "Interview training" || s.status === "Offer Received") score += 10;
    else if (x === "Application" || s.status === "Uni Application") score += 5;
    else if (x === "Documentation") score += 2;
  });
  return { score, visas, activeCount: (students || []).length };
}

export function buildCounselorWeeklyLeaderboard(students = [], employees = []) {
  const counselors = (employees || []).filter((employee) => isCounselorEquivalentAccountRole(employee.role));
  return counselors
    .map((counselor) => {
      const myStudents = getCounselorStudents(counselor, students);
      const { score, visas, activeCount } = computeWeeklyPerformanceScore(myStudents);
      return { ...counselor, score, visas, activeCount };
    })
    .sort((a, b) => b.score - a.score || b.visas - a.visas || b.activeCount - a.activeCount);
}

export function findCounselorWeeklyRank(leaderboard = [], { id = "", email = "" } = {}) {
  const normalizedEmail = normalize(email);
  const normalizedId = String(id || "").trim();
  const index = leaderboard.findIndex(
    (entry) =>
      String(entry.id || "") === normalizedId ||
      normalize(entry.email) === normalizedEmail
  );
  return index >= 0 ? index + 1 : 0;
}
