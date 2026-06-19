import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Globe, Save, Settings, Landmark, Trash2, Wallet, MessageSquare } from "lucide-react";
import { Button } from "./Button";
import { createCountry, createPaymentAccount, deleteCountry, deletePaymentAccount, getBranches, getCountries, getPaymentAccounts, updateBranchCountries } from "../authApi";
import { getStoredBranchCountries } from "../utils/branchCountries";
import { TableSkeletonRows } from "./LoadingPlaceholder";

const AdminSettings = ({ meetingSettings, onSaveMeetingSettings, systemData, onSaveSystemData, paymentAccounts = [], onPaymentAccountsChange }) => {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const defaultDaySchedules = {
    0: { isOpen: true, startHour: 8, endHour: 17 },
    1: { isOpen: true, startHour: 8, endHour: 17 },
    2: { isOpen: true, startHour: 8, endHour: 17 },
    3: { isOpen: true, startHour: 8, endHour: 17 },
    4: { isOpen: true, startHour: 8, endHour: 17 },
    5: { isOpen: true, startHour: 8, endHour: 17 },
    6: { isOpen: true, startHour: 8, endHour: 17 }
  };
  const [meetingForm, setMeetingForm] = useState({
    meetingDurationMinutes: 30,
    daySchedules: defaultDaySchedules
  });
  const [meetingError, setMeetingError] = useState("");
  const [meetingSuccess, setMeetingSuccess] = useState("");
  const [isSavingMeetingSettings, setIsSavingMeetingSettings] = useState(false);
  const [countries, setCountries] = useState([]);
  const [countriesReady, setCountriesReady] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchesReady, setBranchesReady] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [branchCountrySelection, setBranchCountrySelection] = useState([]);
  const [newGlobalCountryName, setNewGlobalCountryName] = useState("");
  const [countryError, setCountryError] = useState("");
  const [countrySuccess, setCountrySuccess] = useState("");
  const [globalCountryError, setGlobalCountryError] = useState("");
  const [globalCountrySuccess, setGlobalCountrySuccess] = useState("");
  const [isSavingCountry, setIsSavingCountry] = useState(false);
  const [isSavingBranchCountrySelection, setIsSavingBranchCountrySelection] = useState(false);
  const [removingCountryName, setRemovingCountryName] = useState("");
  const [localPaymentAccounts, setLocalPaymentAccounts] = useState(paymentAccounts);
  const [paymentAccountsReady, setPaymentAccountsReady] = useState(false);
  const [paymentAccountError, setPaymentAccountError] = useState("");
  const [paymentAccountSuccess, setPaymentAccountSuccess] = useState("");
  const [isSavingPaymentAccount, setIsSavingPaymentAccount] = useState(false);
  const [removingPaymentAccountId, setRemovingPaymentAccountId] = useState("");
  const [newPaymentAccount, setNewPaymentAccount] = useState({
    label: "",
    bankName: "",
    accountName: "",
    accountNumber: "",
    branch: "",
    currency: "LKR",
    notes: ""
  });
  const [financeForm, setFinanceForm] = useState({ counselorCanAcceptPayments: false, adminChatEnabled: false, branchCountriesEnabled: false });
  const [financeError, setFinanceError] = useState("");
  const [financeSuccess, setFinanceSuccess] = useState("");
  const [isSavingFinanceSettings, setIsSavingFinanceSettings] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatSuccess, setChatSuccess] = useState("");
  const [isSavingChatSettings, setIsSavingChatSettings] = useState(false);
  const [branchCountriesError, setBranchCountriesError] = useState("");
  const [branchCountriesSuccess, setBranchCountriesSuccess] = useState("");
  const [isSavingBranchCountriesSettings, setIsSavingBranchCountriesSettings] = useState(false);

  const loadBranches = async () => {
    try {
      const result = await getBranches();
      if (!result.ok) {
        setCountryError(result.error || "Failed to load branches.");
        return;
      }
      const list = Array.isArray(result.data) ? result.data : [];
      setBranches(list);
      setSelectedBranchId((prev) => {
        if (prev && list.some((branch) => branch.id === prev)) return prev;
        return list[0]?.id || "";
      });
    } finally {
      setBranchesReady(true);
    }
  };

  const loadCountries = async () => {
    try {
      const result = await getCountries();
      if (!result.ok) {
        setCountryError(result.error || "Failed to load countries.");
        return;
      }
      setCountries(result.data);
      setCountryError("");
    } finally {
      setCountriesReady(true);
    }
  };

  const loadPaymentAccounts = async () => {
    try {
      const result = await getPaymentAccounts();
      if (!result.ok) {
        setPaymentAccountError(result.error || "Failed to load payment accounts.");
        return;
      }
      setLocalPaymentAccounts(result.data);
      onPaymentAccountsChange?.(result.data);
      setPaymentAccountError("");
    } finally {
      setPaymentAccountsReady(true);
    }
  };

  useEffect(() => {
    loadCountries();
    loadBranches();
    loadPaymentAccounts();
  }, []);

  useEffect(() => {
    if (Array.isArray(paymentAccounts) && paymentAccounts.length > 0) {
      setLocalPaymentAccounts(paymentAccounts);
    }
  }, [paymentAccounts]);

  useEffect(() => {
    if (!systemData) return;
    setFinanceForm({
      counselorCanAcceptPayments: systemData.counselorCanAcceptPayments === true,
      adminChatEnabled: systemData.adminChatEnabled === true,
      branchCountriesEnabled: systemData.branchCountriesEnabled === true
    });
  }, [systemData]);

  useEffect(() => {
    if (!meetingSettings) return;
    const nextSchedules = {};
    for (let day = 0; day <= 6; day++) {
      const row = meetingSettings.daySchedules?.[day] || defaultDaySchedules[day];
      nextSchedules[day] = {
        isOpen: row.isOpen !== false,
        startHour: Number(row.startHour) || 8,
        endHour: Number(row.endHour) || 17
      };
    }
    setMeetingForm({
      meetingDurationMinutes: Number(meetingSettings.meetingDurationMinutes) || 30,
      daySchedules: nextSchedules
    });
  }, [meetingSettings]);

  useEffect(() => {
    if (!selectedBranchId) {
      setBranchCountrySelection([]);
      return;
    }
    const branch = branches.find((item) => item.id === selectedBranchId);
    setBranchCountrySelection(branch ? getStoredBranchCountries(branch) : []);
  }, [selectedBranchId, branches]);

  const toggleBranchCountry = (countryName) => {
    const key = String(countryName || "").trim().toLowerCase();
    if (!key) return;
    setBranchCountrySelection((prev) => {
      if (prev.some((c) => c.toLowerCase() === key)) {
        return prev.filter((c) => c.toLowerCase() !== key);
      }
      const canonical = countries.find((c) => c.toLowerCase() === key) || countryName;
      return [...prev, canonical].sort((a, b) => a.localeCompare(b));
    });
  };

  const isBranchCountrySelected = (countryName) =>
    branchCountrySelection.some((c) => c.toLowerCase() === String(countryName || "").trim().toLowerCase());

  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-slate-900 tracking-tight", children: "Settings" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mt-0.5", children: "Manage global platform configuration for booking behavior." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Settings, { size: 18, className: "text-slate-600" }),
        /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Calendar & Appointments" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Defines available meeting slots for all counselors and students." }),
      meetingError ? /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: meetingError }) : null,
      meetingSuccess ? /* @__PURE__ */ jsx("div", { className: "text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2", children: meetingSuccess }) : null,
      /* @__PURE__ */ jsx("div", { className: "space-y-1.5 max-w-xs", children: /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Duration" }),
        /* @__PURE__ */ jsxs("select", { className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md", value: meetingForm.meetingDurationMinutes, onChange: (e) => setMeetingForm((prev) => ({ ...prev, meetingDurationMinutes: parseInt(e.target.value, 10) })), children: [
          /* @__PURE__ */ jsx("option", { value: 30, children: "30 minutes" })
        ] })
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: "border border-gray-200 rounded-lg overflow-hidden", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { className: "bg-slate-50 border-b border-gray-200 text-xs uppercase tracking-wide text-slate-500", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2.5 text-left font-semibold", children: "Day" }),
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2.5 text-left font-semibold", children: "Open" }),
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2.5 text-left font-semibold", children: "Start" }),
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2.5 text-left font-semibold", children: "End" }),
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2.5 text-left font-semibold", children: "Status" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-100", children: dayNames.map((dayName, dayIdx) => {
          const day = meetingForm.daySchedules[dayIdx] || defaultDaySchedules[dayIdx];
          return /* @__PURE__ */ jsxs("tr", { className: "bg-white", children: [
            /* @__PURE__ */ jsx("td", { className: "px-3 py-2.5 text-slate-700 font-medium", children: dayName }),
            /* @__PURE__ */ jsx("td", { className: "px-3 py-2.5", children: /* @__PURE__ */ jsx("input", { type: "checkbox", checked: day.isOpen !== false, onChange: (e) => setMeetingForm((prev) => ({
              ...prev,
              daySchedules: {
                ...prev.daySchedules,
                [dayIdx]: {
                  ...prev.daySchedules[dayIdx],
                  isOpen: e.target.checked
                }
              }
            })) }) }),
            /* @__PURE__ */ jsx("td", { className: "px-3 py-2.5", children: /* @__PURE__ */ jsx("input", { type: "time", step: 1800, disabled: day.isOpen === false, className: "w-full min-w-[110px] px-2 py-1.5 text-sm bg-white border border-gray-200 rounded-md disabled:opacity-60", value: `${String(day.startHour).padStart(2, "0")}:00`, onChange: (e) => {
              const [h] = e.target.value.split(":");
              setMeetingForm((prev) => ({
                ...prev,
                daySchedules: {
                  ...prev.daySchedules,
                  [dayIdx]: {
                    ...prev.daySchedules[dayIdx],
                    startHour: Number(h)
                  }
                }
              }));
            } }) }),
            /* @__PURE__ */ jsx("td", { className: "px-3 py-2.5", children: /* @__PURE__ */ jsx("input", { type: "time", step: 1800, disabled: day.isOpen === false, className: "w-full min-w-[110px] px-2 py-1.5 text-sm bg-white border border-gray-200 rounded-md disabled:opacity-60", value: `${String(day.endHour).padStart(2, "0")}:00`, onChange: (e) => {
              const [h] = e.target.value.split(":");
              setMeetingForm((prev) => ({
                ...prev,
                daySchedules: {
                  ...prev.daySchedules,
                  [dayIdx]: {
                    ...prev.daySchedules[dayIdx],
                    endHour: Number(h)
                  }
                }
              }));
            } }) }),
            /* @__PURE__ */ jsx("td", { className: "px-3 py-2.5 text-xs", children: /* @__PURE__ */ jsx("span", { className: day.isOpen === false ? "text-rose-600" : "text-emerald-600", children: day.isOpen === false ? "Closed" : "Open" }) })
          ] }, dayName);
        }) })
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: "text-[11px] text-slate-500", children: "Configure open/close windows per day. Calendar slots are generated from this schedule." }),
      /* @__PURE__ */ jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxs(Button, { type: "button", isLoading: isSavingMeetingSettings, onClick: async () => {
        setMeetingError("");
        setMeetingSuccess("");
        if (meetingForm.meetingDurationMinutes !== 30) {
          setMeetingError("Meeting duration must stay at 30 minutes.");
          return;
        }
        for (let day = 0; day <= 6; day++) {
          const schedule = meetingForm.daySchedules[day];
          if (!schedule) {
            setMeetingError("Please configure all 7 days.");
            return;
          }
          if (schedule.isOpen !== false && schedule.endHour <= schedule.startHour) {
            setMeetingError(`${dayNames[day]}: end time must be after start time.`);
            return;
          }
        }
        setIsSavingMeetingSettings(true);
        const result = await onSaveMeetingSettings?.({
          meetingDurationMinutes: 30,
          daySchedules: meetingForm.daySchedules
        });
        setIsSavingMeetingSettings(false);
        if (!result?.ok) {
          setMeetingError(result?.error || "Failed to save meeting settings.");
          return;
        }
        setMeetingSuccess("Meeting settings saved.");
      }, children: [
        /* @__PURE__ */ jsx(Save, { size: 14, className: "mr-1.5" }),
        "Save Settings"
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Wallet, { size: 18, className: "text-slate-600" }),
        /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Finance permissions" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Control whether counselors can approve or reject student payment evidence on invoices." }),
      financeError ? /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 w-full", children: financeError }) : null,
      financeSuccess ? /* @__PURE__ */ jsx("div", { className: "text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 w-full", children: financeSuccess }) : null,
      /* @__PURE__ */ jsx("div", { className: "w-full rounded-lg border border-gray-200 bg-slate-50/60 p-4", children: /* @__PURE__ */ jsxs("label", { className: "flex items-start gap-3 w-full cursor-pointer", children: [
        /* @__PURE__ */ jsx("input", {
          type: "checkbox",
          className: "mt-1 shrink-0",
          checked: financeForm.counselorCanAcceptPayments,
          onChange: (e) => setFinanceForm((prev) => ({ ...prev, counselorCanAcceptPayments: e.target.checked }))
        }),
        /* @__PURE__ */ jsxs("span", { className: "text-sm text-slate-700 flex-1", children: [
          /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-900 block", children: "Allow counselors to accept payments" }),
          "When enabled, counselors (including visa officers) can approve or reject invoice payment evidence. Admin, Manager, and Accountant always retain this permission."
        ] })
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: "flex justify-end w-full", children: /* @__PURE__ */ jsxs(Button, {
        type: "button",
        isLoading: isSavingFinanceSettings,
        onClick: async () => {
          setFinanceError("");
          setFinanceSuccess("");
          setIsSavingFinanceSettings(true);
          const result = await onSaveSystemData?.({
            counselorCanAcceptPayments: financeForm.counselorCanAcceptPayments
          });
          setIsSavingFinanceSettings(false);
          if (!result?.ok) {
            setFinanceError(result?.error || "Failed to save finance settings.");
            return;
          }
          setFinanceSuccess("Finance permissions saved.");
        },
        children: [
          /* @__PURE__ */ jsx(Save, { size: 14, className: "mr-1.5" }),
          "Save finance settings"
        ]
      }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(MessageSquare, { size: 18, className: "text-slate-600" }),
        /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Admin messaging" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Allow Admin, Manager, and Team Lead accounts to send WhatsApp messages to students from Omni-Channel and connect a dedicated WhatsApp number under Integrations." }),
      chatError ? /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 w-full", children: chatError }) : null,
      chatSuccess ? /* @__PURE__ */ jsx("div", { className: "text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 w-full", children: chatSuccess }) : null,
      /* @__PURE__ */ jsx("div", { className: "w-full rounded-lg border border-gray-200 bg-slate-50/60 p-4", children: /* @__PURE__ */ jsxs("label", { className: "flex items-start gap-3 w-full cursor-pointer", children: [
        /* @__PURE__ */ jsx("input", {
          type: "checkbox",
          className: "mt-1 shrink-0",
          checked: financeForm.adminChatEnabled,
          onChange: (e) => setFinanceForm((prev) => ({ ...prev, adminChatEnabled: e.target.checked }))
        }),
        /* @__PURE__ */ jsxs("span", { className: "text-sm text-slate-700 flex-1", children: [
          /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-900 block", children: "Enable staff chat & WhatsApp" }),
          "When enabled, Admin, Manager, and Team Lead can reply in Omni-Channel (not read-only), the Integrations page appears in their sidebar, and outbound messages use each user's own WhatsApp connection. Student threads stay in one conversation view alongside counselor messages."
        ] })
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: "flex justify-end w-full", children: /* @__PURE__ */ jsxs(Button, {
        type: "button",
        isLoading: isSavingChatSettings,
        onClick: async () => {
          setChatError("");
          setChatSuccess("");
          setIsSavingChatSettings(true);
          const result = await onSaveSystemData?.({
            adminChatEnabled: financeForm.adminChatEnabled
          });
          setIsSavingChatSettings(false);
          if (!result?.ok) {
            setChatError(result?.error || "Failed to save messaging settings.");
            return;
          }
          setChatSuccess("Admin messaging settings saved.");
        },
        children: [
          /* @__PURE__ */ jsx(Save, { size: 14, className: "mr-1.5" }),
          "Save messaging settings"
        ]
      }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Globe, { size: 18, className: "text-slate-600" }),
        /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Destination countries by branch" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Configure destination countries separately for each branch. When branch limiting is enabled, students and inquiry forms show the list for their selected office. When disabled, everyone sees the global default list." }),
      branchCountriesError ? /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: branchCountriesError }) : null,
      branchCountriesSuccess ? /* @__PURE__ */ jsx("div", { className: "text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2", children: branchCountriesSuccess }) : null,
      /* @__PURE__ */ jsx("div", { className: "w-full rounded-lg border border-gray-200 bg-slate-50/60 p-4", children: /* @__PURE__ */ jsxs("label", { className: "flex items-start gap-3 w-full cursor-pointer", children: [
        /* @__PURE__ */ jsx("input", {
          type: "checkbox",
          className: "mt-1 shrink-0",
          checked: financeForm.branchCountriesEnabled,
          onChange: (e) => setFinanceForm((prev) => ({ ...prev, branchCountriesEnabled: e.target.checked }))
        }),
        /* @__PURE__ */ jsxs("span", { className: "text-sm text-slate-700 flex-1", children: [
          /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-900 block", children: "Limit countries by branch" }),
          "When enabled, each branch can offer its own destination countries. When disabled, all branches and forms use the global default list only."
        ] })
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: "flex justify-end w-full", children: /* @__PURE__ */ jsxs(Button, {
        type: "button",
        isLoading: isSavingBranchCountriesSettings,
        onClick: async () => {
          setBranchCountriesError("");
          setBranchCountriesSuccess("");
          setIsSavingBranchCountriesSettings(true);
          const result = await onSaveSystemData?.({
            branchCountriesEnabled: financeForm.branchCountriesEnabled
          });
          setIsSavingBranchCountriesSettings(false);
          if (!result?.ok) {
            setBranchCountriesError(result?.error || "Failed to save branch country settings.");
            return;
          }
          setBranchCountriesSuccess("Branch country limiting settings saved.");
        },
        children: [
          /* @__PURE__ */ jsx(Save, { size: 14, className: "mr-1.5" }),
          "Save branch limiting"
        ]
      }) }),
      financeForm.branchCountriesEnabled && countryError ? /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: countryError }) : null,
      financeForm.branchCountriesEnabled && countrySuccess ? /* @__PURE__ */ jsx("div", { className: "text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2", children: countrySuccess }) : null,
      !financeForm.branchCountriesEnabled ? /* @__PURE__ */ jsx("div", { className: "text-xs text-slate-600 bg-slate-50 border border-gray-200 rounded-lg px-3 py-2 w-full", children: "Branch limiting is off. All forms use the global default countries section below." }) : !branchesReady ? /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: "Loading branches…" }) : branches.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: "No branches found. Add branches in Branch Analytics first." }) : /* @__PURE__ */ jsxs("div", { className: "space-y-4 w-full", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Branch" }),
          /* @__PURE__ */ jsx("select", {
            className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md",
            value: selectedBranchId,
            onChange: (e) => setSelectedBranchId(e.target.value),
            children: branches.map((branch) => /* @__PURE__ */ jsx("option", { value: branch.id, children: branch.location || branch.id }, branch.id))
          })
        ] }),
        !countriesReady ? /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: "Loading countries…" }) : countries.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2", children: "Add countries in the Global default countries section below before assigning them to branches." }) : /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Tick the destinations this branch offers. Only countries from the global list can be selected." }),
          /* @__PURE__ */ jsx("div", { className: "border border-gray-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto p-2", children: /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2", children: countries.map((country) => /* @__PURE__ */ jsx("label", {
            className: "flex items-center gap-3 px-3 py-2.5 bg-slate-50/60 border border-gray-200 rounded-md hover:bg-slate-50 cursor-pointer",
            children: [
              /* @__PURE__ */ jsx("input", {
                type: "checkbox",
                className: "shrink-0",
                checked: isBranchCountrySelected(country),
                onChange: () => toggleBranchCountry(country)
              }),
              /* @__PURE__ */ jsx("span", { className: "text-sm text-slate-800 font-medium", children: country })
            ]
          }, country)) }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
            /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500", children: `${branchCountrySelection.length} of ${countries.length} countr${countries.length === 1 ? "y" : "ies"} selected.` }),
            /* @__PURE__ */ jsxs(Button, {
              type: "button",
              isLoading: isSavingBranchCountrySelection,
              onClick: async () => {
                setCountryError("");
                setCountrySuccess("");
                if (!selectedBranchId) {
                  setCountryError("Select a branch first.");
                  return;
                }
                setIsSavingBranchCountrySelection(true);
                const result = await updateBranchCountries(selectedBranchId, branchCountrySelection);
                setIsSavingBranchCountrySelection(false);
                if (!result.ok) {
                  setCountryError(result.error || "Failed to save branch countries.");
                  return;
                }
                setBranches((prev) => prev.map((branch) => branch.id === selectedBranchId ? { ...branch, countries: result.data.countries || [] } : branch));
                setCountrySuccess(`Countries saved for ${result.data.location || "branch"}.`);
              },
              children: [
                /* @__PURE__ */ jsx(Save, { size: 14, className: "mr-1.5" }),
                "Save countries"
              ]
            })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Globe, { size: 18, className: "text-slate-600" }),
        /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Global default countries" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Platform-wide destination list used when branch limiting is off, as a fallback when a branch has no custom list, and for Country Coordinator account setup." }),
      globalCountryError ? /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 max-w-xl", children: globalCountryError }) : null,
      globalCountrySuccess ? /* @__PURE__ */ jsx("div", { className: "text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 max-w-xl", children: globalCountrySuccess }) : null,
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row gap-2 max-w-xl", children: [
        /* @__PURE__ */ jsx("input", {
          type: "text",
          className: "flex-1 px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
          placeholder: "e.g. Ireland",
          value: newGlobalCountryName,
          onChange: (e) => setNewGlobalCountryName(e.target.value)
        }),
        /* @__PURE__ */ jsx(Button, {
          type: "button",
          isLoading: isSavingCountry,
          onClick: async () => {
            setGlobalCountryError("");
            setGlobalCountrySuccess("");
            const name = newGlobalCountryName.trim();
            if (!name) {
              setGlobalCountryError("Enter a country name.");
              return;
            }
            setIsSavingCountry(true);
            const result = await createCountry(name);
            setIsSavingCountry(false);
            if (!result.ok) {
              setGlobalCountryError(result.error || "Failed to add global country.");
              return;
            }
            setCountries(result.data);
            setNewGlobalCountryName("");
            setGlobalCountrySuccess("Global default country added.");
          },
          children: "Add country"
        })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "border border-gray-200 rounded-lg overflow-hidden max-w-xl", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { className: "bg-slate-50 border-b border-gray-200 text-xs uppercase tracking-wide text-slate-500", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2.5 text-left font-semibold", children: "Country" }),
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2.5 text-right font-semibold", children: " " })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-100", children: !countriesReady ? /* @__PURE__ */ jsx(TableSkeletonRows, { rows: 3, cols: 2 }) : countries.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 2, className: "px-3 py-4 text-slate-500", children: "No global countries loaded." }) }) : countries.map((c) => /* @__PURE__ */ jsxs("tr", { className: "bg-white", children: [
          /* @__PURE__ */ jsx("td", { className: "px-3 py-2.5 text-slate-800 font-medium", children: c }),
          /* @__PURE__ */ jsx("td", { className: "px-3 py-2.5 text-right", children: /* @__PURE__ */ jsx(Button, {
            type: "button",
            variant: "ghost",
            size: "sm",
            className: "text-rose-600 hover:text-rose-700 hover:bg-rose-50",
            isLoading: removingCountryName === `global:${c}`,
            onClick: async () => {
              setGlobalCountryError("");
              setGlobalCountrySuccess("");
              setRemovingCountryName(`global:${c}`);
              const result = await deleteCountry(c);
              setRemovingCountryName("");
              if (!result.ok) {
                setGlobalCountryError(result.error || "Failed to remove global country.");
                return;
              }
              setCountries(result.data);
              setGlobalCountrySuccess("Global default country removed.");
            },
            children: /* @__PURE__ */ jsx(Trash2, { size: 14 })
          }) })
        ] }, `global-${c}`)) })
      ] }) }),
      /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500 max-w-xl", children: countriesReady ? `${countries.length} global countr${countries.length === 1 ? "y" : "ies"} in the list.` : "Loading countries…" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Landmark, { size: 18, className: "text-slate-600" }),
        /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Invoice payment accounts" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Bank details staff can attach when issuing invoices. Add multiple accounts (e.g. LKR, USD) and remove any that are no longer used." }),
      paymentAccountError ? /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: paymentAccountError }) : null,
      paymentAccountSuccess ? /* @__PURE__ */ jsx("div", { className: "text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2", children: paymentAccountSuccess }) : null,
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Label" }),
          /* @__PURE__ */ jsx("input", { type: "text", className: "mt-1 w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md", placeholder: "e.g. Main LKR account", value: newPaymentAccount.label, onChange: (e) => setNewPaymentAccount((p) => ({ ...p, label: e.target.value })) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Bank name" }),
          /* @__PURE__ */ jsx("input", { type: "text", className: "mt-1 w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md", value: newPaymentAccount.bankName, onChange: (e) => setNewPaymentAccount((p) => ({ ...p, bankName: e.target.value })) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Account name" }),
          /* @__PURE__ */ jsx("input", { type: "text", className: "mt-1 w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md", value: newPaymentAccount.accountName, onChange: (e) => setNewPaymentAccount((p) => ({ ...p, accountName: e.target.value })) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Account number" }),
          /* @__PURE__ */ jsx("input", { type: "text", className: "mt-1 w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md", value: newPaymentAccount.accountNumber, onChange: (e) => setNewPaymentAccount((p) => ({ ...p, accountNumber: e.target.value })) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Branch (optional)" }),
          /* @__PURE__ */ jsx("input", { type: "text", className: "mt-1 w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md", value: newPaymentAccount.branch, onChange: (e) => setNewPaymentAccount((p) => ({ ...p, branch: e.target.value })) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Currency" }),
          /* @__PURE__ */ jsxs("select", { className: "mt-1 w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md", value: newPaymentAccount.currency, onChange: (e) => setNewPaymentAccount((p) => ({ ...p, currency: e.target.value })), children: [
            /* @__PURE__ */ jsx("option", { value: "LKR", children: "LKR" }),
            /* @__PURE__ */ jsx("option", { value: "USD", children: "USD" }),
            /* @__PURE__ */ jsx("option", { value: "GBP", children: "GBP" }),
            /* @__PURE__ */ jsx("option", { value: "AUD", children: "AUD" }),
            /* @__PURE__ */ jsx("option", { value: "CAD", children: "CAD" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "md:col-span-2", children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Notes (optional)" }),
          /* @__PURE__ */ jsx("input", { type: "text", className: "mt-1 w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md", placeholder: "SWIFT, reference text, etc.", value: newPaymentAccount.notes, onChange: (e) => setNewPaymentAccount((p) => ({ ...p, notes: e.target.value })) })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex justify-end max-w-3xl", children: /* @__PURE__ */ jsx(Button, {
        type: "button",
        isLoading: isSavingPaymentAccount,
        onClick: async () => {
          setPaymentAccountError("");
          setPaymentAccountSuccess("");
          const label = newPaymentAccount.label.trim();
          const bankName = newPaymentAccount.bankName.trim();
          const accountName = newPaymentAccount.accountName.trim();
          const accountNumber = newPaymentAccount.accountNumber.trim();
          if (!label || !bankName || !accountName || !accountNumber) {
            setPaymentAccountError("Label, bank name, account name, and account number are required.");
            return;
          }
          setIsSavingPaymentAccount(true);
          const result = await createPaymentAccount({
            label,
            bankName,
            accountName,
            accountNumber,
            branch: newPaymentAccount.branch.trim(),
            currency: newPaymentAccount.currency,
            notes: newPaymentAccount.notes.trim()
          });
          setIsSavingPaymentAccount(false);
          if (!result.ok) {
            setPaymentAccountError(result.error || "Failed to add payment account.");
            return;
          }
          setLocalPaymentAccounts(result.data);
          onPaymentAccountsChange?.(result.data);
          setNewPaymentAccount({ label: "", bankName: "", accountName: "", accountNumber: "", branch: "", currency: "LKR", notes: "" });
          setPaymentAccountSuccess("Payment account added.");
        },
        children: "Add payment account"
      }) }),
      /* @__PURE__ */ jsx("div", { className: "border border-gray-200 rounded-lg overflow-hidden max-w-3xl", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { className: "bg-slate-50 border-b border-gray-200 text-xs uppercase tracking-wide text-slate-500", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2.5 text-left font-semibold", children: "Label" }),
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2.5 text-left font-semibold", children: "Bank / Account" }),
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2.5 text-right font-semibold", children: " " })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-100", children: !paymentAccountsReady ? /* @__PURE__ */ jsx(TableSkeletonRows, { rows: 3, cols: 3 }) : localPaymentAccounts.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 3, className: "px-3 py-4 text-slate-500", children: "No payment accounts yet. Add one above for invoice creators to select." }) }) : localPaymentAccounts.map((acct) => /* @__PURE__ */ jsxs("tr", { className: "bg-white", children: [
          /* @__PURE__ */ jsxs("td", { className: "px-3 py-2.5 text-slate-800 font-medium", children: [
            acct.label,
            /* @__PURE__ */ jsxs("div", { className: "text-xs text-slate-500 font-normal", children: [acct.currency || "LKR"] })
          ] }),
          /* @__PURE__ */ jsxs("td", { className: "px-3 py-2.5 text-slate-600 text-xs", children: [
            acct.bankName,
            " · ",
            acct.accountName,
            /* @__PURE__ */ jsx("div", { className: "font-mono text-slate-800 mt-0.5", children: acct.accountNumber })
          ] }),
          /* @__PURE__ */ jsx("td", { className: "px-3 py-2.5 text-right", children: /* @__PURE__ */ jsx(Button, {
            type: "button",
            variant: "ghost",
            size: "sm",
            className: "text-rose-600 hover:text-rose-700 hover:bg-rose-50",
            isLoading: removingPaymentAccountId === acct.id,
            onClick: async () => {
              setPaymentAccountError("");
              setPaymentAccountSuccess("");
              setRemovingPaymentAccountId(acct.id);
              const result = await deletePaymentAccount(acct.id);
              setRemovingPaymentAccountId("");
              if (!result.ok) {
                setPaymentAccountError(result.error || "Failed to remove account.");
                return;
              }
              setLocalPaymentAccounts(result.data);
              onPaymentAccountsChange?.(result.data);
              setPaymentAccountSuccess("Payment account removed.");
            },
            children: /* @__PURE__ */ jsx(Trash2, { size: 14 })
          }) })
        ] }, acct.id)) })
      ] }) })
    ] })
  ] });
};

export { AdminSettings };
