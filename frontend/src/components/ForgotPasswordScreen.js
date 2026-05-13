import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Lock, Mail } from "lucide-react";
import { Button } from "./Button";
import { requestPasswordOtp, resetPasswordWithOtp } from "../authApi";
import { COMPANY_NAME, COMPANY_SHORT_NAME, COMPANY_FULL_LOGO, ACTIVE_PROFILE } from "../companyConfig";

const ForgotPasswordScreen = () => {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isResetSuccessful, setIsResetSuccessful] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setIsResetSuccessful(false);
    if (!normalizedEmail) {
      setError("Please enter your registered email.");
      return;
    }
    setIsSendingOtp(true);
    try {
      const result = await requestPasswordOtp(normalizedEmail);
      if (!result.ok) {
        setError(result.error);
        setOtpSent(false);
        return;
      }
      setOtpSent(true);
      setInfo(result.message || "If this account exists, a code was sent to the email.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setIsResetSuccessful(false);
    const code = otp.trim();
    const pw = newPassword.trim();
    const pw2 = confirmPassword.trim();
    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }
    if (!code) {
      setError("Enter the verification code from your email.");
      return;
    }
    if (!pw || pw.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (pw !== pw2) {
      setError("Passwords do not match.");
      return;
    }
    setIsResetting(true);
    try {
      const result = await resetPasswordWithOtp(normalizedEmail, code, pw);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo(result.message || "Password updated. You can sign in now.");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setOtpSent(false);
      setIsResetSuccessful(true);
    } finally {
      setIsResetting(false);
    }
  };

  return /* @__PURE__ */ jsx("div", {
    className: "min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB] text-slate-900 font-sans p-4",
    children: /* @__PURE__ */ jsxs("div", {
      className: "w-full max-w-md bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden",
      children: [
        /* @__PURE__ */ jsxs("div", {
          className: "p-6 border-b border-gray-100 bg-gray-50/50",
          children: [
            /* @__PURE__ */ jsxs("div", {
              className: "flex flex-col items-center mb-5",
              children: [
                /* @__PURE__ */ jsx("img", {
                  key: ACTIVE_PROFILE,
                  src: COMPANY_FULL_LOGO,
                  alt: COMPANY_SHORT_NAME,
                  className:
                    "h-[8.25rem] sm:h-[7.5rem] w-auto object-contain max-w-[510px]",
                  referrerPolicy: "no-referrer"
                })
              ]
            }),
            /* @__PURE__ */ jsx("h1", {
              className: "font-semibold text-lg text-[#0F172A] text-center",
              children: "Reset password"
            }),
            /* @__PURE__ */ jsx("p", {
              className: "text-xs text-slate-500 mt-0.5 text-center",
              children: "We will email a verification code to your registered address."
            })
          ]
        }),
        /* @__PURE__ */ jsxs("div", {
          className: "p-6 space-y-6",
          children: [
            error
              ? /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2",
                  children: error
                })
              : null,
            info
              ? /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2",
                  children: info
                })
              : null,
            !isResetSuccessful
              ? /* @__PURE__ */ jsxs("form", {
                  onSubmit: handleSendOtp,
                  className: "space-y-4",
                  children: [
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
                        /* @__PURE__ */ jsx(Mail, {
                          className: "absolute left-3 top-2.5 text-slate-400",
                          size: 16,
                          strokeWidth: 2
                        }),
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
                /* @__PURE__ */ jsx(Button, {
                  type: "submit",
                  className: "w-full justify-center py-2.5",
                  size: "lg",
                  isLoading: isSendingOtp,
                  children: otpSent ? "Resend code" : "Send verification code"
                })
                  ]
                })
              : null,
            !isResetSuccessful && (otpSent || otp || newPassword || confirmPassword)
              ? /* @__PURE__ */ jsxs("form", {
                  onSubmit: handleReset,
                  className: "space-y-4 pt-2 border-t border-gray-100",
                  children: [
                    /* @__PURE__ */ jsxs("div", {
                      className: "space-y-1.5",
                      children: [
                        /* @__PURE__ */ jsx("label", {
                          className: "text-xs font-semibold text-slate-700 uppercase tracking-wide",
                          children: "Verification code"
                        }),
                        /* @__PURE__ */ jsxs("div", {
                          className: "relative",
                          children: [
                            /* @__PURE__ */ jsx(KeyRound, {
                              className: "absolute left-3 top-2.5 text-slate-400",
                              size: 16,
                              strokeWidth: 2
                            }),
                            /* @__PURE__ */ jsx("input", {
                              type: "text",
                              inputMode: "numeric",
                              autoComplete: "one-time-code",
                              value: otp,
                              onChange: (e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)),
                              placeholder: "6-digit code",
                              className:
                                "w-full pl-10 pr-3 py-2.5 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400 tracking-widest"
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
                          children: "New password"
                        }),
                        /* @__PURE__ */ jsxs("div", {
                          className: "relative",
                          children: [
                            /* @__PURE__ */ jsx(Lock, {
                              className: "absolute left-3 top-2.5 text-slate-400",
                              size: 16,
                              strokeWidth: 2
                            }),
                            /* @__PURE__ */ jsx("input", {
                              type: "password",
                              autoComplete: "new-password",
                              value: newPassword,
                              onChange: (e) => setNewPassword(e.target.value),
                              placeholder: "At least 6 characters",
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
                          children: "Confirm new password"
                        }),
                        /* @__PURE__ */ jsxs("div", {
                          className: "relative",
                          children: [
                            /* @__PURE__ */ jsx(Lock, {
                              className: "absolute left-3 top-2.5 text-slate-400",
                              size: 16,
                              strokeWidth: 2
                            }),
                            /* @__PURE__ */ jsx("input", {
                              type: "password",
                              autoComplete: "new-password",
                              value: confirmPassword,
                              onChange: (e) => setConfirmPassword(e.target.value),
                              placeholder: "Repeat new password",
                              className:
                                "w-full pl-10 pr-3 py-2.5 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                            })
                          ]
                        })
                      ]
                    }),
                    /* @__PURE__ */ jsx(Button, {
                      type: "submit",
                      className: "w-full justify-center py-2.5",
                      size: "lg",
                      isLoading: isResetting,
                      children: "Update password"
                    })
                  ]
                })
              : null,
            /* @__PURE__ */ jsx("div", {
              className: "text-center text-xs",
              children: /* @__PURE__ */ jsx(Link, {
                to: "/dashboard",
                className: "text-indigo-600 hover:text-indigo-700 font-medium",
                children: "Back to sign in"
              })
            })
          ]
        })
      ]
    })
  });
};

export { ForgotPasswordScreen };
