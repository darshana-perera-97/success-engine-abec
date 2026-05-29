import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { DollarSign, X, ExternalLink, FileText } from "lucide-react";
import { Button } from "./Button";
import { formatLKR } from "../utils";
import { toAbsoluteAssetUrl } from "../apiConfig";

const INVOICE_TABS = [
  { id: "all", label: "All" },
  { id: "to_approve", label: "To approve" },
  { id: "rejected", label: "Rejected" },
  { id: "pending", label: "Pending" }
];

function hasRejectedPaymentEvidence(inv) {
  return Boolean(String(inv?.paymentRejectionReason || "").trim());
}

const TABLE_COLUMNS = [
  { key: "student", label: "Student", className: "min-w-[140px]" },
  { key: "description", label: "Description", className: "min-w-[160px]" },
  { key: "amount", label: "Amount", className: "min-w-[100px]" },
  { key: "transferAccount", label: "Transfer account", className: "min-w-[140px]" },
  { key: "due", label: "Due", className: "min-w-[100px]" },
  { key: "status", label: "Status", className: "min-w-[90px]" },
  { key: "actions", label: "Actions", className: "min-w-[280px] text-right" }
];

function transferAccountLabel(inv, paymentAccountsById) {
  const embedded = inv?.paymentAccount;
  if (embedded && typeof embedded === "object") {
    const label = String(embedded.label || "").trim();
    if (label) return label;
    const bank = String(embedded.bankName || "").trim();
    const name = String(embedded.accountName || "").trim();
    if (bank && name) return `${bank} — ${name}`;
    return bank || name || "—";
  }
  const id = String(inv?.paymentAccountId || "").trim();
  if (id && paymentAccountsById) {
    const matched = paymentAccountsById.get(id);
    if (matched) {
      const label = String(matched.label || "").trim();
      if (label) return label;
      return String(matched.bankName || "").trim() || "—";
    }
  }
  return "—";
}

function invoiceMatchesTab(inv, tabId) {
  const status = String(inv.status || "").trim();
  if (tabId === "pending") return status === "Pending" && !hasRejectedPaymentEvidence(inv);
  if (tabId === "to_approve") return status === "Verifying";
  if (tabId === "rejected") return status === "Pending" && hasRejectedPaymentEvidence(inv);
  return true;
}

function statusBadgeClass(status) {
  switch (String(status || "").trim()) {
    case "Paid":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Verifying":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "Overdue":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function proofUrl(inv) {
  const raw = String(inv.paymentProofUrl || "").trim();
  return raw ? toAbsoluteAssetUrl(raw) || raw : "";
}

function isImageProof(url, name) {
  const hint = `${String(name || "")} ${String(url || "")}`.toLowerCase();
  if (hint.includes("data:image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(hint.split("?")[0]);
}

function isPdfProof(url, name) {
  const hint = `${String(name || "")} ${String(url || "")}`.toLowerCase();
  return hint.includes("application/pdf") || /\.pdf$/i.test(hint.split("?")[0]);
}

function EvidencePreview({ url, name }) {
  if (!url) {
    return /* @__PURE__ */ jsx("p", {
      className: "text-sm text-slate-500 py-8 text-center",
      children: "No payment evidence file on this invoice yet."
    });
  }
  if (isImageProof(url, name)) {
    return /* @__PURE__ */ jsx("img", {
      src: url,
      alt: name || "Payment evidence",
      className: "max-w-full max-h-[min(70vh,520px)] mx-auto rounded-lg border border-slate-200 object-contain"
    });
  }
  if (isPdfProof(url, name)) {
    return /* @__PURE__ */ jsx("iframe", {
      title: name || "Payment evidence PDF",
      src: url,
      className: "w-full h-[min(70vh,520px)] rounded-lg border border-slate-200 bg-slate-50"
    });
  }
  return /* @__PURE__ */ jsxs("div", {
    className: "text-center py-10 space-y-4",
    children: [
      /* @__PURE__ */ jsx(FileText, { size: 40, className: "mx-auto text-slate-400" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600", children: name || "Payment evidence file" }),
      /* @__PURE__ */ jsx("a", {
        href: url,
        target: "_blank",
        rel: "noopener noreferrer",
        className: "inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:underline",
        children: ["Open file in new tab", /* @__PURE__ */ jsx(ExternalLink, { size: 14 })]
      })
    ]
  });
}

/** Accountant reviews uploaded payment evidence and approves or rejects. */
const AccountantInvoices = ({
  invoices = [],
  invoicesLoading = false,
  students = [],
  paymentAccounts = [],
  onUpdateInvoice,
  onNotify
}) => {
  const [activeTab, setActiveTab] = useState("to_approve");
  const [busyInvoiceId, setBusyInvoiceId] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [query, setQuery] = useState("");
  const [evidenceModal, setEvidenceModal] = useState({ open: false, invoice: null });
  const [rejectModal, setRejectModal] = useState({ open: false, invoice: null, reason: "", error: "" });

  const studentById = useMemo(() => {
    const map = new Map();
    (students || []).forEach((s) => {
      const id = String(s.id || "").trim();
      if (id) map.set(id, s);
    });
    return map;
  }, [students]);

  const paymentAccountsById = useMemo(() => {
    const map = new Map();
    (paymentAccounts || []).forEach((acct) => {
      const id = String(acct?.id || "").trim();
      if (id) map.set(id, acct);
    });
    return map;
  }, [paymentAccounts]);

  const tabCounts = useMemo(() => {
    const counts = { all: 0, pending: 0, to_approve: 0, rejected: 0 };
    (invoices || []).forEach((inv) => {
      counts.all += 1;
      if (invoiceMatchesTab(inv, "pending")) counts.pending += 1;
      if (invoiceMatchesTab(inv, "to_approve")) counts.to_approve += 1;
      if (invoiceMatchesTab(inv, "rejected")) counts.rejected += 1;
    });
    return counts;
  }, [invoices]);

  const filteredRows = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return (invoices || [])
      .filter((inv) => invoiceMatchesTab(inv, activeTab))
      .filter((inv) => {
        if (!q) return true;
        const sid = String(inv.studentId || "").trim();
        const student = studentById.get(sid);
        const studentName = String(student?.name || "").toLowerCase();
        const id = String(inv.id || "").toLowerCase();
        const desc = String(inv.description || "").toLowerCase();
        const account = transferAccountLabel(inv, paymentAccountsById).toLowerCase();
        return studentName.includes(q) || id.includes(q) || desc.includes(q) || account.includes(q);
      })
      .sort(
        (a, b) =>
          new Date(b.issueDate || b.createdAt || 0).getTime() -
          new Date(a.issueDate || a.createdAt || 0).getTime()
      );
  }, [invoices, activeTab, query, studentById, paymentAccountsById]);

  const isBusy = (invId, action) => busyInvoiceId === invId && busyAction === action;

  const awaitingAccountantReview = (inv) => String(inv?.status || "").trim() === "Verifying";

  const handleApprove = async (inv) => {
    if (!onUpdateInvoice || !awaitingAccountantReview(inv)) return;
    setBusyInvoiceId(inv.id);
    setBusyAction("approve");
    const result = await onUpdateInvoice({
      ...inv,
      status: "Paid",
      generatedReceiptUrl: `REC-${inv.id}.pdf`
    });
    setBusyInvoiceId(null);
    setBusyAction("");
    if (result?.ok) {
      setEvidenceModal({ open: false, invoice: null });
      onNotify?.("Payment approved", `Invoice ${inv.id} was marked paid after evidence review.`, "success");
    }
  };

  const handleReject = async () => {
    const inv = rejectModal.invoice;
    if (!onUpdateInvoice || !inv || !awaitingAccountantReview(inv)) return;
    const reason = String(rejectModal.reason || "").trim();
    if (!reason) {
      setRejectModal((prev) => ({ ...prev, error: "Please enter a rejection reason." }));
      return;
    }
    setBusyInvoiceId(inv.id);
    setBusyAction("reject");
    const result = await onUpdateInvoice({
      ...inv,
      status: "Pending",
      paymentRejectionReason: reason
    });
    setBusyInvoiceId(null);
    setBusyAction("");
    if (!result?.ok) {
      setRejectModal((prev) => ({ ...prev, error: result?.error || "Failed to reject payment evidence." }));
      return;
    }
    setRejectModal({ open: false, invoice: null, reason: "", error: "" });
    setEvidenceModal({ open: false, invoice: null });
    onNotify?.("Payment evidence rejected", `Invoice ${inv.id} was sent back to the student with your reason.`, "info");
  };

  const modalInvoice = evidenceModal.invoice;
  const modalProofUrl = modalInvoice ? proofUrl(modalInvoice) : "";
  const modalStudentName = modalInvoice
    ? String(studentById.get(String(modalInvoice.studentId || "").trim())?.name || "").trim() ||
      modalInvoice.studentId ||
      "—"
    : "";

  return /* @__PURE__ */ jsxs("div", { className: "space-y-6 animate-in fade-in duration-500 pb-10", children: [
    /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
      /* @__PURE__ */ jsxs("h2", {
        className: "text-xl font-bold text-slate-900 flex items-center gap-2",
        children: [
          /* @__PURE__ */ jsx(DollarSign, { size: 22, className: "text-slate-500" }),
          "Ledger & Payments"
        ]
      }),
      /* @__PURE__ */ jsx("p", {
        className: "text-sm text-slate-500 max-w-2xl",
        children:
          "All branch invoices by status. Open payment evidence on the To approve tab, then approve (mark paid) or reject (return to the student with a reason)."
      })
    ] }),
    tabCounts.to_approve > 0 &&
      /* @__PURE__ */ jsxs("div", {
        className: "rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900",
        children: [
          /* @__PURE__ */ jsx("span", { className: "font-semibold", children: tabCounts.to_approve }),
          " invoice",
          tabCounts.to_approve === 1 ? "" : "s",
          " waiting for your review — use the ",
          /* @__PURE__ */ jsx("span", { className: "font-semibold", children: "To approve" }),
          " tab."
        ]
      }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center gap-4", children: [
      /* @__PURE__ */ jsx("div", { className: "flex flex-wrap bg-slate-100 p-1 rounded-lg gap-1", children: INVOICE_TABS.map((tab) =>
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => setActiveTab(tab.id),
            className: `px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === tab.id ? "bg-white text-indigo-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`,
            children: [tab.label, " (", tabCounts[tab.id] ?? 0, ")"]
          },
          tab.id
        )
      ) }),
      /* @__PURE__ */ jsx("input", {
        type: "search",
        placeholder: "Search student, description, transfer account…",
        value: query,
        onChange: (e) => setQuery(e.target.value),
        className: "flex-1 min-w-[200px] px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
      })
    ] }),
    /* @__PURE__ */ jsxs("div", {
      className: "bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden",
      children: [
        /* @__PURE__ */ jsx("div", { className: "px-4 py-3 border-b border-slate-100 bg-slate-50/80", children: /* @__PURE__ */ jsxs("p", { className: "text-xs font-semibold text-slate-600", children: [
          filteredRows.length,
          " invoice",
          filteredRows.length === 1 ? "" : "s",
          " · ",
          INVOICE_TABS.find((t) => t.id === activeTab)?.label || "All"
        ] }) }),
        /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", {
          className: "min-w-full text-sm border-collapse",
          children: [
            /* @__PURE__ */ jsx("thead", {
              className: "bg-slate-50 border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-500",
              children: /* @__PURE__ */ jsx("tr", {
                children: TABLE_COLUMNS.map((col) =>
                  /* @__PURE__ */ jsx(
                    "th",
                    {
                      scope: "col",
                      className: `px-4 py-3 whitespace-nowrap ${col.className || ""} ${col.key === "actions" ? "text-right" : ""}`,
                      children: col.label
                    },
                    col.key
                  )
                )
              })
            }),
            /* @__PURE__ */ jsx("tbody", {
              className: "divide-y divide-slate-100",
              children: invoicesLoading
                ? /* @__PURE__ */ jsx("tr", {
                    children: /* @__PURE__ */ jsx("td", {
                      colSpan: TABLE_COLUMNS.length,
                      className: "px-4 py-12 text-center text-sm text-slate-500",
                      children: "Loading…"
                    })
                  })
                : filteredRows.length === 0
                ? /* @__PURE__ */ jsx("tr", {
                    children: /* @__PURE__ */ jsx("td", {
                      colSpan: TABLE_COLUMNS.length,
                      className: "px-4 py-12 text-center text-sm text-slate-500",
                      children:
                        activeTab === "to_approve"
                          ? "No payment evidence waiting for review."
                          : activeTab === "rejected"
                          ? "No rejected payment evidence."
                          : activeTab === "pending"
                          ? "No pending invoices."
                          : "No invoices in this tab."
                    })
                  })
                : filteredRows.map((inv) => {
                    const sid = String(inv.studentId || "").trim();
                    const studentName =
                      String(studentById.get(sid)?.name || "").trim() || sid || "—";
                    const amountLabel = formatLKR(
                      typeof inv.amount === "string" ? parseFloat(inv.amount) : inv.amount,
                      inv.currency || "LKR"
                    );
                    const accountLabel = transferAccountLabel(inv, paymentAccountsById);
                    const isReviewQueue = awaitingAccountantReview(inv);
                    const hasProof = !!proofUrl(inv);

                    return /* @__PURE__ */ jsxs(
                      "tr",
                      { className: "hover:bg-slate-50/80 align-middle", children: [
                        /* @__PURE__ */ jsx("td", { className: "px-4 py-3 font-medium text-slate-900", children: studentName }),
                        /* @__PURE__ */ jsx("td", {
                          className: "px-4 py-3 text-slate-600 max-w-[220px] truncate",
                          title: inv.description || "",
                          children: inv.description || "—"
                        }),
                        /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-slate-800 tabular-nums whitespace-nowrap", children: amountLabel }),
                        /* @__PURE__ */ jsx("td", {
                          className: "px-4 py-3 text-slate-700 max-w-[160px] truncate",
                          title: accountLabel !== "—" ? accountLabel : "",
                          children: accountLabel
                        }),
                        /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-slate-600 whitespace-nowrap", children: inv.dueDate || "—" }),
                        /* @__PURE__ */ jsx("td", { className: "px-4 py-3 whitespace-nowrap", children: /* @__PURE__ */ jsx(
                          "span",
                          {
                            className: `inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadgeClass(inv.status)}`,
                            children: inv.status || "—"
                          }
                        ) }),
                        /* @__PURE__ */ jsx("td", { className: "px-4 py-3 text-right whitespace-nowrap", children: /* @__PURE__ */ jsxs("div", {
                          className: "inline-flex flex-wrap justify-end gap-1.5",
                          children: [
                            isReviewQueue || hasProof
                              ? /* @__PURE__ */ jsx(Button, {
                                  size: "sm",
                                  variant: isReviewQueue ? "primary" : "outline",
                                  className: isReviewQueue ? "text-xs h-8 bg-indigo-600 hover:bg-indigo-700" : "text-xs h-8",
                                  onClick: () => setEvidenceModal({ open: true, invoice: inv }),
                                  children: "View evidence"
                                })
                              : null,
                            isReviewQueue
                              ? /* @__PURE__ */ jsxs(Fragment, { children: [
                                  !hasProof &&
                                    /* @__PURE__ */ jsx("span", {
                                      className: "text-[10px] text-amber-700 self-center px-1",
                                      children: "No file yet"
                                    }),
                                  /* @__PURE__ */ jsx(Button, {
                                    size: "sm",
                                    className: "text-xs h-8 bg-emerald-600 hover:bg-emerald-700",
                                    disabled: !hasProof || isBusy(inv.id, "approve") || isBusy(inv.id, "reject"),
                                    onClick: () => handleApprove(inv),
                                    children: isBusy(inv.id, "approve") ? "Approving…" : "Approve"
                                  }),
                                  /* @__PURE__ */ jsx(Button, {
                                    size: "sm",
                                    variant: "outline",
                                    className: "text-xs h-8 border-rose-200 text-rose-700 hover:bg-rose-50",
                                    disabled: !hasProof || isBusy(inv.id, "approve") || isBusy(inv.id, "reject"),
                                    onClick: () => setRejectModal({ open: true, invoice: inv, reason: "", error: "" }),
                                    children: isBusy(inv.id, "reject") ? "Rejecting…" : "Reject"
                                  })
                                ] })
                              : null
                          ]
                        }) })
                      ] },
                      String(inv.id)
                    );
                  })
            })
          ]
        }) })
      ]
    }),
    evidenceModal.open && modalInvoice && /* @__PURE__ */ jsx("div", {
      className: "fixed inset-0 z-50 overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm",
      onClick: () => setEvidenceModal({ open: false, invoice: null }),
      children: /* @__PURE__ */ jsxs("div", {
        className: "bg-white rounded-xl border border-gray-100 shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto my-auto",
        onClick: (e) => e.stopPropagation(),
        children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start gap-4 p-5 border-b border-slate-100", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h3", { className: "font-bold text-lg text-slate-900", children: "Review payment evidence" }),
              /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-600 mt-1", children: [
                modalStudentName,
                " · ",
                formatLKR(
                  typeof modalInvoice.amount === "string" ? parseFloat(modalInvoice.amount) : modalInvoice.amount,
                  modalInvoice.currency || "LKR"
                )
              ] }),
              /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 mt-0.5", children: [
                "Transfer account: ",
                transferAccountLabel(modalInvoice, paymentAccountsById)
              ] }),
              modalInvoice.paymentProofName
                ? /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: modalInvoice.paymentProofName })
                : null
            ] }),
            /* @__PURE__ */ jsxs("button", {
              type: "button",
              onClick: () => setEvidenceModal({ open: false, invoice: null }),
              className: "text-slate-400 hover:text-slate-600 p-1",
              children: [/* @__PURE__ */ jsx("span", { className: "sr-only", children: "Close" }), /* @__PURE__ */ jsx(X, { size: 20 })]
            })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "p-5", children: /* @__PURE__ */ jsx(EvidencePreview, { url: modalProofUrl, name: modalInvoice.paymentProofName }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2 p-5 pt-0 border-t border-slate-100", children: [
            modalProofUrl
              ? /* @__PURE__ */ jsx("a", {
                  href: modalProofUrl,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  children: /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "outline", className: "text-xs h-8", children: ["Open in new tab", /* @__PURE__ */ jsx(ExternalLink, { size: 14, className: "ml-1" })] })
                })
              : null,
            awaitingAccountantReview(modalInvoice)
              ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx(Button, {
                    size: "sm",
                    className: "text-xs h-8 bg-emerald-600 hover:bg-emerald-700",
                    disabled: !modalProofUrl || isBusy(modalInvoice.id, "approve") || isBusy(modalInvoice.id, "reject"),
                    onClick: () => handleApprove(modalInvoice),
                    children: isBusy(modalInvoice.id, "approve") ? "Approving…" : "Approve payment"
                  }),
                  /* @__PURE__ */ jsx(Button, {
                    size: "sm",
                    variant: "outline",
                    className: "text-xs h-8 border-rose-200 text-rose-700 hover:bg-rose-50",
                    disabled: !modalProofUrl || isBusy(modalInvoice.id, "approve") || isBusy(modalInvoice.id, "reject"),
                    onClick: () => setRejectModal({ open: true, invoice: modalInvoice, reason: "", error: "" }),
                    children: "Reject"
                  })
                ] })
              : null,
            /* @__PURE__ */ jsx(Button, {
              size: "sm",
              variant: "ghost",
              className: "text-xs h-8 ml-auto",
              onClick: () => setEvidenceModal({ open: false, invoice: null }),
              children: "Close"
            })
          ] })
        ]
      })
    }),
    rejectModal.open && rejectModal.invoice && /* @__PURE__ */ jsx("div", {
      className: "fixed inset-0 z-[60] overflow-y-auto overscroll-contain flex items-start justify-center py-8 px-4 bg-slate-900/60 backdrop-blur-sm",
      children: /* @__PURE__ */ jsxs("div", {
        className: "bg-white rounded-xl border border-gray-100 shadow-2xl p-6 w-full max-w-md my-auto",
        children: [
          /* @__PURE__ */ jsx("h3", { className: "font-bold text-lg text-slate-900 mb-2", children: "Reject payment evidence" }),
          /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-600 mb-4", children: [
            "The student will be notified. Invoice ",
            rejectModal.invoice.id
          ] }),
          /* @__PURE__ */ jsx("textarea", {
            className: "w-full min-h-[100px] border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500",
            placeholder: "Why is this evidence not accepted?",
            value: rejectModal.reason,
            onChange: (e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value, error: "" }))
          }),
          rejectModal.error ? /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-600 mt-2", children: rejectModal.error }) : null,
          /* @__PURE__ */ jsxs("div", { className: "flex gap-3 mt-6", children: [
            /* @__PURE__ */ jsx(Button, {
              variant: "ghost",
              className: "flex-1",
              onClick: () => setRejectModal({ open: false, invoice: null, reason: "", error: "" }),
              children: "Cancel"
            }),
            /* @__PURE__ */ jsx(Button, {
              className: "flex-1 bg-rose-600 hover:bg-rose-700 text-white",
              onClick: handleReject,
              isLoading: isBusy(rejectModal.invoice.id, "reject"),
              children: "Reject evidence"
            })
          ] })
        ]
      })
    })
  ] });
};

export { AccountantInvoices };
