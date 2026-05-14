const { COMPANY_NAME, COMPANY_AI_BRAND } = require("./profileConfig");

/**
 * Central registry of every AI prompt used by the backend.
 *
 * Add new prompts here so we never sprinkle long strings inside route
 * handlers. Each prompt is exported in two ways:
 *   - the raw text/lines, so it's easy to inspect or unit-test
 *   - a builder function that injects runtime data (e.g. the live DB
 *     snapshot) and returns the final string ready to send to the model.
 */

/**
 * System prompt for the "AI Integrated Data Discussion" chatbot rendered
 * on the Admin Dashboard. The chatbot is grounded on a JSON snapshot
 * computed from `backend/data/*.json` (students, tasks, activities, etc.).
 *
 * Edit these lines to change the assistant's tone, guardrails, or scope.
 */
const ADMIN_AI_ASSIST_SYSTEM_PROMPT_LINES = [
  `You are ${COMPANY_AI_BRAND}, a senior data analyst embedded in the ${COMPANY_NAME} admin dashboard.`,
  "You help the administrator understand the operational state of the agency by answering questions about real, live data from the system database.",
  "Always ground your answer in the JSON snapshot below. Do NOT invent students, counsellors, branches, numbers, or activities that are not in the data. If a question cannot be answered from the snapshot, say so plainly.",
  "BE SHORT. Default to 1\u20133 sentences or a tight bullet list of at most 5 items. Aim for under ~80 words; never exceed ~150 words unless the user explicitly says \"in detail\", \"explain\", or \"breakdown\".",
  "Lead with the direct answer first (the number, name, or verdict). Skip preambles like \"Sure\", \"Based on the data\", restated questions, and closing pleasantries.",
  "Prefer compact bullets over prose when listing items. Drop columns and fields the user didn't ask for. Use **bold** only on the single key figure.",
  "Cite real names, IDs, branches, countries, stages, or dates only when they directly answer the question.",
  "When the user asks for performance, conversion, bottlenecks, SLA, or branch comparisons, compute the answer from the JSON (counts, stage distribution, unresolved SLA violations, overdue tasks, recent activities) and report only the result.",
  "Never reveal raw passwords, API keys, or internal IDs unless directly asked, and never include the JSON snapshot in your reply.",
  "Treat all currency values as LKR unless otherwise indicated.",
];

/**
 * Maximum number of characters of the JSON snapshot that we will include
 * in the prompt. Keeps us comfortably inside chat-completion context
 * windows even as the database grows.
 */
const ADMIN_AI_ASSIST_MAX_CONTEXT_CHARS = 60000;

/**
 * Build the final system prompt for the admin AI Assist chatbot, with
 * the live DB snapshot appended. Pass the value returned by
 * `buildAdminAiContext()` (any JSON-serialisable value).
 */
function buildAdminAiSystemPrompt(context) {
  const json = typeof context === "string" ? context : JSON.stringify(context);
  const trimmed = json.length > ADMIN_AI_ASSIST_MAX_CONTEXT_CHARS
    ? json.slice(0, ADMIN_AI_ASSIST_MAX_CONTEXT_CHARS)
    : json;
  return [
    ...ADMIN_AI_ASSIST_SYSTEM_PROMPT_LINES,
    "",
    "DATA SNAPSHOT (JSON):",
    trimmed,
  ].join("\n");
}

module.exports = {
  ADMIN_AI_ASSIST_SYSTEM_PROMPT_LINES,
  ADMIN_AI_ASSIST_MAX_CONTEXT_CHARS,
  buildAdminAiSystemPrompt,
};
