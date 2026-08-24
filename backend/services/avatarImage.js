const fs = require("fs/promises");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const { ASSETS_DIR } = require("../config");

const AVATAR_MAX_SIZE = 256;
const AVATAR_JPEG_QUALITY = 0.8;
const AVATAR_THUMBS_DIR = path.join(ASSETS_DIR, "_thumbs");
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

const inflight = new Map();

function isAvatarStoragePrefix(prefix) {
  return String(prefix || "")
    .toLowerCase()
    .includes("avatar");
}

function isAvatarAssetFileName(fileName) {
  const name = String(fileName || "").toLowerCase();
  return (
    name.startsWith("user-avatar-") ||
    name.startsWith("admin-avatar-") ||
    name.startsWith("student-avatar-")
  );
}

function isJpegBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 3 && buffer.subarray(0, 3).equals(JPEG_MAGIC);
}

async function compressAvatarBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("empty-avatar-buffer");
  }

  const image = await loadImage(buffer);
  const srcW = Math.max(1, image.width || 1);
  const srcH = Math.max(1, image.height || 1);
  const srcSize = Math.min(srcW, srcH);
  const size = Math.max(1, Math.min(AVATAR_MAX_SIZE, srcSize));
  const srcX = (srcW - srcSize) / 2;
  const srcY = (srcH - srcSize) / 2;

  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.drawImage(image, srcX, srcY, srcSize, srcSize, 0, 0, size, size);

  const compressed = canvas.toBuffer("image/jpeg", { quality: AVATAR_JPEG_QUALITY });
  if (isJpegBuffer(buffer) && compressed.length >= buffer.length) {
    return buffer;
  }
  return compressed;
}

async function compressAvatarDataUrl(dataUrl) {
  const value = String(dataUrl || "");
  const comma = value.indexOf(",");
  if (!value.startsWith("data:image/") || comma === -1) {
    throw new Error("invalid-avatar-data-url");
  }
  const buffer = Buffer.from(value.slice(comma + 1), "base64");
  const compressed = await compressAvatarBuffer(buffer);
  return `data:image/jpeg;base64,${compressed.toString("base64")}`;
}

function cachePathForAvatar(fileName) {
  const safeName = path.basename(String(fileName || "")).replace(/[^\w.\-]+/g, "");
  return path.join(AVATAR_THUMBS_DIR, `${safeName}.jpg`);
}

async function compressAndCacheAvatarFile(filePath, fileName) {
  const stat = await fs.stat(filePath);
  const cachePath = cachePathForAvatar(fileName);
  try {
    const cacheStat = await fs.stat(cachePath);
    if (cacheStat.mtimeMs >= stat.mtimeMs && cacheStat.size > 0) {
      return fs.readFile(cachePath);
    }
  } catch {
    // Cache miss — compress below.
  }

  const original = await fs.readFile(filePath);
  const compressed = await compressAvatarBuffer(original);
  await fs.mkdir(AVATAR_THUMBS_DIR, { recursive: true });
  await fs.writeFile(cachePath, compressed);
  return compressed;
}

async function getCompressedAvatarFile(filePath, fileName) {
  const key = String(fileName || filePath);
  if (inflight.has(key)) return inflight.get(key);
  const pending = compressAndCacheAvatarFile(filePath, fileName).finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}

module.exports = {
  AVATAR_MAX_SIZE,
  AVATAR_JPEG_QUALITY,
  isAvatarStoragePrefix,
  isAvatarAssetFileName,
  compressAvatarBuffer,
  compressAvatarDataUrl,
  getCompressedAvatarFile,
};
