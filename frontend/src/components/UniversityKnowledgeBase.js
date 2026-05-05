import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState, useMemo } from "react";
import { createUniversityProgram, deleteUniversityProgram, getUniversityPrograms, updateUniversityProgramVisibility } from "../authApi";
import { Search, BookOpen, MapPin, GraduationCap, CheckCircle, ArrowRight, Loader2, Sparkles, EyeOff, Eye, Trash2, PlusCircle, X, CalendarDays, Award } from "lucide-react";
import { Button } from "./Button";
const UniversityKnowledgeBase = ({ currentRole, students = [] }) => {
  const [programs, setPrograms] = useState([]);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(true);
  const [programLoadError, setProgramLoadError] = useState("");
  const [managerActionError, setManagerActionError] = useState("");
  const [isSavingProgram, setIsSavingProgram] = useState(false);
  const [busyProgramId, setBusyProgramId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("All");
  const [maxBudget, setMaxBudget] = useState("");
  const [ieltsFilter, setIeltsFilter] = useState("");
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isAddUniversityModalOpen, setIsAddUniversityModalOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [applyStep, setApplyStep] = useState("select");
  const [newProgram, setNewProgram] = useState({
    university: "",
    programName: "",
    country: "",
    tuition: "",
    currency: "USD",
    duration: "",
    intake: "",
    qualificationName: "",
    qualificationMinValue: "",
    ranking: "500"
  });
  const canManagePrograms = currentRole === "Manager" || currentRole === "Admin";
  useEffect(() => {
    const loadPrograms = async () => {
      setIsLoadingPrograms(true);
      const result = await getUniversityPrograms({ includeHidden: canManagePrograms });
      if (!result.ok) {
        setPrograms([]);
        setProgramLoadError(result.error || "Failed to load university data.");
        setIsLoadingPrograms(false);
        return;
      }
      setPrograms(result.data);
      setProgramLoadError("");
      setIsLoadingPrograms(false);
    };
    loadPrograms();
  }, [canManagePrograms]);
  const availableCountries = useMemo(() => ["All", ...Array.from(new Set(programs.map((prog) => prog.country))).filter(Boolean)], [programs]);
  const filteredPrograms = useMemo(() => {
    return programs.filter((prog) => {
      const matchesSearch = prog.programName.toLowerCase().includes(searchQuery.toLowerCase()) || prog.university.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCountry = selectedCountry === "All" || prog.country === selectedCountry;
      const matchesBudget = !maxBudget || prog.tuition <= parseFloat(maxBudget);
      const programIelts = String(prog.qualificationName || "").toLowerCase().includes("ielts") ? Number(prog.qualificationMinValue || 0) : Number(prog.minIELTS || 0);
      const matchesIelts = !ieltsFilter || programIelts <= parseFloat(ieltsFilter);
      return matchesSearch && matchesCountry && matchesBudget && matchesIelts;
    });
  }, [programs, searchQuery, selectedCountry, maxBudget, ieltsFilter]);
  const handleApplyClick = (program) => {
    setSelectedProgram(program);
    setApplyStep("select");
    setIsApplyModalOpen(true);
    setSelectedStudentId("");
  };
  const handleConfirmApply = () => {
    if (!selectedStudentId) return;
    setApplyStep("processing");
    setTimeout(() => {
      setApplyStep("success");
    }, 2e3);
  };
  const closeApplyModal = () => {
    setIsApplyModalOpen(false);
    setSelectedProgram(null);
  };
  const closeAddUniversityModal = () => {
    setIsAddUniversityModalOpen(false);
    setManagerActionError("");
  };
  const resetNewProgramForm = () => {
    setNewProgram({
      university: "",
      programName: "",
      country: "",
      tuition: "",
      currency: "USD",
      duration: "",
      intake: "",
      qualificationName: "",
      qualificationMinValue: "",
      ranking: "500"
    });
  };
  const handleAddProgram = async () => {
    if (!canManagePrograms) return;
    setManagerActionError("");
    setIsSavingProgram(true);
    const payload = {
      university: newProgram.university.trim(),
      programName: newProgram.programName.trim(),
      country: newProgram.country.trim(),
      tuition: Number(newProgram.tuition),
      currency: newProgram.currency.trim().toUpperCase(),
      duration: newProgram.duration.trim(),
      intake: newProgram.intake.trim(),
      qualificationName: newProgram.qualificationName.trim(),
      qualificationMinValue: Number(newProgram.qualificationMinValue),
      ranking: Number(newProgram.ranking),
      tags: [],
      logoColor: "bg-slate-700"
    };
    const result = await createUniversityProgram(payload);
    setIsSavingProgram(false);
    if (!result.ok) {
      setManagerActionError(result.error || "Failed to add university program.");
      return;
    }
    setPrograms((prev) => [result.data, ...prev]);
    resetNewProgramForm();
    setIsAddUniversityModalOpen(false);
  };
  const handleToggleVisibility = async (program) => {
    if (!canManagePrograms) return;
    setManagerActionError("");
    setBusyProgramId(program.id);
    const result = await updateUniversityProgramVisibility(program.id, !program.isHidden);
    setBusyProgramId("");
    if (!result.ok) {
      setManagerActionError(result.error || "Failed to update visibility.");
      return;
    }
    setPrograms((prev) => prev.map((row) => row.id === program.id ? result.data : row));
  };
  const handleRemoveProgram = async (program) => {
    if (!canManagePrograms) return;
    const confirmed = window.confirm(`Remove "${program.university} - ${program.programName}"?`);
    if (!confirmed) return;
    setManagerActionError("");
    setBusyProgramId(program.id);
    const result = await deleteUniversityProgram(program.id);
    setBusyProgramId("");
    if (!result.ok) {
      setManagerActionError(result.error || "Failed to remove program.");
      return;
    }
    setPrograms((prev) => prev.filter((row) => row.id !== program.id));
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6 animate-in fade-in duration-500", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-end shrink-0 gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold tracking-tight text-[#0F172A]", children: "University Knowledge Base" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mt-1", children: "Search global partners and auto-fill applications." })
      ] }),
      canManagePrograms && /* @__PURE__ */ jsxs(Button, { onClick: () => setIsAddUniversityModalOpen(true), children: [
        /* @__PURE__ */ jsx(PlusCircle, { size: 14, className: "mr-2" }),
        "Add University"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4 shrink-0", children: [
      /* @__PURE__ */ jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsx(Search, { className: "absolute left-3 top-3 text-gray-400", size: 18 }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            placeholder: "Search by university or program name (e.g. 'Data Science')...",
            className: "w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm",
            value: searchQuery,
            onChange: (e) => setSearchQuery(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-4 items-end", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-[150px]", children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-500 uppercase mb-1 block", children: "Destination" }),
          /* @__PURE__ */ jsxs(
            "select",
            {
              className: "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md outline-none focus:border-indigo-500",
              value: selectedCountry,
              onChange: (e) => setSelectedCountry(e.target.value),
              children: [
                availableCountries.map((country) => /* @__PURE__ */ jsx("option", { value: country, children: country === "All" ? "Global (All)" : country }, country))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-[150px]", children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-500 uppercase mb-1 block", children: "Max Budget" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx("span", { className: "absolute left-3 top-2 text-slate-400 text-xs", children: "$" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "number",
                placeholder: "e.g. 20000",
                className: "w-full pl-6 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-md outline-none focus:border-indigo-500",
                value: maxBudget,
                onChange: (e) => setMaxBudget(e.target.value)
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-[150px]", children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-500 uppercase mb-1 block", children: "Student IELTS" }),
          /* @__PURE__ */ jsxs(
            "select",
            {
              className: "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md outline-none focus:border-indigo-500",
              value: ieltsFilter,
              onChange: (e) => setIeltsFilter(e.target.value),
              children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Any Score" }),
                /* @__PURE__ */ jsx("option", { value: "5.5", children: "5.5+" }),
                /* @__PURE__ */ jsx("option", { value: "6.0", children: "6.0+" }),
                /* @__PURE__ */ jsx("option", { value: "6.5", children: "6.5+" }),
                /* @__PURE__ */ jsx("option", { value: "7.0", children: "7.0+" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: () => {
          setSearchQuery("");
          setSelectedCountry("All");
          setMaxBudget("");
          setIeltsFilter("");
        }, children: "Reset Filters" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-6", children: isLoadingPrograms ? /* @__PURE__ */ jsxs("div", { className: "col-span-full text-center py-20 text-slate-400", children: [
      /* @__PURE__ */ jsx(Loader2, { size: 48, className: "mx-auto mb-4 animate-spin opacity-30" }),
      /* @__PURE__ */ jsx("p", { children: "Loading university programs..." })
    ] }) : programLoadError ? /* @__PURE__ */ jsxs("div", { className: "col-span-full text-center py-20 text-rose-500", children: [
      /* @__PURE__ */ jsx(BookOpen, { size: 48, className: "mx-auto mb-4 opacity-40" }),
      /* @__PURE__ */ jsx("p", { children: programLoadError })
    ] }) : filteredPrograms.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "col-span-full text-center py-20 text-slate-400", children: [
      /* @__PURE__ */ jsx(BookOpen, { size: 48, className: "mx-auto mb-4 opacity-20" }),
      /* @__PURE__ */ jsx("p", { children: "No programs match your criteria." }),
      /* @__PURE__ */ jsx("p", { className: "text-sm", children: "Try adjusting the budget or country filters." })
    ] }) : filteredPrograms.map((prog) => /* @__PURE__ */ jsxs("div", { className: `bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow flex flex-col group ${prog.isHidden ? "opacity-70" : ""}`, children: [
      /* @__PURE__ */ jsxs("div", { className: `h-24 ${prog.logoColor} p-6 flex items-center justify-center relative overflow-hidden`, children: [
        /* @__PURE__ */ jsx("div", { className: "absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" }),
        /* @__PURE__ */ jsx("h3", { className: "text-white font-bold text-xl tracking-tight relative z-10 text-center", children: prog.university })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-5 flex-1 flex flex-col", children: [
        prog.isHidden && /* @__PURE__ */ jsx("span", { className: "inline-flex items-center self-start text-[10px] font-semibold px-2 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700 mb-3", children: "Hidden from counselors/students" }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start mb-2", children: [
          /* @__PURE__ */ jsx("h4", { className: "font-bold text-slate-900 text-lg leading-tight", children: prog.programName }),
          /* @__PURE__ */ jsxs("span", { className: "text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded flex items-center shrink-0 ml-2", children: [
            "#",
            prog.ranking,
            " Rank"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-sm text-slate-500 mb-4", children: [
          /* @__PURE__ */ jsx(MapPin, { size: 14 }),
          " ",
          prog.country
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3 text-sm mb-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "bg-gray-50 p-2 rounded border border-gray-100", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400 block uppercase", children: "Tuition" }),
            /* @__PURE__ */ jsxs("span", { className: "font-semibold text-slate-900", children: [
              prog.currency,
              " ",
              prog.tuition.toLocaleString()
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "bg-gray-50 p-2 rounded border border-gray-100", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400 block uppercase", children: "Intake" }),
            /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-900", children: prog.intake })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "bg-gray-50 p-2 rounded border border-gray-100", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400 block uppercase", children: prog.qualificationName ? "Min Qualification" : "Req. IELTS" }),
            /* @__PURE__ */ jsxs("span", { className: "font-semibold text-slate-900", children: [
              prog.qualificationName ? `${prog.qualificationName}: ` : "",
              prog.qualificationName ? prog.qualificationMinValue : prog.minIELTS
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "bg-gray-50 p-2 rounded border border-gray-100", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400 block uppercase", children: "Duration" }),
            /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-900", children: prog.duration })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2 mb-6", children: prog.tags.map((tag) => /* @__PURE__ */ jsx("span", { className: "text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100 font-medium", children: tag }, tag)) }),
        /* @__PURE__ */ jsxs("div", { className: "mt-auto pt-4 border-t border-gray-100 space-y-2", children: [
          /* @__PURE__ */ jsxs(Button, { className: "w-full group-hover:bg-indigo-600 group-hover:text-white transition-colors", onClick: () => handleApplyClick(prog), disabled: prog.isHidden, children: [
            "Apply Now ",
            /* @__PURE__ */ jsx(ArrowRight, { size: 16, className: "ml-2" })
          ] }),
          canManagePrograms && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ jsxs(Button, { variant: "secondary", disabled: busyProgramId === prog.id, onClick: () => handleToggleVisibility(prog), children: [
              prog.isHidden ? /* @__PURE__ */ jsx(Eye, { size: 14, className: "mr-2" }) : /* @__PURE__ */ jsx(EyeOff, { size: 14, className: "mr-2" }),
              prog.isHidden ? "Unhide" : "Hide"
            ] }),
            /* @__PURE__ */ jsxs(Button, { variant: "ghost", className: "text-rose-600 hover:text-rose-700", disabled: busyProgramId === prog.id, onClick: () => handleRemoveProgram(prog), children: [
              /* @__PURE__ */ jsx(Trash2, { size: 14, className: "mr-2" }),
              "Remove"
            ] })
          ] })
        ] })
      ] })
    ] }, prog.id)) }),
    isAddUniversityModalOpen && canManagePrograms && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-hidden my-auto flex flex-col", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center p-5 border-b border-gray-100 bg-slate-50 flex-shrink-0", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h3", { className: "font-bold text-lg text-slate-900", children: "Add University Program" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: "Create a new option for the knowledge base." })
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: closeAddUniversityModal, className: "text-slate-400 hover:text-slate-600 transition-colors", children: /* @__PURE__ */ jsx(X, { size: 20 }) })
      ] }),
      /* @__PURE__ */ jsxs("form", { className: "p-5 space-y-4 overflow-y-auto flex-1 min-h-0", onSubmit: (e) => {
        e.preventDefault();
        handleAddProgram();
      }, children: [
        managerActionError ? /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: managerActionError }) : null,
        /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "University" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(BookOpen, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
            /* @__PURE__ */ jsx("input", { required: true, type: "text", className: "w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none", placeholder: "e.g. University of Melbourne", value: newProgram.university, onChange: (e) => setNewProgram((prev) => ({ ...prev, university: e.target.value })) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Program Name" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(GraduationCap, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
            /* @__PURE__ */ jsx("input", { required: true, type: "text", className: "w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none", placeholder: "e.g. MSc Data Science", value: newProgram.programName, onChange: (e) => setNewProgram((prev) => ({ ...prev, programName: e.target.value })) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Country" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(MapPin, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
              /* @__PURE__ */ jsx("input", { required: true, type: "text", className: "w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none", placeholder: "UK", value: newProgram.country, onChange: (e) => setNewProgram((prev) => ({ ...prev, country: e.target.value })) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Tuition" }),
            /* @__PURE__ */ jsx("input", { required: true, type: "number", className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none", placeholder: "20000", value: newProgram.tuition, onChange: (e) => setNewProgram((prev) => ({ ...prev, tuition: e.target.value })) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Currency" }),
            /* @__PURE__ */ jsxs("select", { required: true, className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none bg-white", value: newProgram.currency, onChange: (e) => setNewProgram((prev) => ({ ...prev, currency: e.target.value })), children: [
              /* @__PURE__ */ jsx("option", { value: "USD", children: "USD - US Dollar" }),
              /* @__PURE__ */ jsx("option", { value: "GBP", children: "GBP - British Pound" }),
              /* @__PURE__ */ jsx("option", { value: "EUR", children: "EUR - Euro" }),
              /* @__PURE__ */ jsx("option", { value: "CAD", children: "CAD - Canadian Dollar" }),
              /* @__PURE__ */ jsx("option", { value: "AUD", children: "AUD - Australian Dollar" }),
              /* @__PURE__ */ jsx("option", { value: "NZD", children: "NZD - New Zealand Dollar" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Duration" }),
            /* @__PURE__ */ jsx("input", { required: true, type: "text", className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none", placeholder: "1 Year", value: newProgram.duration, onChange: (e) => setNewProgram((prev) => ({ ...prev, duration: e.target.value })) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Intake" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(CalendarDays, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
              /* @__PURE__ */ jsx("input", { required: true, type: "text", className: "w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none", placeholder: "Sept / Jan", value: newProgram.intake, onChange: (e) => setNewProgram((prev) => ({ ...prev, intake: e.target.value })) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Qualification Name" }),
            /* @__PURE__ */ jsx("input", { required: true, type: "text", className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none", placeholder: "e.g. IELTS", value: newProgram.qualificationName, onChange: (e) => setNewProgram((prev) => ({ ...prev, qualificationName: e.target.value })) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Minimum Value" }),
            /* @__PURE__ */ jsx("input", { required: true, type: "number", step: "0.1", className: "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none", placeholder: "6.0", value: newProgram.qualificationMinValue, onChange: (e) => setNewProgram((prev) => ({ ...prev, qualificationMinValue: e.target.value })) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: "Ranking" }),
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(Award, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
              /* @__PURE__ */ jsx("input", { required: true, type: "number", className: "w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none", placeholder: "500", value: newProgram.ranking, onChange: (e) => setNewProgram((prev) => ({ ...prev, ranking: e.target.value })) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2 pt-4 border-t border-gray-100", children: [
          /* @__PURE__ */ jsx(Button, { type: "button", variant: "secondary", onClick: closeAddUniversityModal, disabled: isSavingProgram, children: "Close" }),
          /* @__PURE__ */ jsx(Button, { type: "submit", isLoading: isSavingProgram, children: "Create Program" })
        ] })
      ] })
    ] }) }),
    isApplyModalOpen && selectedProgram && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200", children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-hidden my-auto flex flex-col", children: [
      /* @__PURE__ */ jsxs("div", { className: `p-6 text-white flex-shrink-0 ${applyStep === "success" ? "bg-emerald-600" : "bg-[#0F172A]"}`, children: [
        /* @__PURE__ */ jsxs("h3", { className: "font-bold text-lg flex items-center gap-2", children: [
          applyStep === "success" ? /* @__PURE__ */ jsx(CheckCircle, {}) : /* @__PURE__ */ jsx(GraduationCap, {}),
          applyStep === "success" ? "Application Drafted!" : `Apply to ${selectedProgram.university}`
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-white/80 text-xs mt-1", children: applyStep === "success" ? "The student data has been synced to the portal." : `Program: ${selectedProgram.programName} (${selectedProgram.intake})` })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-6 flex-1 min-h-0 overflow-y-auto", children: [
        applyStep === "select" && /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600", children: "Select a student to auto-fill the application form from the CRM database." }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx("label", { className: "text-xs font-bold text-slate-500 uppercase", children: "Select Student" }),
            /* @__PURE__ */ jsxs(
              "select",
              {
                className: "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                value: selectedStudentId,
                onChange: (e) => setSelectedStudentId(e.target.value),
                children: [
                  /* @__PURE__ */ jsx("option", { value: "", disabled: true, children: "Choose a student..." }),
                  students.filter((s) => s.country === selectedProgram.country).map((s) => /* @__PURE__ */ jsxs("option", { value: s.id, children: [
                    s.name,
                    " (ID: ",
                    s.id,
                    ")"
                  ] }, s.id)),
                  students.filter((s) => s.country !== selectedProgram.country).map((s) => /* @__PURE__ */ jsxs("option", { value: s.id, disabled: true, children: [
                    s.name,
                    " (Different Country: ",
                    s.country,
                    ")"
                  ] }, s.id))
                ]
              }
            ),
            /* @__PURE__ */ jsxs("p", { className: "text-[10px] text-slate-400", children: [
              "* Only students targeting ",
              selectedProgram.country,
              " are selectable."
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "pt-4 flex justify-end gap-3", children: [
            /* @__PURE__ */ jsx(Button, { variant: "ghost", onClick: closeApplyModal, children: "Cancel" }),
            /* @__PURE__ */ jsx(Button, { disabled: !selectedStudentId, onClick: handleConfirmApply, children: "Start Auto-Fill" })
          ] })
        ] }),
        applyStep === "processing" && /* @__PURE__ */ jsxs("div", { className: "py-8 text-center space-y-4", children: [
          /* @__PURE__ */ jsx(Loader2, { size: 40, className: "mx-auto text-indigo-600 animate-spin" }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h4", { className: "font-bold text-slate-900", children: "Syncing Student Data..." }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 mt-1", children: "Mapping Transcripts, SOP, and Passport details." })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "w-full bg-gray-100 rounded-full h-2 max-w-xs mx-auto overflow-hidden", children: /* @__PURE__ */ jsx("div", { className: "h-full bg-indigo-600 rounded-full animate-progress origin-left w-full" }) })
        ] }),
        applyStep === "success" && /* @__PURE__ */ jsxs("div", { className: "text-center space-y-4", children: [
          /* @__PURE__ */ jsx("div", { className: "bg-emerald-50 text-emerald-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2", children: /* @__PURE__ */ jsx(Sparkles, { size: 32 }) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h4", { className: "font-bold text-slate-900 text-lg", children: "Ready for Review" }),
            /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-500 max-w-xs mx-auto", children: [
              "Application ID ",
              /* @__PURE__ */ jsx("strong", { children: "#APP-8675" }),
              ` has been created. Please review the final draft in the student's "Uni Applications" tab.`
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "pt-4", children: /* @__PURE__ */ jsx(Button, { className: "w-full bg-emerald-600 hover:bg-emerald-700 border-none", onClick: closeApplyModal, children: "Done" }) })
        ] })
      ] })
    ] }) })
  ] });
};
export {
  UniversityKnowledgeBase
};
