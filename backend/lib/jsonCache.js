const fs = require("fs/promises");
const { safeJsonParse } = require("./fileUtils");

const cache = new Map();

async function readJsonCached(filePath, parseFn) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") return parseFn(null);
    throw error;
  }
  const mtimeMs = stat.mtimeMs;
  const hit = cache.get(filePath);
  if (hit && hit.mtimeMs === mtimeMs) return hit.data;

  const raw = await fs.readFile(filePath, "utf8");
  const parsed = safeJsonParse(raw, filePath);
  const data = parseFn(parsed);
  cache.set(filePath, { data, mtimeMs });
  return data;
}

function invalidateJsonCache(filePath) {
  cache.delete(filePath);
}

function clearJsonCache() {
  cache.clear();
}

module.exports = {
  readJsonCached,
  invalidateJsonCache,
  clearJsonCache,
};
