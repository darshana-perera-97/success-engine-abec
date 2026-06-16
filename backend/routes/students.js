const crypto = require("crypto");
const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const {
  ADMIN_EMAIL,
  PIPELINE_STEPS,
  UNIVERSITY_OFFER_STATUSES,
  PROFILE_OTHER_DOCUMENTS_MAX_SLOT,
} = require("../config");
const { readUsers } = require("../models/users");
const {
  readStudemts,
  writeStudemts,
  publicAssetUrl,
  publicStudentRecord,
  publicStudentDocUrl,
  migrateProfileOtherDocumentsToSlotEntries,
  normalizeUniversityOfferLetters,
  normalizeUniversityOfferStatusInput,
} = require("../models/students");
const { readBranches } = require("../models/branches");
const { readInvoices } = require("../models/invoices");
const { appendReqStudent } = require("../models/reqStudents");
const { normalizeEmail } = require("../services/roles");
const {
  normalizePipelineStatus,
  applyRoleScope,
  pipelineStageOrder,
  studentTimeMs,
} = require("../services/pipeline");
const { reconcileSlaViolationsOnStudentRecord } = require("../services/adminData");
const {
  deliverCounselorMessageToStudentWhatsapp,
  normalizeSriLankaStudentPhone,
} = require("../services/whatsapp");
const {
  buildCounselorAssignmentWhatsappMessage,
  buildDocumentDecisionWhatsappMessage,
  buildDocumentUploadWhatsappMessage,
  buildUniversityOfferWhatsappMessage,
} = require("../services/whatsappMessages");
const { sendStudentPortalAccountDetails } = require("../services/studentAccountDetails");
const { collectDocumentVerificationTransitions } = require("../services/documents");
const {
  storeImageDataUrl,
  storeStudentCvDataUrl,
  storeStudentPermissionDataUrl,
  safeUnlinkStoredPermissionDoc,
  isSupportedWhatsappMediaMime,
} = require("../services/uploads");
const {
  isApplicationStage,
} = require("../services/pipeline");

function canSendWhatsappAttachmentMime(mime) {
  const normalized = String(mime || "").toLowerCase();
  if (!normalized) return false;
  if (typeof isSupportedWhatsappMediaMime === "function") {
    return isSupportedWhatsappMediaMime(normalized);
  }
  // Fallback for older runtime bundles where helper export can be missing.
  return new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
  ]).has(normalized);
}

const {
  readCountryDocConfig,
  getEnrolledAdvanceBlockReasons,
  resolveStudentStageId,
  isDocumentWhatsappNotifyEnabled,
} = require("../lib/docMappingResolve");
const { normalizeAccountDetailsStageId } = require("../models/docMapping");

async function getBlockedEnrolledTransitionError(previousStudent, mergedStudent) {
  const prevStage = normalizePipelineStatus(previousStudent?.status);
  const nextStage = normalizePipelineStatus(mergedStudent?.status);
  if (nextStage !== "Enrolled" || prevStage === "Enrolled") return null;
  const invoices = await readInvoices();
  const countryConfig = await readCountryDocConfig(mergedStudent?.country);
  const reasons = getEnrolledAdvanceBlockReasons(mergedStudent, invoices, countryConfig);
  if (!reasons.length) return null;
  return reasons.join(" ");
}

async function deliverConfiguredDocumentUploadWhatsapp({
  student,
  studentId,
  docType,
  docName,
  fileName,
  attachmentUrl,
  attachmentMime,
}) {
  const countryConfig = await readCountryDocConfig(student?.country);
  if (!isDocumentWhatsappNotifyEnabled(countryConfig, docType)) {
    return {
      attempted: false,
      status: "skipped",
      reason: "Document type is not configured for WhatsApp notification.",
    };
  }
  const counselorId = String(student?.inquiryCounselorId || student?.counselor || "").trim();
  if (!counselorId || counselorId === "Unassigned") {
    return { attempted: false, status: "skipped", reason: "Student has no assigned counselor." };
  }
  const message = buildDocumentUploadWhatsappMessage({
    studentName: String(student?.name || "").trim(),
    docName: String(docName || docType || "Document").trim(),
    docType: String(docType || "").trim(),
    fileName: String(fileName || "").trim(),
  });
  const attachment =
    attachmentUrl && attachmentMime && canSendWhatsappAttachmentMime(attachmentMime)
      ? { url: attachmentUrl, mime: attachmentMime, name: String(fileName || docName || docType || "document").trim() }
      : null;
  try {
    const result = await deliverCounselorMessageToStudentWhatsapp({
      senderId: counselorId,
      receiverId: studentId,
      content: message,
      attachment,
    });
    return {
      attempted: Boolean(result?.attempted),
      status: String(result?.status || "failed"),
      reason: String(result?.reason || ""),
    };
  } catch (error) {
    return {
      attempted: true,
      status: "failed",
      reason: String(error?.message || "Failed to send WhatsApp message."),
    };
  }
}

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/students") {
    try {
      const studemts = await readStudemts();
      const role = String(url.searchParams.get("role") || "").trim();
      const userId = String(url.searchParams.get("userId") || "").trim();
      const branch = String(url.searchParams.get("branch") || "").trim();
      const country = String(url.searchParams.get("country") || "").trim();

      let result = studemts;
      if (role) {
        const users = await readUsers();
        result = applyRoleScope(result, { role, userId, branch, country, users });
      }

      sendJson(res, 200, { ok: true, data: result.map((student) => publicStudentRecord(req, student)) });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load students." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/students/search") {
    try {
      const studemts = await readStudemts();
      const users = await readUsers();
      const role = String(url.searchParams.get("role") || "").trim();
      const userId = String(url.searchParams.get("userId") || "").trim();
      const branch = String(url.searchParams.get("branch") || "").trim();
      const userCountry = String(url.searchParams.get("userCountry") || "").trim();

      let result = studemts;
      if (role) {
        result = applyRoleScope(result, { role, userId, branch, country: userCountry, users });
      }

      const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
      const counselorParam = String(url.searchParams.get("counselor") || "").trim();
      const countryParam = String(url.searchParams.get("country") || "").trim();
      const statusParam = String(url.searchParams.get("status") || "").trim();

      if (counselorParam && counselorParam !== "All") {
        if (counselorParam === "Unassigned") {
          result = result.filter((s) => {
            const c = String(s.counselor ?? "").trim().toLowerCase();
            return c === "" || c === "unassigned" || c === "none" || c === "null";
          });
        } else {
          result = result.filter((s) => String(s.counselor || "") === counselorParam);
        }
      }

      if (countryParam && countryParam !== "All") {
        result = result.filter((s) => s.country === countryParam);
      }

      if (statusParam && statusParam !== "All") {
        result = result.filter((s) => normalizePipelineStatus(s.status) === normalizePipelineStatus(statusParam));
      }

      if (q) {
        result = result.filter((s) => {
          const name = String(s.name || "").toLowerCase();
          const id = String(s.id || "").toLowerCase();
          const ctry = String(s.country || "").toLowerCase();
          return name.includes(q) || id.includes(q) || ctry.includes(q);
        });
      }

      const sortBy = String(url.searchParams.get("sortBy") || "time").trim();
      const sortDir = String(url.searchParams.get("sortDirection") || "asc").trim();
      const dir = sortDir === "desc" ? -1 : 1;
      result = [...result].sort((a, b) => {
        if (sortBy === "name") {
          return dir * String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
        }
        if (sortBy === "time") {
          const ta = studentTimeMs(a);
          const tb = studentTimeMs(b);
          if (ta === null && tb === null) return 0;
          if (ta === null) return 1;
          if (tb === null) return -1;
          return dir * (ta - tb);
        }
        const sa = pipelineStageOrder(a.status);
        const sb = pipelineStageOrder(b.status);
        if (sa !== sb) return dir * (sa - sb);
        return dir * String(a.status || "").localeCompare(String(b.status || ""), undefined, { sensitivity: "base" });
      });

      const countryList = Array.from(new Set(result.map((s) => String(s.country || "").trim()).filter(Boolean)));

      sendJson(res, 200, {
        ok: true,
        data: result.map((student) => publicStudentRecord(req, student)),
        total: result.length,
        countries: countryList
      });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to search students." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/students/pipeline-counts") {
    try {
      const studemts = await readStudemts();
      const role = String(url.searchParams.get("role") || "").trim();
      const userId = String(url.searchParams.get("userId") || "").trim();
      const branch = String(url.searchParams.get("branch") || "").trim();
      const country = String(url.searchParams.get("country") || "").trim();

      let result = studemts;
      if (role) {
        const users = await readUsers();
        result = applyRoleScope(result, { role, userId, branch, country, users });
      }

      const byStage = {};
      for (const step of PIPELINE_STEPS) byStage[step] = 0;
      let other = 0;
      for (const student of result) {
        const stage = normalizePipelineStatus(student?.status);
        if (PIPELINE_STEPS.includes(stage)) {
          byStage[stage] += 1;
        } else {
          other += 1;
        }
      }
      sendJson(res, 200, { ok: true, data: { byStage, other, total: result.length } });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to compute pipeline counts." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/students") {
    try {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const country = String(body.country || "").trim();
      const branch = String(body.branch || "").trim();
      const email = normalizeEmail(body.email);
      const phoneInput = String(body.phone || "").trim();
      const phone = normalizeSriLankaStudentPhone(phoneInput);
      const password = String(body.password || "").trim();
      const ielts = String(body.ielts || "").trim() || "Pending";
      const gpa = String(body.gpa || "").trim();
      const status = String(body.status || "").trim() || "Inquiry";
      const budget = String(body.budget || "").trim();
      const priority = String(body.priority || "").trim() || "Medium";
      const counselor = String(body.counselor || "").trim() || "Unassigned";
      const counselorNameFromBody = String(body.counselorName || "").trim();
      const notes = String(body.notes || "").trim() || "Newly added via CRM.";
      const lastEducationDate =
        String(body.lastEducationDate || "").trim() || new Date().toISOString().split("T")[0];
      const documents = Array.isArray(body.documents) ? body.documents : [];
      const city = String(body.city || "").trim();
      const livingStatus = String(body.livingStatus || "").trim();
      const visaRejectionAnyCountry = String(body.visaRejectionAnyCountry || "").trim();
      const currentEducationLevel = String(body.currentEducationLevel || "").trim();
      const intendedProgram = String(body.intendedProgram || "").trim();
      const message = String(body.message || "").trim();

      if (!name || !country || !branch || !email || !phoneInput || !gpa || !password) {
        sendJson(res, 400, { ok: false, error: "Name, country, branch, email, phone, GPA and password are required." });
        return true;
      }
      if (!phone) {
        sendJson(res, 400, { ok: false, error: "Enter a valid Sri Lankan mobile number in +947XXXXXXXX format." });
        return true;
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        sendJson(res, 400, { ok: false, error: "Enter a valid email." });
        return true;
      }

      const studemts = await readStudemts();
      if (studemts.some((s) => normalizeEmail(s.email) === email)) {
        sendJson(res, 409, { ok: false, error: "Student email already exists." });
        return true;
      }
      const users = await readUsers();
      if (email === ADMIN_EMAIL || users.some((u) => normalizeEmail(u.email) === email)) {
        sendJson(res, 409, { ok: false, error: "Email is already used by an account." });
        return true;
      }

      let counselorName = "";
      if (counselor && counselor !== "Unassigned") {
        if (counselorNameFromBody) {
          counselorName = counselorNameFromBody;
        } else {
          const counselorUser = users.find((u) => String(u.id || "") === counselor);
          if (counselorUser) {
            counselorName = String(counselorUser.username || "").trim() || normalizeEmail(counselorUser.email);
          }
        }
      }

      const maxStudentNumber = studemts.reduce((max, student) => {
        const match = String(student.id || "").match(/^STU(\d+)$/);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 999);
      const nowIso = new Date().toISOString();
      const student = {
        id: `STU${maxStudentNumber + 1}`,
        name,
        country,
        branch,
        email,
        phone,
        password,
        forcePasswordChange: true,
        ielts,
        gpa,
        status,
        budget,
        priority,
        counselor,
        inquiryCounselorId: isApplicationStage(status) ? "" : counselor,
        counselorName,
        notes,
        lastEducationDate,
        documents,
        city: city || null,
        livingStatus: livingStatus || null,
        visaRejectionAnyCountry: visaRejectionAnyCountry || null,
        currentEducationLevel: currentEducationLevel || null,
        intendedProgram: intendedProgram || null,
        message: message || null,
        createdAt: nowIso,
        stageEnteredAt: nowIso
      };
      const updated = [...studemts, student];
      await writeStudemts(updated);
      sendJson(res, 201, { ok: true, data: publicStudentRecord(req, student) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/students/")) {
    try {
      const studentId = decodeURIComponent(url.pathname.replace("/api/students/", "").trim());
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return true;
      }
      const previous = studemts[idx];
      const nowIso = new Date().toISOString();
      const previousCounselor = String(previous?.counselor || "").trim();
      const merged = {
        ...studemts[idx],
        ...body,
        id: studemts[idx].id,
        updatedAt: nowIso,
      };
      if (Object.prototype.hasOwnProperty.call(body, "phone")) {
        const normalizedPhone = normalizeSriLankaStudentPhone(body.phone);
        if (!normalizedPhone) {
          sendJson(res, 400, { ok: false, error: "Enter a valid Sri Lankan mobile number in +947XXXXXXXX format." });
          return true;
        }
        merged.phone = normalizedPhone;
      }
      const nextCounselor = String(merged?.counselor || "").trim();
      const nextCounselorNorm = nextCounselor.toLowerCase();
      const prevCounselorNorm = previousCounselor.toLowerCase();
      if (previousCounselor && previousCounselor !== nextCounselor) {
        const history = Array.isArray(previous?.counselorHistory) ? previous.counselorHistory : [];
        const normalized = history.map((id) => String(id || "").trim()).filter(Boolean);
        if (
          nextCounselor &&
          nextCounselorNorm !== "unassigned" &&
          nextCounselorNorm !== "none" &&
          nextCounselorNorm !== "null"
        ) {
          normalized.push(previousCounselor);
          merged.counselorHistory = Array.from(new Set(normalized));
          logEvent("student", "counselor transferred", {
            studentId,
            from: previousCounselor,
            to: nextCounselor,
          });
        } else if (
          prevCounselorNorm &&
          prevCounselorNorm !== "unassigned" &&
          prevCounselorNorm !== "none" &&
          prevCounselorNorm !== "null"
        ) {
          logEvent("student", "counselor removed", {
            studentId,
            counselorId: previousCounselor,
          });
        }
      }
      const previousInquiryCounselor = String(previous?.inquiryCounselorId || "").trim();
      const nextInquiryCounselor = String(merged?.inquiryCounselorId || "").trim();
      if (
        previousInquiryCounselor &&
        previousInquiryCounselor !== nextInquiryCounselor &&
        !nextInquiryCounselor
      ) {
        logEvent("student", "inquiry counselor removed", {
          studentId,
          counselorId: previousInquiryCounselor,
        });
      }

      let counselorAssignmentWhatsapp = null;
      const isNewCounselorAssignment =
        nextCounselor &&
        nextCounselor.toLowerCase() !== "unassigned" &&
        (prevCounselorNorm !== nextCounselor.toLowerCase()) &&
        (!previousCounselor || prevCounselorNorm === "unassigned" || previousCounselor !== nextCounselor);
      if (isNewCounselorAssignment) {
        try {
          const users = await readUsers();
          const newCounselorUser = users.find((u) => String(u.id || "") === nextCounselor);
          if (newCounselorUser) {
            const studentName = String(merged.name || "").trim();
            const message = buildCounselorAssignmentWhatsappMessage({
              studentName: studentName || "Student",
              counselorName: String(newCounselorUser.username || "").trim(),
              counselorEmail: normalizeEmail(newCounselorUser.email),
              counselorPhone: String(newCounselorUser.phone || "").trim(),
              counselorBranch: String(newCounselorUser.branch || "").trim(),
            });
            const result = await deliverCounselorMessageToStudentWhatsapp({
              senderId: nextCounselor,
              receiverId: studentId,
              content: message,
            });
            counselorAssignmentWhatsapp = {
              attempted: Boolean(result?.attempted),
              status: String(result?.status || "skipped"),
              reason: String(result?.reason || ""),
            };
            logEvent("student", "counselor assignment WhatsApp sent", {
              studentId,
              counselorId: nextCounselor,
              status: result?.status || "unknown",
            });
          } else {
            counselorAssignmentWhatsapp = {
              attempted: false,
              status: "skipped",
              reason: "New counselor user account not found.",
            };
          }
        } catch (error) {
          counselorAssignmentWhatsapp = {
            attempted: true,
            status: "failed",
            reason: String(error?.message || "Failed to send counselor assignment WhatsApp."),
          };
        }
      }

      const transitionedToInquiry =
        !isApplicationStage(previous?.status) &&
        String(previous?.status || "").trim().toLowerCase() !== "inquiry" &&
        String(merged?.status || "").trim().toLowerCase() === "inquiry";
      if (transitionedToInquiry && !merged.inquiryCounselorId) {
        const c = String(merged.counselor || "").trim();
        if (c && c !== "Unassigned") {
          merged.inquiryCounselorId = c;
        }
      }

      const countryConfig = await readCountryDocConfig(merged.country);
      const configStages = countryConfig?.stages || [];
      const accountDetailsStageId = normalizeAccountDetailsStageId(
        countryConfig?.accountDetailsStageId,
        configStages
      );
      const previousStageId = resolveStudentStageId(previous?.status, configStages);
      const mergedStageId = resolveStudentStageId(merged?.status, configStages);
      const transitionedToAccountDetailsStage =
        mergedStageId === accountDetailsStageId && previousStageId !== accountDetailsStageId;

      const alreadySent = Boolean(
        previous?.accountDetailsSentAt ||
          merged?.accountDetailsSentAt ||
          previous?.applicationAccountDetailsSentAt ||
          merged?.applicationAccountDetailsSentAt
      );

      if (transitionedToAccountDetailsStage && !alreadySent) {
        const delivery = await sendStudentPortalAccountDetails({ req, student: merged, studentId });
        const emailAddress = normalizeEmail(merged.email);
        merged.accountDetailsSentAt = nowIso;
        merged.accountDetailsDelivery = delivery;
        if (accountDetailsStageId === "application") {
          merged.applicationAccountDetailsSentAt = nowIso;
          merged.applicationAccountDetailsDelivery = delivery;
        }
        const stageLabel =
          configStages.find((s) => s.id === accountDetailsStageId)?.label || accountDetailsStageId;
        logEvent("student", `moved to ${stageLabel}: sent account details`, {
          studentId,
          email: emailAddress,
          stageId: accountDetailsStageId,
          counselorId: String(merged.inquiryCounselorId || merged.counselor || ""),
          delivery,
        });
      }

      const documentWhatsappNotifications = [];
      if (Array.isArray(merged.documents)) {
        const transitions = collectDocumentVerificationTransitions(previous.documents, merged.documents);
        const studentName = String(merged.name || "").trim();
        const counselorId = String(merged.inquiryCounselorId || merged.counselor || "").trim();
        for (const t of transitions) {
          if (!counselorId || counselorId === "Unassigned") {
            documentWhatsappNotifications.push({
              docId: t.docId,
              decision: t.decision,
              whatsapp: { attempted: false, status: "skipped", reason: "Student has no assigned counselor." },
            });
            continue;
          }
          const message = buildDocumentDecisionWhatsappMessage({
            studentName,
            docName: t.docName,
            docType: t.docType,
            decision: t.decision,
            rejectionReason: t.rejectionReason,
          });
          try {
            const result = await deliverCounselorMessageToStudentWhatsapp({
              senderId: counselorId,
              receiverId: studentId,
              content: message,
            });
            documentWhatsappNotifications.push({
              docId: t.docId,
              decision: t.decision,
              whatsapp: {
                attempted: Boolean(result?.attempted),
                status: String(result?.status || "failed"),
                reason: String(result?.reason || ""),
              },
            });
          } catch (error) {
            documentWhatsappNotifications.push({
              docId: t.docId,
              decision: t.decision,
              whatsapp: {
                attempted: true,
                status: "failed",
                reason: String(error?.message || "Failed to send WhatsApp message."),
              },
            });
          }
        }
      }

      const enrolledTransitionError = await getBlockedEnrolledTransitionError(previous, merged);
      if (enrolledTransitionError) {
        sendJson(res, 400, { ok: false, error: enrolledTransitionError });
        return true;
      }

      const nextSla = reconcileSlaViolationsOnStudentRecord(merged);
      if (nextSla !== undefined) {
        merged.slaViolations = nextSla;
      }

      const prevDocs = Array.isArray(previous.documents) ? previous.documents : [];
      const nextDocs = Array.isArray(merged.documents) ? merged.documents : [];
      const nextDocIds = new Set(
        nextDocs.map((d) => (d && typeof d === "object" ? String(d.id || "").trim() : "")).filter(Boolean)
      );
      for (const d of prevDocs) {
        if (!d || typeof d !== "object") continue;
        const id = String(d.id || "").trim();
        if (!id || nextDocIds.has(id)) continue;
        const storedUrl = String(d.url || "").trim();
        if (storedUrl) {
          await safeUnlinkStoredPermissionDoc(storedUrl);
        }
      }

      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, {
        ok: true,
        data: publicStudentRecord(req, merged),
        documentWhatsappNotifications,
        counselorAssignmentWhatsapp,
      });
    } catch (error) {
      console.error("Student PUT failed:", error);
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Invalid request body.";
      sendJson(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/move-to-requests")) {
    try {
      const studentId = decodeURIComponent(
        url.pathname.replace("/api/students/", "").replace("/move-to-requests", "").trim()
      ).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const nearestOfficeRaw = String(body.nearestOffice || body.branch || "").trim();
      if (!nearestOfficeRaw) {
        sendJson(res, 400, { ok: false, error: "Branch (nearest office) is required." });
        return true;
      }

      const branchesList = await readBranches();
      const branchLocations = branchesList
        .map((b) => String(b?.location || "").trim())
        .filter(Boolean);
      const matchedOffice = branchLocations.find(
        (loc) => loc.toLowerCase() === nearestOfficeRaw.toLowerCase()
      );
      if (!matchedOffice) {
        sendJson(res, 400, { ok: false, error: "Please choose a valid nearest office from the list." });
        return true;
      }

      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return true;
      }
      const student = studemts[idx];

      const entry = {
        id: `REQ-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        submittedAt: new Date().toISOString(),
        name: String(student.name || "").trim(),
        email: normalizeEmail(student.email),
        phone: String(student.phone || "").trim(),
        countryToVisit: String(student.countryToVisit || student.country || "").trim(),
        city: String(student.city || "").trim() || null,
        nearestOffice: matchedOffice,
        currentEducationLevel: String(student.currentEducationLevel || "").trim(),
        intendedProgram: String(student.intendedProgram || "").trim(),
        message: String(student.message || "").trim() || null,
        source: "counselor-reassignment",
      };

      if (!entry.name || !entry.email || !entry.phone || !entry.countryToVisit) {
        sendJson(res, 400, {
          ok: false,
          error: "Student is missing required interest-form fields (name, email, phone, country).",
        });
        return true;
      }
      if (!entry.currentEducationLevel || !entry.intendedProgram) {
        sendJson(res, 400, {
          ok: false,
          error: "Student is missing education level or intended program.",
        });
        return true;
      }

      await appendReqStudent(entry);
      const updated = [...studemts];
      updated.splice(idx, 1);
      await writeStudemts(updated);
      sendJson(res, 200, { ok: true, data: { requestId: entry.id, studentId, nearestOffice: matchedOffice } });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/avatar")) {
    try {
      const studentId = decodeURIComponent(url.pathname.replace("/api/students/", "").replace("/avatar", "").trim()).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const avatar = String(body.avatar || "");
      if (!avatar.startsWith("data:image/")) {
        sendJson(res, 400, { ok: false, error: "Invalid image payload." });
        return true;
      }
      if (avatar.length > 4_000_000) {
        sendJson(res, 400, { ok: false, error: "Image is too large." });
        return true;
      }
      const storedAvatarPath = await storeImageDataUrl(avatar, "student-avatar");
      if (!storedAvatarPath) {
        sendJson(res, 400, { ok: false, error: "Unsupported image format." });
        return true;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return true;
      }
      const merged = {
        ...studemts[idx],
        avatar: storedAvatarPath,
        updatedAt: new Date().toISOString(),
      };
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, { ok: true, data: publicStudentRecord(req, merged) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/cv")) {
    try {
      const studentId = decodeURIComponent(url.pathname.replace("/api/students/", "").replace("/cv", "").trim()).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const dataUrl = String(body.dataUrl || "");
      const fileName = String(body.fileName || "cv");
      if (!dataUrl.startsWith("data:")) {
        sendJson(res, 400, { ok: false, error: "Invalid CV payload." });
        return true;
      }
      const stored = await storeStudentCvDataUrl(dataUrl, fileName);
      if (!stored) {
        sendJson(res, 400, { ok: false, error: "Unsupported CV format. Use PDF, DOC, or DOCX." });
        return true;
      }
      if (stored.error) {
        sendJson(res, 400, { ok: false, error: stored.error });
        return true;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return true;
      }
      const merged = {
        ...studemts[idx],
        cvFile: {
          name: stored.name,
          mime: stored.mime,
          size: stored.size,
          url: stored.url,
          uploadedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, { ok: true, data: publicStudentRecord(req, merged) });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/documents")) {
    try {
      const studentId = decodeURIComponent(url.pathname.replace("/api/students/", "").replace("/documents", "").trim()).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const dataUrl = String(body.dataUrl || "");
      const fileName = String(body.fileName || "document");
      let docType = String(body.docType || "").trim();
      const tier = String(body.tier || "Global").trim() || "Global";
      const phaseNumber = Number(body.phase);
      const phase = Number.isFinite(phaseNumber) ? Math.max(1, Math.floor(phaseNumber)) : 1;
      const rawLink = body.taskDocumentLink && typeof body.taskDocumentLink === "object" ? body.taskDocumentLink : null;
      const taskDocumentLink = rawLink
        ? {
            taskId: String(rawLink.taskId || "").trim(),
            slotId: String(rawLink.slotId || "").trim(),
            label: String(rawLink.label || "")
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, 220),
          }
        : null;
      if (taskDocumentLink && (!taskDocumentLink.taskId || !taskDocumentLink.slotId)) {
        sendJson(res, 400, { ok: false, error: "taskDocumentLink.taskId and taskDocumentLink.slotId are required." });
        return true;
      }
      if (taskDocumentLink) {
        docType = `taskDoc__${taskDocumentLink.taskId}__${taskDocumentLink.slotId}`;
      }
      if (!docType) {
        sendJson(res, 400, { ok: false, error: "Document type is required." });
        return true;
      }
      if (!dataUrl.startsWith("data:")) {
        sendJson(res, 400, { ok: false, error: "Invalid document payload." });
        return true;
      }
      const stored = await storeStudentPermissionDataUrl(dataUrl, fileName);
      if (!stored) {
        sendJson(res, 400, { ok: false, error: "Unsupported document format. Use PDF, JPG, PNG, DOC, or DOCX." });
        return true;
      }
      if (stored.error) {
        sendJson(res, 400, { ok: false, error: stored.error });
        return true;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return true;
      }
      const newDocument = {
        id: `doc-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
        name: stored.name,
        type: docType,
        status: "Pending",
        uploadedAt: new Date().toISOString(),
        phase,
        tier,
        mime: stored.mime,
        size: stored.size,
        url: stored.url,
        ...(taskDocumentLink ? { taskDocumentLink } : {}),
      };
      let existingDocuments = Array.isArray(studemts[idx].documents) ? [...studemts[idx].documents] : [];
      if (taskDocumentLink) {
        existingDocuments = existingDocuments.filter((d) => {
          if (!d || typeof d !== "object") return true;
          const link = d.taskDocumentLink;
          if (!link || typeof link !== "object") return true;
          return !(String(link.taskId || "") === taskDocumentLink.taskId && String(link.slotId || "") === taskDocumentLink.slotId);
        });
      }
      const merged = {
        ...studemts[idx],
        documents: [...existingDocuments, newDocument],
        updatedAt: new Date().toISOString(),
      };
      const nextSla = reconcileSlaViolationsOnStudentRecord(merged);
      if (nextSla !== undefined) {
        merged.slaViolations = nextSla;
      }
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      const documentUploadWhatsapp = await deliverConfiguredDocumentUploadWhatsapp({
        student: merged,
        studentId,
        docType,
        docName: newDocument.name,
        fileName: newDocument.name,
        attachmentUrl: newDocument.url,
        attachmentMime: newDocument.mime,
      });
      sendJson(res, 200, {
        ok: true,
        data: publicStudentRecord(req, merged),
        document: { ...newDocument, url: publicStudentDocUrl(req, newDocument.url) },
        documentUploadWhatsapp,
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/profile-other-documents")) {
    try {
      const studentId = decodeURIComponent(
        url.pathname.replace("/api/students/", "").replace("/profile-other-documents", "").trim()
      ).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const dataUrl = String(body.dataUrl || "");
      const fileName = String(body.fileName || "document");
      const append = Boolean(body.append);
      const slotNumRaw = Number(body.slot);
      let label = String(body.label || "").trim().replace(/\s+/g, " ");
      if (!label) label = "Other document";
      if (label.length > 120) label = label.slice(0, 120);
      if (!dataUrl.startsWith("data:")) {
        sendJson(res, 400, { ok: false, error: "Invalid document payload." });
        return true;
      }
      const stored = await storeStudentPermissionDataUrl(dataUrl, fileName);
      if (!stored) {
        sendJson(res, 400, { ok: false, error: "Unsupported document format. Use PDF, JPG, PNG, DOC, or DOCX." });
        return true;
      }
      if (stored.error) {
        sendJson(res, 400, { ok: false, error: stored.error });
        return true;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return true;
      }
      const entries = migrateProfileOtherDocumentsToSlotEntries(studemts[idx].profileOtherDocuments);
      let targetSlot;
      if (append) {
        targetSlot = entries.length === 0 ? 1 : Math.max(...entries.map((e) => Number(e.slot) || 0)) + 1;
      } else {
        if (!Number.isFinite(slotNumRaw) || slotNumRaw < 1 || Math.floor(slotNumRaw) !== slotNumRaw) {
          sendJson(res, 400, { ok: false, error: "Slot must be a positive integer, or use append to add a new document." });
          return true;
        }
        targetSlot = Math.floor(slotNumRaw);
      }
      if (targetSlot > PROFILE_OTHER_DOCUMENTS_MAX_SLOT) {
        sendJson(res, 400, {
          ok: false,
          error: `You can store at most ${PROFILE_OTHER_DOCUMENTS_MAX_SLOT} other documents.`,
        });
        return true;
      }
      const previous = entries.find((e) => Number(e.slot) === targetSlot);
      if (previous && previous.url) {
        await safeUnlinkStoredPermissionDoc(String(previous.url));
      }
      const newEntry = {
        id: `pod-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        slot: targetSlot,
        label,
        name: stored.name,
        mime: stored.mime,
        size: stored.size,
        url: stored.url,
        uploadedAt: new Date().toISOString(),
      };
      const nextEntries = [...entries.filter((e) => Number(e.slot) !== targetSlot), newEntry].sort(
        (a, b) => Number(a.slot) - Number(b.slot)
      );
      const merged = {
        ...studemts[idx],
        profileOtherDocuments: nextEntries,
        updatedAt: new Date().toISOString(),
      };
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, {
        ok: true,
        data: publicStudentRecord(req, merged),
        profileOtherDocument: {
          ...newEntry,
          url: publicStudentDocUrl(req, newEntry.url),
        },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/students/") && url.pathname.endsWith("/university-offer-letters")) {
    try {
      const studentId = decodeURIComponent(
        url.pathname.replace("/api/students/", "").replace("/university-offer-letters", "").trim()
      ).replace(/\/+$/, "");
      if (!studentId) {
        sendJson(res, 400, { ok: false, error: "Student ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const offerStatus = normalizeUniversityOfferStatusInput(body.offerStatus);
      if (!UNIVERSITY_OFFER_STATUSES.has(offerStatus)) {
        sendJson(res, 400, { ok: false, error: "Offer status must be Unconditional, Conditional, or Rejected." });
        return true;
      }
      const rawFiles = Array.isArray(body.files) ? body.files : [];
      const singleDataUrl = String(body.dataUrl || body.dataURL || "");
      const singleFileName = String(body.fileName || "offer-letter");
      const fileInputs =
        rawFiles.length > 0
          ? rawFiles
              .map((f) => ({
                dataUrl: typeof f === "string" ? String(f) : String(f?.dataUrl || f?.dataURL || ""),
                fileName: typeof f === "string" ? "offer-letter" : String(f?.fileName || "offer-letter"),
              }))
              .filter((f) => f.dataUrl.startsWith("data:"))
          : singleDataUrl.startsWith("data:")
            ? [{ dataUrl: singleDataUrl, fileName: singleFileName }]
            : [];
      if (fileInputs.length === 0) {
        sendJson(res, 400, { ok: false, error: "At least one offer letter file is required." });
        return true;
      }
      const studemts = await readStudemts();
      const idx = studemts.findIndex((s) => String(s.id || "") === studentId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: "Student not found." });
        return true;
      }
      const newEntries = [];
      for (const fileInput of fileInputs) {
        const stored = await storeStudentPermissionDataUrl(fileInput.dataUrl, fileInput.fileName);
        if (!stored) {
          sendJson(res, 400, { ok: false, error: "Unsupported document format. Use PDF, JPG, PNG, DOC, or DOCX." });
          return true;
        }
        if (stored.error) {
          sendJson(res, 400, { ok: false, error: stored.error });
          return true;
        }
        newEntries.push({
          id: `uol-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          name: stored.name,
          offerStatus,
          mime: stored.mime,
          size: stored.size,
          url: stored.url,
          uploadedAt: new Date().toISOString(),
        });
      }
      const existing = normalizeUniversityOfferLetters(studemts[idx].universityOfferLetters);
      const merged = {
        ...studemts[idx],
        universityOfferLetters: [...existing, ...newEntries],
        updatedAt: new Date().toISOString(),
      };
      const offerLetterWhatsappNotifications = [];
      const studentName = String(merged.name || "").trim();
      const counselorId = String(merged.inquiryCounselorId || merged.counselor || "").trim();
      const letterCount = newEntries.length;
      const countryConfig = await readCountryDocConfig(merged.country);
      const notifyOfferLetters = isDocumentWhatsappNotifyEnabled(countryConfig, "Offer Letter");
      for (const entry of newEntries) {
        if (!notifyOfferLetters) {
          offerLetterWhatsappNotifications.push({
            letterId: entry.id,
            offerStatus: entry.offerStatus,
            whatsapp: {
              attempted: false,
              status: "skipped",
              reason: "Offer Letter is not configured for WhatsApp notification in Doc Mapping.",
            },
          });
          continue;
        }
        if (!counselorId || counselorId === "Unassigned") {
          offerLetterWhatsappNotifications.push({
            letterId: entry.id,
            offerStatus: entry.offerStatus,
            whatsapp: { attempted: false, status: "skipped", reason: "Student has no assigned counselor." },
          });
          continue;
        }
        const message = buildUniversityOfferWhatsappMessage({
          studentName,
          fileName: entry.name,
          offerStatus: entry.offerStatus,
          letterCount,
        });
        const attachment =
          entry.url && entry.mime && canSendWhatsappAttachmentMime(entry.mime)
            ? { url: entry.url, mime: entry.mime, name: entry.name }
            : null;
        try {
          const result = await deliverCounselorMessageToStudentWhatsapp({
            senderId: counselorId,
            receiverId: studentId,
            content: message,
            attachment,
          });
          offerLetterWhatsappNotifications.push({
            letterId: entry.id,
            offerStatus: entry.offerStatus,
            whatsapp: {
              attempted: Boolean(result?.attempted),
              status: String(result?.status || "failed"),
              reason: String(result?.reason || ""),
            },
          });
        } catch (error) {
          offerLetterWhatsappNotifications.push({
            letterId: entry.id,
            offerStatus: entry.offerStatus,
            whatsapp: {
              attempted: true,
              status: "failed",
              reason: String(error?.message || "Failed to send WhatsApp message."),
            },
          });
        }
      }
      const updated = [...studemts];
      updated[idx] = merged;
      await writeStudemts(updated);
      sendJson(res, 200, {
        ok: true,
        data: publicStudentRecord(req, merged),
        universityOfferLetters: newEntries.map((entry) => ({
          ...entry,
          url: publicStudentDocUrl(req, entry.url),
        })),
        offerLetterWhatsappNotifications,
      });
    } catch (error) {
      const errorMessage = String(error?.message || "").trim();
      if (errorMessage === "Request body too large") {
        sendJson(res, 413, { ok: false, error: "Request body too large. Upload a smaller file." });
        return true;
      }
      sendJson(res, 400, { ok: false, error: errorMessage || "Invalid request body." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
