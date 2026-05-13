import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Mail } from "lucide-react";
import { Button } from "./Button";
import { saveLoginSession } from "../authSession";
import { changeStudentDefaultPassword, loginAdmin } from "../authApi";
import { COMPANY_NAME, COMPANY_SHORT_NAME } from "../companyConfig";

const LoginScreen = ({ onLoggedIn }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [pendingCurrentPassword, setPendingCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChangeError, setPasswordChangeError] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    if (!normalizedEmail || !normalizedPassword) {
      setError("Please enter your email and password.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await loginAdmin(normalizedEmail, normalizedPassword);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.user?.role === "Student" && result.user?.mustChangePassword) {
        setPendingUser(result.user);
        setPendingCurrentPassword(normalizedPassword);
        return;
      }
      saveLoginSession(result.user);
      onLoggedIn(result.user);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeDefaultPassword = async (e) => {
    e.preventDefault();
    setPasswordChangeError("");
    const pw = String(newPassword || "").trim();
    const pw2 = String(confirmPassword || "").trim();
    if (!pw || pw.length < 6) {
      setPasswordChangeError("New password must be at least 6 characters.");
      return;
    }
    if (pw !== pw2) {
      setPasswordChangeError("Passwords do not match.");
      return;
    }
    if (!pendingUser?.email || !pendingCurrentPassword) {
      setPasswordChangeError("Session expired. Please sign in again.");
      return;
    }
    setIsChangingPassword(true);
    try {
      const result = await changeStudentDefaultPassword(
        String(pendingUser.email || "").trim().toLowerCase(),
        pendingCurrentPassword,
        pw
      );
      if (!result.ok) {
        setPasswordChangeError(result.error || "Failed to update password.");
        return;
      }
      const nextUser = { ...pendingUser, mustChangePassword: false };
      saveLoginSession(nextUser);
      onLoggedIn(nextUser);
      setPendingUser(null);
      setPendingCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB] text-slate-900 font-sans p-4",
    children: [/* @__PURE__ */ jsxs("div", {
      className: "w-full max-w-md bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden",
      children: [
        /* @__PURE__ */ jsxs("div", {
          className: "p-6 border-b border-gray-100 bg-gray-50/50",
          children: [
            /* @__PURE__ */ jsxs("div", {
              className: "flex flex-col items-center mb-5",
              children: [
                /* @__PURE__ */ jsx("img", {
                  src: "/company-full-logo.png",
                  alt: COMPANY_SHORT_NAME,
                  className:
                    "h-[8.25rem] sm:h-[7.5rem] w-auto object-contain max-w-[510px]",
                  referrerPolicy: "no-referrer"
                }),
                // /* @__PURE__ */ jsx("img", {
                //   src: "/MainLogo.png",
                //   alt: "NexgenAI",
                //   className: "h-4 sm:h-5 w-auto object-contain max-w-[140px] opacity-90",
                //   referrerPolicy: "no-referrer"
                // })
              ]
            }),
            /* @__PURE__ */ jsx("h1", {
              className: "font-semibold text-lg text-[#0F172A] text-center",
              children: "Sign in"
            }),
            /* @__PURE__ */ jsx("p", {
              className: "text-xs text-slate-500 mt-0.5 text-center",
              children: `Access your workspace with your ${COMPANY_NAME} account.`
            })
          ]
        }),
        /* @__PURE__ */ jsxs("form", {
          onSubmit: handleSubmit,
          className: "p-6 space-y-5",
          children: [
            error
              ? /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2",
                  children: error
                })
              : null,
            /* @__PURE__ */ jsxs("div", {
              className: "space-y-1.5",
              children: [
                /* @__PURE__ */ jsx("label", {
                  className: "text-xs font-semibold text-slate-700 uppercase tracking-wide",
                  children: "Email"
                }),
                /* @__PURE__ */ jsxs("div", {
                  className: "relative",
                  children: [
                    /* @__PURE__ */ jsx(Mail, { className: "absolute left-3 top-2.5 text-slate-400", size: 16, strokeWidth: 2 }),
                    /* @__PURE__ */ jsx("input", {
                      type: "email",
                      autoComplete: "email",
                      value: email,
                      onChange: (e) => setEmail(e.target.value),
                      placeholder: "you@organization.com",
                      className:
                        "w-full pl-10 pr-3 py-2.5 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                    })
                  ]
                })
              ]
            }),
            /* @__PURE__ */ jsxs("div", {
              className: "space-y-1.5",
              children: [
                /* @__PURE__ */ jsx("label", {
                  className: "text-xs font-semibold text-slate-700 uppercase tracking-wide",
                  children: "Password"
                }),
                /* @__PURE__ */ jsxs("div", {
                  className: "relative",
                  children: [
                    /* @__PURE__ */ jsx(Lock, { className: "absolute left-3 top-2.5 text-slate-400", size: 16, strokeWidth: 2 }),
                    /* @__PURE__ */ jsx("input", {
                      type: "password",
                      autoComplete: "current-password",
                      value: password,
                      onChange: (e) => setPassword(e.target.value),
                      placeholder: "Enter your password",
                      className:
                        "w-full pl-10 pr-3 py-2.5 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                    })
                  ]
                })
              ]
            }),
            /* @__PURE__ */ jsxs("div", {
              className: "flex items-center justify-between text-xs text-slate-500",
              children: [
                /* @__PURE__ */ jsxs("label", {
                  className: "flex items-center gap-2 cursor-pointer select-none",
                  children: [
                    /* @__PURE__ */ jsx("input", {
                      type: "checkbox",
                      className: "rounded border-gray-300 text-indigo-600 focus:ring-indigo-500",
                      defaultChecked: true
                    }),
                    "Remember me"
                  ]
                }),
                /* @__PURE__ */ jsx(Link, {
                  to: "/forgot-password",
                  className: "text-indigo-600 hover:text-indigo-700 font-medium",
                  children: "Forgot password?"
                })
              ]
            }),
            /* @__PURE__ */ jsx(Button, {
              type: "submit",
              className: "w-full justify-center py-2.5",
              size: "lg",
              isLoading,
              children: "Sign in"
            }),
            /* @__PURE__ */ jsxs("div", {
              className: "inline-flex w-full flex-row flex-wrap items-center justify-center gap-2 mt-5 text-[11px] text-slate-400",
              children: [
                /* @__PURE__ */ jsx("span", { className: "leading-none shrink-0", children: "Powered by" }),
                /* @__PURE__ */ jsx("img", {
                  src: "/MainLogo.png",
                  alt: "NexgenAI",
                  className: "block h-4 sm:h-5 w-auto shrink-0 object-contain max-w-[140px] opacity-90",
                  referrerPolicy: "no-referrer"
                })
              ]
            })
          ]
        })
      ]
    }), pendingUser ? /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-[120] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4", children: /* @__PURE__ */ jsxs("div", { className: "w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-lg font-bold text-slate-900 text-center", children: "Change your password" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 text-center mt-1", children: "For security, you must set a new password before entering the portal." }),
      passwordChangeError ? /* @__PURE__ */ jsx("div", { className: "mt-4 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2", children: passwordChangeError }) : null,
      /* @__PURE__ */ jsxs("form", { onSubmit: handleChangeDefaultPassword, className: "mt-5 space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 uppercase tracking-wide", children: "New password" }),
          /* @__PURE__ */ jsx("input", { type: "password", autoComplete: "new-password", value: newPassword, onChange: (e) => setNewPassword(e.target.value), placeholder: "At least 6 characters", className: "w-full px-3 py-2.5 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 uppercase tracking-wide", children: "Re-enter password" }),
          /* @__PURE__ */ jsx("input", { type: "password", autoComplete: "new-password", value: confirmPassword, onChange: (e) => setConfirmPassword(e.target.value), placeholder: "Re-enter new password", className: "w-full px-3 py-2.5 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400" })
        ] }),
        /* @__PURE__ */ jsx(Button, { type: "submit", className: "w-full justify-center py-2.5", size: "lg", isLoading: isChangingPassword, children: "Update password" })
      ] })
    ] }) }) : null]
  });
};

export { LoginScreen };
