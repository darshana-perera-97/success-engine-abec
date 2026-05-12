import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Button } from "./Button";
import { formatRawLKR, EXCHANGE_RATES, RATE_UPDATED_AT } from "../utils";
import { useExchangeRates } from "../useExchangeRates";
import { DollarSign, Landmark, Calculator, AlertTriangle, Plus, Trash2, Info, Clock } from "lucide-react";
const LIVING_EXPENSES = {
  "UK": 12006,
  // London rate approx
  "Canada": 20635,
  // New 2024 GIC
  "Australia": 24505,
  "New Zealand": 2e4,
  "USA": 25e3
  // I-20 Est
};
const CURRENCY_CODES = {
  "UK": "GBP",
  "Canada": "CAD",
  "Australia": "AUD",
  "New Zealand": "NZD",
  "USA": "USD"
};
const FinancialCalculator = ({ student }) => {
  const [tuitionFee, setTuitionFee] = useState(student.financials?.tuitionFee || 15e3);
  const [scholarship, setScholarship] = useState(student.financials?.scholarship || 0);
  const [paidTuition, setPaidTuition] = useState(student.financials?.paidTuition || 0);
  const [assets, setAssets] = useState(student.financials?.assets || []);
  const [newAssetAmount, setNewAssetAmount] = useState("");
  const [newAssetType, setNewAssetType] = useState("Savings");
  const [newAssetAge, setNewAssetAge] = useState("");
  const { rates, updatedAt, live, loading } = useExchangeRates();
  const targetCurrency = CURRENCY_CODES[student.country] || "USD";
  const exchangeRate = rates[targetCurrency] ?? EXCHANGE_RATES[targetCurrency] ?? 312.5;
  const livingCost = LIVING_EXPENSES[student.country] || 15e3;
  const travelCost = 2e3;
  const totalTuitionDue = Math.max(0, tuitionFee - scholarship - paidTuition);
  const totalRequiredTarget = totalTuitionDue + livingCost + travelCost;
  const totalRequiredLKR = totalRequiredTarget * exchangeRate;
  const liquidAssets = assets.filter((a) => a.isLiquid);
  const totalLiquidLKR = liquidAssets.reduce((sum, a) => sum + a.amountLKR, 0);
  const totalLiquidTarget = totalLiquidLKR / exchangeRate;
  const shortfallTarget = totalRequiredTarget - totalLiquidTarget;
  const isSufficient = shortfallTarget <= 0;
  const coveragePercent = Math.min(100, Math.round(totalLiquidTarget / totalRequiredTarget * 100));
  const addAsset = () => {
    if (!newAssetAmount) return;
    const amount = parseFloat(newAssetAmount);
    const age = parseInt(newAssetAge) || 0;
    const isLiquid = newAssetType === "Savings" || newAssetType === "Fixed Deposit";
    const newAsset = {
      id: Math.random().toString(),
      type: newAssetType,
      amountLKR: amount,
      fundsAgeMonths: age,
      isLiquid
    };
    setAssets([...assets, newAsset]);
    setNewAssetAmount("");
    setNewAssetAge("");
  };
  const removeAsset = (id) => {
    setAssets(assets.filter((a) => a.id !== id));
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
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxs("label", { className: "text-xs font-semibold text-slate-500", children: [
              "Total Annual Tuition (",
              targetCurrency,
              ")"
            ] }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "number",
                value: tuitionFee,
                onChange: (e) => setTuitionFee(parseFloat(e.target.value) || 0),
                className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md outline-none focus:border-indigo-500 font-mono"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-emerald-600", children: "Scholarship (-)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  value: scholarship,
                  onChange: (e) => setScholarship(parseFloat(e.target.value) || 0),
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
                  className: "w-full px-3 py-2 text-sm bg-blue-50 border border-blue-100 rounded-md outline-none focus:border-blue-500 font-mono text-blue-700"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "pt-4 border-t border-gray-100 space-y-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-sm", children: [
              /* @__PURE__ */ jsx("span", { className: "text-slate-600", children: "Tuition Balance" }),
              /* @__PURE__ */ jsx("span", { className: "font-medium", children: formatCurrency(totalTuitionDue, targetCurrency) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-sm", children: [
              /* @__PURE__ */ jsx("span", { className: "text-slate-600", children: "Living Expenses (Est)" }),
              /* @__PURE__ */ jsx("span", { className: "font-medium", children: formatCurrency(livingCost, targetCurrency) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-sm", children: [
              /* @__PURE__ */ jsx("span", { className: "text-slate-600", children: "Travel & Health" }),
              /* @__PURE__ */ jsx("span", { className: "font-medium", children: formatCurrency(travelCost, targetCurrency) })
            ] })
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
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-12 gap-3 items-end bg-slate-50 p-3 rounded-lg border border-slate-100", children: [
            /* @__PURE__ */ jsxs("div", { className: "col-span-12 sm:col-span-3", children: [
              /* @__PURE__ */ jsx("label", { className: "text-[10px] font-bold text-slate-500 uppercase", children: "Type" }),
              /* @__PURE__ */ jsxs(
                "select",
                {
                  className: "w-full p-2 text-sm border border-gray-200 rounded bg-white outline-none",
                  value: newAssetType,
                  onChange: (e) => setNewAssetType(e.target.value),
                  children: [
                    /* @__PURE__ */ jsx("option", { value: "Savings", children: "Savings" }),
                    /* @__PURE__ */ jsx("option", { value: "Fixed Deposit", children: "Fixed Deposit" }),
                    /* @__PURE__ */ jsx("option", { value: "Property", children: "Property (Illiquid)" }),
                    /* @__PURE__ */ jsx("option", { value: "Business Income", children: "Business Income" })
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "col-span-12 sm:col-span-4", children: [
              /* @__PURE__ */ jsx("label", { className: "text-[10px] font-bold text-slate-500 uppercase", children: "Amount (LKR)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  className: "w-full p-2 text-sm border border-gray-200 rounded outline-none focus:border-indigo-500",
                  placeholder: "e.g. 5000000",
                  value: newAssetAmount,
                  onChange: (e) => setNewAssetAmount(e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "col-span-6 sm:col-span-3", children: [
              /* @__PURE__ */ jsx("label", { className: "text-[10px] font-bold text-slate-500 uppercase", children: "Age (Months)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  className: "w-full p-2 text-sm border border-gray-200 rounded outline-none focus:border-indigo-500",
                  placeholder: "Months held",
                  value: newAssetAge,
                  onChange: (e) => setNewAssetAge(e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsx("div", { className: "col-span-6 sm:col-span-2", children: /* @__PURE__ */ jsx(Button, { className: "w-full", onClick: addAsset, disabled: !newAssetAmount, children: /* @__PURE__ */ jsx(Plus, { size: 16 }) }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            assets.length === 0 && /* @__PURE__ */ jsx("div", { className: "text-center py-6 text-slate-400 text-sm italic", children: "No assets added. Add sponsor funds above." }),
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
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => removeAsset(asset.id),
                    className: "text-slate-300 hover:text-rose-500 transition-colors p-1",
                    children: /* @__PURE__ */ jsx(Trash2, { size: 16 })
                  }
                )
              ] })
            ] }, asset.id))
          ] })
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
    ] })
  ] });
};
export {
  FinancialCalculator
};
