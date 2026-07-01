import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatRawLKR } from "../utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { MapPin, TrendingUp, Download, Banknote, Clock, Plus, X } from "lucide-react";
import { Button } from "./Button";
import { createBranch, getBranchFinanceSummary, getBranchManagers } from "../authApi";
import { POLL_MS } from "../runtimeConfig";

const BranchAnalytics = ({
  scopeBranch = null,
}) => {
  const formatRevenueNumber = (value) => {
    const formatted = formatRawLKR(value);
    return formatted.replace(/^LKR\s*/, "");
  };
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [managerAccounts, setManagerAccounts] = useState([]);
  const [branchData, setBranchData] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [fxUpdatedAt, setFxUpdatedAt] = useState("");
  const [fxLive, setFxLive] = useState(false);
  const reportRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pageLoads, setPageLoads] = useState({ finance: false, managers: false });

  const branchPageReady = pageLoads.finance && pageLoads.managers;
  const scopeKey = scopeBranch ? String(scopeBranch).trim().toLowerCase() : "";

  useEffect(() => {
    let cancelled = false;
    const loadFinanceSummary = async () => {
      try {
        const result = await getBranchFinanceSummary(scopeKey ? scopeBranch : "");
        if (!result.ok || cancelled) return;
        setBranchData(result.data.branches || []);
        setTotalRevenue(result.data.totalRevenue || 0);
        if (result.data.exchangeRates) {
          setFxUpdatedAt(result.data.exchangeRates.updatedAt || "");
          setFxLive(result.data.exchangeRates.live !== false);
        }
      } finally {
        if (!cancelled) setPageLoads((p) => ({ ...p, finance: true }));
      }
    };
    loadFinanceSummary();
    const intervalId = setInterval(loadFinanceSummary, POLL_MS.branchAnalytics);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [scopeBranch, scopeKey]);

  useEffect(() => {
    let cancelled = false;
    const loadManagers = async () => {
      try {
        const result = await getBranchManagers(scopeKey ? scopeBranch : "");
        if (!result.ok || cancelled) return;
        setManagerAccounts(result.data);
      } finally {
        if (!cancelled) setPageLoads((p) => ({ ...p, managers: true }));
      }
    };
    loadManagers();
    return () => { cancelled = true; };
  }, [scopeBranch, scopeKey]);

  const revenueRankedData = useMemo(
    () =>
      [...branchData].sort((a, b) => b.revenue - a.revenue).map((branch) => ({
        ...branch,
        revenueShare: totalRevenue > 0 ? branch.revenue / totalRevenue * 100 : 0
      })),
    [branchData, totalRevenue]
  );
  const cardRankedData = useMemo(
    () => [...branchData].sort((a, b) => b.revenue - a.revenue),
    [branchData]
  );

  const handleExportReport = async () => {
    if (!reportRef.current) return;
    try {
      setIsExporting(true);
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf")
      ]);
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: "#f9fafb",
        useCORS: true
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`branch-analytics-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  if (!branchPageReady) {
    return (
      <div className="space-y-6 pb-10" aria-busy="true" aria-label="Loading branch analytics">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="relative mb-6">
            <div className="w-14 h-14 rounded-full border-4 border-slate-200" />
            <div className="absolute inset-0 w-14 h-14 rounded-full border-4 border-transparent border-t-indigo-600 animate-spin" />
            <MapPin size={20} className="absolute inset-0 m-auto text-indigo-600 animate-pulse" />
          </div>
          <p className="text-sm font-medium text-slate-700 mb-1">Loading Branch Analytics</p>
          <p className="text-xs text-slate-400">Fetching branch data and metrics…</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-pulse"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-4 h-4 rounded bg-slate-200" />
                <div className="h-4 w-24 rounded bg-slate-200" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="h-3 w-16 rounded bg-slate-100" />
                  <div className="h-6 w-20 rounded bg-slate-200" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-16 rounded bg-slate-100" />
                  <div className="h-6 w-14 rounded bg-slate-200" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-pulse">
            <div className="h-4 w-48 rounded bg-slate-200 mb-6" />
            <div className="flex items-end gap-6 h-[260px] px-4 pb-4">
              {[65, 45, 80, 55, 70, 40].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end gap-1">
                  <div className="rounded-t bg-slate-200" style={{ height: `${h}%` }} />
                  <div className="h-3 w-full rounded bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-pulse">
            <div className="h-4 w-40 rounded bg-slate-200 mb-6" />
            <div className="space-y-5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between">
                    <div className="h-3 w-20 rounded bg-slate-200" />
                    <div className="h-3 w-16 rounded bg-slate-200" />
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-slate-200"
                      style={{ width: `${70 - i * 15}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={reportRef} className="space-y-6 animate-in fade-in duration-500 pb-10">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">Detailed Branch Analytics</h1>
            <p className="text-sm text-slate-500 mt-1">
              {scopeBranch
                ? `Metrics for your branch only (${scopeBranch}).`
                : "Collected revenue is paid invoices only. Visa success is students at Visa or Enrolled."}
            </p>
            <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
              <Clock size={10} /> Rates updated: {fxUpdatedAt}
              {!fxLive ? " (fallback)" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!scopeBranch ? (
              <Button onClick={() => setIsAddOpen(true)}>
                <Plus size={16} className="mr-2" /> Add Branch
              </Button>
            ) : null}
            <Button variant="secondary" onClick={handleExportReport} isLoading={isExporting}>
              <Download size={16} className="mr-2" /> Export Report
            </Button>
          </div>
        </div>


        {branchData.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-slate-500 text-sm">
            {scopeBranch
              ? `No student records yet for ${scopeBranch}. Metrics will appear when students are assigned to this branch.`
              : "No branch metrics yet. Add branches and students to see regional performance."}
          </div>
        ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {cardRankedData.map((data, idx) => (
            <div
              key={data.name}
              className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:border-indigo-300 transition-colors"
            >
              <div className={`absolute top-0 left-0 w-1 h-full ${idx === 0 ? "bg-indigo-600" : "bg-gray-200"}`} />
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-slate-400" />
                  <span className="font-semibold text-slate-700">{data.name}</span>
                </div>
                {idx === 0 && data.revenue > 0 && (
                  <span className="bg-indigo-50 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    TOP PERFORMER
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-xs text-slate-400 uppercase">Collected (paid)</p>
                  <p className="text-lg font-bold text-slate-900">{formatRevenueNumber(data.revenue)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {data.paidInvoiceCount > 0
                      ? `${data.paidInvoiceCount} paid invoice${data.paidInvoiceCount === 1 ? "" : "s"}`
                      : "No paid invoices yet"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase">Visa success</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {data.students > 0 ? `${data.visaSuccessRate}%` : "—"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {data.visaGranted} of {data.students} students
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm min-h-[400px]">
            <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center">
              <TrendingUp size={16} className="mr-2 text-slate-400" />
              Pipeline volume by branch
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={branchData} barSize={40}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: "#F8FAFC" }}
                    contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                  />
                  <Bar dataKey="students" name="Students" fill="#E2E8F0" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="conversions" name="Past inquiry" fill="#0F172A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center">
              <Banknote size={16} className="mr-2 text-slate-400" />
              Paid revenue by branch
            </h3>
            <div className="space-y-4">
              {revenueRankedData.map((data, idx) => (
                <div key={data.name} className="flex items-center gap-4">
                  <div className="text-xs font-mono text-slate-400 w-4">{idx + 1}</div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700">{data.name}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-slate-900">{formatRawLKR(data.revenue)}</span>
                        <p className="text-[11px] text-slate-500">{data.revenueShare.toFixed(1)}% of total</p>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.max(3, data.revenueShare)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100">
              <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Visa granted students</h4>
              <div className="space-y-3">
                {revenueRankedData.map((data, idx) => (
                  <div key={`${data.name}-visa`} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-xs font-mono text-slate-400 w-4">{idx + 1}</div>
                      <p className="text-sm font-medium text-slate-700">{data.name}</p>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{data.visaGranted}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100">
              <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Branch Managers</h4>
              <div className="space-y-3">
                {managerAccounts.length > 0 ? (
                  managerAccounts.map((manager, idx) => (
                    <div key={manager.id} className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx % 2 === 0 ? "bg-slate-200 text-slate-700" : "bg-indigo-100 text-indigo-700"
                        }`}
                      >
                        {String(manager.username || "M").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{manager.username}</p>
                        <p className="text-xs text-slate-500">{manager.branch}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No manager accounts found.</p>
                )}
              </div>
            </div>
          </div>
        </div>
        </>
        )}
      </div>

      {isAddOpen && (
        <div className="fixed inset-0 z-[110] overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-xl border border-gray-100 shadow-2xl max-h-[90vh] overflow-y-auto my-auto">
            <div className="p-5 border-b border-gray-100 bg-gray-50/60 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-lg text-slate-900">Add Branch</h3>
                <p className="text-xs text-slate-500 mt-0.5">Add a new branch location.</p>
              </div>
              <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setIsAddOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form
              className="p-5 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setIsSaving(true);
                const result = await createBranch(location.trim());
                setIsSaving(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setLocation("");
                setIsAddOpen(false);
                const refreshed = await getBranchFinanceSummary(scopeKey ? scopeBranch : "");
                if (refreshed.ok) {
                  setBranchData(refreshed.data.branches || []);
                  setTotalRevenue(refreshed.data.totalRevenue || 0);
                }
              }}
            >
              {error ? <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">{error}</p> : null}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Branch Location</label>
                <input
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Matara"
                  required
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSaving}>
                  Save Branch
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export { BranchAnalytics };
