import { useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { Crown, Mail, Phone, UserPlus, Users, X } from "lucide-react";
import { DEFAULT_USER_AVATAR } from "../apiConfig";
import { buildCounselorTeamEntriesWithFallback, wouldStudentHaveNoCounselorsAfterRemoval } from "../studentContactHelpers";
import { Button } from "./Button";

function counselorContactHref(type, value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.toLowerCase() === "not available") return null;
  return type === "email" ? `mailto:${normalized}` : `tel:${normalized.replace(/\s+/g, "")}`;
}

function CounselorRosterCard({
  counselor,
  student,
  canRemoveCounselor = false,
  onRemoveCounselor,
  removingCounselorId = ""
}) {
  const isPrimary = counselor.isPrimary;
  const emailHref = counselorContactHref("email", counselor.email);
  const phoneHref = counselorContactHref("phone", counselor.phone);
  const showRemove =
    canRemoveCounselor &&
    onRemoveCounselor &&
    !wouldStudentHaveNoCounselorsAfterRemoval(student, counselor.id);

  return /* @__PURE__ */ jsxs("div", {
    className: `relative group rounded-xl border p-3.5 transition-shadow ${
      isPrimary
        ? "border-indigo-100 bg-gradient-to-br from-indigo-50/90 via-white to-white shadow-sm ring-1 ring-indigo-100/80"
        : "border-slate-100 bg-slate-50/60 hover:bg-white hover:shadow-sm"
    }`,
    children: [
      showRemove ? /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => onRemoveCounselor(counselor),
          disabled: removingCounselorId === counselor.id,
          className: "absolute top-2.5 right-2.5 p-1.5 rounded-lg border border-transparent text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-50",
          title: `Remove ${counselor.name}`,
          "aria-label": `Remove ${counselor.name}`,
          children: /* @__PURE__ */ jsx(X, { size: 14 })
        }
      ) : null,
      /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "relative shrink-0", children: [
          /* @__PURE__ */ jsx("div", {
            className: `${isPrimary ? "h-12 w-12 text-base" : "h-10 w-10 text-sm"} rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border-2 border-white shadow-md overflow-hidden`,
            children: counselor.avatar ? /* @__PURE__ */ jsx("img", {
              src: counselor.avatar,
              alt: counselor.name,
              className: "w-full h-full object-cover",
              referrerPolicy: "no-referrer",
              onError: (event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = DEFAULT_USER_AVATAR;
              }
            }) : counselor.name.charAt(0)
          }),
          isPrimary ? /* @__PURE__ */ jsx("span", {
            className: "absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm ring-2 ring-white",
            title: "Primary counselor",
            children: /* @__PURE__ */ jsx(Crown, { size: 10, strokeWidth: 2.25 })
          }) : null
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1 pr-6", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-1.5 mb-0.5", children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-900 truncate", children: counselor.name }),
            (counselor.badges || []).map((badge) => /* @__PURE__ */ jsx("span", {
              className: `text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                String(badge).toLowerCase() === "primary"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-500 border border-slate-200"
              }`,
              children: badge
            }, badge))
          ] }),
          counselor.role ? /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500 truncate mb-2", children: counselor.role }) : null,
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1.5", children: [
            emailHref ? /* @__PURE__ */ jsxs("a", {
              href: emailHref,
              className: "inline-flex items-center gap-1.5 min-w-0 text-[11px] text-slate-600 hover:text-indigo-700 transition-colors",
              children: [
                /* @__PURE__ */ jsx(Mail, { size: 12, className: "text-slate-400 shrink-0" }),
                /* @__PURE__ */ jsx("span", { className: "truncate", children: counselor.email })
              ]
            }) : /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-1.5 min-w-0 text-[11px] text-slate-500", children: [
              /* @__PURE__ */ jsx(Mail, { size: 12, className: "text-slate-400 shrink-0" }),
              /* @__PURE__ */ jsx("span", { className: "truncate", children: counselor.email })
            ] }),
            phoneHref ? /* @__PURE__ */ jsxs("a", {
              href: phoneHref,
              className: "inline-flex items-center gap-1.5 min-w-0 text-[11px] text-slate-600 hover:text-indigo-700 transition-colors",
              children: [
                /* @__PURE__ */ jsx(Phone, { size: 12, className: "text-slate-400 shrink-0" }),
                /* @__PURE__ */ jsx("span", { className: "truncate", children: counselor.phone })
              ]
            }) : /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-1.5 min-w-0 text-[11px] text-slate-500", children: [
              /* @__PURE__ */ jsx(Phone, { size: 12, className: "text-slate-400 shrink-0" }),
              /* @__PURE__ */ jsx("span", { className: "truncate", children: counselor.phone })
            ] })
          ] })
        ] })
      ] })
    ]
  });
}

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
  const primaryCounselors = counselors.filter((entry) => entry.isPrimary);
  const secondaryCounselors = counselors.filter((entry) => !entry.isPrimary);

  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxs("h3", { className: "text-sm font-semibold text-slate-900 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Users, { size: 16, className: "text-indigo-600", strokeWidth: 1.75 }),
        "Counselors handling this student"
      ] }),
      counselors.length > 0 ? /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wide", children: [
        counselors.length,
        " linked"
      ] }) : null
    ] }),
    counselors.length === 0 ? /* @__PURE__ */ jsx("div", { className: "rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center", children: /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic", children: "No counselors linked on this record yet." }) }) : /* @__PURE__ */ jsxs("div", { className: "space-y-4 max-h-80 overflow-y-auto pr-1", children: [
      primaryCounselors.length > 0 ? /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsx("p", { className: "text-[10px] font-bold uppercase tracking-wider text-indigo-600", children: "Primary" }),
        primaryCounselors.map((counselor) => /* @__PURE__ */ jsx(
          CounselorRosterCard,
          {
            counselor,
            student,
            canRemoveCounselor,
            onRemoveCounselor,
            removingCounselorId
          },
          counselor.id
        ))
      ] }) : null,
      secondaryCounselors.length > 0 ? /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxs("p", { className: "text-[10px] font-bold uppercase tracking-wider text-slate-400", children: [
          "Secondary",
          secondaryCounselors.length > 1 ? ` (${secondaryCounselors.length})` : ""
        ] }),
        secondaryCounselors.map((counselor) => /* @__PURE__ */ jsx(
          CounselorRosterCard,
          {
            counselor,
            student,
            canRemoveCounselor,
            onRemoveCounselor,
            removingCounselorId
          },
          counselor.id
        ))
      ] }) : null
    ] }),
    canAddSecondaryCounselor && onAddSecondaryCounselor && addableOptions.length > 0 ? /* @__PURE__ */ jsxs("div", { className: "mt-4 rounded-xl border border-dashed border-indigo-100 bg-indigo-50/30 p-3.5 space-y-2.5", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("p", { className: "text-[11px] font-semibold text-slate-700 flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsx(UserPlus, { size: 13, className: "text-indigo-600" }),
          "Add secondary counselor"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500 mt-0.5", children: "Keeps the current primary counselor and links another counselor at secondary level." })
      ] }),
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
