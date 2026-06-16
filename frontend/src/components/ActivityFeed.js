import { jsx, jsxs } from "react/jsx-runtime";
import { Upload, CheckCircle, XCircle, AlertTriangle, Shield, Clock } from "lucide-react";
import { VISA_OFFICER_COUNSELOR_ROLE, VISA_OFFICER_ROLE } from "../roles";
import { getRoleDisplayName } from "../roleDisplay";

const ActivityFeed = ({ activities, limit, showRoleBadge = true, showCounselorBadge = true, metaTimestampOnly = false }) => {
  const displayActivities = limit ? activities.slice(0, limit) : activities;
  const genericLabels = new Set([
    "Counselor",
    VISA_OFFICER_ROLE,
    VISA_OFFICER_COUNSELOR_ROLE,
    "Country Coordinator",
    "Manager",
    getRoleDisplayName("Manager"),
    "Team Lead",
    "Admin",
    "Student",
    "System",
  ]);
  const resolveActorName = (activity) => {
    const actorName = String(activity.actorName || "").trim();
    const userName = String(activity.user || "").trim();
    if (actorName && !genericLabels.has(actorName)) return actorName;
    if (userName && !genericLabels.has(userName)) return userName;
    if (activity.counselorName && !genericLabels.has(String(activity.counselorName || "").trim())) {
      return activity.counselorName;
    }
    return actorName || userName || "System";
  };
  const resolveCounselorName = (activity) => {
    const value = String(activity.counselorName || "").trim();
    if (value && !genericLabels.has(value)) return value;
    return "";
  };
  const getIcon = (type) => {
    switch (type) {
      case "upload":
        return /* @__PURE__ */ jsx(Upload, { size: 14, className: "text-blue-500" });
      case "approval":
        return /* @__PURE__ */ jsx(CheckCircle, { size: 14, className: "text-emerald-500" });
      case "rejection":
        return /* @__PURE__ */ jsx(XCircle, { size: 14, className: "text-rose-500" });
      case "task":
        return /* @__PURE__ */ jsx(Clock, { size: 14, className: "text-amber-500" });
      case "system":
        return /* @__PURE__ */ jsx(Shield, { size: 14, className: "text-slate-500" });
      default:
        return /* @__PURE__ */ jsx(AlertTriangle, { size: 14, className: "text-slate-400" });
    }
  };
  const formatActivityTime = (activity) => {
    const raw = activity.createdAt || activity.updatedAt || activity.timestamp;
    if (!raw) return "-";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return String(activity.timestamp || raw);
    return date.toLocaleString();
  };
  return /* @__PURE__ */ jsxs("div", {
    className: "space-y-4", children: [
      displayActivities.map((act) => /* @__PURE__ */ jsxs("div", {
        className: "flex gap-3 items-start p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-gray-100", children: [
      /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center flex-shrink-0 mt-0.5", children: getIcon(act.type) }),
      /* @__PURE__ */ jsxs("div", {
          className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxs("p", {
            className: "text-sm font-medium text-slate-900", children: [
          /* @__PURE__ */ jsx("span", { className: "font-bold text-indigo-900", children: resolveActorName(act) }),
          /* @__PURE__ */ jsxs("span", {
              className: "text-slate-600 font-normal", children: [
                " ",
                act.action,
                " "
              ]
            }),
          /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-900", children: act.target })
            ]
          }),
        /* @__PURE__ */ jsx("div", {
            className: "flex items-center gap-2 mt-1",
            children: metaTimestampOnly ? /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400", children: formatActivityTime(act) }) : [
              showRoleBadge ? /* @__PURE__ */ jsx("span", { className: "text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wide font-medium", children: getRoleDisplayName(act.role) }) : null,
              showCounselorBadge && resolveCounselorName(act) ? /* @__PURE__ */ jsxs("span", {
                className: "text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded uppercase tracking-wide font-semibold",
                children: [resolveCounselorName(act)]
              }) : null,
              /* @__PURE__ */ jsxs("span", {
                className: "text-xs text-slate-400",
                children: ["\u2022 ", formatActivityTime(act)]
              })
            ]
          })
          ]
        })
        ]
      }, act.id)),
      displayActivities.length === 0 && /* @__PURE__ */ jsx("div", { className: "text-center py-8 text-slate-400 text-sm", children: "No recent activity." })
    ]
  });
};
export {
  ActivityFeed
};
