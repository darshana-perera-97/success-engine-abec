import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Button } from "./Button";
import { formatRawLKR, EXCHANGE_RATES, RATE_UPDATED_AT } from "../utils";
import { useExchangeRates } from "../useExchangeRates";
import { DollarSign, Landmark, Calculator, AlertTriangle, Trash2, Info, Clock, X } from "lucide-react";
const CURRENCY_CODES = {
  "UK": "GBP",
  "Canada": "CAD",
  "Australia": "AUD",
  "New Zealand": "NZD",
  "USA": "USD"
};
function getExchangeRateForCountry(country, ratesMap) {
  const targetCurrency = CURRENCY_CODES[country] || "USD";
  return ratesMap[targetCurrency] ?? EXCHANGE_RATES[targetCurrency] ?? 312.5;
}
function normalizeCostEntry(cost, exchangeRate, expensesInLkr) {
  const label = String(cost?.label || "").trim() || "Expense";
  if (Number(cost?.amountLKR) > 0) {
    return { id: cost.id, label, amountLKR: Number(cost.amountLKR) };
  }
  const raw = Number(cost?.amount) || 0;
  const amountLKR = expensesInLkr ? raw : Math.round(raw * exchangeRate);
  return { id: cost.id, label, amountLKR };
}
function defaultCostsForStudent(student, ratesMap = EXCHANGE_RATES) {
  const country = student?.country || "";
  const exchangeRate = getExchangeRateForCountry(country, ratesMap);
  const saved = student?.financials?.costs;
  if (!Array.isArray(saved)) return [];
  const expensesInLkr = student?.financials?.expensesInLkr === true;
  return saved.map((cost) => normalizeCostEntry(cost, exchangeRate, expensesInLkr));
}
function defaultTuitionFee(student) {
  const saved = Number(student?.financials?.tuitionFee);
  if (Number.isFinite(saved)) return saved;
  return 0;
}
function computeShowMoneyTotals({ tuitionFee, scholarship, paidTuition, costs, exchangeRate }) {
  const totalCostsLKR = (costs || []).reduce((sum, cost) => sum + (Number(cost.amountLKR) || 0), 0);
  const totalTuitionDue = Math.max(0, (Number(tuitionFee) || 0) - (Number(scholarship) || 0) - (Number(paidTuition) || 0));
  const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 312.5;
  const totalRequiredLKR = totalTuitionDue * rate + totalCostsLKR;
  const totalRequiredTarget = rate > 0 ? totalRequiredLKR / rate : 0;
  return { totalCostsLKR, totalTuitionDue, totalRequiredLKR, totalRequiredTarget };
}
const FinancialCalculator = ({ student, onUpdateStudent }) => {
  const targetCurrency = CURRENCY_CODES[student.country] || "USD";
  const canEdit = typeof onUpdateStudent === "function";
  const [tuitionFee, setTuitionFee] = useState(() => defaultTuitionFee(student));
  const [scholarship, setScholarship] = useState(student.financials?.scholarship || 0);
  const [paidTuition, setPaidTuition] = useState(student.financials?.paidTuition || 0);
  const [costs, setCosts] = useState(() => defaultCostsForStudent(student, EXCHANGE_RATES));
  const [assets, setAssets] = useState(() =>
    Array.isArray(student.financials?.assets) ? [...student.financials.assets] : []
  );
  const [expenseDialog, setExpenseDialog] = useState({ open: false, label: "", amount: "" });
  const [assetDialog, setAssetDialog] = useState({ open: false, type: "Savings", amount: "", age: "" });
  const { rates, updatedAt, live, loading } = useExchangeRates();
  useEffect(() => {
    setTuitionFee(defaultTuitionFee(student));
    setScholarship(student.financials?.scholarship || 0);
    setPaidTuition(student.financials?.paidTuition || 0);
    setCosts(defaultCostsForStudent(student, rates));
    setAssets(Array.isArray(student.financials?.assets) ? [...student.financials.assets] : []);
  }, [student.id]);
  const exchangeRate = rates[targetCurrency] ?? EXCHANGE_RATES[targetCurrency] ?? 312.5;
  const buildFinancials = (overrides = {}) => {
    const nextTuition = overrides.tuitionFee ?? tuitionFee;
    const nextScholarship = overrides.scholarship ?? scholarship;
    const nextPaidTuition = overrides.paidTuition ?? paidTuition;
    const nextCosts = overrides.costs ?? costs;
    const nextAssets = overrides.assets ?? assets;
    const totals = computeShowMoneyTotals({
      tuitionFee: nextTuition,
      scholarship: nextScholarship,
      paidTuition: nextPaidTuition,
      costs: nextCosts,
      exchangeRate
    });
    const totalLiquidAssetsLKR = nextAssets
      .filter((a) => a && a.isLiquid)
      .reduce((sum, a) => sum + (Number(a.amountLKR) || 0), 0);
    return {
      ...(student.financials || {}),
      tuitionFee: nextTuition,
      scholarship: nextScholarship,
      paidTuition: nextPaidTuition,
      costs: nextCosts,
      assets: nextAssets,
      expensesInLkr: true,
      totalShowMoneyRequired: totals.totalRequiredTarget,
      totalShowMoneyRequiredLKR: totals.totalRequiredLKR,
      totalShowMoneyCurrency: targetCurrency,
      showMoneyUpdatedAt: new Date().toISOString(),
      totalLiquidAssetsLKR
    };
  };
  const persistFinancials = async (overrides = {}) => {
    if (!canEdit) return;
    await onUpdateStudent({
      ...student,
      financials: buildFinancials(overrides)
    });
  };
  const { totalCostsLKR, totalTuitionDue, totalRequiredLKR, totalRequiredTarget } = computeShowMoneyTotals({
    tuitionFee,
    scholarship,
    paidTuition,
    costs,
    exchangeRate
  });
  const liquidAssets = assets.filter((a) => a.isLiquid);
  const totalLiquidLKR = liquidAssets.reduce((sum, a) => sum + a.amountLKR, 0);
  const totalLiquidTarget = totalLiquidLKR / exchangeRate;
  const shortfallTarget = totalRequiredTarget - totalLiquidTarget;
  const isSufficient = totalRequiredTarget > 0 && shortfallTarget <= 0;
  const coveragePercent = totalRequiredTarget > 0
    ? Math.min(100, Math.round(totalLiquidTarget / totalRequiredTarget * 100))
    : 0;
  const addAsset = () => {
    if (!canEdit) return;
    const amount = parseFloat(assetDialog.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const age = parseInt(assetDialog.age, 10) || 0;
    const type = String(assetDialog.type || "Savings");
    const isLiquid = type === "Savings" || type === "Fixed Deposit";
    const newAsset = {
      id: `asset-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      type,
      amountLKR: amount,
      fundsAgeMonths: age,
      isLiquid
    };
    const nextAssets = [...assets, newAsset];
    setAssets(nextAssets);
    setAssetDialog({ open: false, type: "Savings", amount: "", age: "" });
    persistFinancials({ assets: nextAssets });
  };
  const openAssetDialog = () => {
    if (!canEdit) return;
    setAssetDialog({ open: true, type: "Savings", amount: "", age: "" });
  };
  const closeAssetDialog = () => {
    setAssetDialog({ open: false, type: "Savings", amount: "", age: "" });
  };
  const removeAsset = (id) => {
    if (!canEdit) return;
    const nextAssets = assets.filter((a) => a.id !== id);
    setAssets(nextAssets);
    persistFinancials({ assets: nextAssets });
  };
  const addCost = () => {
    if (!canEdit) return;
    const label = String(expenseDialog.label || "").trim();
    const amount = parseFloat(expenseDialog.amount);
    if (!label || !Number.isFinite(amount) || amount < 0) return;
    const nextCosts = [
      ...costs,
      { id: `cost-${Date.now()}-${Math.floor(Math.random() * 1e4)}`, label, amountLKR: amount }
    ];
    setCosts(nextCosts);
    setExpenseDialog({ open: false, label: "", amount: "" });
    persistFinancials({ costs: nextCosts });
  };
  const openExpenseDialog = () => {
    if (!canEdit) return;
    setExpenseDialog({ open: true, label: "", amount: "" });
  };
  const closeExpenseDialog = () => {
    setExpenseDialog({ open: false, label: "", amount: "" });
  };
  const removeCost = (id) => {
    if (!canEdit) return;
    const nextCosts = costs.filter((cost) => cost.id !== id);
    setCosts(nextCosts);
    persistFinancials({ costs: nextCosts });
  };
  const formatCurrency = (val, currency) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(val);
  };
  return /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-12 gap-8 h-full", children: [
    /* @__PURE__ */ jsxs("div", { className: "xl:col-span-5 space-y-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-6 shadow-sm", children: [
        /* @__PURE__ */ jsxs("h3", { className: "text-sm font-bold text-slate-900 uppercase tracking-wider mb-6 flex items-center", children: [
          /* @__PURE__ */ jsx(Calculator, { size: 16, className: "mr-2 text-indigo-600" }),
          "Visa Requirement Model (",
          student.country,
          ")"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-5", children: [
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-emerald-600", children: "Scholarship (-)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  value: scholarship,
                  onChange: (e) => setScholarship(parseFloat(e.target.value) || 0),
                  onBlur: () => persistFinancials(),
                  readOnly: !canEdit,
                  className: "w-full px-3 py-2 text-sm bg-emerald-50 border border-emerald-100 rounded-md outline-none focus:border-emerald-500 font-mono text-emerald-700"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-blue-600", children: "Paid Deposit (-)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  value: paidTuition,
                  onChange: (e) => setPaidTuition(parseFloat(e.target.value) || 0),
                  onBlur: () => persistFinancials(),
                  readOnly: !canEdit,
                  className: "w-full px-3 py-2 text-sm bg-blue-50 border border-blue-100 rounded-md outline-none focus:border-blue-500 font-mono text-blue-700"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "pt-4 border-t border-gray-100 space-y-3", children: [
            costs.length === 0 && /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 italic", children: "No expenses added." }),
            costs.map((cost) => /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center text-sm gap-3", children: [
              /* @__PURE__ */ jsx("span", { className: "text-slate-600 min-w-0 truncate", children: cost.label }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [
                /* @__PURE__ */ jsx("span", { className: "font-medium font-mono", children: formatRawLKR(Number(cost.amountLKR) || 0) }),
                canEdit && /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => removeCost(cost.id),
                    className: "text-slate-300 hover:text-rose-500 transition-colors p-0.5",
                    "aria-label": `Remove ${cost.label}`,
                    children: /* @__PURE__ */ jsx(Trash2, { size: 14 })
                  }
                )
              ] })
            ] }, cost.id)),
            canEdit && /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", className: "mt-1", onClick: openExpenseDialog, children: "Add Expense" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "pt-4 border-t border-gray-200", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-1", children: [
              /* @__PURE__ */ jsx("span", { className: "text-sm font-bold text-slate-900", children: 'Total "Show Money" Required' }),
              /* @__PURE__ */ jsx("span", { className: "text-lg font-bold text-indigo-900", children: formatCurrency(totalRequiredTarget, targetCurrency) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "text-right text-xs text-slate-400 font-mono", children: [
              "\u2248 ",
              formatRawLKR(totalRequiredLKR)
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bg-slate-900 text-white rounded-xl p-6 shadow-md relative overflow-hidden", children: [
        /* @__PURE__ */ jsxs("div", { className: "relative z-10", children: [
          /* @__PURE__ */ jsx("h4", { className: "text-slate-400 text-xs font-bold uppercase tracking-wider mb-2", children: "Calculated Exchange Rate" }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-end gap-2", children: [
            /* @__PURE__ */ jsxs("div", { className: "text-3xl font-mono font-bold", children: [
              "1 ",
              targetCurrency
            ] }),
            /* @__PURE__ */ jsx("div", { className: "mb-1 text-slate-400", children: "=" }),
            /* @__PURE__ */ jsxs("div", { className: "text-3xl font-mono font-bold text-emerald-400", children: [
              exchangeRate.toFixed(2),
              " LKR"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "text-[10px] text-slate-500 mt-2 flex items-center gap-1", children: [
            /* @__PURE__ */ jsx(Clock, { size: 10 }),
            loading ? " Loading live rates…" : ` Rates updated: ${updatedAt || RATE_UPDATED_AT}${live ? " · Live FX" : " · Fallback rates"}`
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "absolute top-0 right-0 w-32 h-32 bg-indigo-600 rounded-full blur-[60px] opacity-20 -mr-10 -mt-10" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "xl:col-span-7 space-y-6", children: [
      /* @__PURE__ */ jsxs("div", { className: `border rounded-xl p-6 shadow-sm transition-all flex flex-col sm:flex-row gap-6 items-center
                    ${isSufficient ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}
                `, children: [
        /* @__PURE__ */ jsxs("div", { className: "flex-1 w-full", children: [
          /* @__PURE__ */ jsx("h4", { className: `text-sm font-bold uppercase mb-2 ${isSufficient ? "text-emerald-800" : "text-rose-800"}`, children: isSufficient ? "Funds Sufficient" : "Funds Shortfall" }),
          /* @__PURE__ */ jsx("div", { className: "w-full bg-white/50 rounded-full h-4 mb-2 border border-black/5 overflow-hidden", children: /* @__PURE__ */ jsx(
            "div",
            {
              className: `h-4 rounded-full transition-all duration-1000 ${isSufficient ? "bg-emerald-500" : "bg-rose-500"}`,
              style: { width: `${coveragePercent}%` }
            }
          ) }),
          /* @__PURE__ */ jsxs("p", { className: `text-xs font-medium ${isSufficient ? "text-emerald-700" : "text-rose-700"}`, children: [
            coveragePercent,
            "% Covered (",
            formatCurrency(totalLiquidTarget, targetCurrency),
            " available)"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "text-center min-w-[120px]", children: [
          /* @__PURE__ */ jsx("div", { className: `text-2xl font-bold ${isSufficient ? "text-emerald-600" : "text-rose-600"}`, children: isSufficient ? "READY" : formatCurrency(shortfallTarget, targetCurrency) }),
          /* @__PURE__ */ jsx("div", { className: `text-xs uppercase font-bold ${isSufficient ? "text-emerald-400" : "text-rose-400"}`, children: isSufficient ? "To File" : "Deficit" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden", children: [
        /* @__PURE__ */ jsxs("div", { className: "p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center", children: [
          /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Landmark, { size: 16, className: "text-slate-500" }),
            "Sponsor Assets"
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "text-xs text-slate-500 bg-white px-2 py-1 rounded border border-gray-200", children: [
            "Total Liquid: ",
            formatRawLKR(totalLiquidLKR)
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "p-4 space-y-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            assets.length === 0 && /* @__PURE__ */ jsx("div", { className: "text-center py-6 text-slate-400 text-sm italic", children: "No sponsor assets added yet." }),
            assets.map((asset) => /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-gray-200 transition-colors group", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsx("div", { className: `p-2 rounded-lg ${asset.isLiquid ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"}`, children: /* @__PURE__ */ jsx(DollarSign, { size: 16 }) }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("p", { className: "font-semibold text-slate-900 text-sm", children: asset.type }),
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs", children: [
                    /* @__PURE__ */ jsx("span", { className: "text-slate-500", children: formatRawLKR(asset.amountLKR) }),
                    asset.fundsAgeMonths < 1 && asset.isLiquid && /* @__PURE__ */ jsxs("span", { className: "flex items-center text-rose-600 font-bold bg-rose-50 px-1 rounded", children: [
                      /* @__PURE__ */ jsx(AlertTriangle, { size: 10, className: "mr-1" }),
                      " New Funds"
                    ] }),
                    !asset.isLiquid && /* @__PURE__ */ jsx("span", { className: "text-amber-600 bg-amber-50 px-1 rounded", children: "Illiquid" })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
                /* @__PURE__ */ jsxs("div", { className: "text-right", children: [
                  /* @__PURE__ */ jsx("p", { className: "font-mono font-medium text-slate-700 text-sm", children: formatCurrency(asset.amountLKR / exchangeRate, targetCurrency) }),
                  /* @__PURE__ */ jsxs("p", { className: "text-[10px] text-slate-400", children: [
                    "Held: ",
                    asset.fundsAgeMonths,
                    "mo"
                  ] })
                ] }),
                canEdit && /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => removeAsset(asset.id),
                    className: "text-slate-300 hover:text-rose-500 transition-colors p-1",
                    children: /* @__PURE__ */ jsx(Trash2, { size: 16 })
                  }
                )
              ] })
            ] }, asset.id))
          ] }),
          canEdit && /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", className: "mt-1", onClick: openAssetDialog, children: "Add Asset" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3", children: [
        /* @__PURE__ */ jsx(Info, { size: 20, className: "text-blue-600 flex-shrink-0 mt-0.5" }),
        /* @__PURE__ */ jsxs("div", { className: "text-sm text-blue-800", children: [
          /* @__PURE__ */ jsx("p", { className: "font-bold mb-1", children: "Counselor Note:" }),
          /* @__PURE__ */ jsxs("ul", { className: "list-disc list-inside space-y-1 text-xs", children: [
            student.country === "UK" && /* @__PURE__ */ jsx("li", { children: "Ensure funds are held for 28 consecutive days before printing the statement." }),
            student.country === "Canada" && /* @__PURE__ */ jsx("li", { children: "GIC ($20,635) must be transferred from the student's or sponsor's account directly." }),
            /* @__PURE__ */ jsxs("li", { children: [
              "Property value is generally ",
              /* @__PURE__ */ jsx("strong", { children: "not accepted" }),
              " as liquid cash for student visas unless sold."
            ] }),
            /* @__PURE__ */ jsx("li", { children: "Gold loans are acceptable if the loan is disbursed into the savings account." })
          ] })
        ] })
      ] })
    ] }),
    expenseDialog.open && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm", onClick: closeExpenseDialog, children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-2xl max-w-md w-full overflow-hidden", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80", children: [
        /* @__PURE__ */ jsx("h4", { className: "text-sm font-semibold text-slate-900", children: "Add Expense" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: "p-1 rounded-md text-slate-500 hover:bg-slate-100", onClick: closeExpenseDialog, children: /* @__PURE__ */ jsx(X, { size: 18 }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-4 space-y-3", children: [
        /* @__PURE__ */ jsxs("label", { className: "block", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-slate-700", children: "Expense name" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              value: expenseDialog.label,
              onChange: (e) => setExpenseDialog((prev) => ({ ...prev, label: e.target.value })),
              placeholder: "e.g. OSHC Insurance",
              className: "mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "block", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-slate-700", children: "Amount (LKR)" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "number",
              min: "0",
              value: expenseDialog.amount,
              onChange: (e) => setExpenseDialog((prev) => ({ ...prev, amount: e.target.value })),
              placeholder: "e.g. 5000000",
              className: "mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 font-mono"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-t border-gray-100 flex justify-end gap-2", children: [
        /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: closeExpenseDialog, children: "Cancel" }),
        /* @__PURE__ */ jsx(
          Button,
          {
            size: "sm",
            onClick: addCost,
            disabled: !String(expenseDialog.label || "").trim() || !(Number(expenseDialog.amount) > 0),
            children: "Add"
          }
        )
      ] })
    ] }) }),
    assetDialog.open && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[151] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm", onClick: closeAssetDialog, children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-2xl max-w-md w-full overflow-hidden", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80", children: [
        /* @__PURE__ */ jsx("h4", { className: "text-sm font-semibold text-slate-900", children: "Add Sponsor Asset" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: "p-1 rounded-md text-slate-500 hover:bg-slate-100", onClick: closeAssetDialog, children: /* @__PURE__ */ jsx(X, { size: 18 }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-4 space-y-3", children: [
        /* @__PURE__ */ jsxs("label", { className: "block", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-slate-700", children: "Type" }),
          /* @__PURE__ */ jsxs(
            "select",
            {
              value: assetDialog.type,
              onChange: (e) => setAssetDialog((prev) => ({ ...prev, type: e.target.value })),
              className: "mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 bg-white",
              children: [
                /* @__PURE__ */ jsx("option", { value: "Savings", children: "Savings" }),
                /* @__PURE__ */ jsx("option", { value: "Fixed Deposit", children: "Fixed Deposit" }),
                /* @__PURE__ */ jsx("option", { value: "Property", children: "Property (Illiquid)" }),
                /* @__PURE__ */ jsx("option", { value: "Business Income", children: "Business Income" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "block", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-slate-700", children: "Amount (LKR)" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "number",
              min: "0",
              value: assetDialog.amount,
              onChange: (e) => setAssetDialog((prev) => ({ ...prev, amount: e.target.value })),
              placeholder: "e.g. 5000000",
              className: "mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 font-mono"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "block", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold text-slate-700", children: "Age held (months)" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "number",
              min: "0",
              value: assetDialog.age,
              onChange: (e) => setAssetDialog((prev) => ({ ...prev, age: e.target.value })),
              placeholder: "e.g. 12",
              className: "mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 font-mono"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-t border-gray-100 flex justify-end gap-2", children: [
        /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: closeAssetDialog, children: "Cancel" }),
        /* @__PURE__ */ jsx(
          Button,
          {
            size: "sm",
            onClick: addAsset,
            disabled: !(Number(assetDialog.amount) > 0),
            children: "Add"
          }
        )
      ] })
    ] }) })
  ] });
};
export {
  FinancialCalculator
};
