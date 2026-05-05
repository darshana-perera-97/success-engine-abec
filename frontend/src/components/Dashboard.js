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
  PieChart,
  Pie,
  AreaChart,
  Area,
  Legend
} from "recharts";
import { formatRawLKR } from "../utils";
import { normalizePipelineStatus } from "../pipeline";
import { Users, Globe, Briefcase, MapPin, Banknote } from "lucide-react";
const PIE_COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#6366F1"];
const Dashboard = ({ students = [], invoices = [] }) => {
  const totalStudents = students.length;
  const counselingCount = students.filter((student) => {
    const x = normalizePipelineStatus(student.status);
    return x === "Inquiry" || x === "Application";
  }).length;
  const uniAppsCount = students.filter((student) => {
    const x = normalizePipelineStatus(student.status);
    return ["Application", "Interview training", "Documentation", "Visa", "Enrolled"].includes(x);
  }).length;
  const visasGranted = students.filter((student) => normalizePipelineStatus(student.status) === "Visa").length;
  const activeApplications = students.filter((student) => normalizePipelineStatus(student.status) !== "Inquiry").length;
  const successRate = uniAppsCount ? Math.round(visasGranted / uniAppsCount * 100) : 0;
  const estimatedRevenue = students.reduce((sum, student) => {
    const value = Number(String(student.budget || "").replace(/[^\d.]/g, ""));
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const funnelData = [
    { name: "Total Inquiries", value: totalStudents, fill: "#94A3B8" },
    { name: "Counseling", value: counselingCount, fill: "#64748B" },
    { name: "Uni Apps", value: uniAppsCount, fill: "#6366F1" },
    { name: "Visas Granted", value: visasGranted, fill: "#10B981" }
  ];
  const countryData = [
    { name: "UK", value: students.filter((student) => student.country === "UK").length },
    { name: "Canada", value: students.filter((student) => student.country === "Canada").length },
    { name: "Australia", value: students.filter((student) => student.country === "Australia").length },
    { name: "New Zealand", value: students.filter((student) => student.country === "New Zealand").length },
    { name: "Other", value: students.filter((student) => !["UK", "Canada", "Australia", "New Zealand"].includes(student.country)).length }
  ];
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
    students.forEach((student) => {
      const key = String(student.branch || "Unknown").trim() || "Unknown";
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
    })).sort((a, b) => b.conversion - a.conversion);
  }, [students]);
  const revenueTrend = revenueData.length >= 2 && revenueData[revenueData.length - 2].revenue > 0 ? Math.round((revenueData[revenueData.length - 1].revenue - revenueData[revenueData.length - 2].revenue) / revenueData[revenueData.length - 2].revenue * 100) : 0;
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6 animate-in fade-in duration-500", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold tracking-tight text-[#0F172A]", children: "Executive Overview" }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-4", children: [
      /* @__PURE__ */ jsx(KpiCard, { title: "Total Students", value: String(totalStudents), trend: "Live", icon: /* @__PURE__ */ jsx(Users, { size: 20 }) }),
      /* @__PURE__ */ jsx(KpiCard, { title: "Active Applications", value: String(activeApplications), trend: "Live", icon: /* @__PURE__ */ jsx(Briefcase, { size: 20 }) }),
      /* @__PURE__ */ jsx(KpiCard, { title: "Visa Success Rate", value: `${successRate}%`, trend: "Live", icon: /* @__PURE__ */ jsx(Globe, { size: 20 }), positive: true }),
      /* @__PURE__ */ jsx(KpiCard, { title: "Est. Revenue", value: formatRawLKR(estimatedRevenue), trend: "Live", icon: /* @__PURE__ */ jsx(Banknote, { size: 20 }), positive: true })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-[350px] flex flex-col", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-slate-900 mb-4", children: "Conversion Funnel Report" }),
        /* @__PURE__ */ jsx("div", { className: "flex-1 w-full", children: /* @__PURE__ */ jsx(ResponsiveContainer, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs(BarChart, { data: funnelData, layout: "vertical", margin: { top: 5, right: 30, left: 40, bottom: 5 }, children: [
          /* @__PURE__ */ jsx(CartesianGrid, { strokeDasharray: "3 3", horizontal: false, stroke: "#E2E8F0" }),
          /* @__PURE__ */ jsx(XAxis, { type: "number", hide: true }),
          /* @__PURE__ */ jsx(YAxis, { dataKey: "name", type: "category", width: 100, tick: { fontSize: 12, fill: "#64748B" }, axisLine: false, tickLine: false }),
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
        /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-slate-900 mb-2", children: "Market Distribution" }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 relative", children: [
          /* @__PURE__ */ jsx(ResponsiveContainer, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs(PieChart, { children: [
            /* @__PURE__ */ jsx(
              Pie,
              {
                data: countryData,
                cx: "50%",
                cy: "50%",
                innerRadius: 60,
                outerRadius: 80,
                paddingAngle: 5,
                dataKey: "value",
                children: countryData.map((entry, index) => /* @__PURE__ */ jsx(Cell, { fill: PIE_COLORS[index % PIE_COLORS.length] }, `cell-${index}`))
              }
            ),
            /* @__PURE__ */ jsx(Tooltip, {}),
            /* @__PURE__ */ jsx(Legend, { verticalAlign: "bottom", height: 36, iconType: "circle", wrapperStyle: { fontSize: "10px" } })
          ] }) }),
          /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center justify-center pointer-events-none pb-8", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
            /* @__PURE__ */ jsx("div", { className: "text-2xl font-bold text-slate-900", children: totalStudents }),
            /* @__PURE__ */ jsx("div", { className: "text-xs text-slate-500 uppercase", children: "Active" })
          ] }) })
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
      /* @__PURE__ */ jsxs("div", { className: "bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-[300px] overflow-hidden", children: [
        /* @__PURE__ */ jsxs("h3", { className: "text-sm font-semibold text-slate-900 mb-4 flex items-center", children: [
          /* @__PURE__ */ jsx(MapPin, { size: 16, className: "mr-2" }),
          " Branch Performance Snapshot"
        ] }),
        /* @__PURE__ */ jsx("div", { className: "space-y-4", children: branchSnapshot.map((branch, idx) => {
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
