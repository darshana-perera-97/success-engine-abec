import { useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { UserPlus, Users, X } from "lucide-react";
import { PersonContactCard } from "./PersonContactCard";
import { buildCounselorTeamEntriesWithFallback, wouldStudentHaveNoCounselorsAfterRemoval } from "../studentContactHelpers";
import { Button } from "./Button";
/**
 * Roster of counselors involved with this student (primary counselor/visa officer, then secondary staff).
 * Shown to staff after Specialized Notes on the student profile.
 */
export function StudentProfileCounselorsRoster({
  student,
  employees = [],
  canRemoveCounselor = false,
  onRemoveCounselor,
  removingCounselorId = "",
  canAddSecondaryCounselor = false,
  secondaryCounselorOptions = [],
  onAddSecondaryCounselor,
  addingSecondaryCounselorId = ""
}) {
  const counselors = buildCounselorTeamEntriesWithFallback(student, employees);
  const [selectedSecondaryId, setSelectedSecondaryId] = useState("");
  const addableOptions = secondaryCounselorOptions.filter(
    (option) => String(option?.id || "").trim() && !counselors.some((entry) => entry.id === option.id)
  );
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxs("h3", { className: "text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2", children: [
      /* @__PURE__ */ jsx(Users, { size: 16, className: "text-indigo-600", strokeWidth: 1.75 }),
      "Counselors handling this student"
    ] }),
    counselors.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic", children: "No counselors linked on this record yet." }) : /* @__PURE__ */ jsx("div", { className: "space-y-3 max-h-72 overflow-y-auto pr-1", children: counselors.map((c) => /* @__PURE__ */ jsxs("div", { className: `relative group rounded-xl ${c.isPrimary ? "ring-2 ring-indigo-200 ring-offset-1" : ""}`, children: [
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
    ] }, c.id)) }),
    canAddSecondaryCounselor && onAddSecondaryCounselor && addableOptions.length > 0 ? /* @__PURE__ */ jsxs("div", { className: "mt-4 pt-4 border-t border-slate-100 space-y-2", children: [
      /* @__PURE__ */ jsxs("p", { className: "text-[11px] font-semibold text-slate-600 flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx(UserPlus, { size: 13, className: "text-indigo-600" }),
        "Add secondary counselor"
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500", children: "Keeps the current primary counselor and links another counselor at secondary level." }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: selectedSecondaryId,
            onChange: (e) => setSelectedSecondaryId(e.target.value),
            className: "flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 bg-white",
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Select counselor" }),
              ...addableOptions.map((option) => /* @__PURE__ */ jsx("option", { value: option.id, children: option.name || option.username || option.email || option.id }, option.id))
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          Button,
          {
            size: "sm",
            disabled: !selectedSecondaryId || Boolean(addingSecondaryCounselorId),
            onClick: async () => {
              if (!selectedSecondaryId) return;
              await onAddSecondaryCounselor(selectedSecondaryId);
              setSelectedSecondaryId("");
            },
            children: addingSecondaryCounselorId ? "Adding..." : "Add"
          }
        )
      ] })
    ] }) : null
  ] });
}
