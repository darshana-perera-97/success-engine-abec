const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "whatsapp-web.js",
  "src",
  "util",
  "Puppeteer.js"
);

if (!fs.existsSync(target)) process.exit(0);

const source = fs.readFileSync(target, "utf8");
if (source.includes("Failed to add page binding")) process.exit(0);

const needle = `async function exposeFunctionIfAbsent(page, name, fn) {
    const exist = await page.evaluate((name) => {
        return !!window[name];
    }, name);
    if (exist) {
        return;
    }
    await page.exposeFunction(name, fn);
}`;

const replacement = `async function exposeFunctionIfAbsent(page, name, fn) {
    try {
        const exist = await page.evaluate((name) => {
            return !!window[name];
        }, name);
        if (exist) {
            return;
        }
        await page.exposeFunction(name, fn);
    } catch (error) {
        const msg = String((error && error.message) || error || "");
        if (msg.includes("already exists") || msg.includes("Failed to add page binding")) {
            return;
        }
        throw error;
    }
}`;

if (!source.includes(needle)) {
  console.warn("whatsapp-web.js exposeFunctionIfAbsent source changed; skip patch.");
  process.exit(0);
}

fs.writeFileSync(target, source.replace(needle, replacement));
console.log("Patched whatsapp-web.js exposeFunctionIfAbsent to ignore existing page bindings.");
