import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from "react";
import { COMPANY_LOGO_ALT, COMPANY_NAME } from "../companyConfig";
import { isCounselorEquivalentPortalRole } from "../roles";
import { getRoleDisplayName } from "../roleDisplay";
import {
  Users,
  LayoutDashboard,
  CheckSquare,
  FileText,
  Settings,
  Bell,
  Search,
  Command,
  LogOut,
  BarChart3,
  MessageSquare,
  Globe,
  DollarSign,
  Calendar,
  UserCog,
  Menu,
  X,
  Contact,
  ClipboardList,
  AlertTriangle,
  Plug,
  MapPin,
  FormInput
} from "lucide-react";
import { DEFAULT_USER_AVATAR } from "../apiConfig";
import { getCompanyProfile } from "../authApi";
const whatsappNavStatusLabel = (status) => {
  const s = String(status || "").trim();
  if (s === "connected" || s === "authenticated") return "WhatsApp connected";
  if (s === "connecting" || s === "awaiting_qr_scan") return "WhatsApp connecting — scan QR in Integrations";
  if (s === "auth_failed" || s === "error") return "WhatsApp error — open Integrations to reconnect";
  return "WhatsApp disconnected — open Integrations to connect";
};
const whatsappNavStatusClass = (status) => {
  const s = String(status || "").trim();
  if (s === "connected" || s === "authenticated") return "text-emerald-600 hover:text-emerald-700";
  if (s === "connecting" || s === "awaiting_qr_scan") return "text-amber-600 hover:text-amber-700";
  return "text-rose-600 hover:text-rose-700";
};
const WhatsappGlyph = ({ className = "" }) => /* @__PURE__ */ jsx(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    className: `w-5 h-5 flex-shrink-0 ${className}`,
    fill: "currentColor",
    "aria-hidden": true,
    children: /* @__PURE__ */ jsx("path", {
      d: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
    })
  }
);
const Layout = ({
  children: pageBody,
  activeView,
  onNavigate,
  currentRole,
  unreadMessageCount,
  notifications = [],
  onClearNotifications,
  onRemoveNotification,
  onNotificationNavigate,
  onLogout,
  userAvatar,
  userName,
  userEmail,
  userPhone,
  userBranch,
  onUpdateProfileAvatar,
  onUpdateProfileContact,
  navMyTasksCount,
  requestedStudentsBadge = "",
  pipelineEscalationBadge = "",
  counselorStageEscalationBadge = "",
  counselorStudentsBadge = "",
  pageLoading = false,
  showWhatsappNavIndicator = false,
  whatsappConnectionStatus = "disconnected",
  adminChatEnabled = false
}) => {
  void pageLoading;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [backendCompanyName, setBackendCompanyName] = useState("");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsPanelRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    getCompanyProfile().then((result) => {
      if (!cancelled && result.ok && result.data?.companyName) {
        setBackendCompanyName(String(result.data.companyName).trim());
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!isNotificationsOpen) return;
    const handlePointerDown = (event) => {
      const el = notificationsPanelRef.current;
      if (el && !el.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isNotificationsOpen]);
  const [profileError, setProfileError] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [selectedAvatarDataUrl, setSelectedAvatarDataUrl] = useState("");
  const [editableEmail, setEditableEmail] = useState(userEmail || "");
  const [editablePhone, setEditablePhone] = useState(userPhone || "");
  const displayedAvatar = selectedAvatarDataUrl || userAvatar || DEFAULT_USER_AVATAR;
  const handleProfileClose = () => {
    setIsProfileOpen(false);
    setProfileError("");
    setSelectedAvatarDataUrl("");
    setIsSavingProfile(false);
    setEditableEmail(userEmail || "");
    setEditablePhone(userPhone || "");
  };
  const handleProfileOpen = () => {
    setEditableEmail(userEmail || "");
    setEditablePhone(userPhone || "");
    setProfileError("");
    setIsProfileOpen(true);
  };
  const handleAvatarFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileError("Please select an image file.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setProfileError("Image must be less than 4MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProfileError("");
      setSelectedAvatarDataUrl(String(reader.result || ""));
    };
    reader.onerror = () => {
      setProfileError("Failed to read selected image.");
    };
    reader.readAsDataURL(file);
  };
  const handleProfileSave = async () => {
    setIsSavingProfile(true);
    setProfileError("");
    const isCounselor = isCounselorEquivalentPortalRole(currentRole);
    const emailChanged = isCounselor && String(editableEmail || "").trim() !== String(userEmail || "").trim();
    const phoneChanged = isCounselor && String(editablePhone || "").trim() !== String(userPhone || "").trim();
    if (emailChanged || phoneChanged) {
      if (!onUpdateProfileContact) {
        setProfileError("Profile contact updates are not available.");
        setIsSavingProfile(false);
        return;
      }
      const contactResult = await onUpdateProfileContact({
        email: String(editableEmail || "").trim(),
        phone: String(editablePhone || "").trim()
      });
      if (!contactResult?.ok) {
        setProfileError(contactResult?.error || "Failed to save profile contact.");
        setIsSavingProfile(false);
        return;
      }
    }
    if (selectedAvatarDataUrl) {
      if (!onUpdateProfileAvatar) {
        setProfileError("Profile updates are not available.");
        setIsSavingProfile(false);
        return;
      }
      const avatarResult = await onUpdateProfileAvatar(selectedAvatarDataUrl);
      if (!avatarResult?.ok) {
        setProfileError(avatarResult?.error || "Failed to save profile image.");
        setIsSavingProfile(false);
        return;
      }
    }
    handleProfileClose();
  };
  const counselorNavItems = [
    { id: "dashboard", label: "My Dashboard", icon: /* @__PURE__ */ jsx(LayoutDashboard, { size: 20 }) },
    { id: "calendar", label: "Calendar", icon: /* @__PURE__ */ jsx(Calendar, { size: 20 }) },
    { id: "students", label: "My Students", icon: /* @__PURE__ */ jsx(Users, { size: 20 }), badge: counselorStudentsBadge },
    { id: "finance", label: "Ledger & Payments", icon: /* @__PURE__ */ jsx(DollarSign, { size: 20 }) },
    { id: "integration", label: "Integrations", icon: /* @__PURE__ */ jsx(Plug, { size: 20 }) },
    { id: "stage-escalations", label: "Stage SLA", icon: /* @__PURE__ */ jsx(AlertTriangle, { size: 20 }), badge: counselorStageEscalationBadge },
    { id: "university", label: "Uni Finder", icon: /* @__PURE__ */ jsx(Globe, { size: 20 }) },
    { id: "messages", label: "Inbox", icon: /* @__PURE__ */ jsx(MessageSquare, { size: 20 }), badge: unreadMessageCount > 0 ? String(unreadMessageCount) : "" },
    { id: "tasks", label: "My Tasks", icon: /* @__PURE__ */ jsx(CheckSquare, { size: 20 }), badge: typeof navMyTasksCount === "number" && navMyTasksCount > 0 ? String(navMyTasksCount) : "" }
  ];
  const getNavItems = () => {
    if (isCounselorEquivalentPortalRole(currentRole)) {
      return counselorNavItems;
    }
    switch (currentRole) {
      case "Student":
        return [
          { id: "dashboard", label: "My Application", icon: /* @__PURE__ */ jsx(LayoutDashboard, { size: 20 }) },
          { id: "resume", label: "AI Resume", icon: /* @__PURE__ */ jsx(FileText, { size: 20 }) },
          { id: "calendar", label: "Book Session", icon: /* @__PURE__ */ jsx(Calendar, { size: 20 }) },
          { id: "finance", label: "My Finances", icon: /* @__PURE__ */ jsx(DollarSign, { size: 20 }) },
          { id: "messages", label: "Messages", icon: /* @__PURE__ */ jsx(MessageSquare, { size: 20 }), badge: unreadMessageCount > 0 ? String(unreadMessageCount) : "" },
          { id: "tasks", label: "My Checklist", icon: /* @__PURE__ */ jsx(CheckSquare, { size: 20 }) }
        ];
      case "Country Coordinator":
        return [
          { id: "dashboard", label: "My Dashboard", icon: /* @__PURE__ */ jsx(LayoutDashboard, { size: 20 }) },
          { id: "calendar", label: "Calendar", icon: /* @__PURE__ */ jsx(Calendar, { size: 20 }) },
          { id: "students", label: "Country students", icon: /* @__PURE__ */ jsx(Users, { size: 20 }) },
          { id: "finance", label: "Ledger & Payments", icon: /* @__PURE__ */ jsx(DollarSign, { size: 20 }) },
          { id: "branch", label: "My Branch", icon: /* @__PURE__ */ jsx(BarChart3, { size: 20 }) },
          { id: "stage-escalations", label: "Stage SLA", icon: /* @__PURE__ */ jsx(AlertTriangle, { size: 20 }), badge: counselorStageEscalationBadge },
          { id: "university", label: "Uni Finder", icon: /* @__PURE__ */ jsx(Globe, { size: 20 }) },
          { id: "messages", label: "Inbox", icon: /* @__PURE__ */ jsx(MessageSquare, { size: 20 }), badge: unreadMessageCount > 0 ? String(unreadMessageCount) : "" },
          { id: "tasks", label: "My Tasks", icon: /* @__PURE__ */ jsx(CheckSquare, { size: 20 }), badge: typeof navMyTasksCount === "number" && navMyTasksCount > 0 ? String(navMyTasksCount) : "" }
        ];
      case "Accountant":
        return [
          { id: "dashboard", label: "Dashboard", icon: /* @__PURE__ */ jsx(LayoutDashboard, { size: 20 }) },
          { id: "students", label: "Students", icon: /* @__PURE__ */ jsx(Users, { size: 20 }) },
          { id: "finance", label: "Ledger & Payments", icon: /* @__PURE__ */ jsx(DollarSign, { size: 20 }) }
        ];
      case "Manager":
        return [
          { id: "dashboard", label: "Command Center", icon: /* @__PURE__ */ jsx(LayoutDashboard, { size: 20 }) },
          { id: "counselors", label: "Counselors", icon: /* @__PURE__ */ jsx(UserCog, { size: 20 }) },
          { id: "calendar", label: "Team Calendar", icon: /* @__PURE__ */ jsx(Calendar, { size: 20 }) },
          { id: "branch", label: "Branch Analytics", icon: /* @__PURE__ */ jsx(BarChart3, { size: 20 }) },
          { id: "students", label: "All Students", icon: /* @__PURE__ */ jsx(Users, { size: 20 }) },
          { id: "finance", label: "Ledger & Payments", icon: /* @__PURE__ */ jsx(DollarSign, { size: 20 }) },
          { id: "requested-students", label: "Requested Students", icon: /* @__PURE__ */ jsx(ClipboardList, { size: 20 }), badge: requestedStudentsBadge },
          { id: "university", label: "Uni Database", icon: /* @__PURE__ */ jsx(Globe, { size: 20 }) },
          { id: "messages", label: "Live Ops (Ghost)", icon: /* @__PURE__ */ jsx(MessageSquare, { size: 20 }) },
          { id: "tasks", label: "Escalations", icon: /* @__PURE__ */ jsx(CheckSquare, { size: 20 }), badge: pipelineEscalationBadge }
        ];
      case "Team Lead":
        return [
          { id: "dashboard", label: "Command Center", icon: /* @__PURE__ */ jsx(LayoutDashboard, { size: 20 }) },
          { id: "counselors", label: "Counselors", icon: /* @__PURE__ */ jsx(UserCog, { size: 20 }) },
          { id: "calendar", label: "Team Calendar", icon: /* @__PURE__ */ jsx(Calendar, { size: 20 }) },
          { id: "students", label: "All Students", icon: /* @__PURE__ */ jsx(Users, { size: 20 }) },
          { id: "finance", label: "Ledger & Payments", icon: /* @__PURE__ */ jsx(DollarSign, { size: 20 }) },
          { id: "university", label: "Uni Database", icon: /* @__PURE__ */ jsx(Globe, { size: 20 }) },
          { id: "messages", label: "Live Ops (Ghost)", icon: /* @__PURE__ */ jsx(MessageSquare, { size: 20 }) },
          { id: "tasks", label: "Escalations", icon: /* @__PURE__ */ jsx(CheckSquare, { size: 20 }), badge: pipelineEscalationBadge }
        ];
      case "Admin":
      default: {
        const adminNavItems = [
          { id: "dashboard", label: "Global Overview", icon: /* @__PURE__ */ jsx(LayoutDashboard, { size: 20 }) },
          { id: "counselors", label: "Counselors", icon: /* @__PURE__ */ jsx(UserCog, { size: 20 }) },
          { id: "branch", label: "Branch Analytics", icon: /* @__PURE__ */ jsx(BarChart3, { size: 20 }) },
          { id: "students", label: "All Students", icon: /* @__PURE__ */ jsx(Users, { size: 20 }) },
          { id: "finance", label: "Ledger & Payments", icon: /* @__PURE__ */ jsx(DollarSign, { size: 20 }) },
          { id: "requested-students", label: "Requested Students", icon: /* @__PURE__ */ jsx(ClipboardList, { size: 20 }), badge: requestedStudentsBadge },
          { id: "accounts", label: "Accounts", icon: /* @__PURE__ */ jsx(Contact, { size: 20 }) },
          { id: "university", label: "Uni Database", icon: /* @__PURE__ */ jsx(Globe, { size: 20 }) },
          { id: "tasks", label: "Escalations", icon: /* @__PURE__ */ jsx(CheckSquare, { size: 20 }), badge: pipelineEscalationBadge },
          { id: "messages", label: "Omni-Channel", icon: /* @__PURE__ */ jsx(MessageSquare, { size: 20 }) },
          { id: "maps", label: "Doc Mapping", icon: /* @__PURE__ */ jsx(MapPin, { size: 20 }) },
          { id: "web-forms", label: "Web Forms", icon: /* @__PURE__ */ jsx(FormInput, { size: 20 }) }
        ];
        if (adminChatEnabled) {
          const messagesIndex = adminNavItems.findIndex((item) => item.id === "messages");
          const integrationItem = { id: "integration", label: "Integrations", icon: /* @__PURE__ */ jsx(Plug, { size: 20 }) };
          if (messagesIndex >= 0) {
            adminNavItems.splice(messagesIndex, 0, integrationItem);
          } else {
            adminNavItems.push(integrationItem);
          }
        }
        return adminNavItems;
      }
    }
  };
  const navItems = getNavItems();
  return /* @__PURE__ */ jsxs("div", { className: "flex h-screen bg-[#F9FAFB] text-slate-900 font-sans overflow-hidden", children: [
    isMobileMenuOpen && /* @__PURE__ */ jsx(
      "div",
      {
        className: "fixed inset-0 bg-slate-900/50 z-[60] lg:hidden backdrop-blur-sm animate-in fade-in",
        onClick: () => setIsMobileMenuOpen(false)
      }
    ),
    /* @__PURE__ */ jsxs("aside", { className: `
        fixed inset-y-0 left-0 z-[70] w-64 max-h-screen overflow-y-auto overscroll-contain bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:hidden flex flex-col justify-between
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
      `, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "h-16 flex items-center px-6 border-b border-gray-100 justify-between", children: [
          /* @__PURE__ */ jsx("div", { className: "flex items-center w-[80%]", children: /* @__PURE__ */ jsx(
            "img",
            {
              src: "/MainLogo.png",
              alt: COMPANY_LOGO_ALT,
              className: "w-full h-auto object-contain",
              referrerPolicy: "no-referrer"
            }
          ) }),
          /* @__PURE__ */ jsx("button", { onClick: () => setIsMobileMenuOpen(false), className: "text-slate-400 hover:text-slate-600", children: /* @__PURE__ */ jsx(X, { size: 20 }) })
        ] }),
        /* @__PURE__ */ jsxs("nav", { className: "mt-6 flex flex-col gap-1 px-4", children: [
          /* @__PURE__ */ jsx("div", { className: "px-2 pb-4 mb-2 border-b border-gray-50", children: /* @__PURE__ */ jsxs("p", { className: "text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2", children: [
            currentRole,
            " Interface"
          ] }) }),
          navItems.map((item) => /* @__PURE__ */ jsx(
            NavItem,
            {
              icon: item.icon,
              label: item.label,
              isActive: activeView === item.id || activeView === "student-detail" && item.id === "students",
              onClick: () => {
                onNavigate(item.id);
                setIsMobileMenuOpen(false);
              },
              badge: item.badge
            },
            item.id
          ))
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-4 border-t border-gray-100", children: [
        currentRole === "Admin" ? /* @__PURE__ */ jsx(
          NavItem,
          {
            icon: /* @__PURE__ */ jsx(Settings, { size: 20 }),
            label: "Settings",
            isActive: activeView === "settings",
            onClick: () => {
              onNavigate("settings");
              setIsMobileMenuOpen(false);
            }
          }
        ) : null,
        /* @__PURE__ */ jsx(
          NavItem,
          {
            icon: /* @__PURE__ */ jsx(LogOut, { size: 20 }),
            label: "Logout",
            isActive: false,
            onClick: () => {
              onLogout?.();
              setIsMobileMenuOpen(false);
            },
            className: "text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("aside", { className: "hidden lg:flex w-64 border-r border-gray-200 bg-white flex-col justify-between transition-all duration-300 z-30 h-screen", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex-1 min-h-0 flex flex-col", children: [
        /* @__PURE__ */ jsx("div", { className: "h-16 flex items-center px-6 border-b border-gray-100 flex-shrink-0", children: /* @__PURE__ */ jsx("div", { className: "w-[80%] flex items-center", children: /* @__PURE__ */ jsx(
          "img",
          {
            src: "/MainLogo.png",
            alt: COMPANY_LOGO_ALT,
            className: "w-full h-auto object-contain",
            referrerPolicy: "no-referrer"
          }
        ) }) }),
        /* @__PURE__ */ jsxs("div", { className: "mt-6 flex flex-col px-4 flex-1 min-h-0", children: [
          /* @__PURE__ */ jsx("div", { className: "px-2 pb-4 mb-2 border-b border-gray-50 flex-shrink-0", children: /* @__PURE__ */ jsxs("p", { className: "text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2", children: [
            currentRole,
            " Interface"
          ] }) }),
          /* @__PURE__ */ jsxs("nav", { className: "flex-1 min-h-0 overflow-y-auto flex flex-col gap-1", children: [
            navItems.map((item) => /* @__PURE__ */ jsx(
              NavItem,
              {
                icon: item.icon,
                label: item.label,
                isActive: activeView === item.id || activeView === "student-detail" && item.id === "students",
                onClick: () => onNavigate(item.id),
                badge: item.badge
              },
              item.id
            ))
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-4 border-t border-gray-100", children: [
        currentRole === "Admin" ? /* @__PURE__ */ jsx(
          NavItem,
          {
            icon: /* @__PURE__ */ jsx(Settings, { size: 20 }),
            label: "Settings",
            isActive: activeView === "settings",
            onClick: () => onNavigate("settings")
          }
        ) : null,
        /* @__PURE__ */ jsx(
          NavItem,
          {
            icon: /* @__PURE__ */ jsx(LogOut, { size: 20 }),
            label: "Logout",
            isActive: false,
            onClick: () => {
              onLogout?.();
            },
            className: "text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("main", { className: "flex-1 flex flex-col min-w-0", children: [
      /* @__PURE__ */ jsxs("header", { className: "h-16 bg-white/80 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-4 lg:px-8 z-[50] sticky top-0", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center text-sm text-slate-500 gap-3", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setIsMobileMenuOpen(true),
              className: "lg:hidden p-2 -ml-2 text-slate-500 hover:bg-gray-100 rounded-md",
              children: /* @__PURE__ */ jsx(Menu, { size: 20 })
            }
          ),
          /* @__PURE__ */ jsxs("span", { className: "hidden md:inline-flex items-center bg-gray-100 px-2 py-1 rounded text-xs border border-gray-200 text-gray-500 mr-4", children: [
            /* @__PURE__ */ jsx(Command, { size: 12, className: "mr-1" }),
            " K"
          ] }),
          /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-900 capitalize", children: activeView.replace("-", " ") })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
          currentRole !== "Student" && /* @__PURE__ */ jsxs("div", { className: "relative hidden md:block", children: [
            /* @__PURE__ */ jsx(Search, { className: "absolute left-2.5 top-2.5 text-gray-400", size: 16 }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                placeholder: "Search anything...",
                className: "pl-9 pr-4 py-1.5 w-64 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white transition-all placeholder:text-gray-400"
              }
            )
          ] }),
          showWhatsappNavIndicator && /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: `relative p-2 rounded-full transition-colors hover:bg-gray-100 ${whatsappNavStatusClass(whatsappConnectionStatus)}`,
              title: whatsappNavStatusLabel(whatsappConnectionStatus),
              "aria-label": whatsappNavStatusLabel(whatsappConnectionStatus),
              onClick: () => onNavigate?.("integration"),
              children: /* @__PURE__ */ jsx(WhatsappGlyph, {})
            }
          ),
          /* @__PURE__ */ jsxs("div", { ref: notificationsPanelRef, className: "relative", children: [
            /* @__PURE__ */ jsxs("button", { className: "relative p-2 text-gray-500 hover:text-slate-900 hover:bg-gray-100 rounded-full transition-colors", onClick: () => setIsNotificationsOpen((prev) => !prev), children: [
              /* @__PURE__ */ jsx(Bell, { size: 20, strokeWidth: 1.5 }),
              notifications.length > 0 && /* @__PURE__ */ jsx("span", { className: "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border border-white", children: notifications.length > 99 ? "99+" : notifications.length })
            ] }),
            isNotificationsOpen && /* @__PURE__ */ jsxs("div", { className: "absolute right-0 mt-2 w-[360px] max-w-[92vw] bg-white border border-gray-200 rounded-xl shadow-2xl z-[130] overflow-hidden", children: [
              /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-100 flex items-center justify-between", children: [
                /* @__PURE__ */ jsxs("h4", { className: "text-sm font-semibold text-slate-900 flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx(Bell, { size: 14 }),
                  "Notifications"
                ] }),
                /* @__PURE__ */ jsx("button", { type: "button", className: "text-xs text-slate-500 hover:text-slate-700", onClick: () => onClearNotifications?.(), children: "Clear all" })
              ] }),
              notifications.length === 0 ? /* @__PURE__ */ jsx("div", { className: "px-4 py-8 text-center text-sm text-slate-400", children: "No notifications yet." }) : /* @__PURE__ */ jsx("div", { className: "max-h-96 overflow-y-auto divide-y divide-gray-100", children: notifications.map((n) => {
                const rowHasLink = Boolean(n?.link && (n.link.taskId || n.link.studentId || n.link.view));
                return /* @__PURE__ */ jsxs(
                  "div",
                  {
                    className: `px-4 py-3 flex items-start gap-3${rowHasLink ? " cursor-pointer hover:bg-slate-50" : ""}`,
                    ...(rowHasLink && onNotificationNavigate ? {
                      role: "button",
                      tabIndex: 0,
                      onClick: () => {
                        onNotificationNavigate(n);
                      },
                      onKeyDown: (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onNotificationNavigate(n);
                        }
                      }
                    } : {}),
                    children: [
                      /* @__PURE__ */ jsx("div", { className: `mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.type === "success" ? "bg-emerald-500" : n.type === "error" ? "bg-rose-500" : n.type === "warning" ? "bg-amber-500" : "bg-indigo-500"}` }),
                      /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
                        /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-900", children: n.title }),
                        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: n.message })
                      ] }),
                      /* @__PURE__ */ jsx("button", {
                        type: "button",
                        className: "text-slate-400 hover:text-slate-600 flex-shrink-0",
                        onClick: (e) => {
                          e.stopPropagation();
                          onRemoveNotification?.(n.id);
                        },
                        children: /* @__PURE__ */ jsx(X, { size: 14 })
                      })
                    ]
                  },
                  n.id
                );
              }) })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "relative", children: /* @__PURE__ */ jsxs("button", { className: "flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border border-transparent", onClick: handleProfileOpen, children: [
              /* @__PURE__ */ jsx("div", { className: "h-8 w-8 rounded-full border-2 border-white shadow-sm ring-1 ring-gray-100 overflow-hidden flex items-center justify-center bg-white", children: /* @__PURE__ */ jsx(
                "img",
                {
                    src: userAvatar || DEFAULT_USER_AVATAR,
                  alt: userName || "User profile",
                  className: "w-full h-full object-cover",
                  referrerPolicy: "no-referrer",
                  onError: (event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = DEFAULT_USER_AVATAR;
                  }
                }
              ) }),
              /* @__PURE__ */ jsxs("div", { className: "text-left hidden md:block", children: [
                /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold text-slate-900 leading-tight", children: getRoleDisplayName(currentRole) }),
                /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-500 leading-tight", children: userName || "Switch View" })
              ] })
            ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-auto p-4 lg:p-8", children: /* @__PURE__ */ jsx("div", { className: "max-w-7xl mx-auto h-full", children: pageBody }) }),
      /* @__PURE__ */ jsx("footer", { className: "border-t border-gray-200 bg-white px-4 lg:px-8 py-3", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between", children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: `© ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.` }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 sm:text-right", children: backendCompanyName ? `Powered by NexGenAI with ${backendCompanyName}` : "Powered by NexGenAI" })
      ] }) })
    ] }),
    isProfileOpen ? /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[120] overflow-y-auto overscroll-contain bg-slate-900/50 backdrop-blur-sm flex items-start justify-center py-8 px-4", onClick: handleProfileClose, children: /* @__PURE__ */ jsxs("div", { className: "w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-2xl max-h-[90vh] overflow-y-auto my-auto", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs("div", { className: "px-5 py-4 border-b border-gray-100 bg-slate-50", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold text-slate-900", children: "My Profile" }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-1", children: "View your account details and update profile photo." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "p-5 space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
          /* @__PURE__ */ jsx("img", { src: displayedAvatar, alt: userName || "Profile", className: "w-16 h-16 rounded-full object-cover border border-gray-200", referrerPolicy: "no-referrer", onError: (event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = DEFAULT_USER_AVATAR;
          } }),
          /* @__PURE__ */ jsxs("label", { className: "inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer", children: [
            "Change Photo",
            /* @__PURE__ */ jsx("input", { type: "file", accept: "image/*", className: "hidden", onChange: handleAvatarFileChange })
          ] })
        ] }),
        profileError ? /* @__PURE__ */ jsx("div", { className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: profileError }) : null,
        /* @__PURE__ */ jsxs("div", { className: "space-y-2 text-sm", children: [
          /* @__PURE__ */ jsxs("p", { className: "text-slate-700", children: [/* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-900", children: "Name: " }), userName || "-" ] }),
          /* @__PURE__ */ jsxs("p", { className: "text-slate-700", children: [/* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-900", children: "Role: " }), getRoleDisplayName(currentRole) || "-" ] }),
          isCounselorEquivalentPortalRole(currentRole) ? /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-500 uppercase block mb-1", children: "Email" }),
              /* @__PURE__ */ jsx("input", { type: "email", value: editableEmail, onChange: (event) => setEditableEmail(event.target.value), className: "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md outline-none focus:border-indigo-500" })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-500 uppercase block mb-1", children: "Contact Number" }),
              /* @__PURE__ */ jsx("input", { type: "text", value: editablePhone, onChange: (event) => setEditablePhone(event.target.value), className: "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md outline-none focus:border-indigo-500", placeholder: "+94 77 123 4567" })
            ] })
          ] }) : /* @__PURE__ */ jsxs("p", { className: "text-slate-700 break-all", children: [/* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-900", children: "Email: " }), userEmail || "-" ] }),
          /* @__PURE__ */ jsxs("p", { className: "text-slate-700", children: [/* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-900", children: "Branch: " }), userBranch || "-" ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [
          /* @__PURE__ */ jsx("button", { type: "button", onClick: handleProfileClose, className: "px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50", children: "Close" }),
          /* @__PURE__ */ jsx("button", { type: "button", onClick: handleProfileSave, disabled: isSavingProfile, className: "px-3 py-1.5 text-xs font-semibold rounded-md bg-[#0F172A] text-white hover:bg-slate-800 disabled:opacity-60", children: isSavingProfile ? "Saving..." : "Save photo" })
        ] })
      ] })
    ] }) }) : null
    
  ] });
};
const NavItem = ({ icon, label, isActive, onClick, badge, className }) => {
  return /* @__PURE__ */ jsxs(
    "button",
    {
      onClick,
      className: `
        group flex items-center justify-center lg:justify-start w-full p-2.5 rounded-md text-sm font-medium transition-all duration-200
        ${isActive ? "bg-slate-100 text-[#0F172A]" : "text-slate-500 hover:bg-gray-50 hover:text-slate-900"}
        ${className}
      `,
      children: [
        /* @__PURE__ */ jsx("span", { className: `${isActive ? "text-[#0F172A]" : "text-slate-400 group-hover:text-slate-600"}`, children: icon }),
        /* @__PURE__ */ jsx("span", { className: "ml-3 block flex-1 text-left", children: label }),
        badge && /* @__PURE__ */ jsx("span", { className: `
            inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[10px] font-bold shadow-sm
            ${isActive ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600 border border-indigo-100"}
            transition-all duration-300 group-hover:scale-110
        `, children: badge })
      ]
    }
  );
};
export {
  Layout
};
