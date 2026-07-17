import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from "react";
import { Send, Paperclip, Search, Check, CheckCheck, Eye, Lock, MessageCircle, Reply, X, RefreshCw } from "lucide-react";
import { getAccounts, getChats, getWhatsappStatus, syncWhatsappHistory } from "../authApi";
import { buildCounselorTeamEntriesWithFallback } from "../studentContactHelpers";
import { Button } from "./Button";
import { isCounselorEquivalentPortalRole, canSendStaffStudentMessages, isStudentMessagingStaffRole } from "../roles";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, MAX_CHAT_ATTACHMENTS } from "../uploadLimits";
import { POLL_MS, SLA_CLOCK_INTERVAL_MS } from "../runtimeConfig";
import { renderChatMessageText } from "../utils/linkifyText";

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const formatMessageDateTime = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const timeLabel = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const today = startOfDay(new Date());
  const messageDay = startOfDay(date);
  const dayDiff = Math.round((today.getTime() - messageDay.getTime()) / 86400000);
  let dateLabel;
  if (dayDiff === 0) dateLabel = "Today";
  else if (dayDiff === 1) dateLabel = "Yesterday";
  else {
    dateLabel = date.toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: today.getFullYear() === date.getFullYear() ? undefined : "numeric"
    });
  }
  return `${dateLabel}, ${timeLabel}`;
};

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
  const [replyingTo, setReplyingTo] = useState(null);
  const [highlightMessageId, setHighlightMessageId] = useState(null);
  const [isSyncingWhatsapp, setIsSyncingWhatsapp] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const textInputRef = useRef(null);
  const lastSignatureRef = useRef("");
  const highlightTimerRef = useRef(null);
  const canSendAsStaffMessenger = canSendStaffStudentMessages(currentRole, adminChatEnabled, branchWhatsappEnabled);
  const isGhostMode =
    (currentRole === "Admin" || currentRole === "Manager" || currentRole === "Team Lead") && !canSendAsStaffMessenger;
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
      // Keep unread flags intact while browsing the inbox list; mark per-peer on open.
      const result = await getChats(shouldLoadAll ? "" : currentUser?.id, { markRead: false });
      if (cancelled) return;
      setIsChatsLoading(false);
      if (!result.ok) return;
      const incoming = result.data || [];
      const signature = `${incoming.length}:${incoming.map((m) => `${m.id}:${m.timestamp}:${m.read === true ? "1" : "0"}`).join("|")}`;
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
    const peer = String(initialChatPeerId || "").trim();
    if (peer) {
      if (!conversationList.some((entry) => String(entry?.id || "").trim() === peer)) return;
      setSelectedConversationId((current) => (current === peer ? current : peer));
      return;
    }
    // Sidebar open (Inbox / Omni-Channel / Live Ops): pick a conversation by default.
    if (!conversationList.length) {
      setSelectedConversationId(null);
      return;
    }
    setSelectedConversationId((current) => {
      const currentId = String(current || "").trim();
      if (currentId && conversationList.some((entry) => String(entry?.id || "").trim() === currentId)) {
        return current;
      }
      if (liveMessages.length) {
        const studentIdsWithMessages = new Set(
          liveMessages.flatMap((m) => [String(m.senderId || ""), String(m.receiverId || "")])
        );
        const firstWithMessages = conversationList.find((student) =>
          studentIdsWithMessages.has(String(student.id || ""))
        );
        if (firstWithMessages) return firstWithMessages.id;
      }
      return conversationList[0].id;
    });
  }, [initialChatPeerId, conversationList, liveMessages]);
  useEffect(() => {
    setReplyingTo(null);
    setHighlightMessageId(null);
    setPendingAttachments([]);
  }, [selectedConversationId]);
  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);
  const pendingInitialPeer = String(initialChatPeerId || "").trim();
  const resolvedInitialPeer =
    pendingInitialPeer &&
    conversationList.some((entry) => String(entry?.id || "").trim() === pendingInitialPeer)
      ? pendingInitialPeer
      : null;
  const activeConversationId =
    selectedConversationId || resolvedInitialPeer || (!pendingInitialPeer ? conversationList[0]?.id : null);
  useEffect(() => {
    if (isGhostMode) return;
    const peerId = String(activeConversationId || "").trim();
    const myId = String(currentUser?.id || "").trim();
    if (!peerId || !myId) return;
    let cancelled = false;
    const markPeerRead = async () => {
      const result = await getChats(myId, { peerId });
      if (cancelled || !result.ok) return;
      const readAt = new Date().toISOString();
      setLiveMessages((prev) => {
        let changed = false;
        const next = prev.map((m) => {
          if (String(m.receiverId || "").trim() !== myId) return m;
          if (String(m.senderId || "").trim() !== peerId) return m;
          if (m.read === true) return m;
          changed = true;
          return { ...m, read: true, readAt };
        });
        if (changed) {
          lastSignatureRef.current = `${next.length}:${next.map((m) => `${m.id}:${m.timestamp}:${m.read === true ? "1" : "0"}`).join("|")}`;
        }
        return changed ? next : prev;
      });
    };
    markPeerRead();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, currentUser?.id, isGhostMode]);
  const MESSAGE_DEDUPE_WINDOW_MS = 2 * 60 * 1000;
  const getMessageContentKey = (msg) => {
    const content = String(msg?.content || "").trim().toLowerCase();
    const attachmentKey = String(msg?.attachment?.url || msg?.attachment?.name || "").trim().toLowerCase();
    return `${content}::${attachmentKey}`;
  };
  const dedupeConversationMessages = (msgs) => {
    if (!Array.isArray(msgs) || msgs.length < 2) return msgs || [];
    const seenIds = /* @__PURE__ */ new Set();
    const seenWhatsappIds = /* @__PURE__ */ new Set();
    const kept = [];
    for (const msg of msgs) {
      if (!msg) continue;
      const id = String(msg.id || "").trim();
      if (id) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      const waId = String(msg.whatsappMessageId || "").trim();
      if (waId) {
        if (seenWhatsappIds.has(waId)) continue;
        seenWhatsappIds.add(waId);
      }
      const senderId = String(msg.senderId || "").trim();
      const contentKey = getMessageContentKey(msg);
      const hasBody = contentKey !== "::";
      const ts = new Date(msg.timestamp || 0).getTime();
      if (hasBody && senderId) {
        const isDuplicate = kept.some((prev) => {
          if (String(prev.senderId || "").trim() !== senderId) return false;
          if (getMessageContentKey(prev) !== contentKey) return false;
          const prevTs = new Date(prev.timestamp || 0).getTime();
          if (!Number.isFinite(ts) || !Number.isFinite(prevTs)) return true;
          return Math.abs(ts - prevTs) <= MESSAGE_DEDUPE_WINDOW_MS;
        });
        if (isDuplicate) continue;
      }
      kept.push(msg);
    }
    return kept;
  };
  const getActiveMessages = () => {
    if (!activeConversationId) return [];
    const otherUserId = activeConversationId;
    const myId = currentUser.id;
    let filtered;
    if (currentRole === "Manager" || currentRole === "Team Lead" || currentRole === "Admin") {
      const selectedStudent = students.find((s) => s.id === otherUserId);
      if (!selectedStudent) return [];
      filtered = liveMessages.filter(
        (m) => m.senderId === selectedStudent.id || m.receiverId === selectedStudent.id
      );
    } else if (isStudentMessagingStaffRole(currentRole)) {
      // Counselors and country coordinators see the full student thread in one window.
      filtered = liveMessages.filter(
        (m) => m.senderId === otherUserId || m.receiverId === otherUserId
      );
    } else {
      filtered = liveMessages.filter(
        (m) => m.senderId === myId && m.receiverId === otherUserId || m.senderId === otherUserId && m.receiverId === myId
      );
    }
    return dedupeConversationMessages(
      filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    );
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
  const isWhatsappConnected = whatsappSyncStatus === "connected" || whatsappSyncStatus === "authenticated";
  const handleSyncWhatsapp = async () => {
    if (isSyncingWhatsapp || !isWhatsappConnected || !relevantCounselorId) return;
    setIsSyncingWhatsapp(true);
    try {
      const studentId = currentRole === "Student" ? "" : String(activeConversationId || "").trim();
      await syncWhatsappHistory(relevantCounselorId, studentId);
      const shouldLoadAll = currentRole === "Manager" || currentRole === "Team Lead" || currentRole === "Admin";
      const result = await getChats(shouldLoadAll ? "" : currentUser?.id, { markRead: false });
      if (result.ok) {
        setLiveMessages(result.data || []);
        lastSignatureRef.current = "";
      }
    } catch {
      // Sync failed silently; next poll will pick up any new messages.
    }
    setIsSyncingWhatsapp(false);
  };
  const whatsappSyncLabel =
    isWhatsappConnected
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
  const buildReplyToPayload = (msg) => {
    if (!msg?.id) return null;
    const content = String(msg.content || "").trim();
    const attachmentName = String(msg.attachment?.name || "").trim();
    return {
      id: String(msg.id),
      senderId: String(msg.senderId || "").trim(),
      content: content.slice(0, 280),
      ...(attachmentName ? { attachmentName } : {})
    };
  };
  const getReplyPreviewText = (reply) => {
    if (!reply) return "";
    const content = String(reply.content || "").trim();
    if (content) return content;
    if (reply.attachmentName) return reply.attachmentName;
    return "Attachment";
  };
  const getLastMessagePreview = (msg) => {
    if (!msg) return "";
    const content = String(msg.content || "").trim();
    if (content) return content;
    if (msg.attachment?.name) return msg.attachment.name;
    return "Attachment";
  };
  const startReplyToMessage = (msg) => {
    const payload = buildReplyToPayload(msg);
    if (!payload) return;
    setReplyingTo(payload);
    requestAnimationFrame(() => textInputRef.current?.focus());
  };
  const scrollToMessage = (messageId) => {
    const id = String(messageId || "").trim();
    if (!id) return;
    const el = document.getElementById(`chat-msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightMessageId(id);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightMessageId(null), 1600);
  };
  const handleSend = async (e) => {
    e.preventDefault();
    const text = inputText.trim();
    if ((!text && pendingAttachments.length === 0) || !activeConversationId || isSending) return;
    const replyPayload = replyingTo;
    setInputText("");
    setReplyingTo(null);
    if (textInputRef.current) textInputRef.current.style.height = "auto";
    const attachmentsToSend = [...pendingAttachments];
    setPendingAttachments([]);
    setIsSending(true);
    let replyUsed = false;
    const appendSentMessage = (message) => {
      if (!message?.id) return;
      setLiveMessages((prev) => {
        if (prev.some((msg) => msg.id === message.id)) return prev;
        return [...prev, message];
      });
    };
    try {
      if (text) {
        const result = await onSendMessage(text, activeConversationId, null, replyPayload);
        if (!result?.ok) {
          setInputText(text);
          setReplyingTo(replyPayload);
          setPendingAttachments(attachmentsToSend);
          requestAnimationFrame(resizeTextInput);
          window.alert(result?.error || "Failed to send message.");
          return;
        }
        appendSentMessage(result.data);
        replyUsed = true;
      }
      for (let index = 0; index < attachmentsToSend.length; index += 1) {
        const attachment = attachmentsToSend[index];
        const result = await onSendMessage(
          "",
          activeConversationId,
          {
            name: attachment.name,
            mime: attachment.mime,
            size: attachment.size || 0,
            dataUrl: attachment.dataUrl
          },
          !replyUsed ? replyPayload : null
        );
        if (!result?.ok) {
          setInputText(text);
          setReplyingTo(replyPayload);
          setPendingAttachments(attachmentsToSend.slice(index));
          window.alert(result?.error || "Failed to upload attachment.");
          return;
        }
        appendSentMessage(result.data);
        replyUsed = true;
      }
    } finally {
      setIsSending(false);
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
  const CHAT_ATTACHMENT_MIME_BY_EXT = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    pdf: "application/pdf",
    txt: "text/plain",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };
  const resolveChatAttachmentMime = (file) => {
    const name = String(file?.name || "");
    const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    const fromExt = CHAT_ATTACHMENT_MIME_BY_EXT[ext] || "";
    if (fromExt) return fromExt;
    const fromType = String(file?.type || "").toLowerCase();
    if (fromType && fromType !== "application/octet-stream") {
      return Object.values(CHAT_ATTACHMENT_MIME_BY_EXT).includes(fromType) ? fromType : "";
    }
    return "";
  };
  const buildChatAttachmentName = (file, mime) => {
    const existing = String(file?.name || "").trim();
    if (existing) return existing;
    const subtype = String(mime || file?.type || "image/png").split("/")[1] || "png";
    const ext = subtype === "jpeg" ? "jpg" : subtype.replace(/[^a-z0-9]/gi, "") || "png";
    return `pasted-image-${Date.now()}.${ext}`;
  };
  const queueChatAttachment = async (file) => {
    if (!file || !activeConversationId) return false;
    const mime = resolveChatAttachmentMime(file);
    if (!mime) {
      window.alert("Unsupported file type. Use PDF, Word (.doc, .docx), Excel (.xls, .xlsx), TXT, or an image.");
      return false;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      window.alert(`Attachment must be under ${MAX_UPLOAD_LABEL}.`);
      return false;
    }
    const reader = new FileReader();
    const rawDataUrl = await new Promise((resolve) => {
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
    if (!rawDataUrl) {
      window.alert("Unable to read file. Try again.");
      return false;
    }
    const dataUrl = rawDataUrl.replace(/^data:[^;]*;base64,/, `data:${mime};base64,`);
    let queued = false;
    setPendingAttachments((prev) => {
      if (prev.length >= MAX_CHAT_ATTACHMENTS) return prev;
      queued = true;
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: buildChatAttachmentName(file, mime),
          mime,
          size: file.size || 0,
          dataUrl
        }
      ];
    });
    if (!queued) {
      window.alert(`You can attach up to ${MAX_CHAT_ATTACHMENTS} files per message.`);
    }
    return queued;
  };
  const removePendingAttachment = (attachmentId) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
  };
  const handlePickAttachment = () => {
    if (pendingAttachments.length >= MAX_CHAT_ATTACHMENTS) {
      window.alert(`You can attach up to ${MAX_CHAT_ATTACHMENTS} files per message.`);
      return;
    }
    fileInputRef.current?.click();
  };
  const handleAttachmentChange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !activeConversationId) return;
    const slotsLeft = MAX_CHAT_ATTACHMENTS - pendingAttachments.length;
    if (slotsLeft <= 0) {
      window.alert(`You can attach up to ${MAX_CHAT_ATTACHMENTS} files per message.`);
      return;
    }
    const selectedFiles = files.slice(0, slotsLeft);
    if (files.length > slotsLeft) {
      window.alert(`Only ${slotsLeft} more file(s) can be added (maximum ${MAX_CHAT_ATTACHMENTS} per message).`);
    }
    for (const file of selectedFiles) {
      const queued = await queueChatAttachment(file);
      if (!queued) break;
    }
  };
  const handlePaste = async (e) => {
    if (!activeConversationId || pendingAttachments.length >= MAX_CHAT_ATTACHMENTS) return;
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind !== "file" || !String(item.type || "").startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      await queueChatAttachment(file);
      return;
    }
  };
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
        const myId = String(currentUser?.id || "").trim();
        const unreadCount = isGhostMode
          ? relatedMsgs.filter((m) => {
              if (m.read === true) return false;
              if (String(m.senderId || "").trim() !== String(user.id || "").trim()) return false;
              return String(m.receiverId || "").trim() !== String(user.id || "").trim();
            }).length
          : relatedMsgs.filter(
              (m) => String(m.receiverId || "").trim() === myId && m.read !== true
            ).length;
        const hasUnread = unreadCount > 0;
        const lastMessagePreview = lastMsg ? getLastMessagePreview(lastMsg) : "";
        const lastMessageSender = lastMsg ? getSenderName(lastMsg.senderId) : "";
        return /* @__PURE__ */ jsxs(
          "div",
          {
            onClick: () => setSelectedConversationId(user.id),
            title: lastMsg ? `${lastMessageSender}: ${lastMessagePreview}` : void 0,
            className: `relative group p-4 border-b border-gray-100 cursor-pointer transition-colors hover:bg-white outline-none focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent]
                                    ${isSelected ? "bg-white border-l-4 border-l-indigo-600 shadow-sm" : "border-l-4 border-l-transparent text-slate-600"}
                                `,
            children: [
              /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start mb-1 gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: `text-sm truncate ${isSelected ? "text-indigo-900 font-semibold" : hasUnread ? "text-slate-900 font-bold" : "text-slate-900 font-semibold"}`, children: user.name }),
                lastMsg && /* @__PURE__ */ jsx("span", { className: `text-[10px] whitespace-nowrap shrink-0 ${hasUnread ? "text-indigo-600 font-semibold" : "text-slate-400"}`, children: formatMessageDateTime(lastMsg.timestamp) })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
                /* @__PURE__ */ jsx("p", { className: `text-xs truncate h-4 min-w-0 flex-1 ${hasUnread ? "text-slate-700 font-medium" : "text-slate-500"}`, children: lastMsg ? lastMsg.content || lastMsg.attachment?.name || "Attachment" : /* @__PURE__ */ jsx("span", { className: "italic text-slate-400", children: "No messages yet" }) }),
                hasUnread ? /* @__PURE__ */ jsx("span", {
                  className: "w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0"
                }) : null
              ] }),
              isGhostMode && "counselor" in user && /* @__PURE__ */ jsxs("div", { className: "mt-2 text-[10px] text-slate-400 flex items-center gap-1", children: [
                /* @__PURE__ */ jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-500" }),
                "Agent: ",
                getCounselorDisplayName(user.counselor)
              ] }),
              lastMsg && /* @__PURE__ */ jsxs("div", {
                className: "pointer-events-none absolute inset-0 z-10 flex flex-col justify-center bg-white/95 px-4 py-3 border border-indigo-200 shadow-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-150",
                children: [
                  /* @__PURE__ */ jsx("p", { className: "text-[11px] font-semibold text-indigo-700 truncate", children: lastMessageSender }),
                  /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-600 mt-1 line-clamp-4 whitespace-pre-wrap break-words", children: lastMessagePreview })
                ]
              })
            ]
          },
          user.id
        );
      }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex-1 flex flex-col bg-white relative", children: [
      !activeConversationId ? /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center justify-center flex-1 text-slate-400 px-6", children: [
        /* @__PURE__ */ jsx(MessageCircle, { size: 56, className: "mb-4 text-slate-300" }),
        /* @__PURE__ */ jsx("p", { className: "font-semibold text-slate-700", children: "Select a conversation" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm mt-2 text-center max-w-sm", children: "Choose a chat from the inbox to view messages and reply." })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
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
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-gray-100", children: [
            /* @__PURE__ */ jsx("div", { className: `w-2 h-2 rounded-full ${whatsappSyncDotClass}` }),
            whatsappSyncLabel
          ] }),
          !isGhostMode && isWhatsappConnected && /* @__PURE__ */ jsx("button", {
            type: "button",
            title: isSyncingWhatsapp ? "Syncing WhatsApp messages..." : "Sync WhatsApp messages",
            onClick: handleSyncWhatsapp,
            disabled: isSyncingWhatsapp,
            className: `p-2 rounded-full border border-gray-100 bg-slate-50 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed outline-none focus:outline-none`,
            children: /* @__PURE__ */ jsx(RefreshCw, { size: 14, className: isSyncingWhatsapp ? "animate-spin" : "" })
          })
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
          const isHighlighted = highlightMessageId === String(msg.id || "");
          return /* @__PURE__ */ jsx("div", { id: `chat-msg-${msg.id}`, className: `flex ${isMe ? "justify-end" : "justify-start"} group/msg`, children: /* @__PURE__ */ jsxs("div", { className: `max-w-[72%] min-w-[120px] rounded-[10px] px-2.5 pt-1.5 pb-1 shadow-sm relative transition-shadow ${isMe ? "bg-indigo-100 text-slate-900 rounded-tr-[8px] border border-indigo-200/60" : "bg-white text-slate-900 rounded-tl-[8px] border border-slate-200"} ${isHighlighted ? "ring-2 ring-indigo-400 shadow-md" : ""}`, children: [
            /* @__PURE__ */ jsx("span", { className: `absolute top-2 ${isMe ? "-right-1.5 bg-indigo-100 border-r border-t border-indigo-200/60" : "-left-1.5 bg-white border-l border-t border-slate-200"} h-3 w-3 rotate-45` }),
            !isGhostMode ? /* @__PURE__ */ jsx("button", {
              type: "button",
              title: "Reply",
              onClick: () => startReplyToMessage(msg),
              className: `absolute -top-2 ${isMe ? "-left-2" : "-right-2"} opacity-100 md:opacity-0 md:group-hover/msg:opacity-100 focus:opacity-100 p-1 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 shadow-sm transition-opacity z-10`,
              children: /* @__PURE__ */ jsx(Reply, { size: 12 })
            }) : null,
            /* @__PURE__ */ jsx("p", { className: `text-[10px] font-semibold mb-0.5 ${isMe ? "text-indigo-700" : "text-slate-500"}`, children: getSenderName(msg.senderId) }),
            msg.replyTo ? /* @__PURE__ */ jsxs("button", {
              type: "button",
              onClick: () => scrollToMessage(msg.replyTo.id),
              className: `w-full text-left mb-1.5 rounded-md px-2 py-1.5 border-l-[3px] ${isMe ? "bg-indigo-50/80 border-indigo-400" : "bg-slate-50 border-slate-400"} hover:brightness-[0.98] transition`,
              children: [
                /* @__PURE__ */ jsx("p", { className: `text-[10px] font-semibold truncate ${isMe ? "text-indigo-700" : "text-slate-600"}`, children: getSenderName(msg.replyTo.senderId) }),
                /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500 whitespace-pre-wrap break-words line-clamp-3", children: renderChatMessageText(getReplyPreviewText(msg.replyTo), "text-indigo-600 underline hover:text-indigo-800") })
              ]
            }) : null,
            msg.content ? /* @__PURE__ */ jsx("div", { className: "text-[14px] leading-[1.35] break-words [overflow-wrap:anywhere]", children: renderChatMessageText(msg.content, isMe ? "text-indigo-700 underline hover:text-indigo-900 break-all" : "text-indigo-600 underline hover:text-indigo-800 break-all") }) : null,
            msg.attachment ? (() => {
              const attMime = String(msg.attachment.mime || "").toLowerCase();
              const attName = String(msg.attachment.name || "").toLowerCase();
              const attUrl = String(msg.attachment.url || "").toLowerCase();
              const isImage = attMime.startsWith("image/");
              const isPdf = attMime === "application/pdf" || attMime.startsWith("application/pdf") || attName.endsWith(".pdf") || attUrl.endsWith(".pdf");
              const isWord = attMime === "application/msword" || attMime.includes("wordprocessingml") || attName.endsWith(".doc") || attName.endsWith(".docx");
              const isExcel = attMime === "application/vnd.ms-excel" || attMime.includes("spreadsheetml") || attName.endsWith(".xls") || attName.endsWith(".xlsx");
              const isDocFile = isWord || isExcel || attMime === "text/plain" || attName.endsWith(".txt");
              return /* @__PURE__ */ jsxs("div", { className: `${msg.content ? "mt-2" : ""} space-y-2`, children: [
                isImage ? /* @__PURE__ */ jsx("a", { href: msg.attachment.url, target: "_blank", rel: "noreferrer", children: /* @__PURE__ */ jsx("img", { src: msg.attachment.url, alt: msg.attachment.name || "Image attachment", className: "max-h-64 rounded-xl border border-black/10 object-contain bg-white cursor-pointer hover:opacity-90 transition-opacity" }) }) : null,
                isPdf ? /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-black/10 overflow-hidden bg-white", children: [
                  /* @__PURE__ */ jsx("iframe", { src: `${msg.attachment.url}#toolbar=1&navpanes=0`, title: msg.attachment.name || "PDF attachment", className: "w-full h-72 border-0" }),
                  /* @__PURE__ */ jsxs("a", { href: msg.attachment.url, target: "_blank", rel: "noreferrer", className: `flex items-center gap-2 text-xs font-medium px-3 py-2 border-t border-black/5 ${isMe ? "bg-indigo-50 text-indigo-800" : "bg-slate-50 text-slate-700"}`, children: [
                    "\ud83d\udcc4 ",
                    msg.attachment.name || "PDF Document",
                    " \u2014 Open"
                  ] })
                ] }) : null,
                !isImage && !isPdf && isDocFile ? /* @__PURE__ */ jsxs("a", { href: msg.attachment.url, target: "_blank", rel: "noreferrer", className: `flex items-center gap-2 text-sm font-medium px-3 py-2.5 rounded-xl border ${isMe ? "bg-indigo-50 border-indigo-200 text-indigo-800" : "bg-white border-slate-200 text-slate-700"} hover:shadow-sm transition-shadow`, children: [
                  isWord ? "\ud83d\udcdd" : isExcel ? "\ud83d\udcca" : "\ud83d\udcc4",
                  " ",
                  /* @__PURE__ */ jsxs("span", { className: "flex flex-col min-w-0", children: [
                    /* @__PURE__ */ jsx("span", { className: "truncate font-semibold text-xs", children: msg.attachment.name || "Document" }),
                    /* @__PURE__ */ jsx("span", { className: "text-[10px] opacity-60", children: isWord ? "Word Document" : isExcel ? "Excel Spreadsheet" : "Text File" })
                  ] }),
                  /* @__PURE__ */ jsx("span", { className: "ml-auto text-[10px] opacity-50 shrink-0", children: msg.attachment.size ? `${(msg.attachment.size / 1024).toFixed(0)} KB` : "Download" })
                ] }) : null,
                !isImage && !isPdf && !isDocFile ? /* @__PURE__ */ jsxs("a", { href: msg.attachment.url, target: "_blank", rel: "noreferrer", className: `inline-flex items-center gap-2 text-xs font-medium px-2.5 py-1.5 rounded-lg ${isMe ? "bg-indigo-50 text-indigo-800" : "bg-slate-100 text-slate-700"}`, children: [
                  "\ud83d\udcce ",
                  msg.attachment.name || "Attachment"
                ] }) : null
              ] });
            })() : null,
            /* @__PURE__ */ jsxs("div", { className: `mt-1 flex items-center justify-end gap-1 text-[10px] whitespace-nowrap ${isMe ? "text-indigo-700/80" : "text-slate-400"}`, children: [
              formatMessageDateTime(msg.timestamp),
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
      ] }) : /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        replyingTo ? /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 shadow-sm", children: [
          /* @__PURE__ */ jsx("div", { className: "w-1 self-stretch rounded-full bg-indigo-500 shrink-0" }),
          /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
            /* @__PURE__ */ jsxs("p", { className: "text-[11px] font-semibold text-indigo-700 flex items-center gap-1", children: [
              /* @__PURE__ */ jsx(Reply, { size: 12 }),
              "Replying to ",
              getSenderName(replyingTo.senderId)
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 whitespace-pre-wrap break-words line-clamp-2", children: renderChatMessageText(getReplyPreviewText(replyingTo)) })
          ] }),
          /* @__PURE__ */ jsx("button", {
            type: "button",
            title: "Cancel reply",
            onClick: () => setReplyingTo(null),
            className: "p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100",
            children: /* @__PURE__ */ jsx(X, { size: 14 })
          })
        ] }) : null,
        pendingAttachments.length > 0 ? /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm", children: [
          /* @__PURE__ */ jsxs("p", { className: "text-[11px] font-semibold text-slate-600 mb-2", children: [
            "Attachments (",
            pendingAttachments.length,
            "/",
            MAX_CHAT_ATTACHMENTS,
            ")"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: pendingAttachments.map((attachment) => /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-2 max-w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700", children: [
            /* @__PURE__ */ jsx("span", { className: "truncate", children: attachment.name }),
            /* @__PURE__ */ jsx("button", {
              type: "button",
              title: "Remove attachment",
              onClick: () => removePendingAttachment(attachment.id),
              className: "p-0.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100",
              children: /* @__PURE__ */ jsx(X, { size: 12 })
            })
          ] }, attachment.id)) })
        ] }) : null,
        /* @__PURE__ */ jsxs("form", { onSubmit: handleSend, className: "flex items-end gap-2.5", children: [
        /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("input", { ref: fileInputRef, type: "file", multiple: true, accept: ".pdf,.doc,.docx,.xls,.xlsx,.txt,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain", className: "hidden", onChange: handleAttachmentChange, title: `Attach up to ${MAX_CHAT_ATTACHMENTS} files (PDF, Word, Excel, TXT, or image)` }),
          /* @__PURE__ */ jsx("button", { type: "button", onClick: handlePickAttachment, disabled: isSending || pendingAttachments.length >= MAX_CHAT_ATTACHMENTS, className: "p-2.5 rounded-full bg-white border border-gray-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors outline-none focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent] disabled:opacity-50 disabled:cursor-not-allowed", children: /* @__PURE__ */ jsx(Paperclip, { size: 18 }) })
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
            onPaste: handlePaste,
            onKeyDown: (e) => {
              if (e.key === "Escape" && replyingTo) {
                e.preventDefault();
                setReplyingTo(null);
                return;
              }
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
              if (inputText.trim() || pendingAttachments.length > 0) handleSend(e);
            },
            placeholder: replyingTo ? "Write a reply..." : "Type a message...",
            rows: 1,
            className: "flex-1 py-2.5 px-4 bg-white border border-gray-200 rounded-[22px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm shadow-sm resize-none max-h-32 overflow-y-auto leading-[1.4]"
          }
        ),
        /* @__PURE__ */ jsx(Button, { type: "submit", className: "rounded-full w-10 h-10 p-0 flex items-center justify-center bg-[#0F172A] hover:bg-slate-800 border-none shrink-0", disabled: isSending || (!inputText.trim() && pendingAttachments.length === 0), children: /* @__PURE__ */ jsx(Send, { size: 17, className: "ml-0.5" }) })
      ] })
      ] }) })
      ] })
    ] })
  ] });
};
export {
  ChatInterface
};
