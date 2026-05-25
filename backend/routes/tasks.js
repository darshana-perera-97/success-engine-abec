const crypto = require("crypto");
const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const { readTasks, writeTasks, withTasksMutationLock } = require("../models/tasks");
const { readStudemts } = require("../models/students");
const { resolveCounselor } = require("../services/roles");
const { deliverCounselorMessageToStudentWhatsapp } = require("../services/whatsapp");

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/tasks") {
    try {
      const tasks = await readTasks();
      sendJson(res, 200, { ok: true, data: tasks });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load tasks." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    try {
      const body = await parseBody(req);
      const taskName = String(body.task || "").trim();
      const studentId = String(body.student_id || "").trim();
      const assignedTo = Array.isArray(body.assigned_to) ? body.assigned_to.map((id) => String(id || "").trim()).filter(Boolean) : [];
      const counselorIds = Array.isArray(body.counselor_ids)
        ? body.counselor_ids.map((id) => String(id || "").trim()).filter(Boolean)
        : [];
      const priority = String(body.priority || "Medium").trim() || "Medium";
      const status = String(body.status || "Pending").trim() || "Pending";
      const dueDate = String(body.dueDate || "").trim();
      let isPrivate = body.isPrivate === true;
      const requiresStudentDocuments = body.requiresStudentDocuments === true;
      const rawDocRequests = Array.isArray(body.taskDocumentRequests) ? body.taskDocumentRequests : [];
      const taskDocumentRequests = [];
      const seenSlotIds = new Set();
      for (const item of rawDocRequests) {
        if (!item || typeof item !== "object") continue;
        const label = String(item.label || "")
          .trim()
          .replace(/\s+/g, " ");
        if (!label) continue;
        let sid = String(item.id || "").trim();
        if (!sid || seenSlotIds.has(sid)) {
          sid = `slot-${crypto.randomUUID().slice(0, 10)}`;
        }
        seenSlotIds.add(sid);
        taskDocumentRequests.push({
          id: sid.slice(0, 80),
          label: label.slice(0, 220),
        });
        if (taskDocumentRequests.length >= 30) break;
      }
      if (requiresStudentDocuments) {
        if (taskDocumentRequests.length === 0) {
          sendJson(res, 400, { ok: false, error: "Add at least one required document when student uploads are enabled." });
          return true;
        }
        isPrivate = false;
      }
      if (!taskName || !studentId || !dueDate) {
        sendJson(res, 400, { ok: false, error: "task, student_id and dueDate are required." });
        return true;
      }
      if (!isPrivate && assignedTo.length === 0) {
        sendJson(res, 400, { ok: false, error: "assigned_to is required for non-private tasks." });
        return true;
      }
      const nowIso = new Date().toISOString();
      const task = {
        id: String(body.id || `T-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`),
        task: taskName,
        student_id: studentId,
        assigned_to: assignedTo,
        counselor_ids: Array.from(new Set(counselorIds)),
        priority,
        status,
        dueDate,
        isPrivate,
        tier: String(body.tier || "Global"),
        phase: Number.isFinite(Number(body.phase)) ? Number(body.phase) : 1,
        isBlocking: body.isBlocking === true,
        documentType: body.documentType ? String(body.documentType) : undefined,
        requiresStudentDocuments,
        taskDocumentRequests: requiresStudentDocuments ? taskDocumentRequests : [],
        createdBy: body.createdBy ? String(body.createdBy) : "",
        createdAt: String(body.createdAt || nowIso),
        updatedAt: nowIso
      };
      await withTasksMutationLock(async () => {
        const tasks = await readTasks();
        await writeTasks([task, ...tasks]);
      });
      logEvent("task", "created", { taskId: task.id, studentId: task.student_id, assignedToCount: task.assigned_to.length });
      let taskAssignmentWhatsapp = { attempted: false, status: "skipped", reason: "Not attempted." };
      const sidLower = studentId.toLowerCase();
      const studentIsAssignee = assignedTo.some((a) => String(a || "").trim().toLowerCase() === sidLower);
      if (studentIsAssignee && !isPrivate) {
        const studemts = await readStudemts();
        const stu = studemts.find((s) => String(s.id || "") === studentId);
        const studentName = String(stu?.name || "there").trim() || "there";
        const createdById = String(body.createdBy || "").trim();
        let senderId = "";
        const creatorCounselor = await resolveCounselor(createdById);
        if (creatorCounselor) {
          senderId = String(creatorCounselor.id || "").trim();
        }
        if (!senderId && stu) {
          senderId = String(stu.counselor || "").trim();
        }
        const docLines =
          requiresStudentDocuments && taskDocumentRequests.length > 0
            ? [
                "",
                "Please upload these items in your portal (Pipeline or My Action Plan):",
                ...taskDocumentRequests.map((r, i) => `${i + 1}. ${r.label}`),
              ]
            : [];
        const message = [
          `Hi ${studentName},`,
          "",
          `You have a new task on your student portal: "${taskName}".`,
          dueDate ? `Due: ${dueDate}.` : null,
          ...docLines,
          "",
          "Sign in to the portal to view details and upload any requested files.",
        ]
          .filter((line) => line != null)
          .join("\n");
        if (senderId) {
          try {
            const result = await deliverCounselorMessageToStudentWhatsapp({
              senderId,
              receiverId: studentId,
              content: message,
            });
            taskAssignmentWhatsapp = {
              attempted: Boolean(result?.attempted),
              status: String(result?.status || "skipped"),
              reason: String(result?.reason || ""),
            };
          } catch (error) {
            taskAssignmentWhatsapp = {
              attempted: true,
              status: "failed",
              reason: String(error?.message || "WhatsApp send failed."),
            };
          }
        } else {
          taskAssignmentWhatsapp = {
            attempted: false,
            status: "skipped",
            reason: "No counselor sender available for WhatsApp.",
          };
        }
      }
      sendJson(res, 201, { ok: true, data: task, taskAssignmentWhatsapp });
    } catch (error) {
      console.error("Task create failed:", error);
      sendJson(res, 400, { ok: false, error: String(error?.message || "Failed to create task.") });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/tasks/")) {
    try {
      const taskId = decodeURIComponent(url.pathname.replace("/api/tasks/", "").trim()).replace(/\/+$/, "");
      if (!taskId) {
        sendJson(res, 400, { ok: false, error: "Task ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const merged = await withTasksMutationLock(async () => {
        const tasks = await readTasks();
        const idx = tasks.findIndex((item) => String(item.id || "") === taskId);
        if (idx === -1) {
          return null;
        }
        const next = {
          ...tasks[idx],
          ...body,
          id: tasks[idx].id,
          updatedAt: new Date().toISOString()
        };
        const updatedTasks = [...tasks];
        updatedTasks[idx] = next;
        await writeTasks(updatedTasks);
        return next;
      });
      if (!merged) {
        sendJson(res, 404, { ok: false, error: "Task not found." });
        return true;
      }
      logEvent("task", "updated", { taskId: merged.id, studentId: merged.student_id, status: merged.status });
      sendJson(res, 200, { ok: true, data: merged });
    } catch (error) {
      console.error("Task update failed:", error);
      sendJson(res, 400, { ok: false, error: String(error?.message || "Failed to update task.") });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
