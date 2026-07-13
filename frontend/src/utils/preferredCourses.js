export const MAX_PREFERRED_COURSE_ROWS = 5;

export function normalizePreferredCourses(raw) {
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
        isManual: item.isManual === true || !programId
      };
    })
    .filter(Boolean);
}

export function formatCourseLabel(course) {
  const uni = String(course?.university || "").trim();
  const prog = String(course?.programName || "").trim();
  if (uni && prog) return `${prog} — ${uni}`;
  return uni || prog || "Course";
}

export function summarizePreferredCourses(courses) {
  return normalizePreferredCourses(courses)
    .map(formatCourseLabel)
    .filter((label) => label && label !== "Course")
    .join("; ");
}

/** Split a free-typed "program — university" line into parts. */
export function parseCourseUniversityLine(raw) {
  const line = String(raw || "").trim();
  if (!line) return { programName: "", university: "" };

  const separators = [" — ", " – ", " - ", " at ", " @ ", ", "];
  for (const sep of separators) {
    const idx = line.toLowerCase().indexOf(sep.toLowerCase());
    if (idx <= 0) continue;
    const programName = line.slice(0, idx).trim();
    const university = line.slice(idx + sep.length).trim();
    if (programName && university) return { programName, university };
  }

  return { programName: line, university: "" };
}

export function formatCourseUniversityLine(row) {
  if (!row || typeof row !== "object") return "";
  if (Object.prototype.hasOwnProperty.call(row, "line")) {
    return String(row.line ?? "");
  }
  const prog = String(row.programName || "").trim();
  const uni = String(row.university || "").trim();
  if (prog && uni) return `${prog} — ${uni}`;
  return prog || uni || "";
}

export function emptyCourseUniversityRow() {
  return {
    id: `cu-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    line: "",
    programName: "",
    university: ""
  };
}

export function courseRowsFromPreferredCourses(raw) {
  const courses = normalizePreferredCourses(raw).slice(0, MAX_PREFERRED_COURSE_ROWS);
  return courses.map((course) => {
    const programName = course.programName || "";
    const university = course.university || "";
    return {
      id: course.entryId || `cu-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      line: formatCourseLabel({ programName, university }),
      programName,
      university
    };
  });
}

export function preferredCoursesFromRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, idx) => {
      if (!row || typeof row !== "object") return null;
      const fromLine = parseCourseUniversityLine(row.line || formatCourseUniversityLine(row));
      const programName = fromLine.programName || String(row.programName || "").trim();
      const university = fromLine.university || String(row.university || "").trim();
      if (!programName && !university) return null;
      return {
        entryId: String(row.id || row.entryId || `pc-manual-${idx}-${Date.now()}`).trim(),
        programId: null,
        university,
        programName,
        country: null,
        intake: null,
        isManual: true
      };
    })
    .filter(Boolean)
    .slice(0, MAX_PREFERRED_COURSE_ROWS);
}
