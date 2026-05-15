import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import React from "react";
import { Dashboard } from "./Dashboard";
import { ActivityFeed } from "./ActivityFeed";
import {
  Sparkles,
  Send,
  AlertCircle,
  Users,
  MapPin,
  ClipboardList,
  AlertTriangle,
  ShieldCheck,
  Trash2,
  Maximize2,
  Minimize2,
  Stamp,
  ChevronRight,
  User,
  FileText,
} from "lucide-react";
import { askAdminAi, getAdminAiStatus, getAdminAiChats, saveAdminAiChats, clearAdminAiChats, getCountries, getBranches } from "../authApi";
import { DEFAULT_USER_AVATAR } from "../apiConfig";
import { normalizePipelineStatus, countOpenSlaRequirementViolations } from "../pipeline";
import { buildUniversityOfferLetterRows, offerStatusBadgeClass } from "../utils/universityOfferLetters";
import { Button } from "./Button";

const SUGGESTED_PROMPTS = [
  "Which branch is underperforming this month?",
  "Summarize today's overdue tasks and who owns them.",
  "List students with unresolved SLA violations.",
  "How is our pipeline distributed by stage?",
];

function renderInlineRichText(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return /* @__PURE__ */ jsx("strong", { children: part.slice(2, -2) }, i);
    }
    return /* @__PURE__ */ jsx(Fragment, { children: part }, i);
  });
}

function renderAssistantMarkdown(text) {
  const safe = String(text || "").trim();
  if (!safe) return null;
  const blocks = safe.split(/\n{2,}/);
  return blocks.map((block, idx) => {
    const lines = block.split(/\n/).filter((l) => l.trim().length > 0);
    const isBulletList = lines.length > 0 && lines.every((l) => /^\s*[-*]\s+/.test(l));
    const isNumberedList = lines.length > 0 && lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
    if (isBulletList) {
      return /* @__PURE__ */ jsx(
        "ul",
        {
          className: "list-disc list-inside space-y-1",
          children: lines.map((line, li) =>
            /* @__PURE__ */ jsx(
              "li",
              { children: renderInlineRichText(line.replace(/^\s*[-*]\s+/, "")) },
              li
            )
          ),
        },
        idx
      );
    }
    if (isNumberedList) {
      return /* @__PURE__ */ jsx(
        "ol",
        {
          className: "list-decimal list-inside space-y-1",
          children: lines.map((line, li) =>
            /* @__PURE__ */ jsx(
              "li",
              { children: renderInlineRichText(line.replace(/^\s*\d+[.)]\s+/, "")) },
              li
            )
          ),
        },
        idx
      );
    }
    const inline = lines.map((line, li) =>
      /* @__PURE__ */ jsxs(Fragment, { children: [renderInlineRichText(line), li < lines.length - 1 && /* @__PURE__ */ jsx("br", {})] }, li)
    );
    return /* @__PURE__ */ jsx("p", { children: inline }, idx);
  });
}

function toTitleCase(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deriveDisplayName(currentUser) {
  const fromName = toTitleCase(currentUser?.name);
  if (fromName) return fromName;
  const fromUsername = toTitleCase(currentUser?.username);
  if (fromUsername) return fromUsername;
  const email = String(currentUser?.email || "").trim();
  if (email) {
    const local = email.split("@")[0] || "";
    const cleaned = local.split(/[._-]/).filter(Boolean).join(" ");
    const titled = toTitleCase(cleaned);
    if (titled) return titled;
  }
  return "Admin";
}

const AdminDashboard = ({
  activities,
  tasks,
  students,
  invoices = [],
  employees = [],
  currentUser = null,
  onSelectStudent,
  studentsScopeLabel = null,
}) => {
  const [destinationCountries, setDestinationCountries] = React.useState([]);
  const [branchLocations, setBranchLocations] = React.useState([]);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [countriesRes, branchesRes] = await Promise.all([getCountries(), getBranches()]);
      if (cancelled) return;
      if (countriesRes.ok && Array.isArray(countriesRes.data)) setDestinationCountries(countriesRes.data);
      if (branchesRes.ok && Array.isArray(branchesRes.data)) {
        setBranchLocations(
          branchesRes.data
            .map((branch) => String(branch?.location || "").trim())
            .filter(Boolean)
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const displayName = deriveDisplayName(currentUser);
  const adminEmail = String(currentUser?.email || "").trim().toLowerCase();
  const userAvatar = String(currentUser?.avatar || "").trim() || DEFAULT_USER_AVATAR;
  const overdueTasks = tasks.filter((t) => t.status === "Overdue").length;
  const totalUnresolvedViolations = students.reduce((acc, s) => acc + countOpenSlaRequirementViolations(s), 0);
  const totalStudents = students.length;
  const branchesCount = React.useMemo(
    () =>
      new Set(
        students
          .map((s) => String(s?.branch || "").trim())
          .filter(Boolean)
      ).size,
    [students]
  );
  const openTasks = tasks.filter((t) => {
    const s = String(t?.status || "");
    return s !== "Completed" && s !== "Done";
  }).length;
  const todayLabel = React.useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    []
  );
  const visaOutcomeStudents = React.useMemo(() => {
    const list = Array.isArray(students) ? students : [];
    return list
      .filter((s) => {
        const stage = normalizePipelineStatus(s?.status);
        return stage === "Visa" || stage === "Enrolled";
      })
      .slice()
      .sort((a, b) =>
        String(a?.name || a?.id || "").localeCompare(String(b?.name || b?.id || ""), undefined, { sensitivity: "base" })
      );
  }, [students]);

  const adminOfferLetterRows = React.useMemo(
    () => buildUniversityOfferLetterRows(Array.isArray(students) ? students : [], employees),
    [students, employees]
  );

  const [messages, setMessages] = React.useState([]);
  const [inputValue, setInputValue] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [typewriter, setTypewriter] = React.useState(null);
  const [aiEnabled, setAiEnabled] = React.useState(true);
  const [aiDisabledReason, setAiDisabledReason] = React.useState("");
  const [chatsLoaded, setChatsLoaded] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const messagesEndRef = React.useRef(null);
  const messagesRef = React.useRef([]);

  React.useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (e) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [isFullscreen]);

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const persistAdminChats = React.useCallback(() => {
    if (!adminEmail) return;
    const list = messagesRef.current
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ id: m.id, role: m.role, content: m.content }));
    saveAdminAiChats(adminEmail, list).catch(() => {});
  }, [adminEmail]);

  React.useEffect(() => {
    if (!adminEmail) {
      setChatsLoaded(true);
      return;
    }
    let cancelled = false;
    setChatsLoaded(false);
    (async () => {
      const result = await getAdminAiChats(adminEmail);
      if (cancelled) return;
      if (result.ok && Array.isArray(result.data)) {
        setMessages(
          result.data.map((m) => ({
            id: String(m.id || `h-${Math.random().toString(36).slice(2)}`),
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content || ""),
            fromHistory: true,
          }))
        );
      } else {
        setMessages([]);
      }
      setChatsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [adminEmail]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await getAdminAiStatus();
      if (cancelled) return;
      if (!status.ok || !status.enabled) {
        setAiEnabled(false);
        setAiDisabledReason(
          status.error || "AI assistant is disabled. Add OPENAI_API_KEY to backend/.env and restart the server."
        );
      } else {
        setAiEnabled(true);
        setAiDisabledReason("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, isTyping, typewriter]);

  React.useEffect(() => {
    if (!typewriter) return;
    const { id, full, pos } = typewriter;
    if (pos >= full.length) {
      setTypewriter(null);
      return;
    }
    const step = 2;
    const t = setTimeout(() => {
      const next = Math.min(pos + step, full.length);
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, content: full.slice(0, next), fromHistory: false } : m))
      );
      if (next >= full.length) {
        setTypewriter(null);
        setTimeout(() => persistAdminChats(), 0);
      } else {
        setTypewriter({ id, full, pos: next });
      }
    }, 14);
    return () => clearTimeout(t);
  }, [typewriter, persistAdminChats]);

  const isAiBusy = isTyping || typewriter !== null;

  const sendMessage = async (rawText) => {
    const text = String(rawText || "").trim();
    if (!text || isAiBusy) return;
    if (!aiEnabled) return;
    const userMsg = { id: `u-${Date.now()}`, role: "user", content: text, fromHistory: false };
    const priorHistory = messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));
    const history = [...priorHistory, { role: "user", content: text }];

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    const result = await askAdminAi(text, history);
    setIsTyping(false);
    if (result.ok) {
      const id = `a-${Date.now()}`;
      const reply = String(result.reply || "");
      setMessages((prev) => [...prev, { id, role: "assistant", content: "", fromHistory: false }]);
      setTypewriter({ id, full: reply, pos: 0 });
    } else {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "error", content: result.error || "AI assistant failed to respond." },
      ]);
    }
  };

  const handleSendQuery = () => {
    sendMessage(inputValue);
  };

  const handleSuggestion = (text) => {
    if (!aiEnabled || isAiBusy) return;
    sendMessage(text);
  };

  const handleDeleteChatHistory = async () => {
    if (!adminEmail) return;
    if (!window.confirm("Clear the chat for this admin account? This cannot be undone.")) return;
    const result = await clearAdminAiChats(adminEmail);
    if (result.ok) {
      setMessages([]);
      setTypewriter(null);
    } else {
      window.alert(result.error || "Could not delete chat history.");
    }
  };

  const renderInitialAssistantBubble = () =>
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ jsx(Sparkles, { size: 14, className: "text-indigo-600" }) }),
      /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-lg p-3 text-sm text-slate-700 shadow-sm max-w-[85%] leading-relaxed", children: [
        "Hi ",
        /* @__PURE__ */ jsx("strong", { children: displayName }),
        " \u{1F44B} I'm your AI data assistant. Ask me anything about students, branches, tasks, SLA, conversions, or activities \u2014 I'll answer using live data from the system.",
      ] }),
    ] });

  const renderUserBubble = (m) =>
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3 flex-row-reverse", children: [
      /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-gray-200", children: /* @__PURE__ */ jsx(
        "img",
        {
          src: userAvatar,
          alt: displayName,
          className: "w-full h-full object-cover",
          referrerPolicy: "no-referrer",
        }
      ) }),
      /* @__PURE__ */ jsx("div", { className: "bg-indigo-600 text-white rounded-lg p-3 text-sm shadow-sm max-w-[80%] whitespace-pre-wrap", children: m.content }),
    ] });

  const renderAssistantBubble = (m) =>
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ jsx(Sparkles, { size: 14, className: "text-indigo-600" }) }),
      /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-lg p-3 text-sm text-slate-700 shadow-sm max-w-[85%] space-y-2 leading-relaxed", children: [
        m.content ? renderAssistantMarkdown(m.content) : null,
        typewriter && m.id === typewriter.id
          ? /* @__PURE__ */ jsx("span", { className: "inline-block w-0.5 h-3 ml-0.5 align-middle bg-indigo-500 animate-pulse", "aria-hidden": true })
          : null,
      ] }),
    ] });

  const renderErrorBubble = (m) =>
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ jsx(AlertCircle, { size: 14, className: "text-rose-600" }) }),
      /* @__PURE__ */ jsx("div", { className: "bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700 shadow-sm max-w-[85%]", children: m.content }),
    ] });

  const renderChatPanel = (fullscreen) =>
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: fullscreen
          ? "bg-white flex flex-col w-full h-full relative overflow-hidden group p-6"
          : "bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col h-[560px] relative overflow-hidden group",
        children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3", children: [
            /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(Sparkles, { size: 18, className: "text-indigo-600" }),
              "AI Integrated Data Discussion",
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 justify-end", children: [
              adminEmail && /* @__PURE__ */ jsxs(
                "button",
                {
                  type: "button",
                  onClick: handleDeleteChatHistory,
                  disabled: isAiBusy || !chatsLoaded,
                  className:
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  children: [
                    /* @__PURE__ */ jsx(Trash2, { size: 12, className: "flex-shrink-0" }),
                    "Clear chat",
                  ],
                }
              ),
              /* @__PURE__ */ jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => setIsFullscreen((v) => !v),
                  title: fullscreen ? "Exit full window (Esc)" : "Full Window",
                  "aria-label": fullscreen ? "Exit full window" : "Full Window",
                  className:
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-colors",
                  children: [
                    fullscreen
                      ? /* @__PURE__ */ jsx(Minimize2, { size: 12, className: "flex-shrink-0" })
                      : /* @__PURE__ */ jsx(Maximize2, { size: 12, className: "flex-shrink-0" }),
                    fullscreen ? "Exit Full Window" : "Full Window",
                  ],
                }
              ),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-full shadow-sm opacity-80 group-hover:opacity-100 transition-opacity w-fit", children: [
                /* @__PURE__ */ jsxs("span", { className: "relative inline-flex h-2 w-2 items-center justify-center", children: [
                  /* @__PURE__ */ jsx("span", { className: "absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" }),
                  /* @__PURE__ */ jsx("span", { className: "relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" }),
                ] }),
                /* @__PURE__ */ jsx("span", { className: "text-[10px] font-semibold text-slate-500 tracking-tight whitespace-nowrap animate-pulse", children: "Live" }),
              ] }),
            ] }),
          ] }),
          !aiEnabled && /* @__PURE__ */ jsxs("div", { className: "mb-3 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800", children: [
            /* @__PURE__ */ jsx(AlertCircle, { size: 14, className: "mt-0.5 flex-shrink-0" }),
            /* @__PURE__ */ jsx("span", { children: aiDisabledReason }),
          ] }),
          /* @__PURE__ */ jsxs(
            "div",
            {
              className: fullscreen
                ? "flex-1 overflow-y-auto bg-slate-50/50 rounded-lg p-6 mb-4 border border-slate-100 flex flex-col gap-4 w-full"
                : "flex-1 overflow-y-auto bg-slate-50/50 rounded-lg p-4 mb-4 border border-slate-100 flex flex-col gap-4",
              children: [
                renderInitialAssistantBubble(),
                messages.map((m) => {
                  if (m.role === "user") {
                    return /* @__PURE__ */ jsx(Fragment, { children: renderUserBubble(m) }, m.id);
                  }
                  if (m.role === "assistant") {
                    return /* @__PURE__ */ jsx(Fragment, { children: renderAssistantBubble(m) }, m.id);
                  }
                  if (m.role === "error") {
                    return /* @__PURE__ */ jsx(Fragment, { children: renderErrorBubble(m) }, m.id);
                  }
                  return null;
                }),
                isTyping && !typewriter && /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
                  /* @__PURE__ */ jsx("div", { className: "w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ jsx(Sparkles, { size: 14, className: "text-indigo-600" }) }),
                  /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-lg p-3 text-sm text-slate-700 shadow-sm flex items-center gap-1", children: [
                    /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" }),
                    /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" }),
                    /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" }),
                  ] }),
                ] }),
                /* @__PURE__ */ jsx("div", { ref: messagesEndRef }),
              ],
            }
          ),
          messages.length === 0 && aiEnabled && chatsLoaded && /* @__PURE__ */ jsx(
            "div",
            {
              className: fullscreen
                ? "flex flex-wrap gap-2 mb-3 w-full"
                : "flex flex-wrap gap-2 mb-3",
              children: SUGGESTED_PROMPTS.map((p) =>
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => handleSuggestion(p),
                    disabled: isAiBusy,
                    className:
                      "text-[11px] px-2.5 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                    children: p,
                  },
                  p
                )
              ),
            }
          ),
          /* @__PURE__ */ jsxs(
            "div",
            {
              className: fullscreen
                ? "relative mt-auto w-full"
                : "relative mt-auto",
              children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: inputValue,
                    onChange: (e) => setInputValue(e.target.value),
                    onKeyDown: (e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendQuery();
                      }
                    },
                    placeholder: aiEnabled ? "Ask AI Assist about your data..." : "AI assistant is offline.",
                    disabled: !aiEnabled || isAiBusy,
                    className:
                      "w-full pl-4 pr-12 py-3 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed",
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: handleSendQuery,
                    disabled: !aiEnabled || isAiBusy || !inputValue.trim(),
                    className:
                      "absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed",
                    children: /* @__PURE__ */ jsx(Send, { size: 16 }),
                  }
                ),
              ],
            }
          ),
        ],
      }
    );

  return /* @__PURE__ */ jsxs("div", { className: "space-y-8 animate-in fade-in duration-500", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-5 pb-2", children: [
      /* @__PURE__ */ jsx("div", { className: "w-16 h-16 rounded-full p-[0.15px] bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#334155] shadow-md flex-shrink-0", children: /* @__PURE__ */ jsx(
        "img",
        {
          src: userAvatar,
          alt: displayName,
          className: "w-full h-full object-cover rounded-full bg-white",
          referrerPolicy: "no-referrer",
        }
      ) }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col justify-center", children: [
        /* @__PURE__ */ jsxs("h1", { className: "text-3xl font-bold text-slate-900 tracking-tight", children: ["Welcome Back \u{1F44B} ", displayName] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500 font-medium", children: [
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx("span", { className: "w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" }),
            todayLabel,
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx(Users, { size: 14, className: "text-slate-400" }),
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("strong", { className: "text-slate-700", children: totalStudents }),
              " student",
              totalStudents === 1 ? "" : "s",
            ] }),
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx(MapPin, { size: 14, className: "text-slate-400" }),
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("strong", { className: "text-slate-700", children: branchesCount }),
              branchesCount === 1 ? " branch" : " branches",
            ] }),
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx(ClipboardList, { size: 14, className: "text-slate-400" }),
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("strong", { className: "text-slate-700", children: openTasks }),
              " open task",
              openTasks === 1 ? "" : "s",
              overdueTasks > 0 && /* @__PURE__ */ jsxs("span", { className: "text-rose-600", children: [
                " (",
                overdueTasks,
                " overdue)",
              ] }),
            ] }),
          ] }),
          totalUnresolvedViolations > 0
            ? /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-rose-600", children: [
                /* @__PURE__ */ jsx(AlertTriangle, { size: 14 }),
                /* @__PURE__ */ jsxs("span", { children: [
                  /* @__PURE__ */ jsx("strong", { children: totalUnresolvedViolations }),
                  " SLA alert",
                  totalUnresolvedViolations === 1 ? "" : "s",
                ] }),
              ] })
            : /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-emerald-600", children: [
                /* @__PURE__ */ jsx(ShieldCheck, { size: 14 }),
                "SLA clean",
              ] }),
        ] }),
      ] }),
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 space-y-8", children: [
        renderChatPanel(false),
        /* @__PURE__ */ jsx(Dashboard, { students, invoices, destinationCountries, branchLocations }),
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-8 w-full min-w-0 self-start flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col w-full", children: [
          /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 mb-4", children: "Global Audit Log" }),
          /* @__PURE__ */ jsx("div", { className: "overflow-y-auto max-h-[600px] pr-2", children: /* @__PURE__ */ jsx(ActivityFeed, { activities, metaTimestampOnly: true }) }),
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col w-full", children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-4", children: [
            /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900", children: "Visa outcomes" }),
            /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
              "Students at ",
              /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-600", children: "Visa" }),
              " or ",
              /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-600", children: "Enrolled" }),
              " across all branches (",
              visaOutcomeStudents.length,
              ").",
            ] }),
          ] }),
          visaOutcomeStudents.length === 0
            ? /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-400 text-center py-6", children: "No students at Visa or Enrolled yet." })
            : /* @__PURE__ */ jsx("div", { className: "overflow-y-auto max-h-[480px] pr-1 -mr-1", children: /* @__PURE__ */ jsx("ul", { className: "space-y-2", children: visaOutcomeStudents.map((s) => {
              const canonical = normalizePipelineStatus(s?.status);
              const raw = String(s?.status || "").trim() || canonical;
              const interactive = typeof onSelectStudent === "function";
              const rowKey = String(s?.id || "").trim() || `visa-row-${raw}-${String(s?.name || "").slice(0, 48)}`;
              return /* @__PURE__ */ jsx("li", {
                key: rowKey,
                children: /* @__PURE__ */ jsxs("button", {
                  type: "button",
                  disabled: !interactive,
                  onClick: interactive ? () => onSelectStudent(s) : void 0,
                  className: interactive
                    ? "w-full text-left flex items-start gap-3 p-3 rounded-lg border border-transparent hover:border-gray-200 hover:bg-slate-50 transition-colors group"
                    : "w-full text-left flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-slate-50/50",
                  children: [
                    /* @__PURE__ */ jsx("div", { className: "w-9 h-9 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5", children: /* @__PURE__ */ jsx(Stamp, { size: 16, className: "text-emerald-700" }) }),
                    /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
                      /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-900 truncate", children: s?.name || s?.id || "Student" }),
                      /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5", children: [
                        s?.branch ? /* @__PURE__ */ jsxs("span", { children: [/* @__PURE__ */ jsx(MapPin, { size: 11, className: "inline mr-0.5 -mt-0.5 text-slate-400" }), s.branch] }) : null,
                        s?.country ? /* @__PURE__ */ jsx("span", { children: s.country }) : null,
                        s?.counselorName ? /* @__PURE__ */ jsxs("span", { className: "text-slate-400", children: ["• ", s.counselorName] }) : null,
                      ] }),
                      /* @__PURE__ */ jsx("span", { className: "inline-block mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded", children: raw }),
                    ] }),
                    interactive ? /* @__PURE__ */ jsx(ChevronRight, { size: 16, className: "text-slate-300 group-hover:text-indigo-500 flex-shrink-0 mt-1 transition-colors" }) : null,
                  ],
                }),
              });
            }) }) }),
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col w-full", children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-4", children: [
            /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(FileText, { size: 18, className: "text-indigo-600" }),
              "Offer letters",
            ] }),
            studentsScopeLabel
              ? /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
                  "University offer letters for students in ",
                  /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-600", children: studentsScopeLabel }),
                  " (",
                  adminOfferLetterRows.length,
                  ").",
                ] })
              : /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
                  "Approved, conditional, and rejected letters across all branches (",
                  adminOfferLetterRows.length,
                  ").",
                ] }),
          ] }),
          adminOfferLetterRows.length === 0
            ? /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-400 text-center py-6", children: "No offer letters uploaded yet." })
            : /* @__PURE__ */ jsx("div", { className: "overflow-y-auto max-h-[480px] pr-1 -mr-1 space-y-2", children: adminOfferLetterRows.map((row) =>
                /* @__PURE__ */ jsxs(
                  "div",
                  {
                    key: row.key,
                    className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-slate-50 border border-slate-100 rounded-lg",
                    children: [
                      /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1 space-y-0.5", children: [
                        /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-slate-900", children: row.studentName }),
                        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-600", children: row.counselorLabel }),
                      ] }),
                      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 shrink-0", children: [
                        /* @__PURE__ */ jsx("span", {
                          className: `px-2 py-0.5 rounded-full text-[10px] font-bold border ${offerStatusBadgeClass(row.offerStatus)}`,
                          children: row.offerStatus,
                        }),
                        typeof onSelectStudent === "function" &&
                          /* @__PURE__ */ jsx(Button, {
                            type: "button",
                            size: "sm",
                            variant: "outline",
                            className: "h-8 w-8 min-w-[2rem] p-0 shrink-0",
                            title: "Student profile",
                            "aria-label": `Open student profile for ${row.studentName}`,
                            onClick: () => onSelectStudent(row.student, { profileTab: "pipeline" }),
                            children: /* @__PURE__ */ jsx(User, { size: 16, "aria-hidden": true }),
                          }),
                      ] }),
                    ],
                  }
                )
              ) }),
        ] }),
      ] }),
    ] }),
    isFullscreen && /* @__PURE__ */ jsx(
      "div",
      {
        className:
          "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-200",
        onClick: (e) => {
          if (e.target === e.currentTarget) setIsFullscreen(false);
        },
        children: /* @__PURE__ */ jsx(
          "div",
          {
            className:
              "bg-white w-full h-full sm:h-[90vh] sm:max-h-[900px] max-w-5xl sm:rounded-xl shadow-2xl overflow-hidden flex flex-col",
            children: renderChatPanel(true),
          }
        ),
      }
    ),
  ] });
};
export {
  AdminDashboard,
};
