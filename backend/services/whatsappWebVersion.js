const https = require("https");
const { WHATSAPP_WEB_VERSION } = require("../config");

const WA_VERSION_LIST_URL =
  "https://api.github.com/repos/wppconnect-team/wa-version/contents/html?per_page=100";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cachedLatestVersion = "";
let cachedAt = 0;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "success-engine-whatsapp" } }, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function compareVersionStrings(left, right) {
  const toNums = (value) => String(value).match(/\d+/g)?.map(Number) || [0];
  const leftNums = toNums(left);
  const rightNums = toNums(right);
  const len = Math.max(leftNums.length, rightNums.length);
  for (let index = 0; index < len; index += 1) {
    const diff = (leftNums[index] || 0) - (rightNums[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchLatestWhatsappWebVersion() {
  const files = await fetchJson(WA_VERSION_LIST_URL);
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("No WhatsApp web versions found.");
  }
  const versions = files
    .map((file) => String(file.name || "").replace(/\.html$/, ""))
    .filter(Boolean)
    .sort(compareVersionStrings);
  const latest = versions[versions.length - 1];
  if (!latest) throw new Error("No WhatsApp web versions found.");
  return latest;
}

async function resolveWhatsappWebVersion() {
  if (process.env.WHATSAPP_WEB_VERSION) {
    return String(process.env.WHATSAPP_WEB_VERSION).trim();
  }
  if (cachedLatestVersion && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedLatestVersion;
  }
  try {
    const latest = await fetchLatestWhatsappWebVersion();
    cachedLatestVersion = latest;
    cachedAt = Date.now();
    return latest;
  } catch (error) {
    console.warn("Failed to resolve latest WhatsApp web version; using configured fallback.", error);
    return WHATSAPP_WEB_VERSION;
  }
}

module.exports = {
  resolveWhatsappWebVersion,
};
