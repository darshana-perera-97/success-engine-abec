const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const { readInvoices, writeInvoices } = require("../models/invoices");
const { readStudemts, publicInvoiceRecord, publicChatFileUrl } = require("../models/students");
const { readPaymentAccounts } = require("../models/paymentAccounts");
const { storeChatAttachmentDataUrl, storePaymentProofDataUrl } = require("../services/uploads");
const { buildInvoiceWhatsappMessage } = require("../services/whatsappMessages");
const { deliverInvoicePackageToStudentWhatsapp, notifyInvoicePaymentDecision } = require("../services/notifications");
const { readSystemData } = require("../models/systemData");
const { isCounselorRole } = require("../services/roles");

const WAVE_OFF_APPROVER_ROLES = new Set(["Admin", "Manager", "Team Lead"]);

function normalizePaidAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function invoiceInvoicedAmount(invoice) {
  const amount = Number(invoice?.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function approvedPaidAmount(invoice) {
  const paid = Number(invoice?.paidAmount);
  return Number.isFinite(paid) && paid > 0 ? paid : 0;
}

function invoiceBalanceDue(invoice) {
  return Math.max(0, invoiceInvoicedAmount(invoice) - approvedPaidAmount(invoice));
}

function isInvoiceFullyPaid(invoice) {
  const status = String(invoice?.status || "").trim();
  if (status === "Paid" || status === "Waived") return true;
  if (status === "Wave-off Rejected") return true;
  return invoiceBalanceDue(invoice) <= 0.009;
}

function mapInvoiceToWaveOffRequest(invoice, studentNameById = new Map()) {
  const studentId = String(invoice?.studentId || "").trim();
  return {
    id: String(invoice?.id || "").trim(),
    requestType: "invoice-wave-off",
    invoiceId: String(invoice?.id || "").trim(),
    studentId,
    studentName: String(invoice?.studentName || studentNameById.get(studentId) || "").trim(),
    description: String(invoice?.description || "").trim(),
    reason: String(invoice?.waveOffReason || "").trim(),
    status: String(invoice?.waveOffStatus || "pending").trim().toLowerCase(),
    requestedByUserId: String(invoice?.createdById || "").trim(),
    requestedByName: String(invoice?.createdByName || "").trim(),
    requestedByRole: String(invoice?.createdByRole || "").trim(),
    requestedAt: String(invoice?.issueDate || invoice?.updatedAt || "").trim(),
    reviewedByUserId: String(invoice?.waveOffReviewedByUserId || "").trim() || undefined,
    reviewedByName: String(invoice?.waveOffReviewedByName || "").trim() || undefined,
    reviewedByRole: String(invoice?.waveOffReviewedByRole || "").trim() || undefined,
    reviewedAt: String(invoice?.waveOffReviewedAt || "").trim() || undefined,
    reviewNote: String(invoice?.waveOffReviewNote || "").trim() || undefined,
  };
}

async function actorCanReviewInvoicePayment(actorRole) {
  const role = String(actorRole || "").trim();
  if (role === "Admin" || role === "Manager" || role === "Accountant") return true;
  if (!isCounselorRole(role)) return false;
  const systemData = await readSystemData();
  return systemData.counselorCanAcceptPayments === true;
}

function archiveCurrentPaymentProof(
  invoice,
  {
    outcome = "superseded",
    rejectionReason = "",
    approvedAmount = null,
    claimedAmount = null,
    balanceDueAtUpload = null,
    paidBeforeUpload = null,
  } = {}
) {
  const url = String(invoice?.paymentProofUrl || "").trim();
  const history = Array.isArray(invoice?.paymentProofHistory) ? [...invoice.paymentProofHistory] : [];
  const archivedClaimedEarly = normalizePaidAmount(claimedAmount ?? invoice.paymentProofClaimedAmount);
  const archivedApprovedEarly = normalizePaidAmount(approvedAmount);
  if (!url && archivedClaimedEarly == null && archivedApprovedEarly == null) return history;
  const entry = {
    url: invoice.paymentProofUrl || "",
    name: String(
      invoice.paymentProofName ||
        (String(invoice?.paymentMethod || "").trim() === "Cash" ? "Cash payment" : "Payment evidence")
    ).trim(),
    uploadedAt: String(invoice.paymentProofUploadedAt || invoice.updatedAt || new Date().toISOString()).trim(),
    outcome,
    rejectionReason: String(rejectionReason || invoice.paymentRejectionReason || "").trim(),
  };
  const archivedClaimed = normalizePaidAmount(claimedAmount ?? invoice.paymentProofClaimedAmount);
  if (archivedClaimed != null) entry.claimedAmount = archivedClaimed;
  const archivedApproved = normalizePaidAmount(approvedAmount);
  if (archivedApproved != null) entry.approvedAmount = archivedApproved;
  const archivedBalance = normalizePaidAmount(balanceDueAtUpload ?? invoice.paymentProofBalanceDue);
  if (archivedBalance != null) entry.balanceDueAtUpload = archivedBalance;
  const archivedPaidBefore = normalizePaidAmount(paidBeforeUpload ?? invoice.paymentProofPaidBefore);
  if (archivedPaidBefore != null) entry.paidBeforeUpload = archivedPaidBefore;
  history.push(entry);
  return history;
}

function clearCurrentPaymentProofFields(invoice) {
  return {
    ...invoice,
    paymentProofUrl: "",
    paymentProofName: "",
    paymentProofUploadedAt: "",
    paymentProofClaimedAmount: "",
    paymentProofBalanceDue: "",
    paymentProofPaidBefore: "",
    paymentRejectionReason: "",
    paymentRejectedAt: "",
  };
}

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/invoice-wave-off-requests") {
    try {
      const requestedBy = String(url.searchParams.get("requestedBy") || "").trim();
      const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
      const pendingOnly = url.searchParams.get("pendingOnly") === "1" || url.searchParams.get("pendingOnly") === "true";
      const studentId = String(url.searchParams.get("studentId") || "").trim();

      const invoices = await readInvoices();
      const students = await readStudemts();
      const studentNameById = new Map(
        students.map((s) => [String(s.id || "").trim(), String(s.name || "").trim()])
      );

      let list = invoices.filter((inv) => inv?.isWaveOff === true);
      if (requestedBy) {
        list = list.filter((inv) => String(inv.createdById || "").trim() === requestedBy);
      }
      if (studentId) {
        list = list.filter((inv) => String(inv.studentId || "").trim() === studentId);
      }
      if (pendingOnly) {
        list = list.filter((inv) => String(inv.waveOffStatus || "").trim().toLowerCase() === "pending");
      } else if (status) {
        list = list.filter((inv) => String(inv.waveOffStatus || "").trim().toLowerCase() === status);
      }

      const rows = list
        .map((inv) => mapInvoiceToWaveOffRequest(inv, studentNameById))
        .sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
      sendJson(res, 200, { ok: true, data: rows });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load invoice wave-off requests." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/invoices") {
    try {
      const invoices = await readInvoices();
      const payload = { ok: true, data: invoices.map((inv) => publicInvoiceRecord(req, inv)) };
      sendJson(res, 200, payload);
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load invoices." });
    }
    return true;
  }

  if (
    req.method === "GET" &&
    (url.pathname === "/api/st-invoices" || url.pathname === "/api/st-invoices/")
  ) {
    try {
      const invoices = await readInvoices();
      const payload = { ok: true, data: invoices.map((inv) => publicInvoiceRecord(req, inv)) };
      sendJson(res, 200, payload);
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load invoices." });
    }
    return true;
  }

  if (
    req.method === "GET" &&
    /^\/api\/st-invoices\/(all|paid|pending|verifying|overdue)\/?$/.test(url.pathname)
  ) {
    try {
      const statusSegment = url.pathname.replace(/\/+$/, "").split("/").pop();
      const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
      const invoices = await readInvoices();
      const pub = invoices.map((inv) => publicInvoiceRecord(req, inv));

      const matchStatus = (inv, tab) => {
        const s = String(inv.status || "").trim();
        if (tab === "paid") return s === "Paid";
        if (tab === "pending") return s === "Pending";
        if (tab === "verifying") return s === "Verifying";
        if (tab === "overdue") return s === "Overdue";
        return true;
      };
      const counts = { all: 0, paid: 0, pending: 0, verifying: 0, overdue: 0 };
      for (const inv of pub) {
        counts.all += 1;
        if (matchStatus(inv, "paid")) counts.paid += 1;
        if (matchStatus(inv, "pending")) counts.pending += 1;
        if (matchStatus(inv, "verifying")) counts.verifying += 1;
        if (matchStatus(inv, "overdue")) counts.overdue += 1;
      }

      let filtered = pub.filter((inv) => matchStatus(inv, statusSegment));
      if (q) {
        const studemts = await readStudemts();
        const studentMap = new Map();
        for (const s of studemts) {
          const id = String(s.id || "").trim();
          if (id) studentMap.set(id, s);
        }
        filtered = filtered.filter((inv) => {
          const sid = String(inv.studentId || "").trim();
          const student = studentMap.get(sid);
          const name = String(student?.name || "").toLowerCase();
          const id = String(inv.id || "").toLowerCase();
          const desc = String(inv.description || "").toLowerCase();
          return name.includes(q) || id.includes(q) || desc.includes(q) || sid.toLowerCase().includes(q);
        });
      }
      filtered.sort(
        (a, b) =>
          new Date(b.issueDate || b.createdAt || 0).getTime() -
          new Date(a.issueDate || a.createdAt || 0).getTime()
      );
      sendJson(res, 200, { ok: true, data: filtered, counts });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load invoices." });
    }
    return true;
  }

  if (
    req.method === "GET" &&
    /^\/api\/st-invoices\/student\/[^/]+\/?$/.test(url.pathname)
  ) {
    try {
      const studentId = decodeURIComponent(
        url.pathname.replace(/\/+$/, "").split("/").pop()
      ).trim();
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return true;
      }
      const invoices = await readInvoices();
      const filtered = invoices
        .filter((inv) => String(inv.studentId || "").trim() === studentId)
        .sort(
          (a, b) =>
            new Date(b.issueDate || b.createdAt || 0).getTime() -
            new Date(a.issueDate || a.createdAt || 0).getTime()
        )
        .map((inv) => publicInvoiceRecord(req, inv));
      sendJson(res, 200, { ok: true, data: filtered });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load student invoices." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/invoices") {
    try {
      const body = await parseBody(req);
      const studentId = String(body.studentId || "").trim();
      const description = String(body.description || "").trim();
      const currency = String(body.currency || "LKR").trim().toUpperCase();
      const amountNum = Number(body.amount);
      const dueDate = String(body.dueDate || "").trim();
      const isWaveOff = body.isWaveOff === true;
      const waveOffReason = String(body.waveOffReason || "").trim();

      if (!studentId || !description || !dueDate) {
        sendJson(res, 400, { ok: false, error: "Invalid invoice payload." });
        return true;
      }
      if (isWaveOff) {
        if (!waveOffReason) {
          sendJson(res, 400, { ok: false, error: "Wave-off reason is required." });
          return true;
        }
      } else if (!Number.isFinite(amountNum) || amountNum <= 0) {
        sendJson(res, 400, { ok: false, error: "Invalid invoice payload." });
        return true;
      }
      const attachmentLinkRaw = String(body.attachmentLink || "").trim();
      const attachmentLink =
        attachmentLinkRaw && /^https?:\/\//i.test(attachmentLinkRaw) ? attachmentLinkRaw : "";

      let paymentAccount = null;
      const paymentAccountId = String(body.paymentAccountId || "").trim();
      if (paymentAccountId) {
        const accounts = await readPaymentAccounts();
        const matched = accounts.find((a) => String(a.id || "") === paymentAccountId);
        if (matched) paymentAccount = { ...matched };
      }

      const invoice = {
        id: String(body.id || `INV-${Date.now()}`),
        studentId,
        amount: isWaveOff ? 0 : Number(amountNum),
        currency,
        description,
        createdByName: String(body.createdByName || "").trim(),
        createdById: String(body.createdById || "").trim(),
        createdByRole: String(body.createdByRole || "").trim() || undefined,
        issueDate: String(body.issueDate || new Date().toISOString().split("T")[0]),
        dueDate,
        status: isWaveOff ? "Wave-off Pending" : String(body.status || "Pending"),
        isWaveOff: isWaveOff || undefined,
        waveOffReason: isWaveOff ? waveOffReason : undefined,
        waveOffStatus: isWaveOff ? "pending" : undefined,
        paymentMethod: body.paymentMethod ? String(body.paymentMethod) : undefined,
        generatedReceiptUrl: body.generatedReceiptUrl ? String(body.generatedReceiptUrl) : undefined,
        paymentProofUrl: body.paymentProofUrl ? String(body.paymentProofUrl) : undefined,
        paymentProofName: body.paymentProofName ? String(body.paymentProofName) : undefined,
        attachmentLink: attachmentLink || undefined,
        paymentAccountId: paymentAccount?.id,
        paymentAccount: paymentAccount || undefined,
        updatedAt: new Date().toISOString(),
      };

      let invoiceFileAttachment = null;
      if (body.invoiceAttachmentDataUrl) {
        const storedInvoiceFile = await storeChatAttachmentDataUrl(
          String(body.invoiceAttachmentDataUrl || ""),
          String(body.invoiceAttachmentName || `${invoice.id}-attachment`)
        );
        if (storedInvoiceFile && !storedInvoiceFile.error) {
          invoiceFileAttachment = {
            name: storedInvoiceFile.name,
            mime: storedInvoiceFile.mime,
            size: storedInvoiceFile.size,
            url: storedInvoiceFile.url,
          };
          invoice.attachmentFileUrl = publicChatFileUrl(req, storedInvoiceFile.url);
          invoice.attachmentFileName = storedInvoiceFile.name;
          invoice.attachmentFileMime = storedInvoiceFile.mime;
        }
      }

      let receiptAttachment = null;
      if (body.receiptImageDataUrl) {
        const storedReceipt = await storeChatAttachmentDataUrl(
          String(body.receiptImageDataUrl || ""),
          String(body.receiptImageName || `${invoice.id}-invoice.png`)
        );
        if (storedReceipt && !storedReceipt.error) {
          receiptAttachment = {
            name: storedReceipt.name,
            mime: storedReceipt.mime,
            size: storedReceipt.size,
            url: storedReceipt.url,
          };
          invoice.generatedReceiptUrl = publicChatFileUrl(req, storedReceipt.url);
        }
      }

      let whatsappDelivery = { attempted: false, status: "skipped", reason: "Not attempted." };
      if (!isWaveOff) {
        try {
          const students = await readStudemts();
          const student = students.find((item) => String(item.id || "") === studentId);
          const counselorId = String(student?.inquiryCounselorId || student?.counselor || "").trim();
          if (!student) {
            whatsappDelivery = { attempted: false, status: "skipped", reason: "Student record not found." };
          } else {
            const messageText = buildInvoiceWhatsappMessage({
              studentName: String(student.name || "").trim(),
              invoiceId: invoice.id,
              currency: invoice.currency,
              amount: invoice.amount,
              description: invoice.description,
              issueDate: invoice.issueDate,
              dueDate: invoice.dueDate,
              paymentAccount,
              attachmentLink: invoice.attachmentLink,
              attachmentFileUrl: invoice.attachmentFileUrl,
              attachmentFileName: invoice.attachmentFileName,
              generatedReceiptUrl: invoice.generatedReceiptUrl,
            });
            whatsappDelivery = await deliverInvoicePackageToStudentWhatsapp({
              student,
              senderId: counselorId,
              receiverId: studentId,
              messageText,
              receiptAttachment,
              invoiceFileAttachment,
            });
          }
        } catch (error) {
          whatsappDelivery = {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send invoice via WhatsApp."),
            sentAt: new Date().toISOString(),
          };
          console.error("Invoice WhatsApp send failed:", error);
        }
      } else {
        whatsappDelivery = {
          attempted: false,
          status: "skipped",
          reason: "Wave-off invoice pending manager approval.",
        };
        const students = await readStudemts();
        const student = students.find((item) => String(item.id || "") === studentId);
        if (student) {
          invoice.studentName = String(student.name || "").trim();
        }
        logEvent("invoice-wave-off", "created", {
          id: invoice.id,
          studentId,
          requestedByUserId: invoice.createdById,
        });
      }
      invoice.whatsappDelivery = whatsappDelivery;
      const invoices = await readInvoices();
      const nextInvoices = [invoice, ...invoices];
      await writeInvoices(nextInvoices);
      sendJson(res, 201, { ok: true, data: publicInvoiceRecord(req, invoice) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && /^\/api\/invoices\/[^/]+\/decide-wave-off\/?$/.test(url.pathname)) {
    try {
      const invoiceId = decodeURIComponent(url.pathname.replace("/api/invoices/", "").split("/")[0] || "").trim();
      if (!invoiceId) {
        sendJson(res, 400, { ok: false, error: "Invoice ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const decision = String(body.decision || "").trim().toLowerCase();
      const reviewerRole = String(body.reviewedByRole || "").trim();
      const reviewerUserId = String(body.reviewedByUserId || "").trim();
      const reviewerName = String(body.reviewedByName || "").trim();
      const reviewNote = String(body.reviewNote || "").trim();

      if (!WAVE_OFF_APPROVER_ROLES.has(reviewerRole)) {
        sendJson(res, 403, { ok: false, error: "You do not have permission to review wave-off invoices." });
        return true;
      }
      if (decision !== "approved" && decision !== "rejected") {
        sendJson(res, 400, { ok: false, error: "Decision must be approved or rejected." });
        return true;
      }

      const invoices = await readInvoices();
      const idx = invoices.findIndex((inv) => String(inv.id || "") === invoiceId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Invoice not found." });
        return true;
      }
      const current = invoices[idx];
      if (current?.isWaveOff !== true) {
        sendJson(res, 400, { ok: false, error: "This invoice is not a wave-off request." });
        return true;
      }
      if (String(current.waveOffStatus || "").trim().toLowerCase() !== "pending") {
        sendJson(res, 400, { ok: false, error: "This wave-off request has already been reviewed." });
        return true;
      }

      const reviewedAt = new Date().toISOString();
      const merged = {
        ...current,
        waveOffStatus: decision,
        waveOffReviewedByUserId: reviewerUserId,
        waveOffReviewedByName: reviewerName,
        waveOffReviewedByRole: reviewerRole,
        waveOffReviewedAt: reviewedAt,
        waveOffReviewNote: reviewNote || undefined,
        updatedAt: reviewedAt,
      };
      if (decision === "approved") {
        merged.status = "Waived";
        merged.amount = 0;
      } else {
        merged.status = "Wave-off Rejected";
        merged.amount = 0;
      }

      const updated = [...invoices];
      updated[idx] = merged;
      await writeInvoices(updated);

      logEvent("invoice-wave-off", decision, {
        id: invoiceId,
        studentId: merged.studentId,
        reviewedByUserId: reviewerUserId,
      });

      sendJson(res, 200, { ok: true, data: publicInvoiceRecord(req, merged) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && /^\/api\/invoices\/[^/]+\/resend-whatsapp\/?$/.test(url.pathname)) {
    try {
      const invoiceId = decodeURIComponent(url.pathname.replace(/\/+$/, "").split("/")[3] || "").trim();
      if (!invoiceId) {
        sendJson(res, 400, { ok: false, error: "Invoice ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const invoices = await readInvoices();
      const idx = invoices.findIndex((inv) => String(inv.id || "") === invoiceId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Invoice not found." });
        return true;
      }
      const invoice = invoices[idx];
      const students = await readStudemts();
      const student = students.find((item) => String(item.id || "") === String(invoice.studentId || ""));
      if (!student) {
        sendJson(res, 404, { ok: false, error: "Student record not found for this invoice." });
        return true;
      }
      const counselorId = String(student?.inquiryCounselorId || student?.counselor || "").trim();
      let paymentAccount = invoice.paymentAccount || null;
      if (!paymentAccount && invoice.paymentAccountId) {
        const accounts = await readPaymentAccounts();
        paymentAccount = accounts.find((a) => String(a.id || "") === String(invoice.paymentAccountId || "")) || null;
      }
      const messageText = buildInvoiceWhatsappMessage({
        studentName: String(student.name || "").trim(),
        invoiceId: invoice.id,
        currency: invoice.currency,
        amount: invoice.amount,
        description: invoice.description,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        paymentAccount,
        attachmentLink: invoice.attachmentLink,
        attachmentFileUrl: invoice.attachmentFileUrl,
        attachmentFileName: invoice.attachmentFileName,
        generatedReceiptUrl: invoice.generatedReceiptUrl,
      });
      const whatsappDelivery = await deliverInvoicePackageToStudentWhatsapp({
        student,
        senderId: counselorId,
        receiverId: String(invoice.studentId || "").trim(),
        messageText,
      });
      const merged = {
        ...invoice,
        whatsappDelivery: {
          ...(invoice.whatsappDelivery || {}),
          ...whatsappDelivery,
          resentAt: new Date().toISOString(),
          resentByRole: String(body?.actorRole || "").trim(),
          resentById: String(body?.actorId || "").trim(),
        },
        updatedAt: new Date().toISOString(),
      };
      const updated = [...invoices];
      updated[idx] = merged;
      await writeInvoices(updated);
      sendJson(res, 200, { ok: true, data: publicInvoiceRecord(req, merged), whatsappDelivery });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || "Failed to resend invoice via WhatsApp.") });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/invoices/") && !url.pathname.endsWith("/payment-proof")) {
    try {
      const invoiceId = decodeURIComponent(url.pathname.replace("/api/invoices/", "").trim()).replace(/\/+$/, "");
      if (!invoiceId) {
        sendJson(res, 400, { ok: false, error: "Invoice ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const invoices = await readInvoices();
      const idx = invoices.findIndex((inv) => String(inv.id || "") === invoiceId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Invoice not found." });
        return true;
      }
      const currentInvoice = invoices[idx];
      const actorRole = String(body.actorRole || "").trim();
      const prevStatus = String(currentInvoice.status || "");
      const nextStatus = String(body.status || currentInvoice.status || "");
      const isAcceptingPayment = nextStatus === "Paid" && prevStatus === "Verifying";
      const isRejectingPayment = nextStatus === "Pending" && prevStatus === "Verifying";
      const wasFullyPaid = isInvoiceFullyPaid(currentInvoice);
      if (wasFullyPaid) {
        if (nextStatus !== "Paid") {
          sendJson(res, 403, { ok: false, error: "Approved payments cannot be reversed." });
          return true;
        }
        if (body.paidAmount !== undefined || body.amount !== undefined) {
          sendJson(res, 403, { ok: false, error: "Paid amount cannot be changed after approval." });
          return true;
        }
      }
      const canReviewInvoicePayment = await actorCanReviewInvoicePayment(actorRole);
      if (isAcceptingPayment && !canReviewInvoicePayment) {
        sendJson(res, 403, {
          ok: false,
          error: "You do not have permission to accept invoice payments.",
        });
        return true;
      }
      if (isRejectingPayment && !canReviewInvoicePayment) {
        sendJson(res, 403, {
          ok: false,
          error: "You do not have permission to reject invoice payment evidence.",
        });
        return true;
      }
      const {
        actorRole: _actorRole,
        actorId: _actorId,
        paidAmount: bodyPaidAmount,
        amount: bodyAmount,
        paidAmountRecordedAt: _paidAmountRecordedAt,
        ...safeBody
      } = body;
      const merged = {
        ...currentInvoice,
        ...safeBody,
        id: currentInvoice.id,
        updatedAt: new Date().toISOString(),
      };
      if (wasFullyPaid) {
        merged.status = "Paid";
        merged.amount = currentInvoice.amount;
        merged.paidAmount = currentInvoice.paidAmount;
      }
      if (isAcceptingPayment) {
        const receiptAmount =
          normalizePaidAmount(bodyPaidAmount ?? bodyAmount) ??
          normalizePaidAmount(currentInvoice.paymentProofClaimedAmount);
        if (receiptAmount == null) {
          sendJson(res, 400, {
            ok: false,
            error: "Enter the amount received when approving payment evidence.",
          });
          return true;
        }
        if (receiptAmount > invoiceBalanceDue(currentInvoice) + 0.009) {
          sendJson(res, 400, {
            ok: false,
            error: `Receipt amount (${receiptAmount}) cannot exceed the outstanding balance (${invoiceBalanceDue(currentInvoice)}).`,
          });
          return true;
        }
        const invoiced = invoiceInvoicedAmount(currentInvoice);
        const previousPaid = approvedPaidAmount(currentInvoice);
        const newPaidTotal = previousPaid + receiptAmount;
        if (newPaidTotal > invoiced + 0.009) {
          sendJson(res, 400, {
            ok: false,
            error: `Approved total (${newPaidTotal}) cannot exceed the invoiced amount (${invoiced}).`,
          });
          return true;
        }
        merged.paidAmount = newPaidTotal;
        merged.amount = invoiced || currentInvoice.amount;
        merged.paidAmountRecordedAt = new Date().toISOString();
        merged.status = newPaidTotal >= invoiced - 0.009 ? "Paid" : "Partially Paid";
        merged.paymentProofHistory = archiveCurrentPaymentProof(currentInvoice, {
          outcome: "approved",
          rejectionReason: "",
          approvedAmount: receiptAmount,
        });
        Object.assign(merged, clearCurrentPaymentProofFields(merged));
      }
      if (isRejectingPayment) {
        merged.paymentRejectionReason = String(body.paymentRejectionReason || merged.paymentRejectionReason || "").trim();
        merged.paymentRejectedAt = new Date().toISOString();
        const balanceDue = invoiceBalanceDue(currentInvoice);
        merged.status = balanceDue < invoiceInvoicedAmount(currentInvoice) - 0.009 ? "Partially Paid" : "Pending";
      }
      if (isAcceptingPayment) {
        merged.paymentRejectionReason = "";
        merged.paymentRejectedAt = "";
      }
      const updated = [...invoices];
      updated[idx] = merged;
      await writeInvoices(updated);

      let invoicePaymentNotifications = null;
      if (isAcceptingPayment || isRejectingPayment) {
        const students = await readStudemts();
        const student = students.find((item) => String(item.id || "") === String(merged.studentId || ""));
        const decision = isAcceptingPayment ? "approved" : "rejected";
        invoicePaymentNotifications = await notifyInvoicePaymentDecision({
          req,
          invoice: merged,
          student: student || null,
          decision,
          actorRole,
          actorId: String(body.actorId || "").trim(),
        });
      }

      sendJson(res, 200, {
        ok: true,
        data: publicInvoiceRecord(req, merged),
        invoiceWhatsappNotification: invoicePaymentNotifications?.invoiceWhatsappNotification || null,
        invoicePaymentNotifications,
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/invoices/") && url.pathname.endsWith("/payment-proof")) {
    try {
      const invoiceId = decodeURIComponent(url.pathname.replace("/api/invoices/", "").replace("/payment-proof", "").trim()).replace(/\/+$/, "");
      if (!invoiceId) {
        sendJson(res, 400, { ok: false, error: "Invoice ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const rawPaymentMethod = String(body.paymentMethod || "").trim();
      const paymentMethod = rawPaymentMethod === "Cash" ? "Cash" : "Bank Transfer";
      const dataUrl = String(body.dataUrl || "");
      const fileName = String(body.fileName || "payment-proof");
      let stored = null;
      if (dataUrl.startsWith("data:")) {
        stored = await storePaymentProofDataUrl(dataUrl, fileName);
        if (!stored) {
          sendJson(res, 400, { ok: false, error: "Unsupported payment proof format. Use PDF, JPG, PNG, DOC, or DOCX." });
          return true;
        }
        if (stored.error) {
          sendJson(res, 400, { ok: false, error: stored.error });
          return true;
        }
      } else if (paymentMethod !== "Cash") {
        sendJson(res, 400, { ok: false, error: "Invalid payment proof payload." });
        return true;
      }
      const invoices = await readInvoices();
      const idx = invoices.findIndex((inv) => String(inv.id || "") === invoiceId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Invoice not found." });
        return true;
      }
      const current = invoices[idx];
      const currentStatus = String(current.status || "").trim();
      if (currentStatus === "Verifying") {
        sendJson(res, 400, { ok: false, error: "Payment evidence is already awaiting review for this invoice." });
        return true;
      }
      if (isInvoiceFullyPaid(current)) {
        sendJson(res, 400, { ok: false, error: "This invoice is already fully paid." });
        return true;
      }
      if (current?.isWaveOff === true) {
        sendJson(res, 400, { ok: false, error: "Payment evidence cannot be uploaded for a wave-off invoice." });
        return true;
      }
      const balanceDue = invoiceBalanceDue(current);
      const claimedAmount = normalizePaidAmount(body.claimedAmount);
      if (claimedAmount == null) {
        sendJson(res, 400, { ok: false, error: "Enter the amount on this receipt (full or partial)." });
        return true;
      }
      if (claimedAmount > balanceDue + 0.009) {
        sendJson(res, 400, {
          ok: false,
          error: `Receipt amount cannot exceed the outstanding balance (${balanceDue}).`,
        });
        return true;
      }
      const paymentProofHistory = current.paymentProofUrl
        ? archiveCurrentPaymentProof(current, {
            outcome: current.paymentRejectionReason ? "rejected" : "superseded",
            rejectionReason: current.paymentRejectionReason,
          })
        : Array.isArray(current.paymentProofHistory)
          ? [...current.paymentProofHistory]
          : [];
      const merged = {
        ...current,
        status: "Verifying",
        paymentMethod,
        paymentProofUrl: stored ? `http://${req.headers.host}${stored.url}` : "",
        paymentProofName: stored ? stored.name : "",
        paymentProofUploadedAt: new Date().toISOString(),
        paymentProofHistory,
        paymentRejectionReason: "",
        paymentRejectedAt: "",
        paymentProofClaimedAmount: claimedAmount,
        paymentProofBalanceDue: balanceDue,
        paymentProofPaidBefore: approvedPaidAmount(current),
        updatedAt: new Date().toISOString(),
      };
      const updated = [...invoices];
      updated[idx] = merged;
      await writeInvoices(updated);
      sendJson(res, 200, { ok: true, data: publicInvoiceRecord(req, merged) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
