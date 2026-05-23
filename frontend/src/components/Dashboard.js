import { jsx, jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { formatRawLKR } from "../utils";
import { branchesMatch, normalizePipelineStatus, PIPELINE_STEPS, computePipelineStageCounts } from "../pipeline";
import { Users, Globe, Briefcase, MapPin, Banknote } from "lucide-react";
const PIE_COLORS = ["#3B82F6", "#8B5CF6", "#EF4444", "#10B981", "#F59E0B", "#6366F1"];
const DESTINATION_SYNONYMS = new Map([
  ["united kingdom", "UK"],
  ["great britain", "UK"],
  ["gb", "UK"],
  ["england", "UK"],
  ["u.k.", "UK"],
  ["u.k", "UK"],
  ["united states", "USA"],
  ["united states of america", "USA"],
  ["u.s.a.", "USA"],
  ["u.s.", "USA"],
  ["us", "USA"],
  ["newzealand", "New Zealand"],
  ["nz", "New Zealand"],
  ["aotearoa", "New Zealand"]
]);
function resolveStudentDestinationLabel(raw, canonicalDestinationList) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || !canonicalDestinationList.length) return null;
  const lower = trimmed.toLowerCase();
  for (const c of canonicalDestinationList) {
    const label = String(c ?? "").trim();
    if (label && label.toLowerCase() === lower) return label;
  }
  const viaSynonym = DESTINATION_SYNONYMS.get(lower);
  if (viaSynonym) {
    const hit = canonicalDestinationList.find((c) => String(c ?? "").trim().toLowerCase() === viaSynonym.toLowerCase());
    if (hit) return String(hit).trim();
  }
  return null;
}
function marketSliceColor(sliceName, destinationList) {
  const i = destinationList.findIndex((c) => String(c).trim().toLowerCase() === String(sliceName).trim().toLowerCase());
  if (i >= 0) return PIE_COLORS[i % PIE_COLORS.length];
  return "#94A3B8";
}
function MarketDonutChart({ slices, size = 200, strokeWidth = 28 }) {
  const total = slices.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  if (!total) return null;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, className: "mx-auto block", role: "img", "aria-label": "Market distribution chart", children: /* @__PURE__ */ jsx("g", { transform: `rotate(-90 ${center} ${center})`, children: slices.map((slice) => {
    const value = Number(slice.value) || 0;
    const dash = value / total * circumference;
    const gap = Math.max(circumference - dash, 0);
    const fill = slice.fill || marketSliceColor(slice.name, []);
    const node = /* @__PURE__ */ jsx(
      "circle",
      {
        cx: center,
        cy: center,
        r: radius,
        fill: "none",
        stroke: fill,
        strokeWidth,
        strokeDasharray: `${dash} ${gap}`,
        strokeDashoffset: -offset,
        strokeLinecap: "butt"
      },
      String(slice.name)
    );
    offset += dash;
    return node;
  }) }) });
}
const Dashboard = ({ students = [], invoices = [], destinationCountries = [], branchLocations = [] }) => {
  const totalStudents = students.length;
  const uniAppsCount = students.filter((student) => {
    const x = normalizePipelineStatus(student.status);
    return ["Application", "Interview training", "Documentation", "Visa", "Enrolled"].includes(x);
  }).length;
  const visasGranted = students.filter((student) => {
    const x = normalizePipelineStatus(student.status);
    return x === "Visa" || x === "Enrolled";
  }).length;
  const activeApplications = students.filter((student) => {
    const stage = normalizePipelineStatus(student.status);
    return stage !== "Inquiry" && stage !== "Registration";
  }).length;
  const successRate = uniAppsCount ? Math.round(visasGranted / uniAppsCount * 100) : 0;
  const invoicedTotal = useMemo(
    () => (invoices || []).reduce((sum, inv) => {
      const n = Number(inv.amount);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0),
    [invoices]
  );
  const budgetPipelineTotal = useMemo(
    () => students.reduce((sum, student) => {
      const value = Number(String(student.budget || "").replace(/[^\d.]/g, ""));
      return Number.isFinite(value) ? sum + value : sum;
    }, 0),
    [students]
  );
  const estimatedRevenue = invoicedTotal > 0 ? invoicedTotal : budgetPipelineTotal;
  const revenueKpiTrend = invoicedTotal > 0 ? `${(invoices || []).length} invoice${(invoices || []).length === 1 ? "" : "s"}` : "Student budgets";
  const funnelBarFills = ["#94A3B8", "#64748B", "#6366F1", "#8B5CF6", "#0EA5E9", "#10B981"];
  const funnelData = useMemo(() => {
    const { byStage, other } = computePipelineStageCounts(students);
    const rows = PIPELINE_STEPS.map((stage, idx) => {
      const name = stage === "Interview training" ? "Interview training" : stage;
      return { name, value: byStage[stage] ?? 0, fill: funnelBarFills[idx % funnelBarFills.length] };
    });
    if (other > 0) {
      rows.push({ name: "Other / unmapped", value: other, fill: "#CBD5E1" });
    }
    return rows;
  }, [students]);
  const destinationList = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const c of destinationCountries || []) {
      const label = String(c ?? "").trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
    return out;
  }, [destinationCountries]);
  const countryData = useMemo(() => {
    const list = destinationList;
    if (!list.length) {
      const counts = new Map();
      for (const student of students) {
        const label = String(student.country || "").trim() || "Unknown";
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      return Array.from(counts.entries()).map(([name, value]) => ({ name, value: Number(value) || 0 }));
    }
    const counts = new Map(list.map((name) => [name, 0]));
    let other = 0;
    for (const student of students) {
      const key = resolveStudentDestinationLabel(student.country, list);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
      else other += 1;
    }
    const rows = list.map((name) => ({ name, value: Number(counts.get(name)) || 0 }));
    if (other > 0) {
      rows.push({ name: "Other", value: Number(other) || 0 });
    }
    return rows;
  }, [students, destinationList]);
  const marketPieSlices = useMemo(
    () => countryData.filter((row) => (Number(row.value) || 0) > 0).map((row) => ({
      ...row,
      fill: marketSliceColor(row.name, destinationList)
    })),
    [countryData, destinationList]
  );
  const revenueData = useMemo(() => {
    const labels = [];
    const bucket = new Map();
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date();
      monthDate.setMonth(monthDate.getMonth() - i, 1);
      const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
      const label = monthDate.toLocaleString("en-US", { month: "short" });
      labels.push({ key, label });
      bucket.set(key, 0);
    }
    (invoices || []).forEach((invoice) => {
      const issueDate = new Date(invoice.issueDate || invoice.createdAt || "");
      if (Number.isNaN(issueDate.getTime())) return;
      const key = `${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, "0")}`;
      if (!bucket.has(key)) return;
      const amount = Number(invoice.amount);
      const current = bucket.get(key) || 0;
      bucket.set(key, current + (Number.isFinite(amount) ? amount : 0));
    });
    return labels.map(({ key, label }) => ({ month: label, revenue: bucket.get(key) || 0 }));
  }, [invoices]);
  const branchSnapshot = useMemo(() => {
    const grouped = new Map();
    branchLocations.forEach((location) => {
      const key = String(location || "").trim();
      if (!key) return;
      grouped.set(key, { name: key, students: 0, converted: 0 });
    });
    students.forEach((student) => {
      const studentBranch = String(student.branch || student.nearestOffice || "").trim();
      if (!studentBranch) return;
      const registeredLocation = branchLocations.find((location) =>
        branchesMatch(location, studentBranch)
      );
      if (!registeredLocation) return;
      const key = String(registeredLocation).trim();
      const current = grouped.get(key) || { name: key, students: 0, converted: 0 };
      current.students += 1;
      if (["Application", "Interview training", "Documentation", "Visa", "Enrolled", "Uni Application", "Offer Received", "Visa Pilot"].includes(normalizePipelineStatus(student.status))) {
        current.converted += 1;
      }
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).map((item) => ({
      ...item,
      conversion: item.students ? Math.round(item.converted / item.students * 100) : 0
    })).sort((a, b) => b.conversion - a.conversion || b.students - a.students || a.name.localeCompare(b.name));
  }, [students, branchLocations]);
  const revenueTrend = revenueData.length >= 2 && revenueData[revenueData.length - 2].revenue > 0 ? Math.round((revenueData[revenueData.length - 1].revenue - revenueData[revenueData.length - 2].revenue) / revenueData[revenueData.length - 2].revenue * 100) : 0;
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6 animate-in fade-in duration-500", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold tracking-tight text-[#0F172A]", children: "Executive Overview" }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-4", children: [
      /* @__PURE__ */ jsx(KpiCard, { title: "Total Students", value: String(totalStudents), trend: "Live", icon: /* @__PURE__ */ jsx(Users, { size: 20 }) }),
      /* @__PURE__ */ jsx(KpiCard, { title: "Active Applications", value: String(activeApplications), trend: "Live", icon: /* @__PURE__ */ jsx(Briefcase, { size: 20 }) }),
      /* @__PURE__ */ jsx(KpiCard, { title: "Visa Success Rate", value: `${successRate}%`, trend: "Live", icon: /* @__PURE__ */ jsx(Globe, { size: 20 }), positive: true }),
      /* @__PURE__ */ jsx(KpiCard, { title: "Est. Revenue", value: formatRawLKR(estimatedRevenue), trend: revenueKpiTrend, icon: /* @__PURE__ */ jsx(Banknote, { size: 20 }), positive: true })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-[350px] flex flex-col", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-slate-900 mb-4", children: "Conversion Funnel Report" }),
        /* @__PURE__ */ jsx("div", { className: "flex-1 w-full", children: /* @__PURE__ */ jsx(ResponsiveContainer, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs(BarChart, { data: funnelData, layout: "vertical", margin: { top: 5, right: 30, left: 40, bottom: 5 }, children: [
          /* @__PURE__ */ jsx(CartesianGrid, { strokeDasharray: "3 3", horizontal: false, stroke: "#E2E8F0" }),
          /* @__PURE__ */ jsx(XAxis, { type: "number", hide: true }),
          /* @__PURE__ */ jsx(YAxis, { dataKey: "name", type: "category", width: 118, tick: { fontSize: 11, fill: "#64748B" }, axisLine: false, tickLine: false }),
          /* @__PURE__ */ jsx(
            Tooltip,
            {
              contentStyle: { borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" },
              cursor: { fill: "#F1F5F9" }
            }
          ),
          /* @__PURE__ */ jsx(Bar, { dataKey: "value", radius: [0, 4, 4, 0], barSize: 32, children: funnelData.map((entry, index) => /* @__PURE__ */ jsx(Cell, { fill: entry.fill }, `cell-${index}`)) })
        ] }) }) })
      ] }),
        /* @__PURE__ */ jsxs("div", { className: "bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-[350px] flex flex-col", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-slate-900 mb-2 shrink-0", children: "Market Distribution" }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col flex-1 min-h-0", children: [
          /* @__PURE__ */ jsxs("div", { className: "relative flex-1 min-h-[180px] w-full flex items-center justify-center", children: [
            marketPieSlices.length > 0 ? /* @__PURE__ */ jsx(MarketDonutChart, { slices: marketPieSlices, size: 200, strokeWidth: 28 }) : /* @__PURE__ */ jsx("div", { className: "flex h-full w-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/80 text-xs text-slate-500 px-4 text-center", children: students.length === 0 ? "No students yet to chart market distribution." : destinationList.length === 0 ? "Loading destination countries\u2026" : "No distribution to display yet (all segments are zero)." }),
            marketPieSlices.length > 0 ? /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center justify-center pointer-events-none", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
              /* @__PURE__ */ jsx("div", { className: "text-2xl font-bold text-slate-900", children: totalStudents }),
              /* @__PURE__ */ jsx("div", { className: "text-xs text-slate-500 uppercase", children: "Active" })
            ] }) }) : null
          ] }),
          marketPieSlices.length > 0 ? /* @__PURE__ */ jsx("div", { className: "flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2 px-1 shrink-0 text-[10px] text-slate-600", children: marketPieSlices.map((entry) => /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1", children: [
            /* @__PURE__ */ jsx("span", { className: "inline-block h-2 w-2 rounded-full shrink-0", style: { backgroundColor: marketSliceColor(entry.name, destinationList) } }),
            /* @__PURE__ */ jsxs("span", { children: [
              entry.name,
              " (",
              entry.value,
              ")"
            ] })
          ] }, String(entry.name))) }) : null
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-[300px]", children: [
        /* @__PURE__ */ jsxs("h3", { className: "text-sm font-semibold text-slate-900 mb-4 flex justify-between", children: [
          /* @__PURE__ */ jsx("span", { children: "Revenue Forecast" }),
          /* @__PURE__ */ jsx("span", { className: "text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-xs font-bold", children: `${revenueTrend >= 0 ? "+" : ""}${revenueTrend}% vs last month` })
        ] }),
        /* @__PURE__ */ jsx(ResponsiveContainer, { width: "100%", height: "80%", children: /* @__PURE__ */ jsxs(AreaChart, { data: revenueData, children: [
          /* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsxs("linearGradient", { id: "colorRev", x1: "0", y1: "0", x2: "0", y2: "1", children: [
            /* @__PURE__ */ jsx("stop", { offset: "5%", stopColor: "#0F172A", stopOpacity: 0.1 }),
            /* @__PURE__ */ jsx("stop", { offset: "95%", stopColor: "#0F172A", stopOpacity: 0 })
          ] }) }),
          /* @__PURE__ */ jsx(XAxis, { dataKey: "month", axisLine: false, tickLine: false, tick: { fontSize: 12 } }),
          /* @__PURE__ */ jsx(YAxis, { hide: true }),
          /* @__PURE__ */ jsx(
            Tooltip,
            {
              formatter: (value) => [formatRawLKR(value), "Revenue"],
              contentStyle: { borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }
            }
          ),
          /* @__PURE__ */ jsx(Area, { type: "monotone", dataKey: "revenue", stroke: "#0F172A", strokeWidth: 2, fillOpacity: 1, fill: "url(#colorRev)" })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-[300px] overflow-hidden flex flex-col", children: [
        /* @__PURE__ */ jsxs("h3", { className: "text-sm font-semibold text-slate-900 mb-4 flex items-center", children: [
          /* @__PURE__ */ jsx(MapPin, { size: 16, className: "mr-2" }),
          " Branch Performance Snapshot"
        ] }),
        /* @__PURE__ */ jsx("div", { className: "space-y-4 overflow-y-auto pr-1 -mr-1 flex-1 min-h-0", children: branchSnapshot.map((branch, idx) => {
          return /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-xs mb-1", children: [
              /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-700", children: branch.name }),
              /* @__PURE__ */ jsxs("span", { className: "text-slate-500", children: [
                branch.conversion,
                "% Conversion (",
                branch.students,
                " Students)"
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "w-full bg-gray-100 rounded-full h-2", children: /* @__PURE__ */ jsx(
              "div",
              {
                className: `h-2 rounded-full ${idx === 0 ? "bg-indigo-600" : "bg-slate-400"}`,
                style: { width: `${branch.conversion}%` }
              }
            ) })
          ] }, branch.name);
        }) })
      ] })
    ] })
  ] });
};
const KpiCard = ({ title, value, trend, icon, positive }) => /* @__PURE__ */ jsxs("div", { className: "bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between", children: [
  /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start", children: [
    /* @__PURE__ */ jsx("div", { className: "text-slate-500 bg-slate-50 p-2 rounded-lg", children: icon }),
    /* @__PURE__ */ jsx("span", { className: `text-xs font-medium px-2 py-1 rounded-full ${positive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`, children: trend })
  ] }),
  /* @__PURE__ */ jsxs("div", { className: "mt-4", children: [
    /* @__PURE__ */ jsx("h4", { className: "text-slate-500 text-xs font-medium uppercase tracking-wider", children: title }),
    /* @__PURE__ */ jsx("div", { className: "text-2xl font-bold text-slate-900 mt-1 tracking-tight", children: value })
  ] })
] });
export {
  Dashboard
};
