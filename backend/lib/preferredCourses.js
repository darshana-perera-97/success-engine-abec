function normalizePreferredCourses(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, idx) => {
      if (!item || typeof item !== "object") return null;
      const programId = String(item.programId || "").trim() || null;
      const university = String(item.university || "").trim();
      const programName = String(item.programName || item.courseName || item.name || "").trim();
      if (!university && !programName) return null;
      const entryId = String(
        item.entryId || item._id || `${programId || "course"}-${idx}-${programName}`
      ).trim();
      return {
        entryId,
        programId,
        university,
        programName,
        country: String(item.country || "").trim() || null,
        intake: String(item.intake || "").trim() || null,
        isManual: item.isManual === true || !programId,
      };
    })
    .filter(Boolean);
}

function summarizePreferredCourses(courses) {
  return normalizePreferredCourses(courses)
    .map((course) => {
      const uni = String(course.university || "").trim();
      const prog = String(course.programName || "").trim();
      if (uni && prog) return `${prog} — ${uni}`;
      return uni || prog || "";
    })
    .filter(Boolean)
    .join("; ");
}

/**
 * Prefer explicit preferredCourses; otherwise keep intendedProgram string.
 * When preferredCourses is present, intendedProgram is derived as a readable summary.
 */
function resolvePreferredCoursesAndProgram(body) {
  const preferredCourses = normalizePreferredCourses(body?.preferredCourses);
  const intendedFromBody = String(body?.intendedProgram || "").trim();
  if (preferredCourses.length) {
    return {
      preferredCourses,
      intendedProgram: summarizePreferredCourses(preferredCourses) || intendedFromBody || null,
    };
  }
  return {
    preferredCourses: [],
    intendedProgram: intendedFromBody || null,
  };
}

module.exports = {
  normalizePreferredCourses,
  summarizePreferredCourses,
  resolvePreferredCoursesAndProgram,
};
