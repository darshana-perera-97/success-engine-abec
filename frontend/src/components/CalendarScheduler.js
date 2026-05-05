import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Button } from "./Button";
import { ChevronLeft, ChevronRight, Clock, User, CheckCircle, AlertTriangle, Video } from "lucide-react";
const CalendarScheduler = ({ appointments, bookingBlocks = [], onBookAppointment, onUpdateAppointment, currentRole, currentUser, employees = [], meetingSettings, onAddBusyBooking, onDeleteBusyBooking, studentsLookup = null }) => {
  const [currentDate, setCurrentDate] = useState(/* @__PURE__ */ new Date());
  const [selectedDate, setSelectedDate] = useState(/* @__PURE__ */ new Date());
  const [selectedCounselorId, setSelectedCounselorId] = useState("");
  const [bookingTime, setBookingTime] = useState(null);
  const [bookingType, setBookingType] = useState("Counseling");
  const [busyDate, setBusyDate] = useState("");
  const [busyStartTime, setBusyStartTime] = useState("09:00");
  const [busyEndTime, setBusyEndTime] = useState("10:00");
  const [busyReason, setBusyReason] = useState("Leave");
  const [busyReasonOther, setBusyReasonOther] = useState("");
  const [busyError, setBusyError] = useState("");
  const [isSavingBusy, setIsSavingBusy] = useState(false);
  const [outcomeModalOpen, setOutcomeModalOpen] = useState(false);
  const [selectedAptId, setSelectedAptId] = useState(null);
  const [outcomeStatus, setOutcomeStatus] = useState("Completed");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  useEffect(() => {
    if (currentRole === "Student") {
      const s = currentUser;
      if (s.counselor && selectedCounselorId !== s.counselor) {
        setSelectedCounselorId(s.counselor);
      }
    } else if (currentRole === "Counselor") {
      if (currentUser.id && selectedCounselorId !== currentUser.id) {
        setSelectedCounselorId(currentUser.id);
      }
    } else if (currentRole === "Country Coordinator") {
      setSelectedCounselorId("");
    }
  }, [currentRole, currentUser, employees]);
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };
  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };
  const changeMonth = (offset) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
    setSelectedDate(null);
  };
  const formatDate = (date) => {
    return date.toLocaleDateString("en-CA");
  };
  const getCounselor = (id) => employees.find((e) => e.id === id);
  const studentPool = studentsLookup || [];
  const getStudent = (id) => studentPool.find((s) => s.id === id);
  const toSriLankaTimestamp = (dateStr, timeStr) => {
    return new Date(`${dateStr}T${timeStr}:00+05:30`).getTime();
  };
  const toMinutes = (value) => {
    const [h, m] = String(value || "00:00").split(":").map((v) => Number(v));
    return h * 60 + m;
  };
  const isRangeOverlap = (startA, endA, startB, endB) => startA < endB && startB < endA;
  const generateTimeSlots = (date, counselorId) => {
    const dayOfWeek = date.getDay();
    const activeSettings = meetingSettings || {
      meetingDurationMinutes: 30,
      daySchedules: {
        0: { isOpen: true, startHour: 8, endHour: 17 },
        1: { isOpen: true, startHour: 8, endHour: 17 },
        2: { isOpen: true, startHour: 8, endHour: 17 },
        3: { isOpen: true, startHour: 8, endHour: 17 },
        4: { isOpen: true, startHour: 8, endHour: 17 },
        5: { isOpen: true, startHour: 8, endHour: 17 },
        6: { isOpen: true, startHour: 8, endHour: 17 }
      }
    };
    const daySchedule = activeSettings.daySchedules?.[dayOfWeek];
    if (!daySchedule || daySchedule.isOpen === false) return [];
    const slots = [];
    const { startHour, endHour } = daySchedule;
    const dateStr = formatDate(date);
    const dayAppointments = appointments.filter((a) => a.counselorId === counselorId && a.date === dateStr && a.status !== "Cancelled");
    const dayBusyBlocks = bookingBlocks.filter((block) => block.counselorId === counselorId && block.date === dateStr);
    const slotDuration = Number(meetingSettings?.meetingDurationMinutes || 30);
    const minStudentBookingTime = Date.now() + 30 * 60 * 1e3;
    const isBooked = (slotTime) => {
      const slotStart = toMinutes(slotTime);
      const slotEnd = slotStart + slotDuration;
      if (currentRole === "Student" && toSriLankaTimestamp(dateStr, slotTime) < minStudentBookingTime) {
        return true;
      }
      const blockedByBusy = dayBusyBlocks.some((block) => {
        return isRangeOverlap(slotStart, slotEnd, toMinutes(block.startTime), toMinutes(block.endTime));
      });
      if (blockedByBusy) return true;
      return dayAppointments.some((a) => {
        return a.time === slotTime;
      });
    };
    for (let h = startHour; h < endHour; h++) {
      const timeString00 = `${h.toString().padStart(2, "0")}:00`;
      if (!isBooked(timeString00)) {
        slots.push(timeString00);
      }
      const timeString30 = `${h.toString().padStart(2, "0")}:30`;
      if (!isBooked(timeString30)) {
        slots.push(timeString30);
      }
    }
    return slots;
  };
  const handleBook = async () => {
    if (!selectedDate || !bookingTime || !selectedCounselorId) return;
    if (currentRole === "Student") {
      const upcomingCount = appointments.filter((a) => a.studentId === currentUser.id && a.status === "Scheduled" && /* @__PURE__ */ new Date(`${a.date}T${a.time}`) > /* @__PURE__ */ new Date()).length;
      if (upcomingCount >= 3) {
        alert("You can only have up to 3 upcoming meetings.");
        return;
      }
    }
    const selectedDateStr = formatDate(selectedDate);
    const minStudentBookingTime = Date.now() + 30 * 60 * 1e3;
    if (currentRole === "Student" && toSriLankaTimestamp(selectedDateStr, bookingTime) < minStudentBookingTime) {
      alert("Bookings must be at least 30 minutes in the future (Sri Lanka time).");
      return;
    }
    const newApt = {
      id: `APT-${Date.now()}`,
      counselorId: selectedCounselorId,
      studentId: currentUser.id,
      title: `${bookingType} Session`,
      date: selectedDateStr,
      time: bookingTime,
      duration: Number(meetingSettings?.meetingDurationMinutes || 30),
      type: bookingType,
      status: "Scheduled",
      meetingLink: "https://meet.google.com/abc-defg-hij"
    };
    const result = await onBookAppointment(newApt);
    if (!result?.ok) {
      alert(result?.error || "Failed to book session.");
      return;
    }
    setBookingTime(null);
    alert(`Session booked for ${newApt.date} at ${newApt.time}! Notification sent.`);
  };
  const handleAddBusyTime = async () => {
    if (currentRole !== "Counselor") return;
    setBusyError("");
    if (!busyDate) {
      setBusyError("Select a date for the one-time busy block.");
      return;
    }
    if (!busyStartTime || !busyEndTime) {
      setBusyError("Select both start and end time.");
      return;
    }
    if (toMinutes(busyEndTime) <= toMinutes(busyStartTime)) {
      setBusyError("End time must be after start time.");
      return;
    }
    setIsSavingBusy(true);
    const result = await onAddBusyBooking?.({
      counselorId: currentUser.id,
      date: busyDate,
      startTime: busyStartTime,
      endTime: busyEndTime,
      reason: busyReason === "Other" ? busyReasonOther || "Other" : busyReason
    });
    setIsSavingBusy(false);
    if (!result?.ok) {
      setBusyError(result?.error || "Failed to save busy time.");
      return;
    }
    setBusyReason("Leave");
    setBusyReasonOther("");
  };
  const dayBusyBlocks = selectedDate ? bookingBlocks.filter((block) => {
    const targetCounselor = currentRole === "Counselor" ? currentUser.id : selectedCounselorId;
    return block.counselorId === targetCounselor && block.date === formatDate(selectedDate);
  }).sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)) : [];
  const roleVisibleBusyBlocks = bookingBlocks.filter((block) => {
    if (currentRole === "Admin" || currentRole === "Manager" || currentRole === "Team Lead" || currentRole === "Country Coordinator") return true;
    if (currentRole === "Counselor") return block.counselorId === currentUser.id;
    return block.counselorId === selectedCounselorId;
  }).sort((a, b) => {
    const aDateTime = new Date(`${a.date}T${a.startTime}`).getTime();
    const bDateTime = new Date(`${b.date}T${b.startTime}`).getTime();
    return aDateTime - bDateTime;
  });
  const handleLogOutcome = async () => {
    if (!selectedAptId) return;
    const apt = appointments.find((a) => a.id === selectedAptId);
    if (apt) {
      const result = await onUpdateAppointment({
        ...apt,
        status: outcomeStatus,
        outcomeNotes
      });
      if (!result?.ok) {
        alert(result?.error || "Failed to save session outcome.");
        return;
      }
      setOutcomeModalOpen(false);
      setOutcomeNotes("");
      setSelectedAptId(null);
    }
  };
  const renderCalendar = () => {
    const days = getDaysInMonth(currentDate);
    const startDay = getFirstDayOfMonth(currentDate);
    const slots = [];
    const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 0; i < startDay; i++) {
      slots.push(/* @__PURE__ */ jsx("div", { className: "h-10" }, `empty-${i}`));
    }
    for (let d = 1; d <= days; d++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
      const dateStr = formatDate(date);
      const isToday = formatDate(/* @__PURE__ */ new Date()) === dateStr;
      const isSelected = selectedDate && formatDate(selectedDate) === dateStr;
      const myAppointmentsDay = appointments.filter((a) => {
        if (currentRole === "Manager" || currentRole === "Team Lead" || currentRole === "Admin" || currentRole === "Country Coordinator") return a.date === dateStr;
        if (currentRole === "Counselor") return a.date === dateStr && a.counselorId === currentUser.id;
        return a.date === dateStr && a.studentId === currentUser.id;
      });
      slots.push(
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => setSelectedDate(date),
            className: `h-10 w-10 mx-auto rounded-full flex flex-col items-center justify-center relative transition-all text-sm
                        ${isSelected ? "bg-[#0F172A] text-white shadow-md" : "hover:bg-slate-100 text-slate-700"}
                        ${isToday && !isSelected ? "text-indigo-600 font-bold bg-indigo-50" : ""}
                    `,
            children: [
              d,
              /* @__PURE__ */ jsx("div", { className: "flex gap-0.5 mt-0.5", children: myAppointmentsDay.map((_, i) => i < 3 && /* @__PURE__ */ jsx("div", { className: `w-1 h-1 rounded-full ${isSelected ? "bg-white/50" : "bg-indigo-400"}` }, i)) })
            ]
          },
          d
        )
      );
    }
    return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-sm mx-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-4 px-2", children: [
        /* @__PURE__ */ jsx("button", { onClick: () => changeMonth(-1), className: "p-1 hover:bg-slate-100 rounded-full", children: /* @__PURE__ */ jsx(ChevronLeft, { size: 20 }) }),
        /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-800", children: currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }) }),
        /* @__PURE__ */ jsx("button", { onClick: () => changeMonth(1), className: "p-1 hover:bg-slate-100 rounded-full", children: /* @__PURE__ */ jsx(ChevronRight, { size: 20 }) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "grid grid-cols-7 text-center mb-2", children: weekDays.map((d) => /* @__PURE__ */ jsx("div", { className: "text-xs font-bold text-slate-400 uppercase", children: d }, d)) }),
      /* @__PURE__ */ jsx("div", { className: "grid grid-cols-7 gap-y-2", children: slots })
    ] });
  };
  const pendingReview = currentRole === "Counselor" ? appointments.filter((a) => a.counselorId === currentUser.id && a.status === "Scheduled" && /* @__PURE__ */ new Date(`${a.date}T${a.time}`) < /* @__PURE__ */ new Date()) : [];
  const studentUpcomingMeetings = currentRole === "Student" ? appointments.filter((a) => a.studentId === currentUser.id && a.status === "Scheduled" && /* @__PURE__ */ new Date(`${a.date}T${a.time}`) > /* @__PURE__ */ new Date()).length : 0;
  const hasStudentMeetingLimit = currentRole === "Student" && studentUpcomingMeetings >= 3;
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6 animate-in fade-in duration-500 h-full flex flex-col", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-end shrink-0", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold tracking-tight text-[#0F172A]", children: "Calendar & Appointments" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mt-1", children: currentRole === "Student" ? "Book sessions with your counselor." : "Manage your schedule and availability." })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "text-xs text-slate-500", children: "Meeting policy: 30 min sessions with admin-defined open/close times for all 7 days." })
    ] }),
    pendingReview.length > 0 && /* @__PURE__ */ jsxs("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between animate-in slide-in-from-top-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("div", { className: "p-2 bg-amber-100 text-amber-600 rounded-full", children: /* @__PURE__ */ jsx(AlertTriangle, { size: 20 }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h4", { className: "font-bold text-amber-800 text-sm", children: "Action Required" }),
          /* @__PURE__ */ jsxs("p", { className: "text-xs text-amber-700", children: [
            pendingReview.length,
            " past sessions need outcome logging."
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx(Button, { size: "sm", className: "bg-amber-600 hover:bg-amber-700 text-white border-none", onClick: () => {
        setSelectedAptId(pendingReview[0].id);
        setOutcomeModalOpen(true);
      }, children: "Review Now" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-fit", children: [
        renderCalendar(),
        /* @__PURE__ */ jsx("div", { className: "mt-8 pt-6 border-t border-gray-100 space-y-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between text-sm", children: [
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2 text-slate-600", children: [
            /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-indigo-500" }),
            " Upcoming"
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2 text-slate-600", children: [
            /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-emerald-500" }),
            " Completed"
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-8 space-y-6 flex flex-col", children: [
        selectedDate && currentRole === "Student" && /* @__PURE__ */ jsxs("div", { className: "bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-in slide-in-from-left-2", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-4", children: [
            /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(Clock, { size: 18, className: "text-slate-400" }),
              "Available Slots for ",
              selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
            ] }),
            currentRole === "Student" && /* @__PURE__ */ jsxs(
              "select",
              {
                className: "text-xs border-gray-200 rounded-md p-1.5 bg-gray-50 outline-none focus:ring-1 focus:ring-indigo-500",
                value: bookingType,
                onChange: (e) => setBookingType(e.target.value),
                children: [
                  /* @__PURE__ */ jsx("option", { value: "Counseling", children: "Counseling" }),
                  /* @__PURE__ */ jsx("option", { value: "Visa Check", children: "Visa Check" }),
                  /* @__PURE__ */ jsx("option", { value: "Mock Interview", children: "Mock Interview" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-6", children: [
            selectedCounselorId ? generateTimeSlots(selectedDate, selectedCounselorId).map((time) => /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => setBookingTime(time),
                className: `py-2 px-1 rounded-md text-xs font-medium border transition-all
                                            ${bookingTime === time ? "bg-indigo-600 text-white border-indigo-600 shadow-md" : "bg-white border-gray-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"}
                                        `,
                children: time
              },
              time
            )) : /* @__PURE__ */ jsx("div", { className: "col-span-full text-center text-slate-400 text-sm py-4", children: "Select a counselor to view availability." }),
            selectedCounselorId && generateTimeSlots(selectedDate, selectedCounselorId).length === 0 && /* @__PURE__ */ jsx("div", { className: "col-span-full text-center text-slate-400 text-sm py-4 italic", children: "No slots available on this date." })
          ] }),
          hasStudentMeetingLimit && /* @__PURE__ */ jsx("div", { className: "mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2", children: "You already have 3 upcoming meetings. Complete or cancel one before booking another." }),
          /* @__PURE__ */ jsx("div", { className: "flex justify-end pt-4 border-t border-gray-100", children: /* @__PURE__ */ jsxs(Button, { disabled: !bookingTime || hasStudentMeetingLimit, onClick: handleBook, children: [
            "Book ",
            bookingType
          ] }) })
        ] }),
        currentRole === "Counselor" && /* @__PURE__ */ jsxs("div", { className: "bg-white p-6 rounded-xl border border-gray-200 shadow-sm", children: [
          /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 mb-4", children: "Block Busy Time" }),
          busyError && /* @__PURE__ */ jsx("div", { className: "mb-3 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: busyError }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-4 gap-3", children: [
            /* @__PURE__ */ jsx("input", { type: "date", value: busyDate, onChange: (e) => setBusyDate(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-md" }),
            /* @__PURE__ */ jsx("input", { type: "time", step: 1800, value: busyStartTime, onChange: (e) => setBusyStartTime(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-md" }),
            /* @__PURE__ */ jsx("input", { type: "time", step: 1800, value: busyEndTime, onChange: (e) => setBusyEndTime(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-md" }),
            /* @__PURE__ */ jsxs("select", { value: busyReason, onChange: (e) => setBusyReason(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-white", children: [
              /* @__PURE__ */ jsx("option", { value: "Leave", children: "Leave" }),
              /* @__PURE__ */ jsx("option", { value: "Training", children: "Training" }),
              /* @__PURE__ */ jsx("option", { value: "Meeting", children: "Internal Meeting" }),
              /* @__PURE__ */ jsx("option", { value: "Personal", children: "Personal" }),
              /* @__PURE__ */ jsx("option", { value: "Other", children: "Other" })
            ] })
          ] }),
          busyReason === "Other" && /* @__PURE__ */ jsx("input", { type: "text", value: busyReasonOther, onChange: (e) => setBusyReasonOther(e.target.value), placeholder: "Enter reason", className: "mt-3 w-full px-3 py-2 text-sm border border-gray-200 rounded-md" }),
          /* @__PURE__ */ jsx("p", { className: "mt-3 text-xs text-slate-500", children: "Busy blocks are one-time only and apply to the selected date." }),
          /* @__PURE__ */ jsx("div", { className: "mt-3 flex justify-end", children: /* @__PURE__ */ jsx(Button, { onClick: handleAddBusyTime, isLoading: isSavingBusy, children: "Add Busy Time" }) }),
          /* @__PURE__ */ jsx("div", { className: "mt-4 space-y-2", children: dayBusyBlocks.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400", children: "No busy blocks for this day." }) : dayBusyBlocks.map((block) => /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between text-xs bg-amber-50 border border-amber-200 rounded-md px-3 py-2", children: [
            /* @__PURE__ */ jsxs("span", { className: "text-amber-800", children: [
              block.startTime,
              " - ",
              block.endTime,
              " | ",
              block.reason || "Busy"
            ] }),
            /* @__PURE__ */ jsx("button", { className: "text-rose-600 hover:text-rose-700 font-semibold", onClick: async () => {
              await onDeleteBusyBooking?.(block.id);
            }, children: "Remove" })
          ] }, block.id)) })
        ] }),
        (currentRole === "Admin" || currentRole === "Manager" || currentRole === "Team Lead" || currentRole === "Country Coordinator") && /* @__PURE__ */ jsxs("div", { className: "bg-white p-6 rounded-xl border border-gray-200 shadow-sm", children: [
          /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 mb-4", children: "Counselor Blocked Times" }),
          roleVisibleBusyBlocks.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-400", children: "No blocked times found." }) : /* @__PURE__ */ jsx("div", { className: "space-y-2 max-h-64 overflow-y-auto", children: roleVisibleBusyBlocks.map((block) => {
            const counselorName = getCounselor(block.counselorId)?.name || block.counselorId;
            return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between text-xs bg-amber-50 border border-amber-200 rounded-md px-3 py-2", children: [
              /* @__PURE__ */ jsxs("div", { className: "text-amber-800", children: [
                /* @__PURE__ */ jsx("div", { className: "font-semibold", children: counselorName }),
                /* @__PURE__ */ jsxs("div", { children: [
                  block.date,
                  " | ",
                  block.startTime,
                  " - ",
                  block.endTime
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  "Reason: ",
                  block.reason || "Busy"
                ] })
              ] }),
              /* @__PURE__ */ jsx("span", { className: "text-amber-600 font-semibold", children: "Blocked" })
            ] }, block.id);
          }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl shadow-sm flex-1 overflow-hidden flex flex-col", children: [
          /* @__PURE__ */ jsx("div", { className: "p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center", children: /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 text-sm uppercase tracking-wide", children: "Scheduled Sessions" }) }),
          /* @__PURE__ */ jsxs("div", { className: "divide-y divide-gray-100 overflow-y-auto flex-1 p-0", children: [
            appointments.filter((a) => {
              if (currentRole === "Manager" || currentRole === "Team Lead" || currentRole === "Admin" || currentRole === "Country Coordinator") return true;
              if (currentRole === "Counselor") return a.counselorId === currentUser.id;
              return a.studentId === currentUser.id;
            }).sort((a, b) => {
              const dateA = /* @__PURE__ */ new Date(`${a.date}T${a.time}`);
              const dateB = /* @__PURE__ */ new Date(`${b.date}T${b.time}`);
              const now = /* @__PURE__ */ new Date();
              const isPastA = dateA < now;
              const isPastB = dateB < now;
              if (isPastA && !isPastB) return 1;
              if (!isPastA && isPastB) return -1;
              if (!isPastA && !isPastB) {
                return dateA.getTime() - dateB.getTime();
              } else {
                return dateB.getTime() - dateA.getTime();
              }
            }).map((apt) => {
              const isPast = /* @__PURE__ */ new Date(`${apt.date}T${apt.time}`) < /* @__PURE__ */ new Date();
              const student = getStudent(apt.studentId);
              const counselor = getCounselor(apt.counselorId);
              const otherName = currentRole === "Student" ? counselor?.name : student?.name;
              return /* @__PURE__ */ jsxs("div", { className: "p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
                  /* @__PURE__ */ jsxs("div", { className: `flex flex-col items-center justify-center w-12 h-12 rounded-lg border ${isPast ? "bg-slate-50 border-slate-200 text-slate-400" : "bg-indigo-50 border-indigo-100 text-indigo-700"}`, children: [
                    /* @__PURE__ */ jsx("span", { className: "text-xs font-bold uppercase", children: new Date(apt.date).toLocaleDateString("en-US", { month: "short" }) }),
                    /* @__PURE__ */ jsx("span", { className: "text-lg font-bold leading-none", children: new Date(apt.date).getDate() })
                  ] }),
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("h4", { className: `font-semibold ${isPast ? "text-slate-500" : "text-slate-900"}`, children: apt.title }),
                    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 text-xs text-slate-500 mt-1", children: [
                      /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
                        /* @__PURE__ */ jsx(Clock, { size: 12 }),
                        " ",
                        apt.time,
                        " (",
                        apt.duration,
                        "m)"
                      ] }),
                      /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
                        /* @__PURE__ */ jsx(User, { size: 12 }),
                        " ",
                        otherName
                      ] }),
                      apt.status === "Completed" && /* @__PURE__ */ jsxs("span", { className: "text-emerald-600 flex items-center gap-1", children: [
                        /* @__PURE__ */ jsx(CheckCircle, { size: 12 }),
                        " Completed"
                      ] })
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  !isPast && apt.status === "Scheduled" && /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", className: "h-8", children: [
                    /* @__PURE__ */ jsx(Video, { size: 14, className: "mr-2" }),
                    " Join"
                  ] }),
                  isPast && apt.status === "Scheduled" && (currentRole === "Counselor" || currentRole === "Country Coordinator") && /* @__PURE__ */ jsx(Button, { size: "sm", className: "h-8 bg-amber-600 hover:bg-amber-700 border-none text-white", onClick: () => {
                    setSelectedAptId(apt.id);
                    setOutcomeModalOpen(true);
                  }, children: "Log Outcome" })
                ] })
              ] }, apt.id);
            }),
            appointments.length === 0 && /* @__PURE__ */ jsx("div", { className: "p-8 text-center text-slate-400 text-sm", children: "No appointments found." })
          ] })
        ] })
      ] })
    ] }),
    outcomeModalOpen && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-100 shadow-2xl p-6 w-full max-w-md scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto my-auto", children: [
      /* @__PURE__ */ jsx("h3", { className: "font-bold text-lg text-slate-900 mb-4", children: "Log Session Outcome" }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-bold text-slate-500 uppercase block mb-2", children: "Status" }),
          /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => setOutcomeStatus("Completed"),
                className: `flex-1 py-2 rounded-md text-sm font-medium border ${outcomeStatus === "Completed" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "border-gray-200 text-slate-600"}`,
                children: "Completed"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => setOutcomeStatus("No Show"),
                className: `flex-1 py-2 rounded-md text-sm font-medium border ${outcomeStatus === "No Show" ? "bg-rose-50 border-rose-200 text-rose-700" : "border-gray-200 text-slate-600"}`,
                children: "No Show"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-bold text-slate-500 uppercase block mb-2", children: "Session Notes" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              className: "w-full p-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none",
              rows: 4,
              placeholder: "Key discussion points and next steps...",
              value: outcomeNotes,
              onChange: (e) => setOutcomeNotes(e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [
          /* @__PURE__ */ jsx(Button, { variant: "ghost", onClick: () => setOutcomeModalOpen(false), children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { onClick: handleLogOutcome, children: "Save Log" })
        ] })
      ] })
    ] }) })
  ] });
};
export {
  CalendarScheduler
};
