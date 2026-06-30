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

/*
  Hide the Next.js dev-tools indicator (the floating logo badge, bottom-left by
  default) so it never lands in a store screenshot. The indicator lives in an
  open shadow root on a `nextjs-portal` element, which Next attaches after the
  initial render — so this runs at capture time (shadow root guaranteed present)
  rather than as an init script. It hides only the badge; runtime/compile error
  overlays in the same portal stay visible so a broken capture can't slip through.
*/
async function hideDevIndicator(page) {
  await page.evaluate(() => {
    const STYLE = `
      [data-nextjs-dev-tools-button],
      [data-next-badge-root],
      [data-next-badge] { display: none !important; }
    `;
    for (const portal of document.querySelectorAll("nextjs-portal")) {
      const root = portal.shadowRoot;
      if (!root || root.querySelector("style[data-hide-devtools]")) continue;
      const style = document.createElement("style");
      style.setAttribute("data-hide-devtools", "true");
      style.textContent = STYLE;
      root.appendChild(style);
    }
  });
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
  await hideDevIndicator(page);
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

    // A couple of category shelves + the Done shelf (verdicts). Skipped if no cards render.
    // Shelf ids come from src/lib/shelves.ts (note: Articles is the `read` id).
    for (const [shelf, label] of [
      ["books", "books"],
      ["watch", "watch"],
      ["read", "articles"],
      ["done", "done"],
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

    // AI recommendations deck — Books shelf. Gated on the AI Gateway being
    // configured (and ≥3 titled books); a live model call can take a few
    // seconds. Skipped (not fatal) if the button is absent or the run doesn't
    // resolve, so a missing gateway key never breaks the rest of the capture.
    await page.goto(`${base}/library?shelf=books`, { waitUntil: "networkidle" });
    await settle(page);
    const recommendBtn = page.getByRole("button", { name: /recommend/i });
    if (await recommendBtn.count()) {
      await recommendBtn.first().click();
      const readyCard = page.getByText(/Recommendation \d+ of/i);
      // A run may fall through up to 3 models at 20s each before resolving.
      await readyCard.waitFor({ state: "visible", timeout: 75000 }).catch(() => {});
      if (await readyCard.count()) {
        await settle(page, 900); // let the cover decode and the slide-in finish
        await shoot(page, `app-recommendations-${colorScheme}-1280x800.png`);
      } else {
        const deckError = await page
          .getByText(/couldn|try again|no new recommendations/i)
          .first()
          .textContent()
          .catch(() => null);
        console.log(
          `! recommendations didn't reach a ready card — skipped${deckError ? ` (deck: "${deckError.trim()}")` : ""}`,
        );
      }
    } else {
      console.log("! Recommend button unavailable (gateway off?) — skipped recommendations");
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
