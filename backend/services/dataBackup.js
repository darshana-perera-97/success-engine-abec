const { spawn, execFile } = require("child_process");
const { createReadStream, createWriteStream } = require("fs");
const fs = require("fs/promises");
const path = require("path");
const { pipeline } = require("stream/promises");
const { Transform, Writable } = require("stream");
const zlib = require("zlib");
const { DATA_DIR } = require("../config");

const BACKUPS_DIR = path.join(__dirname, "..", "backups");
const EXCLUDED_BACKUP_DIR = "whatsapp-connections";
const SAFE_NAME = /^data-backup-\d{8}-\d{6}(?:-\d+)?\.zip$/;
const ZIP32_MAX = 0xffffffff;

let zipCliPromise = null;
let activeJob = null;

function backupError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function timestampForName(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function isExcludedBackupRel(rel) {
  const clean = String(rel || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return clean === EXCLUDED_BACKUP_DIR || clean.startsWith(`${EXCLUDED_BACKUP_DIR}/`);
}

function isSafeBackupName(name) {
  return SAFE_NAME.test(String(name || ""));
}

function resolveBackupPath(name) {
  if (!isSafeBackupName(name)) {
    throw backupError("Invalid backup file.", 400);
  }
  const root = path.resolve(BACKUPS_DIR);
  const full = path.resolve(root, name);
  if (full !== path.join(root, name)) {
    throw backupError("Invalid backup file.", 400);
  }
  return full;
}

async function ensureBackupsDir() {
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
}

function zipCliAvailable() {
  if (!zipCliPromise) {
    zipCliPromise = new Promise((resolve) => {
      execFile("zip", ["-v"], (error) => resolve(!error));
    });
  }
  return zipCliPromise;
}

function runZipCli(sourceDir, zipPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("zip", ["-r", "-y", "-q", zipPath, ".", "-x", EXCLUDED_BACKUP_DIR, `${EXCLUDED_BACKUP_DIR}/*`], {
      cwd: sourceDir,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 4000) stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (error && error.code === "ENOENT") {
        zipCliPromise = Promise.resolve(false);
      }
      reject(error);
    });
    child.on("close", (code) => {
      // Exit 1 and 18 still leave a usable archive when files disappear or
      // cannot be read while the data folder is being written (WhatsApp sessions).
      const warningExit = code === 0 || code === 1 || code === 2 || code === 18;
      fs.stat(zipPath)
        .then(async (stat) => {
          if (!warningExit || !stat.isFile() || stat.size < 22) {
            reject(backupError(stderr.trim() || `Could not create the backup archive (zip exit ${code}).`));
            return;
          }
          const handle = await fs.open(zipPath, "r");
          try {
            const header = Buffer.alloc(2);
            await handle.read(header, 0, 2, 0);
            if (header[0] !== 0x50 || header[1] !== 0x4b) {
              reject(backupError("Backup archive was not created."));
              return;
            }
          } finally {
            await handle.close();
          }
          resolve();
        })
        .catch((error) => {
          if (error && error.status) {
            reject(error);
            return;
          }
          reject(backupError(stderr.trim() || `Could not create the backup archive (zip exit ${code}).`));
        });
    });
  });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function createCrc32() {
  let crc = 0xffffffff;
  return {
    update(buffer) {
      for (let i = 0; i < buffer.length; i += 1) {
        crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
      }
    },
    digest() {
      return (crc ^ 0xffffffff) >>> 0;
    },
  };
}

function dosDateTime(date) {
  const value = date instanceof Date ? date : new Date();
  const safe = Number.isNaN(value.getTime()) ? new Date() : value;
  const time = (safe.getHours() << 11) | (safe.getMinutes() << 5) | Math.floor(safe.getSeconds() / 2);
  const day = ((safe.getFullYear() - 1980) << 9) | ((safe.getMonth() + 1) << 5) | safe.getDate();
  return { time, date: day };
}

function writeToStream(stream, chunk) {
  if (stream.write(chunk)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onDrain = () => {
      stream.off("error", onError);
      resolve();
    };
    const onError = (error) => {
      stream.off("drain", onDrain);
      reject(error);
    };
    stream.once("drain", onDrain);
    stream.once("error", onError);
  });
}

async function collectEntries(dir, prefix, entries) {
  const names = await fs.readdir(dir);
  names.sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (isExcludedBackupRel(rel)) continue;
    let stat;
    try {
      stat = await fs.lstat(full);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) {
      entries.push({ type: "symlink", full, rel, stat });
      continue;
    }
    if (stat.isDirectory()) {
      entries.push({ type: "dir", full, rel, stat });
      await collectEntries(full, rel, entries);
      continue;
    }
    if (stat.isFile()) {
      entries.push({ type: "file", full, rel, stat });
    }
  }
}

async function compressFile(out, filePath) {
  let uncompressedSize = 0;
  let compressedSize = 0;
  const crc = createCrc32();
  const countInput = new Transform({
    transform(chunk, _encoding, callback) {
      uncompressedSize += chunk.length;
      crc.update(chunk);
      callback(null, chunk);
    },
  });
  const countOutput = new Transform({
    transform(chunk, _encoding, callback) {
      compressedSize += chunk.length;
      callback(null, chunk);
    },
  });
  const writer = new Writable({
    write(chunk, _encoding, callback) {
      if (out.write(chunk)) {
        callback();
        return;
      }
      out.once("drain", callback);
    },
  });
  await pipeline(createReadStream(filePath), countInput, zlib.createDeflateRaw({ level: 6 }), countOutput, writer);
  return { crc: crc.digest(), uncompressedSize, compressedSize, method: 8 };
}

async function appendZipEntry(out, state, entry) {
  const zipName = entry.type === "dir" ? `${entry.rel}/` : entry.rel;
  const nameBuf = Buffer.from(zipName, "utf8");
  if (nameBuf.length > 0xffff) {
    throw backupError(`Path is too long to store in a zip: ${zipName}`);
  }
  const dos = dosDateTime(entry.stat.mtime);
  const localOffset = state.offset;
  if (localOffset > ZIP32_MAX) {
    throw backupError("Backup is too large for a standard zip archive.");
  }

  let method = 0;
  let crc = 0;
  let uncompressedSize = 0;
  let compressedSize = 0;
  let payload = null;

  if (entry.type === "symlink") {
    const target = await fs.readlink(entry.full);
    payload = Buffer.from(target, "utf8");
    const crc32 = createCrc32();
    crc32.update(payload);
    crc = crc32.digest();
    uncompressedSize = payload.length;
    compressedSize = payload.length;
  } else if (entry.type === "file") {
    if (entry.stat.size >= ZIP32_MAX) {
      throw backupError(`File is too large to store in a standard zip: ${entry.rel}`);
    }
    if (entry.stat.size === 0) {
      method = 0;
    } else {
      const header = localHeader({ nameBuf, dos, method: 8, flags: 0x0008, crc: 0, compressedSize: 0, uncompressedSize: 0 });
      await writeToStream(out, header);
      await writeToStream(out, nameBuf);
      state.offset += header.length + nameBuf.length;
      const compressed = await compressFile(out, entry.full);
      if (compressed.compressedSize > ZIP32_MAX || compressed.uncompressedSize > ZIP32_MAX) {
        throw backupError(`File is too large to store in a standard zip: ${entry.rel}`);
      }
      const descriptor = Buffer.alloc(16);
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(compressed.crc, 4);
      descriptor.writeUInt32LE(compressed.compressedSize, 8);
      descriptor.writeUInt32LE(compressed.uncompressedSize, 12);
      await writeToStream(out, descriptor);
      state.offset += compressed.compressedSize + descriptor.length;
      state.records.push({
        nameBuf,
        dos,
        method: 8,
        flags: 0x0008,
        crc: compressed.crc,
        compressedSize: compressed.compressedSize,
        uncompressedSize: compressed.uncompressedSize,
        localOffset,
        externalAttr: 0,
      });
      return;
    }
  }

  const header = localHeader({
    nameBuf,
    dos,
    method,
    flags: 0,
    crc,
    compressedSize,
    uncompressedSize,
  });
  await writeToStream(out, header);
  await writeToStream(out, nameBuf);
  if (payload && payload.length) await writeToStream(out, payload);
  state.offset += header.length + nameBuf.length + (payload ? payload.length : 0);
  const mode = entry.type === "symlink" ? 0o120777 : entry.type === "dir" ? 0o040755 : 0o100644;
  state.records.push({
    nameBuf,
    dos,
    method,
    flags: 0,
    crc,
    compressedSize,
    uncompressedSize,
    localOffset,
    externalAttr: mode << 16,
  });
}

function localHeader({ nameBuf, dos, method, flags, crc, compressedSize, uncompressedSize }) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(flags, 6);
  header.writeUInt16LE(method, 8);
  header.writeUInt16LE(dos.time, 10);
  header.writeUInt16LE(dos.date, 12);
  header.writeUInt32LE(crc >>> 0, 14);
  header.writeUInt32LE(compressedSize >>> 0, 18);
  header.writeUInt32LE(uncompressedSize >>> 0, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralHeader(record) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE((3 << 8) | 20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(record.flags, 8);
  header.writeUInt16LE(record.method, 10);
  header.writeUInt16LE(record.dos.time, 12);
  header.writeUInt16LE(record.dos.date, 14);
  header.writeUInt32LE(record.crc >>> 0, 16);
  header.writeUInt32LE(record.compressedSize >>> 0, 20);
  header.writeUInt32LE(record.uncompressedSize >>> 0, 24);
  header.writeUInt16LE(record.nameBuf.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(record.externalAttr >>> 0, 38);
  header.writeUInt32LE(record.localOffset >>> 0, 42);
  return header;
}

async function zipDirectoryWithNode(sourceDir, zipPath) {
  const entries = [];
  await collectEntries(sourceDir, "", entries);
  const out = createWriteStream(zipPath);
  const state = { offset: 0, records: [] };
  try {
    for (const entry of entries) {
      await appendZipEntry(out, state, entry);
    }
    const centralOffset = state.offset;
    for (const record of state.records) {
      const header = centralHeader(record);
      await writeToStream(out, header);
      await writeToStream(out, record.nameBuf);
      state.offset += header.length + record.nameBuf.length;
    }
    const centralSize = state.offset - centralOffset;
    if (centralOffset > ZIP32_MAX || centralSize > ZIP32_MAX || state.records.length > 0xffff) {
      throw backupError("Backup is too large for a standard zip archive.");
    }
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(state.records.length, 8);
    eocd.writeUInt16LE(state.records.length, 10);
    eocd.writeUInt32LE(centralSize, 12);
    eocd.writeUInt32LE(centralOffset, 16);
    eocd.writeUInt16LE(0, 20);
    await writeToStream(out, eocd);
    await new Promise((resolve, reject) => {
      out.end(() => resolve());
      out.once("error", reject);
    });
  } catch (error) {
    out.destroy();
    throw error;
  }
}

async function zipDirectory(sourceDir, zipPath) {
  if (await zipCliAvailable()) {
    try {
      await runZipCli(sourceDir, zipPath);
      return;
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
  }
  await zipDirectoryWithNode(sourceDir, zipPath);
}

async function toBackupRecord(name) {
  const full = resolveBackupPath(name);
  const stat = await fs.stat(full);
  if (!stat.isFile()) {
    throw backupError("Backup file was not found.", 404);
  }
  return {
    name,
    sizeBytes: stat.size,
    createdAt: stat.mtime.toISOString(),
  };
}

async function listBackups() {
  await ensureBackupsDir();
  const names = await fs.readdir(BACKUPS_DIR);
  const records = [];
  for (const name of names) {
    if (!isSafeBackupName(name)) continue;
    try {
      records.push(await toBackupRecord(name));
    } catch {
      // Skip entries that disappear while the folder is being read.
    }
  }
  records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return records;
}

async function uniqueBackupName() {
  const base = `data-backup-${timestampForName()}`;
  let name = `${base}.zip`;
  let suffix = 2;
  for (;;) {
    try {
      await fs.access(path.join(BACKUPS_DIR, name));
      name = `${base}-${suffix}.zip`;
      suffix += 1;
    } catch {
      return name;
    }
  }
}

function describeJob(job) {
  if (!job) {
    return {
      status: "idle",
      name: null,
      startedAt: null,
      completedAt: null,
      percent: 0,
      etaSeconds: null,
      processedBytes: 0,
      totalBytes: 0,
      error: null,
    };
  }
  let processed = job.processedBytes;
  if (job.status === "running" && job.inflightBytes > 0 && job.bytesPerMs > 0) {
    const guessed = job.bytesPerMs * Math.max(0, Date.now() - job.inflightStartedAt);
    processed += Math.min(job.inflightBytes * 0.95, guessed);
  }
  const total = job.totalBytes;
  let percent = 0;
  if (job.status === "completed") percent = 100;
  else if (total > 0) percent = Math.min(99, Math.round((processed / total) * 100));
  let etaSeconds = null;
  if (job.status === "running" && job.bytesPerMs > 0 && processed > 0 && total > processed) {
    etaSeconds = Math.max(1, Math.round((total - processed) / job.bytesPerMs / 1000));
  }
  return {
    status: job.status,
    name: job.name,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    percent,
    etaSeconds,
    processedBytes: Math.round(processed),
    totalBytes: total,
    error: job.error,
  };
}

function getBackupJob() {
  return describeJob(activeJob);
}

function runZipAdd(sourceDir, zipPath, relativePaths) {
  return new Promise((resolve, reject) => {
    const child = spawn("zip", ["-r", "-y", "-q", zipPath, ...relativePaths], {
      cwd: sourceDir,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 2000) stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (error && error.code === "ENOENT") zipCliPromise = Promise.resolve(false);
      reject(error);
    });
    child.on("close", (code) => {
      const warningExit = code === 0 || code === 1 || code === 2 || code === 12 || code === 18;
      fs.stat(zipPath)
        .then((stat) => {
          if (warningExit && stat.isFile() && stat.size >= 22) {
            resolve();
            return;
          }
          reject(backupError(stderr.trim() || `Could not add files to the backup (zip exit ${code}).`));
        })
        .catch(() => {
          reject(backupError(stderr.trim() || `Could not add files to the backup (zip exit ${code}).`));
        });
    });
  });
}

async function measureDataTree(dir) {
  const files = [];
  let totalBytes = 0;
  async function walk(current, prefix) {
    const names = await fs.readdir(current);
    names.sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      const full = path.join(current, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (isExcludedBackupRel(rel)) continue;
      let stat;
      try {
        stat = await fs.lstat(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink() || stat.isFile()) {
        const size = stat.isFile() ? stat.size : 0;
        files.push({ rel, size });
        totalBytes += size;
        continue;
      }
      if (stat.isDirectory()) await walk(full, rel);
    }
  }
  await walk(dir, "");
  return { files, totalBytes };
}

async function zipTreeWithProgress(sourceDir, zipPath, files, job) {
  if (!(await zipCliAvailable())) {
    await zipDirectory(sourceDir, zipPath);
    job.processedBytes = job.totalBytes;
    job.inflightBytes = 0;
    return;
  }
  const batchBytesLimit = 16 * 1024 * 1024;
  const batchFileLimit = 80;
  let batch = [];
  let batchSize = 0;

  async function flushBatch() {
    if (!batch.length) return;
    const paths = batch;
    const size = batchSize;
    batch = [];
    batchSize = 0;
    job.inflightBytes = size;
    job.inflightStartedAt = Date.now();
    try {
      await runZipAdd(sourceDir, zipPath, paths);
    } catch (error) {
      if (!error || error.code === "ENOENT") throw error;
      try {
        const stat = await fs.stat(zipPath);
        if (!stat.isFile() || stat.size < 22) throw error;
      } catch (statError) {
        if (statError && statError.status) throw statError;
        throw error;
      }
    }
    job.processedBytes += size;
    job.inflightBytes = 0;
    const elapsed = Math.max(1, Date.now() - job.startedMs);
    job.bytesPerMs = job.processedBytes / elapsed;
  }

  for (const file of files) {
    batch.push(file.rel);
    batchSize += file.size;
    if (batch.length >= batchFileLimit || batchSize >= batchBytesLimit) {
      await flushBatch();
    }
  }
  await flushBatch();
}

async function runBackupJob(job) {
  let partialPath = "";
  try {
    await fs.access(DATA_DIR);
    await ensureBackupsDir();
    const measured = await measureDataTree(DATA_DIR);
    const name = await uniqueBackupName();
    partialPath = path.join(BACKUPS_DIR, `.partial-${name}`);
    const finalPath = path.join(BACKUPS_DIR, name);
    job.name = name;
    job.totalBytes = measured.totalBytes;
    job.status = "running";
    if (!measured.files.length) {
      await zipDirectory(DATA_DIR, partialPath);
    } else {
      await zipTreeWithProgress(DATA_DIR, partialPath, measured.files, job);
    }
    const stat = await fs.stat(partialPath);
    if (!stat.isFile() || stat.size < 22) {
      throw backupError("Backup archive was not created.");
    }
    await fs.rename(partialPath, finalPath);
    partialPath = "";
    const record = await toBackupRecord(name);
    job.processedBytes = job.totalBytes;
    job.inflightBytes = 0;
    job.status = "completed";
    job.completedAt = record.createdAt;
    job.name = record.name;
  } catch (error) {
    job.status = "failed";
    job.inflightBytes = 0;
    job.completedAt = new Date().toISOString();
    if (error && error.code === "ENOENT" && !partialPath) {
      job.error = "Data folder was not found.";
    } else {
      job.error = error?.message || "Failed to create backup.";
    }
    if (partialPath) await fs.unlink(partialPath).catch(() => {});
  }
}

function startBackup() {
  if (activeJob && (activeJob.status === "preparing" || activeJob.status === "running")) {
    const error = backupError("A backup is already in progress.", 409);
    error.job = describeJob(activeJob);
    throw error;
  }
  const job = {
    status: "preparing",
    name: null,
    startedAt: new Date().toISOString(),
    startedMs: Date.now(),
    completedAt: null,
    processedBytes: 0,
    inflightBytes: 0,
    inflightStartedAt: 0,
    totalBytes: 0,
    bytesPerMs: 0,
    error: null,
  };
  activeJob = job;
  runBackupJob(job).catch((error) => {
    if (job.status === "preparing" || job.status === "running") {
      job.status = "failed";
      job.error = error?.message || "Failed to create backup.";
      job.completedAt = new Date().toISOString();
    }
  });
  return describeJob(job);
}

async function deleteBackup(name) {
  const full = resolveBackupPath(name);
  try {
    const stat = await fs.stat(full);
    if (!stat.isFile()) throw backupError("Backup file was not found.", 404);
  } catch (error) {
    if (error && error.status) throw error;
    throw backupError("Backup file was not found.", 404);
  }
  await fs.unlink(full);
  return listBackups();
}

module.exports = {
  BACKUPS_DIR,
  isSafeBackupName,
  resolveBackupPath,
  listBackups,
  startBackup,
  getBackupJob,
  deleteBackup,
  zipDirectory,
};
