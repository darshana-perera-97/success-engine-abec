import { useEffect, useMemo, useRef, useState } from "react";
import { createUniversityProgram, createUniversityProgramsBulk, deleteUniversityProgram, getCountries, getUniversityPrograms, updateUniversityProgramVisibility } from "../authApi";
import { toAbsoluteAssetUrl } from "../apiConfig";
import { downloadUniversitySample, parseUniversityImportFile, validateUniversityFields } from "../utils/universityImport";
import { Search, BookOpen, MapPin, GraduationCap, CheckCircle, ArrowRight, Loader2, Sparkles, EyeOff, Eye, Trash2, PlusCircle, X, Award, FileUp, Download, Link2, Image as ImageIcon } from "lucide-react";
import { Button } from "./Button";
import { InlineLoading } from "./LoadingPlaceholder";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const EMPTY_PROGRAM = {
  university: "",
  logoUrl: "",
  logoFileName: "",
  country: "",
  pageLink: "",
  courseLink: "",
};

function text(value) {
  return String(value || "").trim();
}

function programLabel(program) {
  return [text(program?.university), text(program?.programName)].filter(Boolean).join(" - ") || "this university";
}

function hasStats(program) {
  return (
    Number(program?.tuition) > 0 ||
    Boolean(text(program?.intake)) ||
    Boolean(text(program?.qualificationName)) ||
    Number(program?.minIELTS) > 0 ||
    Boolean(text(program?.duration))
  );
}

function readLogoFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Choose a logo image."));
      return;
    }
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
      reject(new Error("Logo must be a PNG, JPG, WEBP, or GIF."));
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      reject(new Error("Logo must be under 2MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the logo file."));
    reader.readAsDataURL(file);
  });
}

const UniversityKnowledgeBase = ({ currentRole, students = [] }) => {
  const [programs, setPrograms] = useState([]);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(true);
  const [programLoadError, setProgramLoadError] = useState("");
  const [managerActionError, setManagerActionError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [isSavingProgram, setIsSavingProgram] = useState(false);
  const [busyProgramId, setBusyProgramId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("All");
  const [maxBudget, setMaxBudget] = useState("");
  const [ieltsFilter, setIeltsFilter] = useState("");
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isAddUniversityModalOpen, setIsAddUniversityModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [applyStep, setApplyStep] = useState("select");
  const [newProgram, setNewProgram] = useState(EMPTY_PROGRAM);
  const [countryOptions, setCountryOptions] = useState([]);
  const [countriesError, setCountriesError] = useState("");
  const [importRows, setImportRows] = useState([]);
  const [importFileName, setImportFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [importParseLoading, setImportParseLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const logoInputRef = useRef(null);
  const importInputRef = useRef(null);
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

  useEffect(() => {
    if (!canManagePrograms) return undefined;
    let cancelled = false;
    const loadCountries = async () => {
      const result = await getCountries();
      if (cancelled) return;
      if (!result.ok) {
        setCountryOptions([]);
        setCountriesError(result.error || "Failed to load countries.");
        return;
      }
      setCountryOptions(result.data || []);
      setCountriesError("");
    };
    loadCountries();
    return () => {
      cancelled = true;
    };
  }, [canManagePrograms]);

  const availableCountries = useMemo(
    () => ["All", ...Array.from(new Set(programs.map((prog) => prog.country))).filter(Boolean)],
    [programs]
  );
  const filteredPrograms = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return programs.filter((prog) => {
      const programName = text(prog.programName).toLowerCase();
      const university = text(prog.university).toLowerCase();
      const matchesSearch = !query || programName.includes(query) || university.includes(query);
      const matchesCountry = selectedCountry === "All" || prog.country === selectedCountry;
      const tuition = Number(prog.tuition);
      const matchesBudget = !maxBudget || !Number.isFinite(tuition) || tuition <= parseFloat(maxBudget);
      const programIelts = String(prog.qualificationName || "").toLowerCase().includes("ielts")
        ? Number(prog.qualificationMinValue || 0)
        : Number(prog.minIELTS || 0);
      const matchesIelts = !ieltsFilter || !programIelts || programIelts <= parseFloat(ieltsFilter);
      return matchesSearch && matchesCountry && matchesBudget && matchesIelts;
    });
  }, [programs, searchQuery, selectedCountry, maxBudget, ieltsFilter]);
  const readyImportRows = importRows.filter((row) => !row.error);

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
    setNewProgram(EMPTY_PROGRAM);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };
  const closeImportModal = () => {
    if (importSaving) return;
    setIsImportModalOpen(false);
    setImportRows([]);
    setImportFileName("");
    setImportError("");
    setImportParseLoading(false);
    if (importInputRef.current) importInputRef.current.value = "";
  };
  const handleLogoFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setManagerActionError("");
    try {
      const logoUrl = await readLogoFile(file);
      setNewProgram((prev) => ({ ...prev, logoUrl, logoFileName: file.name }));
    } catch (error) {
      setNewProgram((prev) => ({ ...prev, logoUrl: "", logoFileName: "" }));
      if (logoInputRef.current) logoInputRef.current.value = "";
      setManagerActionError(error.message || "Could not read the logo file.");
    }
  };
  const handleAddProgram = async () => {
    if (!canManagePrograms) return;
    const validated = validateUniversityFields(newProgram, countryOptions);
    if (!validated.ok) {
      setManagerActionError(validated.error);
      return;
    }
    setManagerActionError("");
    setIsSavingProgram(true);
    const result = await createUniversityProgram(validated.value);
    setIsSavingProgram(false);
    if (!result.ok) {
      setManagerActionError(result.error || "Failed to add university program.");
      return;
    }
    setPrograms((prev) => [result.data, ...prev]);
    resetNewProgramForm();
    setIsAddUniversityModalOpen(false);
    setImportNotice("");
  };
  const handleImportFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportParseLoading(true);
    setImportError("");
    setImportRows([]);
    const parsed = await parseUniversityImportFile(file, { countries: countryOptions });
    setImportParseLoading(false);
    if (!parsed.ok) {
      setImportFileName("");
      setImportError(parsed.error || "Could not read the spreadsheet.");
      return;
    }
    setImportFileName(parsed.fileName || file.name);
    setImportRows(parsed.rows || []);
  };
  const handleImportPrograms = async () => {
    if (!canManagePrograms || !readyImportRows.length) return;
    setImportSaving(true);
    setImportError("");
    const result = await createUniversityProgramsBulk(
      readyImportRows.map((row) => ({
        rowNumber: row.rowNumber,
        university: row.university,
        logoUrl: row.logoUrl,
        country: row.country,
        pageLink: row.pageLink,
        courseLink: row.courseLink,
      }))
    );
    setImportSaving(false);
    if (!result.ok) {
      setImportError(result.error || "Failed to import universities.");
      return;
    }
    setPrograms((prev) => [...(result.data || []), ...prev]);
    const skipped = (result.skipped || []).length + importRows.filter((row) => row.error).length;
    const imported = (result.data || []).length;
    setImportNotice(
      skipped
        ? `Imported ${imported} universit${imported === 1 ? "y" : "ies"}. ${skipped} row${skipped === 1 ? " was" : "s were"} skipped.`
        : `Imported ${imported} universit${imported === 1 ? "y" : "ies"}.`
    );
    setIsImportModalOpen(false);
    setImportRows([]);
    setImportFileName("");
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
    setPrograms((prev) => prev.map((row) => (row.id === program.id ? result.data : row)));
  };
  const handleRemoveProgram = async (program) => {
    if (!canManagePrograms) return;
    const confirmed = window.confirm(`Remove "${programLabel(program)}"?`);
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
  const sampleCountry = countryOptions[0] || "Australia";
  const logoPreview = text(newProgram.logoUrl);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-end shrink-0 gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">University Knowledge Base</h1>
          <p className="text-sm text-slate-500 mt-1">Search global partners and auto-fill applications.</p>
        </div>
        {canManagePrograms && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => { setImportNotice(""); setIsImportModalOpen(true); }}>
              <FileUp size={14} className="mr-2" />
              Import spreadsheet
            </Button>
            <Button type="button" onClick={() => { setManagerActionError(""); setIsAddUniversityModalOpen(true); }}>
              <PlusCircle size={14} className="mr-2" />
              Add University
            </Button>
          </div>
        )}
      </div>
      {importNotice ? (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{importNotice}</div>
      ) : null}
      {!isAddUniversityModalOpen && managerActionError ? (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{managerActionError}</div>
      ) : null}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search by university or program name (e.g. 'Data Science')..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Destination</label>
            <select
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md outline-none focus:border-indigo-500"
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
            >
              {availableCountries.map((country) => (
                <option key={country} value={country}>{country === "All" ? "Global (All)" : country}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Max Budget</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-400 text-xs">$</span>
              <input
                type="number"
                placeholder="e.g. 20000"
                className="w-full pl-6 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-md outline-none focus:border-indigo-500"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Student IELTS</label>
            <select
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md outline-none focus:border-indigo-500"
              value={ieltsFilter}
              onChange={(e) => setIeltsFilter(e.target.value)}
            >
              <option value="">Any Score</option>
              <option value="5.5">5.5+</option>
              <option value="6.0">6.0+</option>
              <option value="6.5">6.5+</option>
              <option value="7.0">7.0+</option>
            </select>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setSearchQuery("");
              setSelectedCountry("All");
              setMaxBudget("");
              setIeltsFilter("");
            }}
          >
            Reset Filters
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-6">
        {isLoadingPrograms ? (
          <div className="col-span-full">
            <InlineLoading label="Loading university programs..." />
          </div>
        ) : programLoadError ? (
          <div className="col-span-full text-center py-20 text-rose-500">
            <BookOpen size={48} className="mx-auto mb-4 opacity-40" />
            <p>{programLoadError}</p>
          </div>
        ) : filteredPrograms.length === 0 ? (
          <div className="col-span-full text-center py-20 text-slate-400">
            <BookOpen size={48} className="mx-auto mb-4 opacity-20" />
            <p>No programs match your criteria.</p>
            <p className="text-sm">Try adjusting the budget or country filters.</p>
          </div>
        ) : filteredPrograms.map((prog) => {
          const tags = Array.isArray(prog.tags) ? prog.tags : [];
          const logoSrc = text(prog.logoUrl) ? (toAbsoluteAssetUrl(prog.logoUrl) || prog.logoUrl) : "";
          const pageLink = text(prog.pageLink);
          const courseLink = text(prog.courseLink);
          return (
            <div key={prog.id} className={`bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow flex flex-col group ${prog.isHidden ? "opacity-70" : ""}`}>
              {logoSrc ? (
                <div className="h-24 bg-slate-50 border-b border-gray-100 p-4 flex items-center justify-center">
                  <img src={logoSrc} alt={`${text(prog.university) || "University"} logo`} className="max-h-16 max-w-[80%] object-contain" />
                </div>
              ) : (
                <div className={`h-24 ${prog.logoColor || "bg-slate-700"} p-6 flex items-center justify-center relative overflow-hidden`}>
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
                  <h3 className="text-white font-bold text-xl tracking-tight relative z-10 text-center">{prog.university}</h3>
                </div>
              )}
              <div className="p-5 flex-1 flex flex-col">
                {prog.isHidden && (
                  <span className="inline-flex items-center self-start text-[10px] font-semibold px-2 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700 mb-3">
                    Hidden from counselors/students
                  </span>
                )}
                <div className="flex justify-between items-start mb-2">
                  <div className="min-w-0">
                    {logoSrc ? (
                      <h4 className="font-bold text-slate-900 text-lg leading-tight">{prog.university}</h4>
                    ) : null}
                    {text(prog.programName) ? (
                      <p className={logoSrc ? "text-sm text-slate-600 mt-1" : "font-bold text-slate-900 text-lg leading-tight"}>{prog.programName}</p>
                    ) : null}
                  </div>
                  {Number(prog.ranking) > 0 ? (
                    <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded flex items-center shrink-0 ml-2">
                      <Award size={12} className="mr-1" />
                      #{prog.ranking} Rank
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                  <MapPin size={14} /> {prog.country}
                </div>
                {hasStats(prog) ? (
                  <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                    {Number(prog.tuition) > 0 ? (
                      <div className="bg-gray-50 p-2 rounded border border-gray-100">
                        <span className="text-xs text-slate-400 block uppercase">Tuition</span>
                        <span className="font-semibold text-slate-900">{prog.currency} {Number(prog.tuition).toLocaleString()}</span>
                      </div>
                    ) : null}
                    {text(prog.intake) ? (
                      <div className="bg-gray-50 p-2 rounded border border-gray-100">
                        <span className="text-xs text-slate-400 block uppercase">Intake</span>
                        <span className="font-semibold text-slate-900">{prog.intake}</span>
                      </div>
                    ) : null}
                    {text(prog.qualificationName) || Number(prog.minIELTS) > 0 ? (
                      <div className="bg-gray-50 p-2 rounded border border-gray-100">
                        <span className="text-xs text-slate-400 block uppercase">{prog.qualificationName ? "Min Qualification" : "Req. IELTS"}</span>
                        <span className="font-semibold text-slate-900">
                          {prog.qualificationName ? `${prog.qualificationName}: ` : ""}
                          {prog.qualificationName ? prog.qualificationMinValue : prog.minIELTS}
                        </span>
                      </div>
                    ) : null}
                    {text(prog.duration) ? (
                      <div className="bg-gray-50 p-2 rounded border border-gray-100">
                        <span className="text-xs text-slate-400 block uppercase">Duration</span>
                        <span className="font-semibold text-slate-900">{prog.duration}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {tags.map((tag) => (
                      <span key={tag} className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100 font-medium">{tag}</span>
                    ))}
                  </div>
                ) : null}
                {(pageLink || courseLink) ? (
                  <div className="flex flex-col gap-2 mb-4">
                    {pageLink ? (
                      <a href={pageLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-800 break-all">
                        <Link2 size={14} className="shrink-0" /> University page
                      </a>
                    ) : null}
                    {courseLink ? (
                      <a href={courseLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-800 break-all">
                        <Link2 size={14} className="shrink-0" /> Course page
                      </a>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-auto pt-4 border-t border-gray-100 space-y-2">
                  <Button
                    className="w-full group-hover:bg-indigo-600 group-hover:text-white transition-colors"
                    onClick={() => {
                      const coursesUrl = courseLink || pageLink;
                      if (coursesUrl) window.open(coursesUrl, "_blank", "noopener,noreferrer");
                    }}
                    disabled={prog.isHidden || !(courseLink || pageLink)}
                  >
                    View Courses <ArrowRight size={16} className="ml-2" />
                  </Button>
                  {canManagePrograms && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" disabled={busyProgramId === prog.id} onClick={() => handleToggleVisibility(prog)}>
                        {prog.isHidden ? <Eye size={14} className="mr-2" /> : <EyeOff size={14} className="mr-2" />}
                        {prog.isHidden ? "Unhide" : "Hide"}
                      </Button>
                      <Button variant="ghost" className="text-rose-600 hover:text-rose-700" disabled={busyProgramId === prog.id} onClick={() => handleRemoveProgram(prog)}>
                        <Trash2 size={14} className="mr-2" />
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {isAddUniversityModalOpen && canManagePrograms && (
        <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-hidden my-auto flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-slate-50 flex-shrink-0">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Add University Program</h3>
                <p className="text-xs text-slate-500 mt-1">Name, logo, and country are required. Add a page link, a course link, or both.</p>
              </div>
              <button type="button" onClick={closeAddUniversityModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form
              className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0"
              onSubmit={(e) => {
                e.preventDefault();
                handleAddProgram();
              }}
            >
              {managerActionError ? (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{managerActionError}</div>
              ) : null}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">University name</label>
                <div className="relative">
                  <BookOpen className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input
                    required
                    type="text"
                    className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    placeholder="e.g. University of Melbourne"
                    value={newProgram.university}
                    onChange={(e) => setNewProgram((prev) => ({ ...prev, university: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-500 uppercase">University logo</label>
                {logoPreview ? (
                  <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-slate-50 p-3">
                    <img src={logoPreview.startsWith("data:") ? logoPreview : (toAbsoluteAssetUrl(logoPreview) || logoPreview)} alt="Logo preview" className="h-12 w-12 object-contain bg-white rounded border border-gray-100" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-700 truncate">{newProgram.logoFileName || "Image link"}</p>
                      <button
                        type="button"
                        className="text-xs text-rose-600 hover:text-rose-700 mt-1"
                        onClick={() => {
                          setNewProgram((prev) => ({ ...prev, logoUrl: "", logoFileName: "" }));
                          if (logoInputRef.current) logoInputRef.current.value = "";
                        }}
                      >
                        Remove logo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <ImageIcon size={14} />
                    Upload an image or paste a link.
                  </div>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                  onChange={handleLogoFileChange}
                />
                <input
                  type="url"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  placeholder="Or paste an image link (https://...)"
                  value={newProgram.logoFileName ? "" : (logoPreview.startsWith("data:") ? "" : logoPreview)}
                  onChange={(e) => {
                    if (logoInputRef.current) logoInputRef.current.value = "";
                    setNewProgram((prev) => ({ ...prev, logoUrl: e.target.value, logoFileName: "" }));
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Country</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <select
                    required
                    className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none bg-white"
                    value={newProgram.country}
                    onChange={(e) => setNewProgram((prev) => ({ ...prev, country: e.target.value }))}
                    disabled={countryOptions.length === 0}
                  >
                    <option value="">{countryOptions.length === 0 ? "Loading countries..." : "Select country"}</option>
                    {countryOptions.map((country) => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </div>
                {countriesError ? <p className="text-xs text-rose-600">{countriesError}</p> : null}
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">University page link</label>
                <input
                  type="url"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  placeholder="https://university.edu"
                  value={newProgram.pageLink}
                  onChange={(e) => setNewProgram((prev) => ({ ...prev, pageLink: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">University course link</label>
                <input
                  type="url"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  placeholder="https://university.edu/courses"
                  value={newProgram.courseLink}
                  onChange={(e) => setNewProgram((prev) => ({ ...prev, courseLink: e.target.value }))}
                />
                <p className="text-[11px] text-slate-500">Provide at least one of the two links. Both are allowed.</p>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <Button type="button" variant="secondary" onClick={closeAddUniversityModal} disabled={isSavingProgram}>Close</Button>
                <Button type="submit" isLoading={isSavingProgram} disabled={countryOptions.length === 0}>Create Program</Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isImportModalOpen && canManagePrograms && (
        <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-hidden my-auto flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-slate-50 flex-shrink-0">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Import universities</h3>
                <p className="text-xs text-slate-500 mt-1">Upload an Excel or CSV file. Name, logo link, and country are required, plus a page link, a course link, or both.</p>
              </div>
              <button type="button" onClick={closeImportModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => downloadUniversitySample("xlsx", sampleCountry)}>
                  <Download size={14} className="mr-2" />
                  Download Excel sample
                </Button>
                <Button type="button" variant="secondary" onClick={() => downloadUniversitySample("csv", sampleCountry)}>
                  <Download size={14} className="mr-2" />
                  Download CSV sample
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                Columns: University name, Logo link, Country, University page link, University course link. Country must match a name from the country list. The sample uses {sampleCountry}.
              </p>
              {countriesError ? <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{countriesError}</div> : null}
              {importError ? <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{importError}</div> : null}
              <input
                ref={importInputRef}
                type="file"
                accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                onChange={handleImportFileChange}
                disabled={importParseLoading || importSaving}
              />
              {importParseLoading ? <InlineLoading label="Reading spreadsheet..." /> : null}
              {importFileName ? <p className="text-xs text-slate-600">File: {importFileName}</p> : null}
              {importRows.length > 0 ? (
                <>
                  <p className="text-xs text-slate-600">
                    {readyImportRows.length} ready, {importRows.length - readyImportRows.length} need a fix. Only ready rows are imported.
                  </p>
                  <div className="border border-gray-200 rounded-lg overflow-auto max-h-80">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase">
                        <tr>
                          <th className="text-left font-semibold px-3 py-2">Row</th>
                          <th className="text-left font-semibold px-3 py-2">University</th>
                          <th className="text-left font-semibold px-3 py-2">Country</th>
                          <th className="text-left font-semibold px-3 py-2">Links</th>
                          <th className="text-left font-semibold px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((row) => (
                          <tr key={`${row.rowNumber}-${row.university}`} className="border-t border-gray-100 align-top">
                            <td className="px-3 py-2 text-slate-500">{row.rowNumber}</td>
                            <td className="px-3 py-2 text-slate-800">{row.university || "—"}</td>
                            <td className="px-3 py-2 text-slate-700">{row.country || "—"}</td>
                            <td className="px-3 py-2 text-slate-600">
                              {[row.pageLink ? "Page" : "", row.courseLink ? "Course" : ""].filter(Boolean).join(", ") || "—"}
                            </td>
                            <td className={`px-3 py-2 ${row.error ? "text-rose-600" : "text-emerald-700"}`}>{row.error || "Ready"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
              <Button type="button" variant="secondary" onClick={closeImportModal} disabled={importSaving}>Close</Button>
              <Button type="button" onClick={handleImportPrograms} isLoading={importSaving} disabled={!readyImportRows.length || importParseLoading}>
                {readyImportRows.length === 1 ? "Import 1 university" : `Import ${readyImportRows.length || ""} universities`.replace("  ", " ")}
              </Button>
            </div>
          </div>
        </div>
      )}
      {isApplyModalOpen && selectedProgram && (
        <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-100 scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-hidden my-auto flex flex-col">
            <div className={`p-6 text-white flex-shrink-0 ${applyStep === "success" ? "bg-emerald-600" : "bg-[#0F172A]"}`}>
              <h3 className="font-bold text-lg flex items-center gap-2">
                {applyStep === "success" ? <CheckCircle /> : <GraduationCap />}
                {applyStep === "success" ? "Application Drafted!" : `Apply to ${selectedProgram.university}`}
              </h3>
              <p className="text-white/80 text-xs mt-1">
                {applyStep === "success"
                  ? "The student data has been synced to the portal."
                  : `Program: ${selectedProgram.programName || selectedProgram.university}${selectedProgram.intake ? ` (${selectedProgram.intake})` : selectedProgram.country ? ` (${selectedProgram.country})` : ""}`}
              </p>
            </div>
            <div className="p-6 flex-1 min-h-0 overflow-y-auto">
              {applyStep === "select" && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">Select a student to auto-fill the application form from the CRM database.</p>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Select Student</label>
                    <select
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                    >
                      <option value="" disabled>Choose a student...</option>
                      {students.filter((s) => s.country === selectedProgram.country).map((s) => (
                        <option key={s.id} value={s.id}>{s.name} (ID: {s.id})</option>
                      ))}
                      {students.filter((s) => s.country !== selectedProgram.country).map((s) => (
                        <option key={s.id} value={s.id} disabled>{s.name} (Different Country: {s.country})</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400">* Only students targeting {selectedProgram.country} are selectable.</p>
                  </div>
                  <div className="pt-4 flex justify-end gap-3">
                    <Button variant="ghost" onClick={closeApplyModal}>Cancel</Button>
                    <Button disabled={!selectedStudentId} onClick={handleConfirmApply}>Start Auto-Fill</Button>
                  </div>
                </div>
              )}
              {applyStep === "processing" && (
                <div className="py-8 text-center space-y-4">
                  <Loader2 size={40} className="mx-auto text-indigo-600 animate-spin" />
                  <div>
                    <h4 className="font-bold text-slate-900">Syncing Student Data...</h4>
                    <p className="text-sm text-slate-500 mt-1">Mapping Transcripts, SOP, and Passport details.</p>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 max-w-xs mx-auto overflow-hidden">
                    <div className="h-full bg-indigo-600 rounded-full animate-progress origin-left w-full" />
                  </div>
                </div>
              )}
              {applyStep === "success" && (
                <div className="text-center space-y-4">
                  <div className="bg-emerald-50 text-emerald-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Sparkles size={32} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg">Ready for Review</h4>
                    <p className="text-sm text-slate-500 max-w-xs mx-auto">
                      Application ID <strong>#APP-8675</strong> has been created. Please review the final draft in the student's "Uni Applications" tab.
                    </p>
                  </div>
                  <div className="pt-4">
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 border-none" onClick={closeApplyModal}>Done</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export {
  UniversityKnowledgeBase
};
