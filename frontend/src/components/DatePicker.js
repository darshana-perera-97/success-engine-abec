import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
const DatePicker = ({ label, value, onChange, required }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(value ? new Date(value) : /* @__PURE__ */ new Date());
  const containerRef = useRef(null);
  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const handleDateClick = (day) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const formattedDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(formattedDate);
    setIsOpen(false);
  };
  const changeMonth = (offset) => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
    setCurrentDate(newDate);
  };
  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const slots = [];
    for (let i = 0; i < startDay; i++) {
      slots.push(/* @__PURE__ */ jsx("div", { className: "w-8 h-8" }, `empty-${i}`));
    }
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isSelected = value === dateStr;
      const isToday = (/* @__PURE__ */ new Date()).toDateString() === new Date(year, month, d).toDateString();
      slots.push(
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: (e) => {
              e.preventDefault();
              handleDateClick(d);
            },
            className: `w-8 h-8 text-xs rounded-full flex items-center justify-center transition-all
                        ${isSelected ? "bg-[#0F172A] text-white font-bold shadow-sm" : "hover:bg-slate-100 text-slate-700"}
                        ${!isSelected && isToday ? "text-indigo-600 font-bold bg-indigo-50 border border-indigo-100" : ""}
                    `,
            children: d
          },
          d
        )
      );
    }
    return slots;
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", ref: containerRef, children: [
    /* @__PURE__ */ jsxs("label", { className: "text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center", children: [
      /* @__PURE__ */ jsx(CalendarIcon, { size: 12, className: "mr-1.5" }),
      " ",
      label
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "relative", children: [
      /* @__PURE__ */ jsxs(
        "div",
        {
          onClick: () => setIsOpen(!isOpen),
          className: "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all cursor-pointer flex items-center justify-between",
          children: [
            /* @__PURE__ */ jsx("span", { className: value ? "text-slate-900" : "text-slate-400", children: value ? new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Select date..." }),
            /* @__PURE__ */ jsx(CalendarIcon, { size: 14, className: "text-slate-400" })
          ]
        }
      ),
      isOpen && /* @__PURE__ */ jsxs("div", { className: "absolute z-50 left-0 mt-1 p-4 bg-white border border-gray-200 rounded-xl shadow-xl w-[280px] animate-in fade-in zoom-in-95 duration-100", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-4", children: [
          /* @__PURE__ */ jsx("button", { type: "button", onClick: () => changeMonth(-1), className: "p-1 hover:bg-slate-50 rounded-md text-slate-500 transition-colors", children: /* @__PURE__ */ jsx(ChevronLeft, { size: 16 }) }),
          /* @__PURE__ */ jsxs("span", { className: "text-sm font-semibold text-slate-900", children: [
            months[currentDate.getMonth()],
            " ",
            currentDate.getFullYear()
          ] }),
          /* @__PURE__ */ jsx("button", { type: "button", onClick: () => changeMonth(1), className: "p-1 hover:bg-slate-50 rounded-md text-slate-500 transition-colors", children: /* @__PURE__ */ jsx(ChevronRight, { size: 16 }) })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-7 gap-1 mb-2 text-center", children: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => /* @__PURE__ */ jsx("div", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wider", children: d }, d)) }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-7 gap-1 place-items-center", children: renderCalendar() })
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      "input",
      {
        type: "text",
        className: "sr-only",
        value,
        required,
        onChange: () => {
        },
        onFocus: () => setIsOpen(true)
      }
    )
  ] });
};
export {
  DatePicker
};
