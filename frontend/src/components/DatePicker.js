import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

const DROPDOWN_WIDTH = 280;
const DROPDOWN_HEIGHT = 320;

export function getLocalDateIso(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isDateBeforeMin(year, month, day, minDate) {
  if (!minDate) return false;
  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return dateStr < minDate;
}

function isMonthBeforeMin(year, month, minDate) {
  if (!minDate) return false;
  const min = new Date(`${minDate}T00:00:00`);
  const monthStart = new Date(year, month, 1);
  const minMonthStart = new Date(min.getFullYear(), min.getMonth(), 1);
  return monthStart < minMonthStart;
}

const DatePicker = ({ label, value, onChange, required, minDate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(value ? new Date(value) : /* @__PURE__ */ new Date());
  const [dropdownStyle, setDropdownStyle] = useState({ top: 0, left: 0 });
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const updateDropdownPosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < DROPDOWN_HEIGHT && rect.top > DROPDOWN_HEIGHT;
    const top = openAbove ? rect.top - DROPDOWN_HEIGHT - 4 : rect.bottom + 4;
    let left = rect.left;
    if (left + DROPDOWN_WIDTH > window.innerWidth - 8) {
      left = window.innerWidth - DROPDOWN_WIDTH - 8;
    }
    if (left < 8) left = 8;
    setDropdownStyle({ top, left });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();
    const handleReposition = () => updateDropdownPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const inContainer = containerRef.current?.contains(event.target);
      const inDropdown = dropdownRef.current?.contains(event.target);
      if (!inContainer && !inDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDateClick = (day) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    if (isDateBeforeMin(year, month, day, minDate)) return;
    const formattedDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(formattedDate);
    setIsOpen(false);
  };

  const changeMonth = (offset) => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
    if (offset < 0 && isMonthBeforeMin(newDate.getFullYear(), newDate.getMonth(), minDate)) return;
    setCurrentDate(newDate);
  };

  const canGoToPreviousMonth = !isMonthBeforeMin(
    currentDate.getFullYear(),
    currentDate.getMonth() - 1,
    minDate
  );

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
      const isDisabled = isDateBeforeMin(year, month, d, minDate);
      slots.push(
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            disabled: isDisabled,
            onClick: (e) => {
              e.preventDefault();
              if (!isDisabled) handleDateClick(d);
            },
            className: `w-8 h-8 text-xs rounded-full flex items-center justify-center transition-all
                        ${isDisabled ? "text-slate-300 cursor-not-allowed" : isSelected ? "bg-[#0F172A] text-white font-bold shadow-sm" : "hover:bg-slate-100 text-slate-700"}
                        ${!isDisabled && !isSelected && isToday ? "text-indigo-600 font-bold bg-indigo-50 border border-indigo-100" : ""}
                    `,
            children: d
          },
          d
        )
      );
    }
    return slots;
  };

  const calendarDropdown = isOpen ? createPortal(
    /* @__PURE__ */ jsxs(
      "div",
      {
        ref: dropdownRef,
        style: { position: "fixed", top: dropdownStyle.top, left: dropdownStyle.left, width: DROPDOWN_WIDTH, zIndex: 9999 },
        className: "p-4 bg-white border border-gray-200 rounded-xl shadow-xl animate-in fade-in zoom-in-95 duration-100",
        children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-4", children: [
            /* @__PURE__ */ jsx("button", { type: "button", onClick: () => changeMonth(-1), disabled: !canGoToPreviousMonth, className: `p-1 rounded-md transition-colors ${canGoToPreviousMonth ? "hover:bg-slate-50 text-slate-500" : "text-slate-300 cursor-not-allowed"}`, children: /* @__PURE__ */ jsx(ChevronLeft, { size: 16 }) }),
            /* @__PURE__ */ jsxs("span", { className: "text-sm font-semibold text-slate-900", children: [
              months[currentDate.getMonth()],
              " ",
              currentDate.getFullYear()
            ] }),
            /* @__PURE__ */ jsx("button", { type: "button", onClick: () => changeMonth(1), className: "p-1 hover:bg-slate-50 rounded-md text-slate-500 transition-colors", children: /* @__PURE__ */ jsx(ChevronRight, { size: 16 }) })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "grid grid-cols-7 gap-1 mb-2 text-center", children: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => /* @__PURE__ */ jsx("div", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wider", children: d }, d)) }),
          /* @__PURE__ */ jsx("div", { className: "grid grid-cols-7 gap-1 place-items-center", children: renderCalendar() })
        ]
      }
    ),
    document.body
  ) : null;

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
          ref: triggerRef,
          onClick: () => {
            setIsOpen((prev) => {
              const next = !prev;
              if (next) {
                if (minDate) {
                  const min = new Date(`${minDate}T00:00:00`);
                  setCurrentDate((prevDate) => {
                    const view = new Date(prevDate.getFullYear(), prevDate.getMonth(), 1);
                    const minView = new Date(min.getFullYear(), min.getMonth(), 1);
                    return view < minView ? min : prevDate;
                  });
                }
                requestAnimationFrame(updateDropdownPosition);
              }
              return next;
            });
          },
          className: "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all cursor-pointer flex items-center justify-between",
          children: [
            /* @__PURE__ */ jsx("span", { className: value ? "text-slate-900" : "text-slate-400", children: value ? new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Select date..." }),
            /* @__PURE__ */ jsx(CalendarIcon, { size: 14, className: "text-slate-400" })
          ]
        }
      ),
      calendarDropdown
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
        onFocus: () => {
          setIsOpen(true);
          requestAnimationFrame(updateDropdownPosition);
        }
      }
    )
  ] });
};
export {
  DatePicker
};
