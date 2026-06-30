#!/usr/bin/env node
/**
 * Package the MV3 extension into a store-upload zip at the repo root.
 *
 * Output: `theque-extension-v<version>.zip` (version read from extension/manifest.json),
 * matching the convention documented in docs/chrome-store/listing.md. The same zip is
 * uploaded to both the Chrome Web Store and Microsoft Edge Add-ons — the package is
 * drop-in across Chromium browsers (see docs/adr/0007).
 *
 * Includes only runtime files. Source (`*.ts`), tests (`*.test.ts`), `tsconfig.json`,
 * and the zip itself are excluded. Run `npm run build:extension` first so the compiled
 * `*.js` exist — `npm run package:extension` chains both.
 *
 * Zero-dependency: builds the zip with node:zlib (deflate + crc32), so it needs no `zip`
 * CLI and works the same on every platform.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const extDir = join(repoRoot, "extension");

// Compiled outputs that must exist before we can ship — guards against zipping a
// half-built extension (e.g. someone ran the packager without build:extension).
const REQUIRED_COMPILED = ["popup.js", "background.js", "category-hints.js", "page-snapshot.js"];

/** A file is shippable unless it's source, a test, build config, or a stray zip. */
function isExcluded(relPath) {
  return (
    relPath.endsWith(".ts") || // covers *.ts and *.test.ts
    relPath === "tsconfig.json" ||
    relPath === ".gitignore" ||
    relPath.endsWith(".zip")
  );
}

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(abs));
      continue;
    }
    const rel = relative(extDir, abs).split("\\").join("/"); // zip paths use "/"
    if (!isExcluded(rel)) out.push({ rel, abs });
  }
  return out;
}

/** DOS date/time for the local + central headers (zip stores mtime this way). */
function dosDateTime(date) {
  const time =
    (Math.floor(date.getSeconds() / 2) & 0x1f) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getHours() & 0x1f) << 11);
  const day =
    (date.getDate() & 0x1f) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (((date.getFullYear() - 1980) & 0x7f) << 9);
  return { time, day };
}

function buildZip(files) {
  const now = new Date();
  const { time, day } = dosDateTime(now);
  const localChunks = [];
  const central = [];
  let offset = 0;

  for (const { rel, abs } of files) {
    const data = readFileSync(abs);
    const compressed = deflateRawSync(data);
    const crc = crc32(data) >>> 0;
    const name = Buffer.from(rel, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    localChunks.push(local, name, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // central dir signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(8, 10); // method
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(day, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42); // local header offset
    central.push(cd, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central dir signature
  eocd.writeUInt16LE(files.length, 8); // entries on this disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(centralBuf.length, 12); // central dir size
  eocd.writeUInt32LE(offset, 16); // central dir offset

  return Buffer.concat([...localChunks, centralBuf, eocd]);
}

const manifest = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf8"));
const version = manifest.version;
if (!version) {
  console.error("extension/manifest.json has no version.");
  process.exit(1);
}

for (const name of REQUIRED_COMPILED) {
  try {
    statSync(join(extDir, name));
  } catch {
    console.error(
      `Missing compiled file extension/${name}. Run "npm run build:extension" first ` +
        `(or use "npm run package:extension", which builds then packages).`,
    );
    process.exit(1);
  }
}

const files = collectFiles(extDir).sort((a, b) => a.rel.localeCompare(b.rel));
const zip = buildZip(files);
const outName = `theque-extension-v${version}.zip`;
writeFileSync(join(repoRoot, outName), zip);

console.log(`Packaged ${files.length} files → ${outName} (${(zip.length / 1024).toFixed(1)} KB)`);
for (const { rel } of files) console.log(`  ${rel}`);
