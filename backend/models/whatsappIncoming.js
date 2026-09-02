const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { WHATSAPP_INCOMING_FILE } = require("../config");

async function readWhatsappIncoming() {
  try {
    const raw = await fs.readFile(WHATSAPP_INCOMING_FILE, "utf8");
    const parsed = safeJsonParse(raw, WHATSAPP_INCOMING_FILE);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

function isDuplicateWhatsappIncomingRow(existing, entry) {
  const waId = String(entry?.whatsappMessageId || "").trim();
  const rowWaId = String(existing?.whatsappMessageId || "").trim();
  if (waId && rowWaId && waId === rowWaId) return true;
  return (
    String(existing?.counselorId || "") === String(entry?.counselorId || "") &&
    String(existing?.from || "") === String(entry?.from || "") &&
    String(existing?.timestamp || "") === String(entry?.timestamp || "") &&
    String(existing?.message || "").trim() === String(entry?.message || "").trim()
  );
}

async function appendWhatsappIncoming(entry) {
  return withFileLock(WHATSAPP_INCOMING_FILE, async () => {
    const list = await readWhatsappIncoming();
    if (entry && list.some((row) => isDuplicateWhatsappIncomingRow(row, entry))) {
      return false;
    }
    list.push(entry);
    await atomicWriteFile(WHATSAPP_INCOMING_FILE, JSON.stringify(list, null, 2));
    return true;
  });
}

function uniqueWhatsappIncomingRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set();
  const unique = [];
  for (const row of list) {
    const waId = String(row?.whatsappMessageId || "").trim();
    const key = waId
      ? `wa:${waId}`
      : `row:${String(row?.counselorId || "")}|${String(row?.from || "")}|${String(row?.timestamp || "")}|${String(row?.message || "").trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

module.exports = {
  readWhatsappIncoming,
  appendWhatsappIncoming,
  uniqueWhatsappIncomingRows,
};
