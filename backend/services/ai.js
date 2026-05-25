const {
  OPENAI_API_KEY,
  OPENAI_MODEL,
  OPENAI_API_URL,
  OPENAI_MAX_HISTORY_MESSAGES,
  OPENAI_REQUEST_TIMEOUT_MS,
} = require("../config");
const { logEvent } = require("../lib/logger");

async function callOpenAiChatCompletion({ messages, temperature = 0.2, maxTokens = 280 }) {
  if (!OPENAI_API_KEY) {
    return { ok: false, status: 500, error: "OpenAI API key is not configured. Add OPENAI_API_KEY to backend/.env." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logEvent("openai", `Request failed (${response.status})`, { detail: errText.slice(0, 400) });
      return {
        ok: false,
        status: 502,
        error: response.status === 401
          ? "OpenAI rejected the API key. Check OPENAI_API_KEY in backend/.env."
          : "OpenAI request failed.",
      };
    }
    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!reply) {
      return { ok: false, status: 502, error: "Empty response from OpenAI." };
    }
    return { ok: true, reply, model: data.model || OPENAI_MODEL, usage: data.usage || null };
  } catch (error) {
    if (error && error.name === "AbortError") {
      return { ok: false, status: 504, error: "OpenAI request timed out." };
    }
    logEvent("openai", "Unexpected error calling OpenAI", { message: String(error?.message || error) });
    return { ok: false, status: 502, error: "Could not reach OpenAI." };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeAiHistory(history) {
  if (!Array.isArray(history)) return [];
  const cleaned = [];
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const role = item.role === "user" || item.role === "assistant" ? item.role : null;
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!role || !content) continue;
    cleaned.push({ role, content: content.slice(0, 4000) });
  }
  return cleaned.slice(-OPENAI_MAX_HISTORY_MESSAGES);
}

module.exports = {
  callOpenAiChatCompletion,
  normalizeAiHistory,
};
