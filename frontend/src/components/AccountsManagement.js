import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./Button";
import { dt } from "./DataTable";
import { Copy, Eye, EyeOff, KeyRound, Plus, RefreshCw, Search, Shield, UserPen, X } from "lucide-react";
import {
  createAccount,
  getAccounts,
  getBranches,
  getCountries,
  resetAccountPassword,
  updateAccountProfile,
  updateAccountRole,
  updateAdminAvatar
} from "../authApi";
import { QuietPageSkeleton } from "./LoadingPlaceholder";
import {
  VISA_OFFICER_COUNSELOR_ROLE,
  VISA_OFFICER_ROLE,
} from "../roles";
import { getRoleDisplayName } from "../roleDisplay";

function generateTempPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;
  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 8 }, () => pick(all));
  return [...required, ...rest].sort(() => Math.random() - 0.5).join("");
}

function accountRoleSelectValue(role) {
  if (role === "Consultor") return "Counselor";
  const r = String(role || "").trim();
  if (r === "Team Lead" && getRoleDisplayName("Manager") === "Team Lead") return "Manager";
  return r;
}

function getAccountRoleOptions() {
  const managerLabel = getRoleDisplayName("Manager");
  const options = [
    { value: "Admin", label: "Admin" },
    { value: "Manager", label: managerLabel },
    { value: "Accountant", label: "Accountant" },
    { value: "Counselor", label: "Counselor" },
    { value: VISA_OFFICER_ROLE, label: VISA_OFFICER_ROLE },
    { value: VISA_OFFICER_COUNSELOR_ROLE, label: VISA_OFFICER_COUNSELOR_ROLE },
    { value: "Country Coordinator", label: "Country Coordinator" }
  ];
  if (managerLabel !== "Team Lead") {
    options.splice(2, 0, { value: "Team Lead", label: "Team Lead" });
  }
  return options;
}

function roleBadgeClass(role) {
  switch (getRoleDisplayName(role)) {
    case "Admin":
      return "bg-slate-900 text-white border-slate-800";
    case "Manager":
    case "Manager Level":
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    case "Team Lead":
      return "bg-violet-50 text-violet-800 border-violet-200";
    case "Counselor":
    case "Visa Officer":
    case "Visa Officer & Counselor":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "Country Coordinator":
      return "bg-cyan-50 text-cyan-900 border-cyan-200";
    case "Accountant":
      return "bg-teal-50 text-teal-800 border-teal-200";
    case "Student":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    default:
      return "bg-slate-50 text-slate-700 border-gray-200";
  }
}

const AccountsManagement = ({ onResetPassword, onAccountCreated, onAdminAvatarUpdated, onProfileUpdated }) => {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [branchOptions, setBranchOptions] = useState([]);
  const [countryOptions, setCountryOptions] = useState([]);
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "Manager",
    branch: "",
    country: ""
  });
  const [newAccountAvatar, setNewAccountAvatar] = useState("");
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [roleTarget, setRoleTarget] = useState(null);
  const [roleForm, setRoleForm] = useState({ role: "Manager", branch: "", country: "" });
  const [roleError, setRoleError] = useState("");
  const [roleSuccess, setRoleSuccess] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  const [profileTarget, setProfileTarget] = useState(null);
  const [profileForm, setProfileForm] = useState({ username: "", email: "" });
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [pageLoads, setPageLoads] = useState({
    accounts: false,
    branches: false,
    countries: false
  });
  const accountsPageReady = pageLoads.accounts && pageLoads.branches && pageLoads.countries;

  useEffect(() => {
    const load = async () => {
      try {
        const result = await getAccounts();
        if (!result.ok) {
          setLoadError(result.error);
          return;
        }
        setRows(result.data);
      } finally {
        setPageLoads((p) => ({ ...p, accounts: true }));
      }
    };
    load();
  }, []);
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const result = await getBranches();
        if (!result.ok) return;
        setBranchOptions(result.data.map((b) => b.location));
      } finally {
        setPageLoads((p) => ({ ...p, branches: true }));
      }
    };
    loadBranches();
  }, []);
  useEffect(() => {
    const loadCountries = async () => {
      try {
        const result = await getCountries();
        if (!result.ok) return;
        setCountryOptions(result.data);
      } finally {
        setPageLoads((p) => ({ ...p, countries: true }));
      }
    };
    loadCountries();
  }, []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.username.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const openResetDialog = (row) => {
    setResetTarget(row);
    setResetPasswordValue("");
    setResetError("");
    setResetSuccess("");
    setShowResetPassword(false);
  };

  const closeResetDialog = () => {
    if (resetSaving) return;
    setResetTarget(null);
    setResetPasswordValue("");
    setResetError("");
    setResetSuccess("");
    setShowResetPassword(false);
  };

  const openRoleDialog = (row) => {
    setRoleTarget(row);
    setRoleForm({
      role: accountRoleSelectValue(row.role) || "Manager",
      branch: row.branch || "",
      country: row.country || countryOptions[0] || ""
    });
    setRoleError("");
    setRoleSuccess("");
  };

  const closeRoleDialog = () => {
    if (roleSaving) return;
    setRoleTarget(null);
    setRoleError("");
    setRoleSuccess("");
  };

  const openProfileDialog = (row) => {
    setProfileTarget(row);
    setProfileForm({
      username: row.username || "",
      email: row.email || ""
    });
    setProfileError("");
    setProfileSuccess("");
  };

  const closeProfileDialog = () => {
    if (profileSaving) return;
    setProfileTarget(null);
    setProfileError("");
    setProfileSuccess("");
  };

  const handleConfirmProfileChange = async () => {
    if (!profileTarget) return;
    const username = String(profileForm.username || "").trim();
    const email = String(profileForm.email || "").trim().toLowerCase();
    if (!username) {
      setProfileError("Username is required.");
      return;
    }
    if (!email) {
      setProfileError("Email is required.");
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      setProfileError("Enter a valid email.");
      return;
    }
    setProfileError("");
    setProfileSaving(true);
    setPendingId(profileTarget.id);
    const result = await updateAccountProfile(profileTarget.id, { username, email });
    setProfileSaving(false);
    setPendingId(null);
    if (!result.ok) {
      setProfileError(result.error || "Failed to update profile.");
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === profileTarget.id ? { ...row, ...result.data } : row)));
    setProfileSuccess(`Profile updated for ${username}.`);
    onProfileUpdated?.({ ...profileTarget, ...result.data });
  };

  const handleConfirmRoleChange = async () => {
    if (!roleTarget) return;
    if (roleForm.role === "Country Coordinator" && !roleForm.country) {
      setRoleError("Select a country for this Country Coordinator account.");
      return;
    }
    if (roleForm.role !== "Admin" && !roleForm.branch) {
      setRoleError("Select a branch for this access level.");
      return;
    }
    setRoleError("");
    setRoleSaving(true);
    setPendingId(roleTarget.id);
    const result = await updateAccountRole(roleTarget.id, {
      role: roleForm.role,
      branch: roleForm.role === "Admin" ? "" : roleForm.branch,
      country: roleForm.role === "Country Coordinator" ? roleForm.country : ""
    });
    setRoleSaving(false);
    setPendingId(null);
    if (!result.ok) {
      setRoleError(result.error || "Failed to update access level.");
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === roleTarget.id ? { ...row, ...result.data } : row)));
    setRoleSuccess(`Access level updated for ${roleTarget.username}.`);
  };

  const handleConfirmReset = async () => {
    if (!resetTarget) return;
    const newPassword = resetPasswordValue.trim();
    if (newPassword.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    setResetError("");
    setResetSaving(true);
    setPendingId(resetTarget.id);
    const result = await resetAccountPassword(resetTarget.id, newPassword);
    setResetSaving(false);
    setPendingId(null);
    if (!result.ok) {
      setResetError(result.error || "Failed to reset password.");
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === resetTarget.id ? { ...row, ...result.data } : row)));
    setResetSuccess(`New password set. Share it securely with ${resetTarget.username}.`);
    onResetPassword?.({ ...resetTarget, ...result.data });
  };

  const handleCopyPassword = async () => {
    if (!resetPasswordValue) return;
    try {
      await navigator.clipboard.writeText(resetPasswordValue);
    } catch {
      // Clipboard API may be blocked in insecure origins; ignore.
    }
  };

  const handleAdminAvatarUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Please choose an image file.");
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read-failed"));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) {
      setFormError("Failed to read image file.");
      return;
    }
    setIsUploadingAvatar(true);
    const result = await updateAdminAvatar(dataUrl);
    setIsUploadingAvatar(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setRows((prev) => prev.map((row) => row.id === "ADM001" ? result.data : row));
    onAdminAvatarUpdated?.(result.data);
  };

  if (!accountsPageReady) {
    return /* @__PURE__ */ jsx(QuietPageSkeleton, {});
  }

  return /* @__PURE__ */ jsxs("div", {
    className: "space-y-6",
    children: [
      /* @__PURE__ */ jsxs("div", {
        className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4",
        children: [
          /* @__PURE__ */ jsxs("div", {
            children: [
              /* @__PURE__ */ jsx("h2", {
                className: "text-xl font-bold text-slate-900 tracking-tight",
                children: "Accounts"
              }),
              /* @__PURE__ */ jsx("p", {
                className: "text-sm text-slate-500 mt-0.5",
                children: "Manage platform logins. Add accounts, edit usernames and emails, change access levels, and reset passwords (except the primary admin login)."
              })
            ]
          }),
          /* @__PURE__ */ jsxs("div", {
            className: "flex w-full sm:w-auto gap-2",
            children: [
              /* @__PURE__ */ jsxs("div", {
                className: "relative flex-1 sm:w-72",
                children: [
                  /* @__PURE__ */ jsx(Search, { className: "absolute left-3 top-2.5 text-slate-400", size: 16 }),
                  /* @__PURE__ */ jsx("input", {
                    type: "search",
                    value: query,
                    onChange: (e) => setQuery(e.target.value),
                    placeholder: "Search username, email, role…",
                    className:
                      "w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400"
                  })
                ]
              }),
              /* @__PURE__ */ jsxs(Button, {
                type: "button",
                className: "gap-1.5 whitespace-nowrap",
                onClick: () => setIsAddOpen(true),
                children: [
                  /* @__PURE__ */ jsx(Plus, { size: 14 }),
                  "Add Account"
                ]
              })
            ]
          })
        ]
      }),
      loadError ? /* @__PURE__ */ jsx("div", {
        className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2",
        children: loadError
      }) : null,
      /* @__PURE__ */ jsxs("div", {
        className: dt.card,
        children: [
          /* @__PURE__ */ jsx("div", {
            className: dt.scroll,
            children: /* @__PURE__ */ jsxs("table", {
              className: dt.table,
              children: [
                /* @__PURE__ */ jsx("thead", {
                  className: dt.head,
                  children: /* @__PURE__ */ jsxs("tr", {
                    children: [
                      /* @__PURE__ */ jsx("th", {
                        className: "px-4 py-3 font-semibold w-[72px]",
                        "aria-label": "Photo"
                      }),
                      /* @__PURE__ */ jsx("th", { className: "px-4 py-3 font-semibold", children: "Username" }),
                      /* @__PURE__ */ jsx("th", { className: "px-4 py-3 font-semibold", children: "Email" }),
                      /* @__PURE__ */ jsx("th", { className: "px-4 py-3 font-semibold", children: "Role" }),
                      /* @__PURE__ */ jsx("th", {
                        className: "px-4 py-3 font-semibold text-right",
                        children: "Actions"
                      })
                    ]
                  })
                }),
                /* @__PURE__ */ jsx("tbody", {
                  className: dt.body,
                  children: filtered.map((row) =>
                    /* @__PURE__ */ jsxs(
                      "tr",
                      {
                        className: "hover:bg-slate-50/80 transition-colors",
                        children: [
                          /* @__PURE__ */ jsx("td", {
                            className: "px-4 py-3",
                            children: /* @__PURE__ */ jsx("img", {
                              src: row.avatar,
                              alt: "",
                              className:
                                "h-10 w-10 rounded-full object-cover border border-gray-200 bg-slate-100 flex-shrink-0",
                              referrerPolicy: "no-referrer"
                            })
                          }),
                          /* @__PURE__ */ jsx("td", {
                            className: "px-4 py-3 text-slate-700 font-medium",
                            children: row.username
                          }),
                          /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-slate-600", children: row.email }),
                          /* @__PURE__ */ jsx("td", {
                            className: "px-4 py-3",
                            children: /* @__PURE__ */ jsx("span", {
                              className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleBadgeClass(row.role)}`,
                              children: getRoleDisplayName(row.role)
                            })
                          }),
                          /* @__PURE__ */ jsx("td", {
                            className: "px-4 py-3 text-right",
                            children: /* @__PURE__ */ jsxs("div", {
                              className: "flex justify-end gap-2",
                              children: [
                                row.id === "ADM001" ? /* @__PURE__ */ jsxs("div", {
                                  className: "contents",
                                  children: [
                                    /* @__PURE__ */ jsx("input", {
                                      ref: fileRef,
                                      type: "file",
                                      accept: "image/*",
                                      className: "hidden",
                                      onChange: (e) => {
                                        const file = e.target.files?.[0] || null;
                                        handleAdminAvatarUpload(file);
                                        e.currentTarget.value = "";
                                      }
                                    }),
                                    /* @__PURE__ */ jsx(Button, {
                                      type: "button",
                                      variant: "secondary",
                                      size: "sm",
                                      isLoading: isUploadingAvatar,
                                      onClick: () => fileRef.current?.click(),
                                      children: "Upload photo"
                                    })
                                  ]
                                }) : null,
                                row.id !== "ADM001" ? /* @__PURE__ */ jsxs(Button, {
                                  type: "button",
                                  variant: "outline",
                                  size: "sm",
                                  className: "gap-1.5",
                                  isLoading: pendingId === row.id,
                                  onClick: () => openProfileDialog(row),
                                  children: [
                                    /* @__PURE__ */ jsx(UserPen, { size: 14 }),
                                    "Edit profile"
                                  ]
                                }) : null,
                                row.id !== "ADM001" ? /* @__PURE__ */ jsxs(Button, {
                                  type: "button",
                                  variant: "outline",
                                  size: "sm",
                                  className: "gap-1.5",
                                  isLoading: pendingId === row.id,
                                  onClick: () => openRoleDialog(row),
                                  children: [
                                    /* @__PURE__ */ jsx(Shield, { size: 14 }),
                                    "Change access"
                                  ]
                                }) : null,
                                row.id !== "ADM001" ? /* @__PURE__ */ jsxs(Button, {
                                  type: "button",
                                  variant: "outline",
                                  size: "sm",
                                  className: "gap-1.5",
                                  isLoading: pendingId === row.id,
                                  onClick: () => openResetDialog(row),
                                  children: [
                                    /* @__PURE__ */ jsx(KeyRound, { size: 14 }),
                                    "Reset password"
                                  ]
                                }) : null
                              ].filter(Boolean)
                            })
                          })
                        ]
                      },
                      row.id
                    )
                  )
                })
              ]
            })
          }),
          filtered.length === 0 &&
            /* @__PURE__ */ jsx("div", {
              className: "px-4 py-12 text-center text-slate-500 text-sm",
              children: "No accounts match your search."
            })
        ].filter(Boolean)
      }),
      isAddOpen ? /* @__PURE__ */ jsx("div", {
        className: "fixed inset-0 z-[110] overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/50 backdrop-blur-sm",
        children: /* @__PURE__ */ jsxs("div", {
          className: "w-full max-w-md bg-white rounded-xl border border-gray-100 shadow-2xl max-h-[90vh] overflow-y-auto my-auto",
          children: [
            /* @__PURE__ */ jsxs("div", {
              className: "p-5 border-b border-gray-100 bg-gray-50/60 flex items-start justify-between",
              children: [
                /* @__PURE__ */ jsxs("div", {
                  children: [
                    /* @__PURE__ */ jsx("h3", { className: "font-semibold text-lg text-slate-900", children: "Add Account" }),
                    /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Create an Admin, Manager, counselor-type, or Country Coordinator account." })
                  ]
                }),
                /* @__PURE__ */ jsx("button", {
                  type: "button",
                  className: "text-slate-400 hover:text-slate-600",
                  onClick: () => {
                    setIsAddOpen(false);
                    setFormError("");
                  },
                  children: /* @__PURE__ */ jsx(X, { size: 18 })
                })
              ]
            }),
            /* @__PURE__ */ jsxs("form", {
              className: "p-5 space-y-4",
              onSubmit: async (e) => {
                e.preventDefault();
                setFormError("");
                if (form.role === "Country Coordinator" && !form.country) {
                  setFormError("Select a country for this Country Coordinator account.");
                  return;
                }
                setIsSaving(true);
                const result = await createAccount({
                  ...form,
                  branch: form.role === "Admin" ? "" : form.branch,
                  country: form.role === "Country Coordinator" ? form.country : "",
                  teamLeadId: "",
                  teamLeadName: "",
                  teamLeadEmail: "",
                  avatar: newAccountAvatar || void 0
                });
                setIsSaving(false);
                if (!result.ok) {
                  setFormError(result.error);
                  return;
                }
                setRows((prev) => [result.data, ...prev]);
                onAccountCreated?.(result.data);
                setIsAddOpen(false);
                setForm({ username: "", email: "", password: "", role: "Manager", branch: "", country: "" });
                setNewAccountAvatar("");
              },
              children: [
                formError ? /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2",
                  children: formError
                }) : null,
                /* @__PURE__ */ jsxs("div", {
                  className: "space-y-1.5",
                  children: [
                    /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Username" }),
                    /* @__PURE__ */ jsx("input", {
                      className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      value: form.username,
                      onChange: (e) => setForm((prev) => ({ ...prev, username: e.target.value })),
                      required: true
                    })
                  ]
                }),
                /* @__PURE__ */ jsxs("div", {
                  className: "space-y-1.5",
                  children: [
                    /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Email" }),
                    /* @__PURE__ */ jsx("input", {
                      type: "email",
                      className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      value: form.email,
                      onChange: (e) => setForm((prev) => ({ ...prev, email: e.target.value })),
                      required: true
                    })
                  ]
                }),
                /* @__PURE__ */ jsxs("div", {
                  className: "space-y-1.5",
                  children: [
                    /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Password" }),
                    /* @__PURE__ */ jsx("input", {
                      type: "password",
                      className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      value: form.password,
                      onChange: (e) => setForm((prev) => ({ ...prev, password: e.target.value })),
                      required: true
                    })
                  ]
                }),
                /* @__PURE__ */ jsxs("div", {
                  className: "space-y-1.5",
                  children: [
                    /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Role" }),
                    /* @__PURE__ */ jsxs("select", {
                      className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      value: form.role,
                      onChange: (e) => setForm((prev) => {
                        const role = e.target.value;
                        return {
                          ...prev,
                          role,
                          branch: role === "Admin" ? "" : prev.branch,
                          country: role === "Country Coordinator" ? prev.country || countryOptions[0] || "" : ""
                        };
                      }),
                      children: [
                        ...getAccountRoleOptions().map((option) =>
                          /* @__PURE__ */ jsx("option", { value: option.value, children: option.label }, option.value)
                        )
                      ]
                    })
                  ]
                }),
                form.role === "Admin" ? /* @__PURE__ */ jsx("p", {
                  className: "text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-3 py-2",
                  children: "Admin accounts are global and are not assigned to a branch."
                }) : /* @__PURE__ */ jsxs("div", {
                  className: "space-y-1.5",
                  children: [
                    /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Branch" }),
                    /* @__PURE__ */ jsxs("select", {
                      className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      value: form.branch,
                      onChange: (e) => setForm((prev) => ({ ...prev, branch: e.target.value })),
                      required: true,
                      disabled: branchOptions.length === 0,
                      children: [
                        /* @__PURE__ */ jsx("option", {
                          value: "",
                          disabled: true,
                          children: branchOptions.length === 0 ? "No saved branches" : "Select branch"
                        }),
                        ...branchOptions.map((branch) => /* @__PURE__ */ jsx("option", { value: branch, children: branch }, branch))
                      ]
                    }),
                    /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500", children: "Only branches saved in Branch Analytics can be selected." })
                  ]
                }),
                form.role === "Country Coordinator" ? /* @__PURE__ */ jsxs("div", {
                  className: "space-y-1.5",
                  children: [
                    /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Country (portfolio)" }),
                    /* @__PURE__ */ jsxs("select", {
                      className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      value: form.country,
                      onChange: (e) => setForm((prev) => ({ ...prev, country: e.target.value })),
                      required: true,
                      disabled: countryOptions.length === 0,
                      children: [
                        /* @__PURE__ */ jsx("option", {
                          value: "",
                          disabled: true,
                          children: countryOptions.length === 0 ? "Add countries in Settings first" : "Select country"
                        }),
                        ...countryOptions.map((c) => /* @__PURE__ */ jsx("option", { value: c, children: c }, c))
                      ]
                    }),
                    /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500", children: "This coordinator only sees students whose destination country matches this value." })
                  ]
                }) : null,
                /* @__PURE__ */ jsxs("div", {
                  className: "space-y-1.5",
                  children: [
                    /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold uppercase tracking-wide text-slate-700", children: "Profile Image (optional)" }),
                    /* @__PURE__ */ jsx("input", {
                      type: "file",
                      accept: "image/*",
                      className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      onChange: (e) => {
                        const file = e.target.files?.[0];
                        if (!file) {
                          setNewAccountAvatar("");
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => setNewAccountAvatar(String(reader.result || ""));
                        reader.onerror = () => setFormError("Failed to read selected image.");
                        reader.readAsDataURL(file);
                      }
                    }),
                    /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500", children: "If skipped, the default company icon will be used." })
                  ]
                }),
                /* @__PURE__ */ jsxs("div", {
                  className: "pt-2 flex justify-end gap-2",
                  children: [
                    /* @__PURE__ */ jsx(Button, { type: "button", variant: "ghost", onClick: () => setIsAddOpen(false), children: "Cancel" }),
                    /* @__PURE__ */ jsx(Button, {
                      type: "submit",
                      isLoading: isSaving,
                      disabled: (form.role !== "Admin" && branchOptions.length === 0) || (form.role === "Country Coordinator" && (!form.country || countryOptions.length === 0)),
                      children: "Save Account"
                    })
                  ]
                })
              ].filter(Boolean)
            })
          ]
        })
      }) : null,
      roleTarget ? /* @__PURE__ */ jsx("div", {
        className: "fixed inset-0 z-[120] overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/50 backdrop-blur-sm",
        onClick: (e) => {
          if (e.target === e.currentTarget) closeRoleDialog();
        },
        children: /* @__PURE__ */ jsxs("div", {
          className: "w-full max-w-md bg-white rounded-xl border border-gray-100 shadow-2xl max-h-[90vh] overflow-y-auto my-auto",
          children: [
            /* @__PURE__ */ jsxs("div", {
              className: "p-5 border-b border-gray-100 bg-gray-50/60 flex items-start justify-between",
              children: [
                /* @__PURE__ */ jsxs("div", {
                  children: [
                    /* @__PURE__ */ jsx("h3", {
                      className: "font-semibold text-lg text-slate-900",
                      children: "Change access level"
                    }),
                    /* @__PURE__ */ jsxs("p", {
                      className: "text-xs text-slate-500 mt-0.5",
                      children: [
                        "Update the portal role for ",
                        /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-700", children: roleTarget.username }),
                        " (",
                        roleTarget.email,
                        ")."
                      ]
                    })
                  ]
                }),
                /* @__PURE__ */ jsx("button", {
                  type: "button",
                  className: "text-slate-400 hover:text-slate-600",
                  onClick: closeRoleDialog,
                  disabled: roleSaving,
                  children: /* @__PURE__ */ jsx(X, { size: 18 })
                })
              ]
            }),
            /* @__PURE__ */ jsxs("div", {
              className: "p-5 space-y-4",
              children: [
                roleError ? /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2",
                  children: roleError
                }) : null,
                roleSuccess ? /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2",
                  children: roleSuccess
                }) : null,
                /* @__PURE__ */ jsxs("div", {
                  className: "space-y-1.5",
                  children: [
                    /* @__PURE__ */ jsx("label", {
                      className: "text-xs font-semibold uppercase tracking-wide text-slate-700",
                      children: "Access level"
                    }),
                    /* @__PURE__ */ jsxs("select", {
                      className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      value: roleForm.role,
                      onChange: (e) => {
                        const role = e.target.value;
                        setRoleForm((prev) => ({
                          ...prev,
                          role,
                          branch: role === "Admin" ? "" : prev.branch || branchOptions[0] || "",
                          country: role === "Country Coordinator" ? prev.country || countryOptions[0] || "" : ""
                        }));
                        if (roleError) setRoleError("");
                        if (roleSuccess) setRoleSuccess("");
                      },
                      disabled: roleSaving || Boolean(roleSuccess),
                      children: getAccountRoleOptions().map((option) =>
                        /* @__PURE__ */ jsx("option", { value: option.value, children: option.label }, option.value)
                      )
                    })
                  ]
                }),
                roleForm.role === "Admin" ? /* @__PURE__ */ jsx("p", {
                  className: "text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-3 py-2",
                  children: "Admin accounts are global and are not assigned to a branch."
                }) : /* @__PURE__ */ jsxs("div", {
                  className: "space-y-1.5",
                  children: [
                    /* @__PURE__ */ jsx("label", {
                      className: "text-xs font-semibold uppercase tracking-wide text-slate-700",
                      children: "Branch"
                    }),
                    /* @__PURE__ */ jsxs("select", {
                      className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      value: roleForm.branch,
                      onChange: (e) => {
                        setRoleForm((prev) => ({ ...prev, branch: e.target.value }));
                        if (roleError) setRoleError("");
                        if (roleSuccess) setRoleSuccess("");
                      },
                      required: true,
                      disabled: roleSaving || Boolean(roleSuccess) || branchOptions.length === 0,
                      children: [
                        /* @__PURE__ */ jsx("option", {
                          value: "",
                          disabled: true,
                          children: branchOptions.length === 0 ? "No saved branches" : "Select branch"
                        }),
                        ...branchOptions.map((branch) => /* @__PURE__ */ jsx("option", { value: branch, children: branch }, branch))
                      ]
                    })
                  ]
                }),
                roleForm.role === "Country Coordinator" ? /* @__PURE__ */ jsxs("div", {
                  className: "space-y-1.5",
                  children: [
                    /* @__PURE__ */ jsx("label", {
                      className: "text-xs font-semibold uppercase tracking-wide text-slate-700",
                      children: "Country (portfolio)"
                    }),
                    /* @__PURE__ */ jsxs("select", {
                      className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      value: roleForm.country,
                      onChange: (e) => {
                        setRoleForm((prev) => ({ ...prev, country: e.target.value }));
                        if (roleError) setRoleError("");
                        if (roleSuccess) setRoleSuccess("");
                      },
                      required: true,
                      disabled: roleSaving || Boolean(roleSuccess) || countryOptions.length === 0,
                      children: [
                        /* @__PURE__ */ jsx("option", {
                          value: "",
                          disabled: true,
                          children: countryOptions.length === 0 ? "Add countries in Settings first" : "Select country"
                        }),
                        ...countryOptions.map((c) => /* @__PURE__ */ jsx("option", { value: c, children: c }, c))
                      ]
                    })
                  ]
                }) : null,
                /* @__PURE__ */ jsxs("div", {
                  className: "pt-2 flex justify-end gap-2",
                  children: [
                    /* @__PURE__ */ jsx(Button, {
                      type: "button",
                      variant: "ghost",
                      onClick: closeRoleDialog,
                      disabled: roleSaving,
                      children: roleSuccess ? "Close" : "Cancel"
                    }),
                    roleSuccess ? null : /* @__PURE__ */ jsx(Button, {
                      type: "button",
                      isLoading: roleSaving,
                      disabled:
                        (roleForm.role !== "Admin" && (!roleForm.branch || branchOptions.length === 0)) ||
                        (roleForm.role === "Country Coordinator" && (!roleForm.country || countryOptions.length === 0)),
                      onClick: handleConfirmRoleChange,
                      children: "Save access level"
                    })
                  ].filter(Boolean)
                })
              ].filter(Boolean)
            })
          ]
        })
      }) : null,
      profileTarget ? /* @__PURE__ */ jsx("div", {
        className: "fixed inset-0 z-[120] overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/50 backdrop-blur-sm",
        onClick: (e) => {
          if (e.target === e.currentTarget) closeProfileDialog();
        },
        children: /* @__PURE__ */ jsxs("div", {
          className: "w-full max-w-md bg-white rounded-xl border border-gray-100 shadow-2xl max-h-[90vh] overflow-y-auto my-auto",
          children: [
            /* @__PURE__ */ jsxs("div", {
              className: "p-5 border-b border-gray-100 bg-gray-50/60 flex items-start justify-between",
              children: [
                /* @__PURE__ */ jsxs("div", {
                  children: [
                    /* @__PURE__ */ jsx("h3", {
                      className: "font-semibold text-lg text-slate-900",
                      children: "Edit profile"
                    }),
                    /* @__PURE__ */ jsxs("p", {
                      className: "text-xs text-slate-500 mt-0.5",
                      children: [
                        "Update the login username and email for ",
                        /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-700", children: profileTarget.username }),
                        "."
                      ]
                    })
                  ]
                }),
                /* @__PURE__ */ jsx("button", {
                  type: "button",
                  className: "text-slate-400 hover:text-slate-600",
                  onClick: closeProfileDialog,
                  disabled: profileSaving,
                  children: /* @__PURE__ */ jsx(X, { size: 18 })
                })
              ]
            }),
            /* @__PURE__ */ jsxs("div", {
              className: "p-5 space-y-4",
              children: [
                profileError ? /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2",
                  children: profileError
                }) : null,
                profileSuccess ? /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2",
                  children: profileSuccess
                }) : null,
                /* @__PURE__ */ jsxs("div", {
                  className: "space-y-1.5",
                  children: [
                    /* @__PURE__ */ jsx("label", {
                      className: "text-xs font-semibold uppercase tracking-wide text-slate-700",
                      children: "Username"
                    }),
                    /* @__PURE__ */ jsx("input", {
                      className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      value: profileForm.username,
                      onChange: (e) => {
                        setProfileForm((prev) => ({ ...prev, username: e.target.value }));
                        if (profileError) setProfileError("");
                        if (profileSuccess) setProfileSuccess("");
                      },
                      disabled: profileSaving || Boolean(profileSuccess),
                      required: true
                    })
                  ]
                }),
                /* @__PURE__ */ jsxs("div", {
                  className: "space-y-1.5",
                  children: [
                    /* @__PURE__ */ jsx("label", {
                      className: "text-xs font-semibold uppercase tracking-wide text-slate-700",
                      children: "Email"
                    }),
                    /* @__PURE__ */ jsx("input", {
                      type: "email",
                      className: "w-full px-3 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                      value: profileForm.email,
                      onChange: (e) => {
                        setProfileForm((prev) => ({ ...prev, email: e.target.value }));
                        if (profileError) setProfileError("");
                        if (profileSuccess) setProfileSuccess("");
                      },
                      disabled: profileSaving || Boolean(profileSuccess),
                      required: true
                    })
                  ]
                }),
                /* @__PURE__ */ jsx("p", {
                  className: "text-[11px] text-slate-500",
                  children: "The user will sign in with the new email. Share the update with them if their login address changes."
                }),
                /* @__PURE__ */ jsxs("div", {
                  className: "pt-2 flex justify-end gap-2",
                  children: [
                    /* @__PURE__ */ jsx(Button, {
                      type: "button",
                      variant: "ghost",
                      onClick: closeProfileDialog,
                      disabled: profileSaving,
                      children: profileSuccess ? "Close" : "Cancel"
                    }),
                    profileSuccess ? null : /* @__PURE__ */ jsx(Button, {
                      type: "button",
                      isLoading: profileSaving,
                      onClick: handleConfirmProfileChange,
                      children: "Save profile"
                    })
                  ].filter(Boolean)
                })
              ].filter(Boolean)
            })
          ]
        })
      }) : null,
      resetTarget ? /* @__PURE__ */ jsx("div", {
        className: "fixed inset-0 z-[120] overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/50 backdrop-blur-sm",
        onClick: (e) => {
          if (e.target === e.currentTarget) closeResetDialog();
        },
        children: /* @__PURE__ */ jsxs("div", {
          className: "w-full max-w-md bg-white rounded-xl border border-gray-100 shadow-2xl max-h-[90vh] overflow-y-auto my-auto",
          children: [
            /* @__PURE__ */ jsxs("div", {
              className: "p-5 border-b border-gray-100 bg-gray-50/60 flex items-start justify-between",
              children: [
                /* @__PURE__ */ jsxs("div", {
                  children: [
                    /* @__PURE__ */ jsx("h3", {
                      className: "font-semibold text-lg text-slate-900",
                      children: "Reset password"
                    }),
                    /* @__PURE__ */ jsxs("p", {
                      className: "text-xs text-slate-500 mt-0.5",
                      children: [
                        "Set a new password for ",
                        /* @__PURE__ */ jsx("span", { className: "font-medium text-slate-700", children: resetTarget.username }),
                        " (",
                        resetTarget.email,
                        "). They will be prompted to change it on next login."
                      ]
                    })
                  ]
                }),
                /* @__PURE__ */ jsx("button", {
                  type: "button",
                  className: "text-slate-400 hover:text-slate-600",
                  onClick: closeResetDialog,
                  disabled: resetSaving,
                  children: /* @__PURE__ */ jsx(X, { size: 18 })
                })
              ]
            }),
            /* @__PURE__ */ jsxs("div", {
              className: "p-5 space-y-4",
              children: [
                resetError ? /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2",
                  children: resetError
                }) : null,
                resetSuccess ? /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2",
                  children: resetSuccess
                }) : null,
                /* @__PURE__ */ jsxs("div", {
                  className: "space-y-1.5",
                  children: [
                    /* @__PURE__ */ jsx("label", {
                      className: "text-xs font-semibold uppercase tracking-wide text-slate-700",
                      children: "New password"
                    }),
                    /* @__PURE__ */ jsxs("div", {
                      className: "flex gap-2",
                      children: [
                        /* @__PURE__ */ jsxs("div", {
                          className: "relative flex-1",
                          children: [
                            /* @__PURE__ */ jsx("input", {
                              type: showResetPassword ? "text" : "password",
                              autoFocus: true,
                              value: resetPasswordValue,
                              onChange: (e) => {
                                setResetPasswordValue(e.target.value);
                                if (resetError) setResetError("");
                                if (resetSuccess) setResetSuccess("");
                              },
                              placeholder: "Enter or generate a password",
                              className:
                                "w-full pl-3 pr-10 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono tracking-tight"
                            }),
                            /* @__PURE__ */ jsx("button", {
                              type: "button",
                              "aria-label": showResetPassword ? "Hide password" : "Show password",
                              className: "absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1",
                              onClick: () => setShowResetPassword((v) => !v),
                              children: showResetPassword
                                ? /* @__PURE__ */ jsx(EyeOff, { size: 16 })
                                : /* @__PURE__ */ jsx(Eye, { size: 16 })
                            })
                          ]
                        }),
                        /* @__PURE__ */ jsx(Button, {
                          type: "button",
                          variant: "secondary",
                          size: "sm",
                          className: "gap-1.5 whitespace-nowrap",
                          onClick: () => {
                            const generated = generateTempPassword();
                            setResetPasswordValue(generated);
                            setShowResetPassword(true);
                            if (resetError) setResetError("");
                            if (resetSuccess) setResetSuccess("");
                          },
                          "aria-label": "Generate password",
                          children: [
                            /* @__PURE__ */ jsx(RefreshCw, { size: 14 }),
                            "Generate"
                          ]
                        }),
                        /* @__PURE__ */ jsx(Button, {
                          type: "button",
                          variant: "outline",
                          size: "sm",
                          className: "gap-1.5 whitespace-nowrap",
                          onClick: handleCopyPassword,
                          disabled: !resetPasswordValue,
                          "aria-label": "Copy password",
                          children: /* @__PURE__ */ jsx(Copy, { size: 14 })
                        })
                      ]
                    }),
                    /* @__PURE__ */ jsx("p", {
                      className: "text-[11px] text-slate-500",
                      children: "Minimum 6 characters. The user will be asked to change this on their next sign-in."
                    })
                  ]
                }),
                /* @__PURE__ */ jsxs("div", {
                  className: "pt-2 flex justify-end gap-2",
                  children: [
                    /* @__PURE__ */ jsx(Button, {
                      type: "button",
                      variant: "ghost",
                      onClick: closeResetDialog,
                      disabled: resetSaving,
                      children: resetSuccess ? "Close" : "Cancel"
                    }),
                    resetSuccess ? null : /* @__PURE__ */ jsx(Button, {
                      type: "button",
                      isLoading: resetSaving,
                      disabled: resetPasswordValue.trim().length < 6,
                      onClick: handleConfirmReset,
                      children: "Reset password"
                    })
                  ].filter(Boolean)
                })
              ].filter(Boolean)
            })
          ]
        })
      }) : null
    ]
  });
};

export { AccountsManagement };
