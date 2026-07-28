import { jsx, jsxs } from "react/jsx-runtime";
import { X, MessageCircle } from "lucide-react";
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
  const studentLabel = String(studentName || "").trim() || "this student";

  return /* @__PURE__ */ jsx("div", {
    className:
      "fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm",
    onClick: onClose,
    children: /* @__PURE__ */ jsxs("div", {
      className:
        "bg-white rounded-xl border border-gray-200 shadow-2xl max-w-md w-full overflow-hidden",
      onClick: (e) => e.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxs("div", {
          className: "flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100",
          children: [
            /* @__PURE__ */ jsxs("div", {
              className: "flex items-start gap-3 min-w-0",
              children: [
                /* @__PURE__ */ jsx("div", {
                  className: "mt-0.5 p-2 rounded-lg bg-amber-50 text-amber-700 shrink-0",
                  children: /* @__PURE__ */ jsx(MessageCircle, { size: 18 }),
                }),
                /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsx("h3", {
                    className: "text-sm font-bold text-slate-900",
                    children: "Primary WhatsApp not connected",
                  }),
                  /* @__PURE__ */ jsxs("p", {
                    className: "text-xs text-slate-600 mt-1 leading-relaxed",
                    children: [
                      "Messages to ",
                      studentLabel,
                      " are sent from the Primary WhatsApp contact",
                      accountLabel ? " (" : "",
                      accountLabel ? /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-800", children: accountLabel }) : null,
                      accountLabel ? ")." : ".",
                    ],
                  }),
                ] }),
              ],
            }),
            /* @__PURE__ */ jsx("button", {
              type: "button",
              className: "p-1 rounded-md text-slate-500 hover:bg-slate-100 shrink-0",
              onClick: onClose,
              "aria-label": "Close",
              children: /* @__PURE__ */ jsx(X, { size: 18 }),
            }),
          ],
        }),
        /* @__PURE__ */ jsx("div", {
          className: "px-5 py-4",
          children: /* @__PURE__ */ jsx("p", {
            className: "text-sm text-slate-700 leading-relaxed",
            children:
              reason ||
              "Connect the WhatsApp account shown on the student profile, or assign a different Primary WhatsApp contact.",
          }),
        }),
        /* @__PURE__ */ jsxs("div", {
          className: "px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-2",
          children: [
            /* @__PURE__ */ jsx(Button, { variant: "ghost", type: "button", onClick: onClose, children: "Cancel" }),
            typeof onOpenStudentProfile === "function"
              ? /* @__PURE__ */ jsx(Button, {
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
