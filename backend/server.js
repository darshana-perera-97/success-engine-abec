require("dotenv").config();

const http = require("http");
const crypto = require("crypto");
const { PORT, HOST, WHATSAPP_LAZY_START, WARM_JSON_CACHE_ON_START, WHATSAPP_RECONNECT_INTERVAL_MS, MEETING_REMINDER_POLL_MS, IS_PRODUCTION } = require("./config");
const { corsHeaders, sendJson } = require("./lib/httpUtils");
const { logEvent } = require("./lib/logger");
const { initializeWhatsappSessionsOnStartup, reconnectActiveWhatsappSessions } = require("./services/whatsapp");
const { processMeetingReminders, processInquiryScheduledCallReminders } = require("./services/notifications");

const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/accounts");
const studentRoutes = require("./routes/students");
const branchRoutes = require("./routes/branches");
const invoiceRoutes = require("./routes/invoices");
const taskRoutes = require("./routes/tasks");
const chatRoutes = require("./routes/chats");
const activityRoutes = require("./routes/activities");
const appointmentRoutes = require("./routes/appointments");
const whatsappRoutes = require("./routes/whatsapp");
const universityRoutes = require("./routes/university");
const aiRoutes = require("./routes/ai");
const docMappingRoutes = require("./routes/docMapping");
const webFormsRoutes = require("./routes/webForms");
const countryChangeRequestRoutes = require("./routes/countryChangeRequests");
const studentDetailChangeRequestRoutes = require("./routes/studentDetailChangeRequests");
const studentRemovalRequestRoutes = require("./routes/studentRemovalRequests");
const intakeChangeRequestRoutes = require("./routes/intakeChangeRequests");
const refundRequestRoutes = require("./routes/refundRequests");
const frontendRoutes = require("./routes/frontend");

const fs = require("fs/promises");
const { DATA_DIR, INVOICES_FILE, STUDEMTS_FILE, TASKS_FILE, BRANCHES_FILE } = require("./config");
const { readInvoices } = require("./models/invoices");
const { readStudemts } = require("./models/students");
const { readUsers } = require("./models/users");
const { readTasks } = require("./models/tasks");

const server = http.createServer(async (req, res) => {
  res.req = req;
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    if (url.pathname.startsWith("/api/tasks") && req.method !== "GET") {
      logEvent("task", `${req.method} ${url.pathname}`, {
        id: requestId,
        status: res.statusCode,
        durationMs,
      });
    }
  });

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, status: "healthy", env: IS_PRODUCTION ? "production" : "development" });
    return;
  }

  if (await frontendRoutes.handleApi(req, res, url)) return;
  if (await authRoutes.handle(req, res, url)) return;
  if (await whatsappRoutes.handle(req, res, url)) return;
  if (await accountRoutes.handle(req, res, url)) return;
  if (await universityRoutes.handle(req, res, url)) return;
  if (await appointmentRoutes.handle(req, res, url)) return;
  if (await invoiceRoutes.handle(req, res, url)) return;
  if (await taskRoutes.handle(req, res, url)) return;
  if (await studentRoutes.handle(req, res, url)) return;
  if (await chatRoutes.handle(req, res, url)) return;
  if (await activityRoutes.handle(req, res, url)) return;
  if (await branchRoutes.handle(req, res, url)) return;
  if (await docMappingRoutes.handle(req, res, url)) return;
  if (await webFormsRoutes.handle(req, res, url)) return;
  if (await countryChangeRequestRoutes.handle(req, res, url)) return;
  if (await studentDetailChangeRequestRoutes.handle(req, res, url)) return;
  if (await studentRemovalRequestRoutes.handle(req, res, url)) return;
  if (await intakeChangeRequestRoutes.handle(req, res, url)) return;
  if (await refundRequestRoutes.handle(req, res, url)) return;
  if (await aiRoutes.handle(req, res, url)) return;
  if (await frontendRoutes.handle(req, res, url)) return;

  sendJson(res, 404, { ok: false, error: "Not found." });
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the existing process or change PORT in backend/.env.`);
    return;
  }
  console.error("Server failed to start:", error);
});

async function logDataStoreStatus() {
  const stores = [
    ["invoices.json", INVOICES_FILE],
    ["studemts.json", STUDEMTS_FILE],
    ["tasks.json", TASKS_FILE],
    ["branches.json", BRANCHES_FILE],
  ];
  const missing = [];
  for (const [label, filePath] of stores) {
    try {
      await fs.access(filePath);
    } catch {
      missing.push(label);
    }
  }
  console.log(`Data directory (live server store): ${DATA_DIR}`);
  if (missing.length) {
    console.warn(
      `Missing data files (API endpoints will return empty arrays until created on the server): ${missing.join(", ")}`
    );
  }
  try {
    const invoiceCount = (await readInvoices()).length;
    console.log(`invoices.json: ${invoiceCount} record(s) at ${INVOICES_FILE}`);
  } catch (error) {
    console.warn(`invoices.json: failed to read ${INVOICES_FILE}`, error);
  }
}

async function warmJsonCache() {
  const t0 = Date.now();
  await Promise.all([readStudemts(), readUsers(), readTasks(), readInvoices()]);
  console.log(`JSON cache warmed in ${Date.now() - t0}ms`);
}

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(PORT, HOST, async () => {
  const mode = IS_PRODUCTION ? "production" : "development";
  console.log(`Backend listening at http://${HOST}:${PORT} (${mode})`);
  await logDataStoreStatus();
  if (WARM_JSON_CACHE_ON_START) {
    await warmJsonCache().catch((error) => {
      console.warn("JSON cache warm-up failed:", error.message);
    });
  }
  if (WHATSAPP_LAZY_START) {
    console.log("WhatsApp: lazy start enabled — sessions start when a user connects (saves RAM at boot).");
  } else {
    await initializeWhatsappSessionsOnStartup();
  }
  setInterval(() => {
    reconnectActiveWhatsappSessions().catch((error) => {
      console.error("Periodic WhatsApp reconnect failed:", error);
    });
  }, WHATSAPP_RECONNECT_INTERVAL_MS);
  setInterval(() => {
    processMeetingReminders().catch((error) => {
      console.error("Meeting reminder processing failed:", error);
    });
    processInquiryScheduledCallReminders().catch((error) => {
      console.error("Inquiry call reminder processing failed:", error);
    });
  }, MEETING_REMINDER_POLL_MS);
});

function shutdown(signal) {
  console.log(`${signal} received — shutting down gracefully`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
