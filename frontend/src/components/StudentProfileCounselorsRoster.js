import { jsx, jsxs } from "react/jsx-runtime";
import { Users } from "lucide-react";
import { PersonContactCard } from "./PersonContactCard";
import { buildCounselorTeamEntriesWithFallback } from "../studentContactHelpers";
/**
 * Roster of counselors involved with this student (enrolling, primary, previous).
 * Shown to staff after Specialized Notes on the student profile.
 */
export function StudentProfileCounselorsRoster({ student, employees = [] }) {
  const counselors = buildCounselorTeamEntriesWithFallback(student, employees);
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxs("h3", { className: "text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2", children: [
      /* @__PURE__ */ jsx(Users, { size: 16, className: "text-indigo-600", strokeWidth: 1.75 }),
      "Counselors handling this student"
    ] }),
    counselors.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic", children: "No counselors linked on this record yet." }) : /* @__PURE__ */ jsx("div", { className: "space-y-3 max-h-72 overflow-y-auto pr-1", children: counselors.map((c) => /* @__PURE__ */ jsx(
      PersonContactCard,
      {
        name: c.name,
        role: c.role,
        badges: c.badges,
        email: c.email,
        phone: c.phone,
        avatar: c.avatar,
        avatarClassName: "h-12 w-12 text-base"
      },
      c.id
    )) })
  ] });
}
