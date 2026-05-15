import { jsx, jsxs } from "react/jsx-runtime";
import { AlertTriangle, Clock, Building2, UserCircle, ChevronRight, ShieldAlert } from "lucide-react";

function formatOverdue(ms) {
  const m = Math.max(0, ms);
  const hours = Math.floor(m / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h`;
  const mins = Math.floor(m / (60 * 1000));
  return `${mins}m`;
}

const StageEscalations = ({
  escalations = [],
  requirementViolations = [],
  employees = [],
  variant = "admin",
  onOpenStudent,
  embedded = false
}) => {
  const emptyCopy =
    variant === "counselor"
      ? "No stage SLA breaches for your assigned students."
      : variant === "manager"
        ? "No overdue stages for your branch."
        : "No overdue pipeline stages across branches.";
  const requirementNoticeCopy =
    variant === "counselor"
      ? "These students were advanced through stages without completing all mandatory requirements. This will impact your SLA score until resolved."
      : variant === "manager"
        ? "Students on your branch advanced through stages without completing all mandatory requirements. Each open notice impacts the assigned counselor's SLA score."
        : "Students advanced through stages without completing all mandatory requirements. Each open notice impacts the assigned counselor's SLA score.";
  return /* @__PURE__ */ jsxs("div", {
    className: embedded ? "space-y-3" : "space-y-4 animate-in fade-in duration-500",
    children: [
      /* @__PURE__ */ jsxs("div", {
        className: "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3",
        children: [
          /* @__PURE__ */ jsxs("div", {
            children: embedded
              ? [
                  /* @__PURE__ */ jsx("h3", {
                    className: "text-sm font-bold text-slate-800 uppercase tracking-wide",
                    children: "Pipeline stage SLA"
                  }),
                  /* @__PURE__ */ jsx("p", {
                    className: "text-xs text-slate-500 mt-0.5",
                    children: "Students past the time limit for their current stage."
                  })
                ]
              : [
                  /* @__PURE__ */ jsx("h2", {
                    className: "text-xl font-semibold tracking-tight text-[#0F172A]",
                    children: "Stage SLA escalations"
                  }),
                  /* @__PURE__ */ jsx("p", {
                    className: "text-sm text-slate-500 mt-1 max-w-2xl",
                    children:
                      "Students who have exceeded the time limit for their current pipeline stage. Inquiry (1h), Application (24h), Interview training (72h), Documentation (7d), Visa (30d), Enrolled (14d)."
                  })
                ]
          }),
          /* @__PURE__ */ jsxs("div", {
            className:
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-100 text-rose-800 text-xs font-semibold",
            children: [
              /* @__PURE__ */ jsx(AlertTriangle, { size: 14 }),
              escalations.length,
              " overdue"
            ]
          })
        ]
      }),
      requirementViolations.length > 0 && /* @__PURE__ */ jsxs("div", {
        className: "bg-rose-50 border border-rose-200 rounded-2xl p-4 shadow-sm",
        children: [
          /* @__PURE__ */ jsxs("div", {
            className: "flex items-start gap-3",
            children: [
              /* @__PURE__ */ jsx("div", {
                className: "bg-rose-100 p-2 rounded-xl text-rose-600",
                children: /* @__PURE__ */ jsx(ShieldAlert, { size: 20 })
              }),
              /* @__PURE__ */ jsxs("div", {
                className: "flex-1 min-w-0",
                children: [
                  /* @__PURE__ */ jsxs("div", {
                    className: "flex items-center justify-between gap-2 flex-wrap",
                    children: [
                      /* @__PURE__ */ jsx("h3", {
                        className: "text-sm font-bold text-rose-900",
                        children: "SLA Requirement Notice"
                      }),
                      /* @__PURE__ */ jsxs("span", {
                        className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/70 border border-rose-200 text-rose-800 text-[11px] font-semibold",
                        children: [
                          /* @__PURE__ */ jsx(AlertTriangle, { size: 12 }),
                          requirementViolations.length,
                          " open"
                        ]
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx("p", {
                    className: "text-xs text-rose-700 mt-1",
                    children: requirementNoticeCopy
                  })
                ]
              })
            ]
          }),
          /* @__PURE__ */ jsx("ul", {
            className: "mt-3 space-y-2",
            children: requirementViolations.map((row) => {
              const assignedCounselor = (employees || []).find(
                (employee) => String(employee.id || "").trim() === String(row.counselorId || "").trim()
              );
              const counselorLabel = assignedCounselor
                ? assignedCounselor.name || assignedCounselor.username || assignedCounselor.email || row.counselorId
                : row.counselorId || "—";
              const missingLabel = (row.missingItems || []).length > 0
                ? row.missingItems.join(", ")
                : "Required items";
              return /* @__PURE__ */ jsxs(
                "li",
                {
                  className: "bg-white/70 border border-rose-100 rounded-xl px-3 py-2 flex items-start justify-between gap-3",
                  children: [
                    /* @__PURE__ */ jsxs("div", {
                      className: "min-w-0",
                      children: [
                        /* @__PURE__ */ jsxs("div", {
                          className: "flex items-center gap-2 flex-wrap",
                          children: [
                            /* @__PURE__ */ jsx("span", {
                              className: "text-xs font-semibold text-slate-900 truncate",
                              children: row.studentName
                            }),
                            /* @__PURE__ */ jsx("span", {
                              className: "text-[10px] font-mono text-slate-400",
                              children: row.studentId
                            }),
                            row.branch && /* @__PURE__ */ jsxs("span", {
                              className: "inline-flex items-center gap-1 text-[10px] text-slate-500",
                              children: [
                                /* @__PURE__ */ jsx(Building2, { size: 10 }),
                                row.branch
                              ]
                            }),
                            (variant === "admin" || variant === "manager") && /* @__PURE__ */ jsxs("span", {
                              className: "text-[10px] text-slate-500",
                              children: ["• ", counselorLabel]
                            })
                          ]
                        }),
                        /* @__PURE__ */ jsxs("p", {
                          className: "text-[11px] font-semibold text-rose-800 mt-1",
                          children: [
                            row.stage,
                            ": Missing ",
                            missingLabel,
                            row.duplicateCount > 1 && /* @__PURE__ */ jsxs("span", {
                              className: "ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold",
                              children: ["×", row.duplicateCount]
                            })
                          ]
                        })
                      ]
                    }),
                    typeof onOpenStudent === "function"
                      ? /* @__PURE__ */ jsxs("button", {
                          type: "button",
                          onClick: () => onOpenStudent(row.studentId),
                          className: "inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 hover:text-rose-900 whitespace-nowrap",
                          children: [
                            "Resolve",
                            /* @__PURE__ */ jsx(ChevronRight, { size: 12 })
                          ]
                        })
                      : null
                  ]
                },
                row.violationId
              );
            })
          })
        ]
      }),
      /* @__PURE__ */ jsx("div", {
        className: "bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden",
        children: /* @__PURE__ */ jsx("div", {
          className: "overflow-x-auto",
          children: /* @__PURE__ */ jsxs("table", {
            className: "w-full text-sm text-left",
            children: [
              /* @__PURE__ */ jsx("thead", {
                className: "bg-gray-50 border-b border-gray-200 text-slate-500",
                children: /* @__PURE__ */ jsxs("tr", {
                  children: [
                    /* @__PURE__ */ jsx("th", { className: "px-4 py-3 whitespace-nowrap", children: "Student" }),
                    /* @__PURE__ */ jsx("th", { className: "px-4 py-3 whitespace-nowrap hidden md:table-cell", children: "Branch" }),
                    /* @__PURE__ */ jsx("th", { className: "px-4 py-3 whitespace-nowrap", children: "Stage" }),
                    /* @__PURE__ */ jsx("th", { className: "px-4 py-3 whitespace-nowrap hidden lg:table-cell", children: "SLA" }),
                    /* @__PURE__ */ jsx("th", { className: "px-4 py-3 whitespace-nowrap", children: "Overdue by" }),
                    (variant === "admin" || variant === "manager") &&
                      /* @__PURE__ */ jsx("th", {
                        className: "px-4 py-3 whitespace-nowrap hidden xl:table-cell",
                        children: "Counselor"
                      }),
                    /* @__PURE__ */ jsx("th", { className: "px-4 py-3 w-10", children: "" })
                  ]
                })
              }),
              /* @__PURE__ */ jsx("tbody", {
                className: "divide-y divide-gray-100",
                children:
                  escalations.length === 0
                    ? /* @__PURE__ */ jsx("tr", {
                        children: /* @__PURE__ */ jsx("td", {
                          colSpan: variant === "admin" || variant === "manager" ? 7 : 6,
                          className: "px-4 py-12 text-center text-slate-500 text-sm",
                          children: emptyCopy
                        })
                      })
                    : escalations.map((row) => {
                        const assignedCounselor = (employees || []).find(
                          (employee) => String(employee.id || "").trim() === String(row.counselorId || "").trim()
                        );
                        const counselorLabel = assignedCounselor
                          ? assignedCounselor.name || assignedCounselor.username || assignedCounselor.email || row.counselorId
                          : row.counselorId || "—";
                        return /* @__PURE__ */ jsxs(
                          "tr",
                          {
                            className: "hover:bg-slate-50/80",
                            children: [
                              /* @__PURE__ */ jsx("td", {
                                className: "px-4 py-3",
                                children: /* @__PURE__ */ jsxs("div", {
                                  children: [
                                    /* @__PURE__ */ jsx("p", {
                                      className: "font-medium text-slate-900",
                                      children: row.studentName
                                    }),
                                    /* @__PURE__ */ jsxs("p", {
                                      className: "text-[11px] text-slate-400 font-mono",
                                      children: [row.studentId]
                                    })
                                  ]
                                })
                              }),
                              /* @__PURE__ */ jsx("td", {
                                className: "px-4 py-3 hidden md:table-cell",
                                children: /* @__PURE__ */ jsxs("span", {
                                  className: "inline-flex items-center gap-1 text-slate-600",
                                  children: [
                                    /* @__PURE__ */ jsx(Building2, { size: 12, className: "text-slate-400" }),
                                    row.branch || "—"
                                  ]
                                })
                              }),
                              /* @__PURE__ */ jsx("td", {
                                className: "px-4 py-3",
                                children: /* @__PURE__ */ jsxs("div", {
                                  children: [
                                    /* @__PURE__ */ jsx("span", {
                                      className:
                                        "inline-flex px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-100",
                                      children: row.stage
                                    }),
                                    /* @__PURE__ */ jsx("p", {
                                      className: "text-[11px] text-slate-500 mt-1 max-w-[220px]",
                                      children: row.owners
                                    })
                                  ]
                                })
                              }),
                              /* @__PURE__ */ jsx("td", {
                                className: "px-4 py-3 hidden lg:table-cell text-slate-600",
                                children: row.slaLabel
                              }),
                              /* @__PURE__ */ jsx("td", {
                                className: "px-4 py-3",
                                children: /* @__PURE__ */ jsxs("span", {
                                  className:
                                    "inline-flex items-center gap-1 font-semibold text-rose-700",
                                  children: [
                                    /* @__PURE__ */ jsx(Clock, { size: 14 }),
                                    formatOverdue(row.overdueMs)
                                  ]
                                })
                              }),
                              (variant === "admin" || variant === "manager") &&
                                /* @__PURE__ */ jsx("td", {
                                  className: "px-4 py-3 hidden xl:table-cell text-slate-600 text-xs",
                                  children: counselorLabel
                                }),
                              /* @__PURE__ */ jsx("td", {
                                className: "px-4 py-3 text-right",
                                children:
                                  typeof onOpenStudent === "function"
                                    ? /* @__PURE__ */ jsx("button", {
                                        type: "button",
                                        onClick: () => onOpenStudent(row.studentId),
                                        className:
                                          "inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800",
                                        children: [
                                          /* @__PURE__ */ jsx(UserCircle, { size: 14 }),
                                          /* @__PURE__ */ jsx(ChevronRight, { size: 14 })
                                        ]
                                      })
                                    : null
                              })
                            ]
                          },
                          `${row.studentId}-${row.stage}`
                        );
                      })
              })
            ]
          })
        })
      })
    ]
  });
};

export { StageEscalations };
