import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Lock, Mail } from "lucide-react";
import { Button } from "./Button";
import { saveLoginSession } from "../authSession";
import { loginAdmin } from "../authApi";

const LoginScreen = ({ onLoggedIn }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
      saveLoginSession(result.user);
      onLoggedIn(result.user);
    } finally {
      setIsLoading(false);
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
            /* @__PURE__ */ jsx("div", {
              className: "flex justify-center mb-5",
              children: /* @__PURE__ */ jsx("img", {
                src: "/MainLogo.png",
                alt: "ABEC Premier",
                className: "h-10 w-auto object-contain max-w-[220px]",
                referrerPolicy: "no-referrer"
              })
            }),
            /* @__PURE__ */ jsx("h1", {
              className: "font-semibold text-lg text-[#0F172A] text-center",
              children: "Sign in"
            }),
            /* @__PURE__ */ jsx("p", {
              className: "text-xs text-slate-500 mt-0.5 text-center",
              children: "Access your workspace with your ABEC Premier account."
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
                /* @__PURE__ */ jsx("button", {
                  type: "button",
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
            /* @__PURE__ */ jsx("p", {
              className: "text-[11px] text-center text-slate-400 leading-relaxed",
              children: "Use admin@gmail.com and admin@123 (from backend .env)."
            })
          ]
        })
      ]
    })
  });
};

export { LoginScreen };
