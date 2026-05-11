import { jsx, jsxs } from "react/jsx-runtime";
import { Trophy, Medal, TrendingUp, Star, Crown } from "lucide-react";
import { normalizePipelineStatus } from "../pipeline";
const LeaderboardWidget = ({ students = [], employees = [], currentUserId = "", currentUserEmail = "" }) => {
  const normalize = (value) => String(value || "").trim().toLowerCase();
  const counselors = employees.filter((employee) => {
    const role = normalize(employee.role);
    return role === "counselor" || role === "consultor" || role === "counsellor";
  });
  const leaderboard = counselors.map((counselor) => {
    const counselorId = normalize(counselor.id);
    const counselorEmail = normalize(counselor.email);
    const counselorName = normalize(counselor.name || counselor.username);
    const myStudents = students.filter((student) => {
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
    let score = 0;
    let visas = 0;
    myStudents.forEach((s) => {
      const x = normalizePipelineStatus(s.status);
      const hasVisaOutcome = x === "Visa" || x === "Enrolled" || s.status === "Visa Pilot";
      if (hasVisaOutcome) {
        score += 50;
        visas++;
      } else if (x === "Interview training" || s.status === "Offer Received") score += 10;
      else if (x === "Application" || s.status === "Uni Application") score += 5;
      else if (x === "Documentation") score += 2;
    });
    return {
      ...counselor,
      score,
      visas,
      activeCount: myStudents.length
    };
  }).sort((a, b) => b.score - a.score || b.visas - a.visas || b.activeCount - a.activeCount);
  const top3 = leaderboard.slice(0, 3);
  const currentUserRank = leaderboard.findIndex(
    (c) => String(c.id || "") === String(currentUserId || "") || String(c.email || "").toLowerCase() === String(currentUserEmail || "").toLowerCase()
  ) + 1;
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden", children: [
    /* @__PURE__ */ jsxs("div", { className: "bg-[#0F172A] p-4 text-white flex justify-between items-center", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("h4", { className: "font-bold text-sm flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Trophy, { size: 16, className: "text-yellow-400" }),
          "Leaderboard"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-400", children: "Weekly Performance" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "text-right", children: [
        /* @__PURE__ */ jsx("p", { className: "text-[10px] uppercase text-slate-400 font-bold", children: "Your Rank" }),
        /* @__PURE__ */ jsxs("p", { className: "text-lg font-bold leading-none text-white", children: [
          "#",
          currentUserRank
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "p-2", children: top3.map((agent, idx) => {
      let medalColor = "";
      let Icon = Star;
      if (idx === 0) {
        medalColor = "text-yellow-500 bg-yellow-50 border-yellow-100";
        Icon = Crown;
      } else if (idx === 1) {
        medalColor = "text-slate-500 bg-slate-100 border-slate-200";
        Icon = Medal;
      } else if (idx === 2) {
        medalColor = "text-orange-600 bg-orange-50 border-orange-100";
        Icon = Medal;
      }
      return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 p-3 border-b last:border-0 border-gray-50 hover:bg-slate-50 transition-colors rounded-lg", children: [
        /* @__PURE__ */ jsx("div", { className: `w-8 h-8 rounded-full flex items-center justify-center border ${medalColor} font-bold text-xs shadow-sm`, children: idx === 0 ? /* @__PURE__ */ jsx(Icon, { size: 14, fill: "currentColor" }) : idx + 1 }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsx("p", { className: `text-sm font-semibold truncate ${idx === 0 ? "text-slate-900" : "text-slate-700"}`, children: agent.name || agent.username || agent.email || "Counselor" }),
          /* @__PURE__ */ jsxs("p", { className: "text-[10px] text-slate-400 flex items-center gap-2", children: [
            /* @__PURE__ */ jsxs("span", { children: [
              agent.score,
              " pts"
            ] }),
            /* @__PURE__ */ jsx("span", { children: "\u2022" }),
            /* @__PURE__ */ jsxs("span", { children: [
              agent.visas,
              " Visas"
            ] }),
            /* @__PURE__ */ jsx("span", { children: "\u2022" }),
            /* @__PURE__ */ jsxs("span", { children: [
              agent.activeCount,
              " Students"
            ] })
          ] })
        ] }),
        idx === 0 && /* @__PURE__ */ jsxs("div", { className: "text-xs font-bold text-emerald-600 flex flex-col items-end", children: [
          /* @__PURE__ */ jsx(TrendingUp, { size: 14 }),
          /* @__PURE__ */ jsx("span", { children: "Top" })
        ] })
      ] }, agent.id);
    }) }),
  ] });
};
export {
  LeaderboardWidget
};
