import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./Button";
import { KeyRound, Plus, Search, X } from "lucide-react";
import { createAccount, getAccounts, getBranches, getCountries, updateAdminAvatar } from "../authApi";

function roleBadgeClass(role) {
  switch (role) {
    case "Admin":
      return "bg-slate-900 text-white border-slate-800";
    case "Manager":
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    case "Team Lead":
      return "bg-violet-50 text-violet-800 border-violet-200";
    case "Counselor":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "Country Coordinator":
      return "bg-cyan-50 text-cyan-900 border-cyan-200";
    case "Student":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    default:
      return "bg-slate-50 text-slate-700 border-gray-200";
  }
}

const AccountsManagement = ({ onResetPassword, onAccountCreated, onAdminAvatarUpdated }) => {
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

  useEffect(() => {
    const load = async () => {
      const result = await getAccounts();
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setRows(result.data);
    };
    load();
  }, []);
  useEffect(() => {
    const loadBranches = async () => {
      const result = await getBranches();
      if (!result.ok) return;
      setBranchOptions(result.data.map((b) => b.location));
    };
    loadBranches();
  }, []);
  useEffect(() => {
    const loadCountries = async () => {
      const result = await getCountries();
      if (!result.ok) return;
      setCountryOptions(result.data);
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

  const handleReset = (row) => {
    setPendingId(row.id);
    window.setTimeout(() => {
      onResetPassword?.(row);
      setPendingId(null);
    }, 600);
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
                children: "Manage platform logins. Add Admin, Manager, Counselor, or Country Coordinator accounts and reset passwords (except the primary admin login)."
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
        className: "bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden",
        children: [
          /* @__PURE__ */ jsx("div", {
            className: "overflow-x-auto",
            children: /* @__PURE__ */ jsxs("table", {
              className: "w-full text-sm text-left",
              children: [
                /* @__PURE__ */ jsx("thead", {
                  className: "bg-gray-50/80 border-b border-gray-200 text-xs uppercase tracking-wide text-slate-500 font-semibold",
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
                  className: "divide-y divide-gray-100",
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
                              children: row.role
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
                                  onClick: () => handleReset(row),
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
                    /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Create an Admin, Manager, Counselor, or Country Coordinator account." })
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
                        /* @__PURE__ */ jsx("option", { value: "Admin", children: "Admin" }),
                        /* @__PURE__ */ jsx("option", { value: "Manager", children: "Manager" }),
                        /* @__PURE__ */ jsx("option", { value: "Counselor", children: "Counselor" }),
                        /* @__PURE__ */ jsx("option", { value: "Country Coordinator", children: "Country Coordinator" })
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
                    /* @__PURE__ */ jsx("p", { className: "text-[11px] text-slate-500", children: "If skipped, a default ash male avatar will be used." })
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
      }) : null
    ]
  });
};

export { AccountsManagement };
