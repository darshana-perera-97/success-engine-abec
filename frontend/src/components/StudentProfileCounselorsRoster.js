import { jsx, jsxs } from "react/jsx-runtime";
import { Users, X } from "lucide-react";
import { PersonContactCard } from "./PersonContactCard";
import { buildCounselorTeamEntriesWithFallback, wouldStudentHaveNoCounselorsAfterRemoval } from "../studentContactHelpers";
/**
 * Roster of counselors involved with this student (enrolling, primary, previous).
 * Shown to staff after Specialized Notes on the student profile.
 */
export function StudentProfileCounselorsRoster({
  student,
  employees = [],
  canRemoveCounselor = false,
  onRemoveCounselor,
  removingCounselorId = ""
}) {
  const counselors = buildCounselorTeamEntriesWithFallback(student, employees);
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxs("h3", { className: "text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2", children: [
      /* @__PURE__ */ jsx(Users, { size: 16, className: "text-indigo-600", strokeWidth: 1.75 }),
      "Counselors handling this student"
    ] }),
    counselors.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic", children: "No counselors linked on this record yet." }) : /* @__PURE__ */ jsx("div", { className: "space-y-3 max-h-72 overflow-y-auto pr-1", children: counselors.map((c) => /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
      /* @__PURE__ */ jsx(
        PersonContactCard,
        {
          name: c.name,
          role: c.role,
          badges: c.badges,
          email: c.email,
          phone: c.phone,
          avatar: c.avatar,
          avatarClassName: "h-12 w-12 text-base"
        }
      ),
      canRemoveCounselor && onRemoveCounselor && !wouldStudentHaveNoCounselorsAfterRemoval(student, c.id) ? /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => onRemoveCounselor(c),
          disabled: removingCounselorId === c.id,
          className: "absolute top-3 right-3 p-1.5 rounded-lg border border-transparent text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-50",
          title: `Remove ${c.name}`,
          "aria-label": `Remove ${c.name}`,
          children: /* @__PURE__ */ jsx(X, { size: 14 })
        }
      ) : null
    ] }, c.id)) })
  ] });
}
