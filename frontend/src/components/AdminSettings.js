import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Globe, Save, Settings } from "lucide-react";
import { Button } from "./Button";
import { createCountry, getCountries } from "../authApi";
import { TableSkeletonRows } from "./LoadingPlaceholder";

const AdminSettings = ({ meetingSettings, onSaveMeetingSettings }) => {
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
  const [newCountryName, setNewCountryName] = useState("");
  const [countryError, setCountryError] = useState("");
  const [countrySuccess, setCountrySuccess] = useState("");
  const [isSavingCountry, setIsSavingCountry] = useState(false);

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

  useEffect(() => {
    loadCountries();
  }, []);

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
        /* @__PURE__ */ jsx(Globe, { size: 18, className: "text-slate-600" }),
        /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Destination countries" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Used when creating Country Coordinator accounts. Student records should use the same spelling (e.g. Canada, UK)." }),
      countryError ? /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: countryError }) : null,
      countrySuccess ? /* @__PURE__ */ jsx("div", { className: "text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2", children: countrySuccess }) : null,
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row gap-2 max-w-xl", children: [
        /* @__PURE__ */ jsx("input", {
          type: "text",
          className: "flex-1 px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
          placeholder: "e.g. Ireland",
          value: newCountryName,
          onChange: (e) => setNewCountryName(e.target.value)
        }),
        /* @__PURE__ */ jsx(Button, {
          type: "button",
          isLoading: isSavingCountry,
          onClick: async () => {
            setCountryError("");
            setCountrySuccess("");
            const name = newCountryName.trim();
            if (!name) {
              setCountryError("Enter a country name.");
              return;
            }
            setIsSavingCountry(true);
            const result = await createCountry(name);
            setIsSavingCountry(false);
            if (!result.ok) {
              setCountryError(result.error || "Failed to add country.");
              return;
            }
            setCountries(result.data);
            setNewCountryName("");
            setCountrySuccess("Country added.");
          },
          children: "Add country"
        })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "border border-gray-200 rounded-lg overflow-hidden max-w-xl", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { className: "bg-slate-50 border-b border-gray-200 text-xs uppercase tracking-wide text-slate-500", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2.5 text-left font-semibold", children: "Country" }),
          /* @__PURE__ */ jsx("th", { className: "px-3 py-2.5 text-right font-semibold", children: "Count" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-100", children: !countriesReady ? /* @__PURE__ */ jsx(TableSkeletonRows, { rows: 5, cols: 2 }) : countries.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 2, className: "px-3 py-4 text-slate-500", children: "No countries loaded." }) }) : countries.map((c) => /* @__PURE__ */ jsxs("tr", { className: "bg-white", children: [
          /* @__PURE__ */ jsx("td", { className: "px-3 py-2.5 text-slate-800 font-medium", children: c }),
          /* @__PURE__ */ jsx("td", { className: "px-3 py-2.5 text-right text-slate-500 tabular-nums", children: "—" })
        ] }, c)) })
      ] }) }),
      /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500", children: countriesReady ? `${countries.length} countr${countries.length === 1 ? "y" : "ies"} in the list.` : "Loading countries…" })
    ] })
  ] });
};

export { AdminSettings };
