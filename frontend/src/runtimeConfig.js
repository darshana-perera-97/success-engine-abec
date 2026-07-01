/**
 * Client polling intervals — slower in production builds to reduce load on EC2;
 * faster in development for quicker feedback during local work.
 *
 * Override with REACT_APP_* env vars in .env.development / .env.production.
 */

const isDev = process.env.NODE_ENV === "development";

function envMs(name, devDefault, prodDefault) {
  const raw = parseInt(process.env[name] || "", 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return isDev ? devDefault : prodDefault;
}

export const POLL_MS = {
  students: envMs("REACT_APP_POLL_STUDENTS_MS", 10_000, 30_000),
  tasks: envMs("REACT_APP_POLL_TASKS_MS", 10_000, 30_000),
  invoices: envMs("REACT_APP_POLL_INVOICES_MS", 10_000, 30_000),
  chats: envMs("REACT_APP_POLL_CHATS_MS", 5_000, 15_000),
  whatsapp: envMs("REACT_APP_POLL_WHATSAPP_MS", 8_000, 15_000),
  requestedStudents: envMs("REACT_APP_POLL_REQUESTED_STUDENTS_MS", 10_000, 30_000),
  appointments: envMs("REACT_APP_POLL_APPOINTMENTS_MS", 15_000, 30_000),
  branchAnalytics: envMs("REACT_APP_POLL_BRANCH_ANALYTICS_MS", 30_000, 60_000),
};

export const SLA_CLOCK_INTERVAL_MS = envMs("REACT_APP_SLA_CLOCK_MS", 10_000, 30_000);

export const IS_DEV = isDev;
