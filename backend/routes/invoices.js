const { parseBody, sendJson } = require("../lib/httpUtils");
const { readInvoices, writeInvoices } = require("../models/invoices");
const { readStudemts, publicInvoiceRecord, publicChatFileUrl } = require("../models/students");
const { readPaymentAccounts } = require("../models/paymentAccounts");
const { storeChatAttachmentDataUrl, storePaymentProofDataUrl } = require("../services/uploads");
const { buildInvoiceWhatsappMessage } = require("../services/whatsappMessages");
const { deliverInvoicePackageToStudentWhatsapp, notifyInvoicePaymentDecision } = require("../services/notifications");

async function handle(req, res, url) {
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
      if (!studentId || !description || !dueDate || !Number.isFinite(amountNum) || amountNum <= 0) {
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
        amount: Number(amountNum),
        currency,
        description,
        createdByName: String(body.createdByName || "").trim(),
        createdById: String(body.createdById || "").trim(),
        issueDate: String(body.issueDate || new Date().toISOString().split("T")[0]),
        dueDate,
        status: String(body.status || "Pending"),
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
      try {
        const students = await readStudemts();
        const student = students.find((item) => String(item.id || "") === studentId);
        const counselorId = String(student?.inquiryCounselorId || student?.counselor || "").trim();
        if (!student) {
          whatsappDelivery = { attempted: false, status: "skipped", reason: "Student record not found." };
        } else if (!counselorId || counselorId === "Unassigned") {
          whatsappDelivery = { attempted: false, status: "skipped", reason: "Student has no assigned counselor." };
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
      const canReviewInvoicePayment =
        actorRole === "Admin" || actorRole === "Manager" || actorRole === "Accountant";
      if (isAcceptingPayment && !canReviewInvoicePayment) {
        sendJson(res, 403, {
          ok: false,
          error: "Only Admin, Manager, or Accountant can accept invoice payments.",
        });
        return true;
      }
      if (isRejectingPayment && !canReviewInvoicePayment) {
        sendJson(res, 403, {
          ok: false,
          error: "Only Admin, Manager, or Accountant can reject invoice payment evidence.",
        });
        return true;
      }
      const { actorRole: _actorRole, actorId: _actorId, ...safeBody } = body;
      const merged = {
        ...currentInvoice,
        ...safeBody,
        id: currentInvoice.id,
        updatedAt: new Date().toISOString(),
      };
      if (isRejectingPayment) {
        merged.paymentRejectionReason = String(body.paymentRejectionReason || merged.paymentRejectionReason || "").trim();
        merged.paymentRejectedAt = new Date().toISOString();
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
      const dataUrl = String(body.dataUrl || "");
      const fileName = String(body.fileName || "payment-proof");
      if (!dataUrl.startsWith("data:")) {
        sendJson(res, 400, { ok: false, error: "Invalid payment proof payload." });
        return true;
      }
      const stored = await storePaymentProofDataUrl(dataUrl, fileName);
      if (!stored) {
        sendJson(res, 400, { ok: false, error: "Unsupported payment proof format. Use PDF, JPG, PNG, DOC, or DOCX." });
        return true;
      }
      if (stored.error) {
        sendJson(res, 400, { ok: false, error: stored.error });
        return true;
      }
      const invoices = await readInvoices();
      const idx = invoices.findIndex((inv) => String(inv.id || "") === invoiceId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Invoice not found." });
        return true;
      }
      const merged = {
        ...invoices[idx],
        status: "Verifying",
        paymentMethod: "Bank Transfer",
        paymentProofUrl: `http://${req.headers.host}${stored.url}`,
        paymentProofName: stored.name,
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
