import { jsx, jsxs } from "react/jsx-runtime";
import { AlertTriangle, MessageCircle, X } from "lucide-react";
import { Button } from "./Button";
import { formatWhatsappContactCardTitle } from "../utils/branchWhatsappAccounts";
import { canAccessWhatsappIntegration, isBranchWhatsappManagerRole } from "../roles";

export function PrimaryWhatsappConnectPrompt({
  open,
  onClose,
  studentName = "",
  account = null,
  reason = "",
  currentRole = "",
  currentUserId = "",
  adminChatEnabled = false,
  branchWhatsappEnabled = false,
  branchWhatsappSharedEnabled = false,
  onOpenIntegrations,
  onOpenStudentProfile,
}) {
  if (!open) return null;

  const messengerUserId = String(account?.userId || "").trim();
  const canOpenIntegrations = canAccessWhatsappIntegration(currentRole, adminChatEnabled, branchWhatsappEnabled);
  const isAccountOwner =
    messengerUserId && String(currentUserId || "").trim() === messengerUserId;
  const canConnectOwnAccount =
    canOpenIntegrations &&
    (isAccountOwner ||
      isBranchWhatsappManagerRole(currentRole) ||
      String(currentRole || "").trim() === "Admin");
  const accountLabel = formatWhatsappContactCardTitle(account);
  const accountNumber = String(account?.whatsappNumber || "").trim();
  const staffName = String(account?.name || "").trim();
  const studentLabel = String(studentName || "").trim() || "this student";
  const bodyText =
    reason ||
    (branchWhatsappSharedEnabled
      ? "Connect the branch WhatsApp account under Integrations. Messages to this student are sent only from that shared team number."
      : "Connect the WhatsApp account shown on the student profile, or assign a different Primary WhatsApp contact.");

  return /* @__PURE__ */ jsx("div", {
    className:
      "fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm",
    onClick: onClose,
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "primary-whatsapp-prompt-title",
    children: /* @__PURE__ */ jsxs("div", {
      className:
        "bg-white rounded-xl border border-gray-200 shadow-2xl max-w-md w-full overflow-hidden",
      onClick: (e) => e.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxs("div", {
          className:
            "px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/80",
          children: [
            /* @__PURE__ */ jsx("h4", {
              id: "primary-whatsapp-prompt-title",
              className: "text-sm font-semibold text-slate-900",
              children: "Primary WhatsApp not connected",
            }),
            /* @__PURE__ */ jsx("button", {
              type: "button",
              className: "p-1 rounded-md text-slate-500 hover:bg-slate-100",
              onClick: onClose,
              "aria-label": "Close",
              children: /* @__PURE__ */ jsx(X, { size: 18 }),
            }),
          ],
        }),
        /* @__PURE__ */ jsxs("div", { className: "p-4 space-y-3", children: [
          /* @__PURE__ */ jsxs("div", {
            className:
              "flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-3",
            children: [
              /* @__PURE__ */ jsx(AlertTriangle, {
                size: 18,
                className: "text-amber-700 shrink-0 mt-0.5",
              }),
              /* @__PURE__ */ jsxs("div", { className: "text-sm text-amber-900 space-y-2 min-w-0", children: [
                /* @__PURE__ */ jsxs("p", {
                  children: [
                    "Messages to ",
                    /* @__PURE__ */ jsx("span", { className: "font-semibold", children: studentLabel }),
                    " are sent from the Primary WhatsApp contact for this student.",
                  ],
                }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-amber-800", children: bodyText }),
              ] }),
            ],
          }),
          /* @__PURE__ */ jsxs("div", {
            className: "rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 space-y-1.5",
            children: [
              /* @__PURE__ */ jsxs("div", {
                className: "flex items-center gap-2 text-xs font-semibold text-slate-700",
                children: [
                  /* @__PURE__ */ jsx(MessageCircle, { size: 14, className: "text-slate-500 shrink-0" }),
                  "Primary contact",
                ],
              }),
              /* @__PURE__ */ jsx("p", {
                className: "text-sm font-medium text-slate-900 truncate",
                children: accountLabel || "No account assigned",
              }),
              staffName && staffName !== accountLabel
                ? /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-600 truncate", children: [
                    "Staff: ",
                    /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-800", children: staffName }),
                  ] })
                : null,
              accountNumber
                ? /* @__PURE__ */ jsx("p", {
                    className: "text-xs text-slate-500 font-mono tabular-nums",
                    children: accountNumber,
                  })
                : null,
              /* @__PURE__ */ jsx("span", {
                className:
                  "inline-flex items-center mt-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800",
                children: "Not connected",
              }),
            ],
          }),
          /* @__PURE__ */ jsx("p", {
            className: "text-[11px] text-slate-500",
            children: branchWhatsappSharedEnabled
              ? "Connect the shared branch WhatsApp under Integrations. Student messages always use that team account."
              : "Connect the linked WhatsApp under Integrations, or request a different Primary contact on this profile.",
          }),
        ] }),
        /* @__PURE__ */ jsxs("div", {
          className: "px-4 py-3 border-t border-gray-100 flex flex-wrap justify-end gap-2",
          children: [
            /* @__PURE__ */ jsx(Button, {
              size: "sm",
              variant: "outline",
              type: "button",
              onClick: onClose,
              children: "Dismiss",
            }),
            typeof onOpenStudentProfile === "function"
              ? /* @__PURE__ */ jsx(Button, {
                  size: "sm",
                  variant: "outline",
                  type: "button",
                  onClick: () => {
                    onOpenStudentProfile();
                    onClose();
                  },
                  children: "Change Primary contact",
                })
              : null,
            canConnectOwnAccount && typeof onOpenIntegrations === "function"
              ? /* @__PURE__ */ jsx(Button, {
                  size: "sm",
                  type: "button",
                  onClick: () => {
                    onOpenIntegrations();
                    onClose();
                  },
                  children: isAccountOwner ? "Connect WhatsApp" : "Open Integrations",
                })
              : null,
          ],
        }),
      ],
    }),
  });
}
