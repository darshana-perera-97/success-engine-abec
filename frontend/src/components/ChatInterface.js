import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from "react";
import { Send, Paperclip, Search, Check, CheckCheck, Eye, Lock, MessageCircle } from "lucide-react";
import { getAccounts, getChats, getWhatsappStatus } from "../authApi";
import { buildCounselorTeamEntriesWithFallback } from "../studentContactHelpers";
import { Button } from "./Button";
import { isCounselorEquivalentPortalRole, canSendStaffStudentMessages, isStudentMessagingStaffRole } from "../roles";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "../uploadLimits";
import { POLL_MS, SLA_CLOCK_INTERVAL_MS } from "../runtimeConfig";
const ChatInterface = ({ currentRole, currentUser, messages, onSendMessage, students = [], employees = [], initialChatPeerId = null, adminChatEnabled = false, branchWhatsappEnabled = false }) => {
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [inputText, setInputText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isWaitingForReply, setIsWaitingForReply] = useState(false);
  const [liveMessages, setLiveMessages] = useState(messages || []);
  const [accountNameById, setAccountNameById] = useState({});
  const [isChatsLoading, setIsChatsLoading] = useState(true);
  const [whatsappSyncStatus, setWhatsappSyncStatus] = useState("disconnected");
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const textInputRef = useRef(null);
  const lastSignatureRef = useRef("");
  const resizeTextInput = () => {
    const el = textInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };
  useEffect(() => {
    setLiveMessages(messages || []);
  }, [messages]);
  useEffect(() => {
    const loadAccountNames = async () => {
      const result = await getAccounts();
      if (!result.ok) return;
      const nextMap = {};
      result.data.forEach((account) => {
        const id = String(account.id || "").trim();
        if (!id) return;
        nextMap[id] = account.username || account.email || id;
      });
      setAccountNameById(nextMap);
    };
    loadAccountNames();
  }, []);
  useEffect(() => {
    let cancelled = false;
    const loadChats = async () => {
      const shouldLoadAll = currentRole === "Manager" || currentRole === "Team Lead" || currentRole === "Admin";
      const result = await getChats(shouldLoadAll ? "" : currentUser?.id);
      if (cancelled) return;
      setIsChatsLoading(false);
      if (!result.ok) return;
      const incoming = result.data || [];
      const signature = `${incoming.length}:${incoming.map((m) => `${m.id}:${m.timestamp}`).join("|")}`;
      if (signature === lastSignatureRef.current) return;
      lastSignatureRef.current = signature;
      setLiveMessages(incoming);
    };
    loadChats();
    const intervalId = setInterval(loadChats, POLL_MS.chats);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentRole, currentUser?.id]);
  const getConversations = () => {
    if (currentRole === "Student") {
      const student = currentUser;
      const roster = buildCounselorTeamEntriesWithFallback(student, employees);
      if (roster.length === 0) return [];
      return roster.map((c) => ({
        id: c.id,
        name: c.badgeLabel ? `${c.name} (${c.badgeLabel})` : c.name,
        avatar: c.avatar || ""
      }));
    } else if (isStudentMessagingStaffRole(currentRole)) {
      // App already passes role-scoped students; avoid re-filtering here.
      return students;
    } else {
      return students || [];
    }
  };
  const conversationList = getConversations().filter(
    (u) => u.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    const lastMsgA = liveMessages.filter((m) => m.senderId === a.id || m.receiverId === a.id).sort((m1, m2) => new Date(m2.timestamp).getTime() - new Date(m1.timestamp).getTime())[0];
    const lastMsgB = liveMessages.filter((m) => m.senderId === b.id || m.receiverId === b.id).sort((m1, m2) => new Date(m2.timestamp).getTime() - new Date(m1.timestamp).getTime())[0];
    if (!lastMsgA) return 1;
    if (!lastMsgB) return -1;
    return new Date(lastMsgB.timestamp).getTime() - new Date(lastMsgA.timestamp).getTime();
  });
  useEffect(() => {
    if (currentRole !== "Student") return;
    const peer = String(initialChatPeerId || "").trim();
    if (!peer) return;
    const roster = buildCounselorTeamEntriesWithFallback(currentUser, employees);
    if (!roster.some((c) => String(c.id || "").trim() === peer)) return;
    setSelectedConversationId(peer);
  }, [initialChatPeerId, currentRole, currentUser, employees]);
  useEffect(() => {
    if (selectedConversationId) return;
    if (!conversationList.length || !liveMessages.length) return;
    if (currentRole !== "Manager" && currentRole !== "Team Lead" && currentRole !== "Admin") return;
    const studentIdsWithMessages = /* @__PURE__ */ new Set(
      liveMessages.flatMap((m) => [String(m.senderId || ""), String(m.receiverId || "")])
    );
    const firstWithMessages = conversationList.find((student) => studentIdsWithMessages.has(String(student.id || "")));
    if (firstWithMessages) {
      setSelectedConversationId(firstWithMessages.id);
    }
  }, [selectedConversationId, conversationList, liveMessages, currentRole]);
  const activeConversationId = selectedConversationId || conversationList[0]?.id;
  const getActiveMessages = () => {
    if (!activeConversationId) return [];
    const otherUserId = activeConversationId;
    const myId = currentUser.id;
    if (currentRole === "Manager" || currentRole === "Team Lead" || currentRole === "Admin") {
      const selectedStudent = students.find((s) => s.id === otherUserId);
      if (!selectedStudent) return [];
      return liveMessages.filter(
        (m) => m.senderId === selectedStudent.id || m.receiverId === selectedStudent.id
      ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else if (isStudentMessagingStaffRole(currentRole)) {
      // Counselors and country coordinators see the full student thread in one window.
      return liveMessages.filter(
        (m) => m.senderId === otherUserId || m.receiverId === otherUserId
      ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else {
      return liveMessages.filter(
        (m) => m.senderId === myId && m.receiverId === otherUserId || m.senderId === otherUserId && m.receiverId === myId
      ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }
  };
  const activeMessages = getActiveMessages();
  const activeUser = conversationList.find((u) => u.id === activeConversationId);
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [activeConversationId, activeMessages.length, isTyping, isWaitingForReply]);
  const canSendAsStaffMessenger = canSendStaffStudentMessages(currentRole, adminChatEnabled, branchWhatsappEnabled);
  const getRelevantCounselorId = () => {
    if (canSendAsStaffMessenger) {
      return String(currentUser?.id || "").trim();
    }
    if (isStudentMessagingStaffRole(currentRole)) {
      return String(currentUser?.id || "").trim();
    }
    if (currentRole === "Student") {
      return String(activeConversationId || currentUser?.counselor || "").trim();
    }
    const selectedStudent = students.find((s) => String(s.id || "") === String(activeConversationId || ""));
    return String(selectedStudent?.counselor || "").trim();
  };
  const relevantCounselorId = getRelevantCounselorId();
  useEffect(() => {
    let stop = false;
    if (!relevantCounselorId) {
      setWhatsappSyncStatus("disconnected");
      return;
    }
    const run = async () => {
      const result = await getWhatsappStatus(relevantCounselorId);
      if (stop) return;
      if (!result.ok) {
        setWhatsappSyncStatus("disconnected");
        return;
      }
      setWhatsappSyncStatus(String(result.data?.status || "disconnected"));
    };
    run();
    const timer = setInterval(run, POLL_MS.whatsapp);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [relevantCounselorId]);
  const whatsappSyncLabel =
    whatsappSyncStatus === "connected" || whatsappSyncStatus === "authenticated"
      ? "WhatsApp Connected"
      : whatsappSyncStatus === "connecting" || whatsappSyncStatus === "awaiting_qr_scan"
        ? "WhatsApp Connecting"
        : "WhatsApp Disconnected";
  const whatsappSyncDotClass =
    whatsappSyncStatus === "connected" || whatsappSyncStatus === "authenticated"
      ? "bg-emerald-500"
      : whatsappSyncStatus === "connecting" || whatsappSyncStatus === "awaiting_qr_scan"
        ? "bg-amber-500"
        : "bg-rose-500";
  const getSenderName = (senderId) => {
    const normalizedSenderId = String(senderId || "").trim();
    if (!normalizedSenderId) return "Unknown";
    if (normalizedSenderId === String(currentUser?.id || "").trim()) {
      return String(currentUser?.name || currentUser?.username || "You");
    }
    if (accountNameById[normalizedSenderId]) {
      return accountNameById[normalizedSenderId];
    }
    const matchedStudent = students.find((s) => String(s.id || "").trim() === normalizedSenderId);
    if (matchedStudent?.name) return matchedStudent.name;
    const matchedEmployee = employees.find((e) => String(e.id || "").trim() === normalizedSenderId);
    if (matchedEmployee?.name) return matchedEmployee.name;
    return normalizedSenderId;
  };
  const getCounselorDisplayName = (counselorId) => {
    const normalizedId = String(counselorId || "").trim();
    if (!normalizedId) return "Unassigned";
    if (accountNameById[normalizedId]) return accountNameById[normalizedId];
    const matchedEmployee = employees.find((e) => String(e.id || "").trim() === normalizedId);
    if (matchedEmployee?.name) return matchedEmployee.name;
    return normalizedId;
  };
  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConversationId) return;
    const text = inputText;
    setInputText("");
    if (textInputRef.current) textInputRef.current.style.height = "auto";
    const result = await onSendMessage(text, activeConversationId);
    if (!result?.ok) {
      setInputText(text);
      requestAnimationFrame(resizeTextInput);
      return;
    }
    if (result.data) {
      setLiveMessages((prev) => {
        if (prev.some((msg) => msg.id === result.data.id)) return prev;
        return [...prev, result.data];
      });
    }
    setIsWaitingForReply(true);
    setTimeout(() => {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setIsWaitingForReply(false);
      }, 3e3);
    }, 1500);
  };
  const handlePickAttachment = () => {
    fileInputRef.current?.click();
  };
  const handleAttachmentChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activeConversationId) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      window.alert(`Attachment must be under ${MAX_UPLOAD_LABEL}.`);
      return;
    }
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve) => {
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
    if (!dataUrl) return;
    const result = await onSendMessage("", activeConversationId, {
      name: file.name,
      mime: file.type || "",
      size: file.size || 0,
      dataUrl
    });
    if (result?.data) {
      setLiveMessages((prev) => {
        if (prev.some((msg) => msg.id === result.data.id)) return prev;
        return [...prev, result.data];
      });
    }
  };
  const isGhostMode =
    (currentRole === "Admin" || currentRole === "Manager" || currentRole === "Team Lead") && !canSendAsStaffMessenger;
  if (!isChatsLoading && conversationList.length === 0) {
    return /* @__PURE__ */ jsx("div", { className: "h-[calc(100vh-140px)] bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center animate-in fade-in duration-500", children: /* @__PURE__ */ jsxs("div", { className: "text-center max-w-md px-6 text-slate-500", children: [
      /* @__PURE__ */ jsx(MessageCircle, { size: 48, className: "mx-auto mb-4 text-slate-300" }),
      /* @__PURE__ */ jsx("p", { className: "font-semibold text-slate-800", children: currentRole === "Student" ? "No counselors to message yet" : "No conversations yet" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm mt-2", children: currentRole === "Student" ? "Your counselor team will appear here once assigned. You can still receive messages when they contact you." : "Students in your scope will appear here. Open a student profile or wait for the first message." })
    ] }) });
  }
  return /* @__PURE__ */ jsxs("div", { className: "h-[calc(100vh-140px)] bg-white border border-gray-200 rounded-xl shadow-sm flex overflow-hidden animate-in fade-in duration-500", children: [
    /* @__PURE__ */ jsxs("div", { className: "w-80 border-r border-gray-200 flex flex-col bg-gray-50/50", children: [
      /* @__PURE__ */ jsxs("div", { className: "p-4 border-b border-gray-200 bg-white", children: [
        /* @__PURE__ */ jsxs("h2", { className: "font-bold text-slate-900 mb-3 flex items-center justify-between", children: [
          /* @__PURE__ */ jsx("span", { children: "Inbox" }),
          isGhostMode && /* @__PURE__ */ jsxs("span", { className: "text-[10px] bg-slate-900 text-white px-2 py-0.5 rounded-full flex items-center gap-1", children: [
            /* @__PURE__ */ jsx(Eye, { size: 10 }),
            " Ghost Mode"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsx(Search, { className: "absolute left-3 top-2.5 text-gray-400", size: 16 }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              placeholder: "Search chats...",
              className: "w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
              value: searchTerm,
              onChange: (e) => setSearchTerm(e.target.value)
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto", children: conversationList.map((user) => {
        const relatedMsgs = liveMessages.filter(
          (m) => m.senderId === user.id || m.receiverId === user.id
        ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const lastMsg = relatedMsgs[0];
        const isSelected = activeConversationId === user.id;
        return /* @__PURE__ */ jsxs(
          "div",
          {
            onClick: () => setSelectedConversationId(user.id),
            className: `p-4 border-b border-gray-100 cursor-pointer transition-colors hover:bg-white outline-none focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent]
                                    ${isSelected ? "bg-white border-l-4 border-l-indigo-600 shadow-sm" : "border-l-4 border-l-transparent text-slate-600"}
                                `,
            children: [
              /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start mb-1", children: [
                /* @__PURE__ */ jsx("span", { className: `font-semibold text-sm ${isSelected ? "text-indigo-900" : "text-slate-900"}`, children: user.name }),
                lastMsg && /* @__PURE__ */ jsx("span", { className: "text-[10px] text-slate-400", children: new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })
              ] }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 truncate h-4", children: lastMsg ? lastMsg.content || lastMsg.attachment?.name || "Attachment" : /* @__PURE__ */ jsx("span", { className: "italic text-slate-400", children: "No messages yet" }) }),
              isGhostMode && "counselor" in user && /* @__PURE__ */ jsxs("div", { className: "mt-2 text-[10px] text-slate-400 flex items-center gap-1", children: [
                /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-500" }),
                "Agent: ",
                getCounselorDisplayName(user.counselor)
              ] })
            ]
          },
          user.id
        );
      }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex-1 flex flex-col bg-white relative", children: [
      /* @__PURE__ */ jsxs("div", { className: "h-16 border-b border-indigo-100 flex items-center justify-between px-6 bg-gradient-to-r from-indigo-50/70 to-white z-10", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold overflow-hidden", children: activeUser && "avatar" in activeUser && activeUser.avatar ? /* @__PURE__ */ jsx("img", { src: activeUser.avatar, alt: activeUser.name, className: "w-full h-full object-cover", referrerPolicy: "no-referrer" }) : (activeUser?.name || "?").charAt(0) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 text-sm", children: activeUser?.name }),
            activeUser && "country" in activeUser ? /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 flex items-center gap-1", children: [
              "Student \u2022 ",
              activeUser.country
            ] }) : /* @__PURE__ */ jsxs("p", { className: "text-xs text-emerald-600 flex items-center gap-1", children: [
              /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" }),
              " Online"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-gray-100", children: [
          /* @__PURE__ */ jsx("div", { className: `w-2 h-2 rounded-full ${whatsappSyncDotClass}` }),
          whatsappSyncLabel
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { ref: messagesContainerRef, className: "flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50", children: [
        isChatsLoading ? /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center justify-center h-full text-slate-400", children: [
          /* @__PURE__ */ jsx(MessageCircle, { size: 48, className: "mb-4 text-slate-300" }),
          /* @__PURE__ */ jsx("p", { children: "Loading chats..." }),
          /* @__PURE__ */ jsx("p", { className: "text-xs", children: "Please wait a moment." })
        ] }) : activeMessages.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center justify-center h-full text-slate-400", children: [
          /* @__PURE__ */ jsx(MessageCircle, { size: 48, className: "mb-4 text-slate-300" }),
          /* @__PURE__ */ jsx("p", { children: "No messages yet." }),
          /* @__PURE__ */ jsx("p", { className: "text-xs", children: "Start the conversation!" })
        ] }) : activeMessages.map((msg) => {
          let isMe = false;
          if (isGhostMode) {
            const selectedStudent = students.find((s) => s.id === activeConversationId);
            const counselorId = String(selectedStudent?.counselor || "");
            isMe = counselorId ? msg.senderId === counselorId : msg.senderId !== activeConversationId;
          } else {
            isMe = msg.senderId === currentUser.id;
          }
          return /* @__PURE__ */ jsx("div", { className: `flex ${isMe ? "justify-end" : "justify-start"}`, children: /* @__PURE__ */ jsxs("div", { className: `max-w-[72%] min-w-[120px] rounded-[10px] px-2.5 pt-1.5 pb-1 shadow-sm relative ${isMe ? "bg-indigo-100 text-slate-900 rounded-tr-[8px] border border-indigo-200/60" : "bg-white text-slate-900 rounded-tl-[8px] border border-slate-200"}`, children: [
            /* @__PURE__ */ jsx("span", { className: `absolute top-2 ${isMe ? "-right-1.5 bg-indigo-100 border-r border-t border-indigo-200/60" : "-left-1.5 bg-white border-l border-t border-slate-200"} h-3 w-3 rotate-45` }),
            /* @__PURE__ */ jsx("p", { className: `text-[10px] font-semibold mb-0.5 ${isMe ? "text-indigo-700" : "text-slate-500"}`, children: getSenderName(msg.senderId) }),
            msg.content ? /* @__PURE__ */ jsx("p", { className: "text-[14px] leading-[1.35] whitespace-pre-wrap break-words pr-12", children: msg.content }) : null,
            msg.attachment ? /* @__PURE__ */ jsxs("div", { className: `${msg.content ? "mt-2" : ""} space-y-2`, children: [
              String(msg.attachment.mime || "").startsWith("image/") ? /* @__PURE__ */ jsx("img", { src: msg.attachment.url, alt: msg.attachment.name || "Image attachment", className: "max-h-64 rounded-xl border border-black/10 object-contain bg-white" }) : null,
              /* @__PURE__ */ jsxs("a", { href: msg.attachment.url, target: "_blank", rel: "noreferrer", className: `inline-flex items-center gap-2 text-xs font-medium px-2.5 py-1.5 rounded-lg ${isMe ? "bg-indigo-50 text-indigo-800" : "bg-slate-100 text-slate-700"}`, children: [
                "\ud83d\udcce ",
                msg.attachment.name || "Attachment"
              ] })
            ] }) : null,
            /* @__PURE__ */ jsxs("div", { className: `absolute bottom-1 right-2 flex items-center gap-1 text-[10px] ${isMe ? "text-indigo-700/80" : "text-slate-400"}`, children: [
              new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              isMe && (msg.read ? /* @__PURE__ */ jsx(CheckCheck, { size: 12, className: "text-[#53BDEB]", title: "Seen" }) : /* @__PURE__ */ jsx(Check, { size: 12, className: "text-slate-400", title: "Sent" }))
            ] })
          ] }) }, msg.id);
        }),
        isTyping && /* @__PURE__ */ jsx("div", { className: "flex justify-start", children: /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-2xl p-3 shadow-sm rounded-bl-none flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" }),
          /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" }),
          /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" })
        ] }) }),
        isWaitingForReply && !isTyping && /* @__PURE__ */ jsx("div", { className: "flex justify-start", children: /* @__PURE__ */ jsxs("div", { className: "text-[10px] text-slate-400 font-medium flex items-center gap-1 ml-2", children: [
          /* @__PURE__ */ jsx("span", { className: "w-1 h-1 rounded-full bg-slate-400 animate-pulse" }),
          "Waiting for reply..."
        ] }) }),
        /* @__PURE__ */ jsx("div", { ref: messagesEndRef })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "p-4 border-t border-indigo-100 bg-slate-100/80", children: isGhostMode ? /* @__PURE__ */ jsxs("div", { className: "bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-center gap-2 text-slate-500 text-sm", children: [
        /* @__PURE__ */ jsx(Lock, { size: 16 }),
        /* @__PURE__ */ jsx("span", { children: "Ghost Mode Active: Monitoring Only" })
      ] }) : /* @__PURE__ */ jsxs("form", { onSubmit: handleSend, className: "flex items-end gap-2.5", children: [
        /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("input", { ref: fileInputRef, type: "file", accept: ".pdf,.doc,.docx,.xls,.xlsx,.txt,image/*", className: "hidden", onChange: handleAttachmentChange }),
          /* @__PURE__ */ jsx("button", { type: "button", onClick: handlePickAttachment, className: "p-2.5 rounded-full bg-white border border-gray-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors outline-none focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent]", children: /* @__PURE__ */ jsx(Paperclip, { size: 18 }) })
        ] }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            ref: textInputRef,
            value: inputText,
            onChange: (e) => {
              setInputText(e.target.value);
              resizeTextInput();
            },
            onKeyDown: (e) => {
              if (e.key !== "Enter") return;
              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const el = e.target;
                const start = el.selectionStart ?? inputText.length;
                const end = el.selectionEnd ?? inputText.length;
                const next = `${inputText.slice(0, start)}\n${inputText.slice(end)}`;
                setInputText(next);
                requestAnimationFrame(() => {
                  el.selectionStart = el.selectionEnd = start + 1;
                  resizeTextInput();
                });
                return;
              }
              e.preventDefault();
              if (inputText.trim()) handleSend(e);
            },
            placeholder: "Type a message...",
            rows: 1,
            className: "flex-1 py-2.5 px-4 bg-white border border-gray-200 rounded-[22px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm shadow-sm resize-none max-h-32 overflow-y-auto leading-[1.4]"
          }
        ),
        /* @__PURE__ */ jsx(Button, { type: "submit", className: "rounded-full w-10 h-10 p-0 flex items-center justify-center bg-[#0F172A] hover:bg-slate-800 border-none shrink-0", disabled: !inputText.trim(), children: /* @__PURE__ */ jsx(Send, { size: 17, className: "ml-0.5" }) })
      ] }) })
    ] })
  ] });
};
export {
  ChatInterface
};
