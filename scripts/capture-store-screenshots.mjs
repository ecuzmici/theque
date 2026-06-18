/*
  Capture REAL screenshots of the running app for the Chrome Web Store listing
  and landing page. Authenticates locally via the dev-only QA session route
  (no email sent), then screenshots key routes at exactly 1280x800.

  Prereqs (all already in .env.local for this project):
    QA_DEV_SESSION_SECRET, QA_DEV_EMAIL, NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, SERVICE_ROLE_KEY
  Run the dev server first (npm run dev), then:
    node scripts/capture-store-screenshots.mjs
  Optional: COLOR_SCHEME=dark node scripts/capture-store-screenshots.mjs
*/

import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "docs", "chrome-store");
const viewport = { width: 1280, height: 800 };

function readEnvLocal() {
  const vars = {};
  const file = path.join(rootDir, ".env.local");
  if (!fs.existsSync(file)) return vars;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return vars;
}

const env = { ...process.env, ...readEnvLocal() };
const secret = env.QA_DEV_SESSION_SECRET;
const port = env.PORT || "3000";
const base = (env.QA_DEV_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, "");
const colorScheme = (env.COLOR_SCHEME || "light") === "dark" ? "dark" : "light";

if (!secret) {
  console.error("Missing QA_DEV_SESSION_SECRET in .env.local");
  process.exit(1);
}

function qaUrl(next) {
  return `${base}/api/dev/qa-session?secret=${encodeURIComponent(secret)}&next=${encodeURIComponent(next)}`;
}

async function settle(page, ms = 1200) {
  // Wait for in-viewport images (covers) to finish decoding, then a short beat.
  await page
    .waitForFunction(
      () => Array.from(document.images).every((img) => img.complete),
      { timeout: 8000 },
    )
    .catch(() => {});
  await page.waitForTimeout(ms);
}

async function shoot(page, file) {
  await page.screenshot({ path: path.join(outDir, file), fullPage: false });
  console.log(`- ${file}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  try {
    // Authenticate (QA route 302-redirects to /library, setting auth cookies).
    await page.goto(qaUrl("/library"), { waitUntil: "networkidle" });
    if (/\/login(\?|$)/.test(page.url())) {
      throw new Error(
        `Auth failed — landed on ${page.url()}. Check QA_DEV_EMAIL maps to a real user and the dev server runs in development mode.`,
      );
    }
    await settle(page);
    await shoot(page, `app-library-${colorScheme}-1280x800.png`);

    // A couple of category shelves (skipped if no cards render).
    for (const [shelf, label] of [
      ["books", "books"],
      ["watch", "watch"],
      ["shop", "shop"],
    ]) {
      await page.goto(`${base}/library?shelf=${shelf}`, { waitUntil: "networkidle" });
      await settle(page);
      const hasCards = await page.locator('a[href*="/item/"]').count();
      if (hasCards > 0) await shoot(page, `app-shelf-${label}-${colorScheme}-1280x800.png`);
    }

    // Item detail — first card from the full library.
    await page.goto(`${base}/library`, { waitUntil: "networkidle" });
    await settle(page);
    const href = await page
      .locator('a[href*="/item/"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (href) {
      await page.goto(`${base}${href}`, { waitUntil: "networkidle" });
      await settle(page);
      await shoot(page, `app-item-detail-${colorScheme}-1280x800.png`);
    } else {
      console.log("! no item cards found — skipped item detail");
    }
  } finally {
    await browser.close();
  }

  console.log(`\nDone. Screenshots in ${path.relative(rootDir, outDir)} (${colorScheme} mode).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
