import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from "react";
import { formatLKR } from "../utils";
import { getAccounts, getBranches } from "../authApi";
import { isCounselorEquivalentAccountRole } from "../roles";
import {
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Search,
  ArrowRight,
  ArrowLeft,
  DollarSign,
  Briefcase,
  ThumbsUp,
  Activity,
  Target,
  X,
  Plus,
  Mail,
  MapPin,
  Phone,
  KeyRound,
} from "lucide-react";
import { Button } from "./Button";
import { QuietPageSkeleton } from "./LoadingPlaceholder";
import { normalizePipelineStatus, PIPELINE_STEPS, computePipelineStageCounts } from "../pipeline";
import { filterTasksForCounselorIdentities, isTaskOverdueByDate } from "../counselorTaskScope";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
const normalizeIdentity = (value) => String(value || "").trim().toLowerCase();
function buildCounselorFunnelSeries(students) {
  const list = Array.isArray(students) ? students : [];
  return PIPELINE_STEPS.map((stage, idx) => {
    const count = list.filter((s) => {
      const n = normalizePipelineStatus(s.status);
      const i = PIPELINE_STEPS.indexOf(n);
      const ord = i >= 0 ? i : 0;
      return ord >= idx;
    }).length;
    const short =
      stage === "Interview training"
        ? "Interview tr."
        : stage.length > 12
          ? `${stage.slice(0, 11)}…`
          : stage;
    return { stage: short, fullStage: stage, count };
  });
}
const CounselorManagement = ({ students, employees, tasks, onTransferStudents, onAddActivity, onAddCounselor, currentRole, authenticatedUserEmail = "", resetSignal = 0 }) => {
  const [selectedCounselorId, setSelectedCounselorId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddingCounselor, setIsAddingCounselor] = useState(false);
  const [addCounselorError, setAddCounselorError] = useState("");
  const [branchOptions, setBranchOptions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [targetCounselorId, setTargetCounselorId] = useState("");
  const [newCounselor, setNewCounselor] = useState({ name: "", email: "", branch: "", role: "Senior Counselor", phone: "", password: "" });
  const [pageLoads, setPageLoads] = useState({ accounts: false, branches: false });
  const counselorPageReady = pageLoads.accounts && pageLoads.branches;
  const teamLeadOptions = useMemo(() => accounts.filter((a) => String(a.role || "") === "Team Lead"), [accounts]);
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const result = await getAccounts();
        if (!result.ok) return;
        setAccounts(result.data);
      } finally {
        setPageLoads((p) => ({ ...p, accounts: true }));
      }
    };
    loadAccounts();
  }, []);
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const result = await getBranches();
        if (!result.ok) return;
        const locations = result.data.map((b) => String(b.location || "").trim()).filter(Boolean);
        setBranchOptions(locations);
        if (locations.length > 0) {
          setNewCounselor((prev) => ({ ...prev, branch: locations[0] }));
        }
      } finally {
        setPageLoads((p) => ({ ...p, branches: true }));
      }
    };
    loadBranches();
  }, []);
  useEffect(() => {
    setSelectedCounselorId(null);
  }, [resetSignal]);
  const handleAddCounselor = async (e) => {
    e.preventDefault();
    if (!newCounselor.name || !newCounselor.email || !newCounselor.branch || !newCounselor.password) return;
    setAddCounselorError("");
    setIsAddingCounselor(true);
    const result = onAddCounselor ? await onAddCounselor(newCounselor) : { ok: true };
    setIsAddingCounselor(false);
    if (!result?.ok) {
      setAddCounselorError(result?.error || "Failed to add counselor.");
      return;
    }
    if (onAddActivity) {
      onAddActivity({
        user: "Manager",
        role: "Manager",
        action: "added new counselor",
        target: newCounselor.name,
        type: "system"
      });
    }
    setIsAddModalOpen(false);
    if (result?.data) {
      setAccounts((prev) => [result.data, ...prev]);
    }
    setNewCounselor({
      name: "",
      email: "",
      branch: branchOptions[0] || "",
      role: "Senior Counselor",
      phone: "",
      password: ""
    });
    setAddCounselorError("");
  };
  const counselors = useMemo(() => {
    const normalizedAuthEmail = String(authenticatedUserEmail || "").toLowerCase();
    const loggedTeamLeadAccount = currentRole === "Team Lead" ? accounts.find(
      (a) => String(a.role || "") === "Team Lead" && String(a.email || "").toLowerCase() === normalizedAuthEmail
    ) : null;
    return accounts.filter((a) => {
      const role = String(a.role || "").toLowerCase();
      const isCounselor = isCounselorEquivalentAccountRole(a.role);
      if (!isCounselor) return false;
      if (currentRole !== "Team Lead") return true;
      if (!loggedTeamLeadAccount) return false;
      return String(a.teamLeadId || "") === String(loggedTeamLeadAccount.id || "") || String(a.teamLeadEmail || "").toLowerCase() === normalizedAuthEmail;
    }).map((account) => {
      const linkedEmployee = employees.find((e) => String(e.email || "").toLowerCase() === String(account.email || "").toLowerCase());
      const counselorId = linkedEmployee?.id || account.id;
      const counselorIdentities = new Set();
      [
        counselorId,
        account.id,
        account.email,
        account.username,
        linkedEmployee?.id,
        linkedEmployee?.email,
        linkedEmployee?.name
      ].forEach((identity) => {
        const normalized = normalizeIdentity(identity);
        if (normalized) counselorIdentities.add(normalized);
      });
      const myStudents = students.filter((student) => counselorIdentities.has(normalizeIdentity(student.counselor)));
      const myTasks = filterTasksForCounselorIdentities(tasks, counselorIdentities, myStudents);
      const activeStudents = myStudents.length;
      const visaGranted = myStudents.filter((s) => s.status === "Visa" || s.status === "Enrolled").length;
      const overdueTasks = myTasks.filter((t) => t.status === "Overdue").length;
      const criticalTasks = myTasks.filter(
        (t) => t.priority === "High" || t.status === "Overdue" || isTaskOverdueByDate(t)
      ).length;
      const maxCapacity = 35;
      const capacityLoad = Math.round(activeStudents / maxCapacity * 100);
      const successRate = activeStudents > 0 ? Math.round(visaGranted / activeStudents * 100) : 0;
      const sla = Math.max(0, 100 - overdueTasks * 5);
      const revenue = myStudents.reduce((acc, s) => acc + parseFloat(s.budget || "0") * 5e-3, 0);
      const converted = myStudents.filter((s) => {
        const x = normalizePipelineStatus(s.status);
        return x !== "Inquiry" && x !== "Registration" && x !== "Application";
      }).length;
      const conversionRate = activeStudents > 0 ? Math.round(converted / activeStudents * 100) : 0;
      const npsScore = Number.isFinite(linkedEmployee?.npsScore) ? linkedEmployee.npsScore : 0;
      const resolvedTeamLeadById = teamLeadOptions.find((lead) => String(lead.id || "") === String(account.teamLeadId || ""));
      const resolvedTeamLeadByEmail = teamLeadOptions.find(
        (lead) => String(lead.email || "").toLowerCase() === String(account.teamLeadEmail || "").toLowerCase()
      );
      const resolvedTeamLead = resolvedTeamLeadById || resolvedTeamLeadByEmail;
      return {
        ...linkedEmployee,
        ...account,
        accountId: account.id,
        id: counselorId,
        name: account.username || linkedEmployee?.name || account.email || "Counselor",
        role: String(account.role || "").toLowerCase() === "consultor" ? "Counselor" : account.role,
        teamLeadId: account.teamLeadId || resolvedTeamLead?.id || "",
        teamLeadName: account.teamLeadName || resolvedTeamLead?.username || (account.teamLeadEmail ? String(account.teamLeadEmail).split("@")[0] : "Unassigned"),
        metrics: {
          activeStudents,
          visaGranted,
          overdueTasks,
          criticalTasks,
          capacityLoad,
          successRate,
          sla,
          revenue,
          conversionRate,
          npsScore,
          avgTurnaround: "2.4h"
        },
        students: myStudents,
        tasks: myTasks
      };
    });
  }, [accounts, students, employees, tasks, currentRole, authenticatedUserEmail]);
  const filteredCounselors = counselors.filter(
    (c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.branch.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const topPerformer = useMemo(() => {
    if (counselors.length === 0) return null;
    return counselors.slice().sort((a, b) => b.metrics.visaGranted - a.metrics.visaGranted)[0];
  }, [counselors]);
  const handleTransfer = () => {
    if (selectedCounselorId && targetCounselorId) {
      onTransferStudents(selectedCounselorId, targetCounselorId);
      setIsTransferModalOpen(false);
      setTargetCounselorId("");
    }
  };
  if (selectedCounselorId) {
    const counselor = counselors.find((c) => c.id === selectedCounselorId);
    if (!counselor) return null;
    const funnelData = buildCounselorFunnelSeries(counselor.students);
    const pipelineStageCounts = computePipelineStageCounts(counselor.students || []);
    const pipelineHealthPalette = ["#6366F1", "#F59E0B", "#A855F7", "#F97316", "#14B8A6", "#22C55E", "#38BDF8"];
    const pipelineHealthRows = PIPELINE_STEPS.map((stage, idx) => ({
      stage,
      count: pipelineStageCounts.byStage[stage] ?? 0,
      color: pipelineHealthPalette[idx % pipelineHealthPalette.length]
    }));
    if (pipelineStageCounts.other > 0) {
      pipelineHealthRows.push({
        stage: "Other / unmapped",
        count: pipelineStageCounts.other,
        color: "#94A3B8"
      });
    }
    const counselorCriticalTasks = counselor.tasks.filter(
      (t) => t.priority === "High" || t.status === "Overdue" || isTaskOverdueByDate(t)
    );
    const studentById = new Map(
      (counselor.students || []).map((s) => [String(s.id || "").trim(), s])
    );
    return /* @__PURE__ */ jsxs("div", { className: "space-y-8 animate-in slide-in-from-right-8 duration-500 pb-10", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col md:flex-row justify-between items-start md:items-center gap-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
          /* @__PURE__ */ jsx("button", { onClick: () => setSelectedCounselorId(null), className: "p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors", children: /* @__PURE__ */ jsx(ArrowLeft, { size: 20 }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
            /* @__PURE__ */ jsx("div", { className: "w-16 h-16 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-bold border-4 border-white shadow-sm", children: counselor.avatar ? /* @__PURE__ */ jsx("img", { src: counselor.avatar, alt: counselor.name, className: "w-full h-full object-cover rounded-full", referrerPolicy: "no-referrer" }) : counselor.name.charAt(0) }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h1", { className: "text-2xl font-bold text-slate-900", children: counselor.name }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 text-sm text-slate-500", children: [
                /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsx(Briefcase, { size: 14 }),
                  " ",
                  counselor.role
                ] }),
                /* @__PURE__ */ jsx("span", { children: "\u2022" }),
                /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsx(Users, { size: 14 }),
                  " ",
                  counselor.branch
                ] }),
                /* @__PURE__ */ jsx("span", { children: "\u2022" }),
                /* @__PURE__ */ jsx("span", { className: "bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold border border-emerald-100", children: "Active" })
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex gap-2", children: /* @__PURE__ */ jsx(Button, { disabled: true, onClick: () => setIsTransferModalOpen(true), children: "Transfer" }) })
      ] }),
      isTransferModalOpen && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center p-5 border-b border-gray-100", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-slate-900", children: "Transfer Students" }),
            /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
              "Reassign all students from ",
              counselor.name
            ] })
          ] }),
          /* @__PURE__ */ jsx("button", { onClick: () => setIsTransferModalOpen(false), className: "text-slate-400 hover:text-slate-600 transition-colors", children: /* @__PURE__ */ jsx(X, { size: 20 }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "p-5 space-y-4", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-slate-700 mb-1", children: "Select New Counselor" }),
            /* @__PURE__ */ jsxs(
              "select",
              {
                className: "w-full p-2 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none",
                value: targetCounselorId,
                onChange: (e) => setTargetCounselorId(e.target.value),
                children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "Select a counselor..." }),
                  counselors.filter((c) => c.id !== counselor.id).map((c) => /* @__PURE__ */ jsxs("option", { value: c.id, children: [
                    c.name,
                    " (",
                    c.metrics.activeStudents,
                    " active students)"
                  ] }, c.id))
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "bg-amber-50 border border-amber-100 p-3 rounded-lg flex gap-3 items-start", children: [
            /* @__PURE__ */ jsx(AlertTriangle, { size: 16, className: "text-amber-600 shrink-0 mt-0.5" }),
            /* @__PURE__ */ jsxs("p", { className: "text-xs text-amber-800", children: [
              "This will transfer ",
              /* @__PURE__ */ jsxs("strong", { children: [
                counselor.metrics.activeStudents,
                " students"
              ] }),
              " and all their associated tasks to the selected counselor. This action cannot be undone."
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [
            /* @__PURE__ */ jsx(Button, { variant: "ghost", onClick: () => setIsTransferModalOpen(false), children: "Cancel" }),
            /* @__PURE__ */ jsx(Button, { disabled: !targetCounselorId, onClick: handleTransfer, children: "Confirm Transfer" })
          ] })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", children: [
        /* @__PURE__ */ jsx(
          MetricCard,
          {
            title: "Revenue YTD",
            value: formatLKR(counselor.metrics.revenue),
            icon: /* @__PURE__ */ jsx(DollarSign, { size: 18 }),
            subtext: "Realized Commissions",
            highlight: true
          }
        ),
        /* @__PURE__ */ jsx(
          MetricCard,
          {
            title: "Visa Granted",
            value: `${counselor.metrics.visaGranted}`,
            icon: /* @__PURE__ */ jsx(ThumbsUp, { size: 18 }),
            subtext: "Students with Visa Stage",
            color: "text-emerald-600"
          }
        ),
        /* @__PURE__ */ jsx(
          MetricCard,
          {
            title: "Pipeline Conversion",
            value: `${counselor.metrics.conversionRate}%`,
            icon: /* @__PURE__ */ jsx(Target, { size: 18 }),
            subtext: "Inquiry to App"
          }
        ),
        /* @__PURE__ */ jsx(
          MetricCard,
          {
            title: "Workload Capacity",
            value: `${counselor.metrics.capacityLoad}%`,
            icon: /* @__PURE__ */ jsx(Activity, { size: 18 }),
            subtext: counselor.metrics.capacityLoad > 90 ? "High Burnout Risk" : "Optimal Load",
            color: counselor.metrics.capacityLoad > 90 ? "text-rose-600" : "text-slate-600"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm", children: [
          /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 mb-6 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(TrendingUp, { size: 18, className: "text-slate-400" }),
            "Conversion Funnel Analysis"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "h-[300px]", children: /* @__PURE__ */ jsx(ResponsiveContainer, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs(AreaChart, { data: funnelData, children: [
            /* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsxs("linearGradient", { id: "colorCount", x1: "0", y1: "0", x2: "0", y2: "1", children: [
              /* @__PURE__ */ jsx("stop", { offset: "5%", stopColor: "#4F46E5", stopOpacity: 0.1 }),
              /* @__PURE__ */ jsx("stop", { offset: "95%", stopColor: "#4F46E5", stopOpacity: 0 })
            ] }) }),
            /* @__PURE__ */ jsx(CartesianGrid, { strokeDasharray: "3 3", vertical: false, stroke: "#E2E8F0" }),
            /* @__PURE__ */ jsx(XAxis, { dataKey: "stage", axisLine: false, tickLine: false, tick: { fill: "#64748B", fontSize: 12 }, dy: 10 }),
            /* @__PURE__ */ jsx(YAxis, { axisLine: false, tickLine: false, tick: { fill: "#64748B", fontSize: 12 } }),
            /* @__PURE__ */ jsx(
              Tooltip,
              {
                cursor: { fill: "#F1F5F9" },
                contentStyle: { borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" },
                formatter: (value) => [`${value} students`, "At or past this stage"],
                labelFormatter: (label, items) => {
                  const row = Array.isArray(items) ? items[0]?.payload : null;
                  return row?.fullStage || label || "";
                }
              }
            ),
            /* @__PURE__ */ jsx(Area, { type: "monotone", dataKey: "count", stroke: "#4F46E5", strokeWidth: 2, fillOpacity: 1, fill: "url(#colorCount)" })
          ] }) }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "bg-[#0F172A] p-6 rounded-xl shadow-lg text-white flex flex-col", children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-4", children: [
            /* @__PURE__ */ jsx("h4", { className: "text-slate-400 text-xs font-bold uppercase tracking-wider", children: "Pipeline Health" }),
            /* @__PURE__ */ jsxs("p", { className: "text-[11px] text-slate-500 mt-1", children: [
              "Students by stage (",
              pipelineStageCounts.total,
              " total)"
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "space-y-2.5 max-h-[280px] overflow-y-auto pr-1 flex-1", children: pipelineHealthRows.map(({ stage, count, color }) => {
            const denom = Math.max(1, pipelineStageCounts.total);
            const widthPct = Math.round(count / denom * 100);
            return /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-sm mb-1 gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "text-slate-300 truncate", title: stage, children: stage }),
                /* @__PURE__ */ jsx("span", { className: "font-bold tabular-nums shrink-0", children: count })
              ] }),
              /* @__PURE__ */ jsx("div", { className: "w-full bg-slate-700 rounded-full h-1.5", children: /* @__PURE__ */ jsx("div", { className: "h-1.5 rounded-full transition-[width] duration-300", style: { width: `${widthPct}%`, backgroundColor: color } }) })
            ] }, stage);
          }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-6 shadow-sm", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-1", children: [
            /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900", children: "Overdue / Priority Tasks" }),
            /* @__PURE__ */ jsxs("span", { className: "text-xs font-bold bg-rose-50 text-rose-600 px-2 py-1 rounded-full", children: [
              counselorCriticalTasks.length,
              " critical"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mb-4", children: [
            "Showing tasks for ",
            /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-700", children: counselor.name }),
            " (assigned to them, linked via counselor IDs, or for their students)."
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
            counselorCriticalTasks.slice(0, 5).map((task) => {
              const sid = String(task.student_id || task.studentId || "").trim();
              const stu = studentById.get(sid);
              const studentLabel = stu?.name || sid || "—";
              const overdueByDate = isTaskOverdueByDate(task) && task.status !== "Overdue";
              return /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100", children: [
                /* @__PURE__ */ jsx("div", { className: "mt-1", children: /* @__PURE__ */ jsx(AlertTriangle, { size: 14, className: "text-rose-500" }) }),
                /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
                  /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900", children: task.task }),
                  /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 mt-1", children: [
                    task.priority === "High" && /* @__PURE__ */ jsx("span", { className: "text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full", children: "High priority" }),
                    (task.status === "Overdue" || overdueByDate) && /* @__PURE__ */ jsx("span", { className: "text-[10px] font-bold uppercase tracking-wide bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full", children: "Overdue" })
                  ] }),
                  /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
                    "Student: ",
                    studentLabel,
                    " \u2022 Due: ",
                    task.dueDate || "—"
                  ] })
                ] })
              ] }, task.id);
            }),
            counselorCriticalTasks.length === 0 && /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-400 italic", children: "No critical tasks pending." })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-6 shadow-sm", children: [
          /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 mb-4", children: "Recent Student Activity" }),
          /* @__PURE__ */ jsx("div", { className: "space-y-4", children: counselor.students.slice(0, 5).map((student) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500", children: student.name.charAt(0) }),
            /* @__PURE__ */ jsx("div", { className: "flex-1 min-w-0", children: /* @__PURE__ */ jsxs("p", { className: "text-sm font-medium text-slate-900 truncate", children: [
              student.name,
              " ",
              /* @__PURE__ */ jsx("span", { className: "text-slate-400 font-normal", children: "moved to" }),
              " ",
              student.status
            ] }) }),
            /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400", children: "Today" })
          ] }, student.id)) })
        ] })
      ] })
    ] });
  }
  if (!counselorPageReady) {
    return /* @__PURE__ */ jsx(QuietPageSkeleton, {});
  }
  return /* @__PURE__ */ jsxs("div", { className: "space-y-8 animate-in fade-in duration-500 pb-10", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold tracking-tight text-[#0F172A]", children: "Counselor Management" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mt-1", children: "Monitor performance, workload capacity, and SLA compliance." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2 w-full sm:w-auto", children: [
        /* @__PURE__ */ jsxs("div", { className: "relative flex-1 sm:flex-none", children: [
          /* @__PURE__ */ jsx(Search, { className: "absolute left-3 top-2.5 text-gray-400", size: 16 }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              placeholder: "Search counselors...",
              className: "w-full sm:w-64 pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
              value: searchTerm,
              onChange: (e) => setSearchTerm(e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsxs(Button, { onClick: () => setIsAddModalOpen(true), children: [
          /* @__PURE__ */ jsx(Plus, { size: 16, className: "mr-2" }),
          " Add Counselor"
        ] })
      ] })
    ] }),
    isAddModalOpen && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-hidden my-auto flex flex-col", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center p-5 border-b border-gray-100 bg-slate-50 flex-shrink-0", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "font-bold text-lg text-slate-900", children: "Add New Counselor" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: "Onboard a new member to the team." })
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: () => setIsAddModalOpen(false), className: "text-slate-400 hover:text-slate-600 transition-colors", children: /* @__PURE__ */ jsx(X, { size: 20 }) })
      ] }),
        /* @__PURE__ */ jsxs("form", { className: "p-5 space-y-4 overflow-y-auto flex-1 min-h-0", onSubmit: handleAddCounselor, children: [
          addCounselorError && /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: addCounselorError }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "col-span-2", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Full Name" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(Users, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  name: "name",
                  required: true,
                  type: "text",
                  placeholder: "e.g. Aruni Perera",
                  className: "w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none",
                  value: newCounselor.name,
                  onChange: (e) => setNewCounselor({ ...newCounselor, name: e.target.value })
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "col-span-2", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Email Address" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(Mail, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  name: "email",
                  required: true,
                  type: "email",
                  placeholder: "aruni@abec.lk",
                  className: "w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none",
                  value: newCounselor.email,
                  onChange: (e) => setNewCounselor({ ...newCounselor, email: e.target.value })
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "col-span-2", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Branch" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(MapPin, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
              /* @__PURE__ */ jsxs(
                "select",
                {
                  name: "branch",
                  className: "w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none appearance-none bg-white",
                  value: newCounselor.branch,
                  onChange: (e) => setNewCounselor({ ...newCounselor, branch: e.target.value }),
                  disabled: branchOptions.length === 0,
                  children: [
                    /* @__PURE__ */ jsx("option", {
                      value: "",
                      disabled: true,
                      children: branchOptions.length === 0 ? "No saved branches" : "Select branch"
                    }),
                    ...branchOptions.map((branch) => /* @__PURE__ */ jsx("option", { value: branch, children: branch }, branch))
                  ]
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsx("input", { type: "hidden", name: "role", value: newCounselor.role }),
          /* @__PURE__ */ jsxs("div", { className: "col-span-2", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Password" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(KeyRound, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  name: "password",
                  required: true,
                  type: "password",
                  placeholder: "Set account password",
                  className: "w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none",
                  value: newCounselor.password,
                  onChange: (e) => setNewCounselor({ ...newCounselor, password: e.target.value })
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "col-span-2", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Phone Number" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(Phone, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  name: "phone",
                  required: true,
                  type: "tel",
                  placeholder: "+94 77 123 4567",
                  className: "w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none",
                  value: newCounselor.phone,
                  onChange: (e) => setNewCounselor({ ...newCounselor, phone: e.target.value })
                }
              )
            ] })
          ] })
        ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2 pt-4 border-t border-gray-100", children: [
            /* @__PURE__ */ jsx(Button, { variant: "ghost", type: "button", onClick: () => setIsAddModalOpen(false), disabled: isAddingCounselor, children: "Cancel" }),
            /* @__PURE__ */ jsx(Button, { type: "submit", isLoading: isAddingCounselor, disabled: branchOptions.length === 0, children: "Create Profile" })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", children: [
      /* @__PURE__ */ jsx(MetricCard, { title: "Active Counselors", value: counselors.length.toString(), icon: /* @__PURE__ */ jsx(Briefcase, { size: 18 }) }),
      /* @__PURE__ */ jsx(MetricCard, { title: "Avg SLA Score", value: counselors.length > 0 ? `${Math.round(counselors.reduce((acc, c) => acc + c.metrics.sla, 0) / counselors.length)}%` : "0%", icon: /* @__PURE__ */ jsx(CheckCircle, { size: 18 }), color: "text-emerald-600" }),
      /* @__PURE__ */ jsx(MetricCard, { title: "Total Students", value: counselors.reduce((acc, c) => acc + c.metrics.activeStudents, 0).toString(), icon: /* @__PURE__ */ jsx(Users, { size: 18 }) }),
      /* @__PURE__ */ jsxs("div", { className: "bg-gradient-to-br from-[#D32722] via-[#BF342F] to-[#883560] p-5 rounded-xl text-white shadow-lg relative overflow-hidden flex items-center gap-4", children: [
        /* @__PURE__ */ jsx("div", { className: "w-16 h-16 bg-white rounded-full flex-shrink-0 overflow-hidden shadow-sm border-2 border-white/20 flex items-center justify-center text-slate-700 font-bold text-lg", children: topPerformer ? topPerformer.avatar ? /* @__PURE__ */ jsx("img", { src: topPerformer.avatar, alt: topPerformer.name || "", className: "w-full h-full object-cover", referrerPolicy: "no-referrer" }) : (topPerformer.name || "C").charAt(0).toUpperCase() : "N/A" }),
        /* @__PURE__ */ jsxs("div", { className: "relative z-10 flex-1", children: [
          /* @__PURE__ */ jsx("div", { className: "text-white/80 text-xs font-bold uppercase tracking-wider mb-1", children: "Top Performer" }),
          /* @__PURE__ */ jsx("div", { className: "text-xl font-bold", children: topPerformer ? topPerformer.name : "No counselor data" }),
          /* @__PURE__ */ jsxs("div", { className: "text-sm text-white/90 font-medium mt-0.5", children: [
            topPerformer ? topPerformer.metrics.visaGranted : 0,
            " Visas Granted"
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "absolute -right-4 -bottom-4 text-white opacity-10", children: /* @__PURE__ */ jsx(Users, { size: 100 }) })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm text-left", children: [
      /* @__PURE__ */ jsx("thead", { className: "bg-gray-50 border-b border-gray-200 text-slate-500 font-medium", children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4", children: "Counselor" }),
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4 hidden md:table-cell", children: "Branch" }),
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4 hidden lg:table-cell", children: "Capacity" }),
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4 hidden lg:table-cell", children: "SLA" }),
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4 hidden sm:table-cell", children: "Visa" }),
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4 hidden md:table-cell text-right", children: "Critical tasks" }),
        /* @__PURE__ */ jsx("th", { className: "px-6 py-4" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-100", children: filteredCounselors.map((c) => /* @__PURE__ */ jsxs("tr", { className: "hover:bg-slate-50 transition-colors group", children: [
        /* @__PURE__ */ jsx("td", { className: "px-6 py-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-slate-200", children: c.avatar ? /* @__PURE__ */ jsx("img", { src: c.avatar, alt: c.name, className: "w-full h-full object-cover rounded-full", referrerPolicy: "no-referrer" }) : c.name.charAt(0) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "font-semibold text-slate-900", children: c.name }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: c.role })
          ] })
        ] }) }),
        /* @__PURE__ */ jsx("td", { className: "px-6 py-4 hidden md:table-cell text-slate-600", children: c.branch }),
        /* @__PURE__ */ jsx("td", { className: "px-6 py-4 hidden lg:table-cell", children: /* @__PURE__ */ jsxs("div", { className: "w-full max-w-[140px]", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-xs mb-1", children: [
            /* @__PURE__ */ jsxs("span", { className: "font-medium text-slate-700", children: [
              c.metrics.activeStudents,
              " Active"
            ] }),
            /* @__PURE__ */ jsxs("span", { className: `font-bold ${c.metrics.capacityLoad > 90 ? "text-rose-600" : "text-slate-400"}`, children: [
              c.metrics.capacityLoad,
              "%"
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "w-full bg-gray-100 rounded-full h-1.5 overflow-hidden", children: /* @__PURE__ */ jsx(
            "div",
            {
              className: `h-full rounded-full ${c.metrics.capacityLoad > 90 ? "bg-rose-500" : c.metrics.capacityLoad > 75 ? "bg-amber-500" : "bg-indigo-500"}`,
              style: { width: `${c.metrics.capacityLoad}%` }
            }
          ) })
        ] }) }),
        /* @__PURE__ */ jsx("td", { className: "px-6 py-4 hidden lg:table-cell", children: /* @__PURE__ */ jsxs("span", { className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${c.metrics.sla >= 90 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : c.metrics.sla >= 70 ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-rose-50 text-rose-700 border-rose-100"}`, children: [
          c.metrics.sla,
          "%"
        ] }) }),
        /* @__PURE__ */ jsxs("td", { className: "px-6 py-4 hidden sm:table-cell font-mono font-medium text-slate-700", children: [
          c.metrics.successRate,
          "%"
        ] }),
        /* @__PURE__ */ jsx("td", { className: "px-6 py-4 hidden md:table-cell text-right", children: /* @__PURE__ */ jsxs("span", { className: `inline-flex items-center justify-end min-w-[2rem] font-semibold tabular-nums ${c.metrics.criticalTasks > 0 ? "text-rose-600" : "text-slate-400"}`, title: "High priority, overdue status, or past due date", children: [
          c.metrics.criticalTasks
        ] }) }),
        /* @__PURE__ */ jsx("td", { className: "px-6 py-4 text-right", children: /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2", children: [
          /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", onClick: () => setSelectedCounselorId(c.id), children: [
            "View ",
            /* @__PURE__ */ jsx(ArrowRight, { size: 14, className: "ml-1" })
          ] })
        ] }) })
      ] }, c.id)) })
    ] }) })
  ] });
};
const MetricCard = ({ title, value, icon, subtext, color, highlight }) => /* @__PURE__ */ jsxs("div", { className: `p-5 rounded-xl border shadow-sm flex flex-col justify-between ${highlight ? "bg-indigo-50 border-indigo-100" : "bg-white border-gray-200"}`, children: [
  /* @__PURE__ */ jsx("div", { className: "flex justify-between items-start", children: /* @__PURE__ */ jsx("div", { className: `p-2 rounded-lg ${highlight ? "bg-white text-indigo-600" : "bg-slate-50 text-slate-500"}`, children: icon }) }),
  /* @__PURE__ */ jsxs("div", { className: "mt-4", children: [
    /* @__PURE__ */ jsx("h4", { className: "text-xs font-bold uppercase tracking-wider text-slate-500", children: title }),
    /* @__PURE__ */ jsx("div", { className: `text-2xl font-bold mt-1 ${color || "text-slate-900"}`, children: value }),
    subtext && /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 mt-1", children: subtext })
  ] })
] });
export {
  CounselorManagement
};
