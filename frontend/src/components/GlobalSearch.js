import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, User } from "lucide-react";
import { searchStudents } from "../authApi";
import { normalizePipelineStatus } from "../pipeline";

const SEARCH_DEBOUNCE_MS = 350;
const RESULT_LIMIT = 8;

function buildSearchParams(scope, query) {
  const params = {
    q: query,
    summary: true,
    sortBy: "name",
    sortDirection: "asc",
    limit: RESULT_LIMIT,
  };
  if (scope?.role) params.role = scope.role;
  if (scope?.userId) params.userId = scope.userId;
  if (scope?.branch) params.branch = scope.branch;
  if (scope?.userCountry) params.userCountry = scope.userCountry;
  return params;
}

export function GlobalSearch({ searchScope = {}, onSelectStudent, className = "" }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const isModK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isModK) return;
      event.preventDefault();
      inputRef.current?.focus();
      setOpen(true);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event) => {
      const panel = panelRef.current;
      if (panel && !panel.contains(event.target)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  const runSearch = useCallback(async (q) => {
    if (!q) {
      setResults([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    const id = ++fetchIdRef.current;
    setLoading(true);
    const result = await searchStudents(buildSearchParams(searchScope, q));
    if (id !== fetchIdRef.current) return;
    setLoading(false);
    if (result.ok) {
      setResults(result.data || []);
      setTotal(result.total || (result.data || []).length);
    } else {
      setResults([]);
      setTotal(0);
    }
  }, [searchScope]);

  useEffect(() => {
    runSearch(debouncedQuery);
  }, [debouncedQuery, runSearch]);

  const showDropdown = open && (loading || debouncedQuery.length > 0);

  const selectStudent = useCallback((student) => {
    if (!student) return;
    onSelectStudent?.(student);
    setQuery("");
    setDebouncedQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  }, [onSelectStudent]);

  const resultMeta = useMemo(() => {
    if (!debouncedQuery) return "";
    if (loading) return "Searching…";
    if (total === 0) return "No students found";
    if (total > results.length) return `${total} matches — showing ${results.length}`;
    return `${total} match${total === 1 ? "" : "es"}`;
  }, [debouncedQuery, loading, total, results.length]);

  const handleInputKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectStudent(results[activeIndex]);
    }
  };

  return (
    <div ref={panelRef} className={`relative ${className}`}>
      <Search className="absolute left-2.5 top-2.5 text-gray-400 pointer-events-none" size={16} />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleInputKeyDown}
        placeholder="Search students…"
        aria-label="Search students"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        className="pl-9 pr-4 py-1.5 w-64 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white transition-all placeholder:text-gray-400"
      />
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] bg-white border border-gray-200 rounded-xl shadow-2xl z-[140] overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Students</p>
            <p className="text-[11px] text-slate-500">{resultMeta}</p>
          </div>
          {!debouncedQuery ? (
            <div className="px-4 py-6 text-sm text-slate-400 text-center">
              Search by name, email, ID, or country.
            </div>
          ) : loading ? (
            <div className="px-4 py-6 flex items-center justify-center text-slate-400">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400 text-center">
              No students match &ldquo;{debouncedQuery}&rdquo;.
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1" role="listbox">
              {results.map((student, index) => {
                const stage = normalizePipelineStatus(student.status);
                const subtitle = [student.email, student.country].filter(Boolean).join(" · ");
                const isActive = index === activeIndex;
                return (
                  <li key={student.id} role="option" aria-selected={isActive}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectStudent(student)}
                      className={`w-full px-3 py-2.5 flex items-start gap-3 text-left transition-colors ${
                        isActive ? "bg-slate-100" : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <User size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900 truncate">
                          {student.name || "Unnamed student"}
                        </span>
                        {subtitle ? (
                          <span className="block text-xs text-slate-500 truncate mt-0.5">{subtitle}</span>
                        ) : null}
                      </span>
                      <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 mt-0.5">
                        {stage}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
