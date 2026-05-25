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

async function appendWhatsappIncoming(entry) {
  return withFileLock(WHATSAPP_INCOMING_FILE, async () => {
    const list = await readWhatsappIncoming();
    list.push(entry);
    await atomicWriteFile(WHATSAPP_INCOMING_FILE, JSON.stringify(list, null, 2));
  });
}

module.exports = {
  readWhatsappIncoming,
  appendWhatsappIncoming,
};
