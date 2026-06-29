/**
 * Mobile tap-target regression guard (issue #34).
 *
 * Boots/uses a `next dev` server, signs in without sending email, walks the core
 * surfaces at a coarse-pointer mobile viewport (iPhone 13), and FAILS if any
 * touch target drops below the WCAG 2.5.8 AA minimum (24px), honouring the spec
 * exceptions. The contract lives in `e2e/lib/tap-targets.ts`.
 *
 * Standalone runner (the repo has the `playwright` library, not `@playwright/test`):
 *   npm run test:e2e
 *   E2E_BASE_URL=http://localhost:3000 npm run test:e2e   # reuse a running dev server
 *
 * Exits non-zero on any FAIL (or on infra/auth errors).
 */
import { spawn, type ChildProcess } from "node:child_process";

import { chromium, devices, type Browser, type BrowserContext, type Page } from "playwright";

import {
  authenticate,
  auditSurface,
  readEnvLocal,
  type SurfaceAudit,
} from "./lib/tap-targets";

const DEVICE = devices["iPhone 13"];
const E2E_PORT = process.env.E2E_PORT || "3000";

async function isUp(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(baseUrl, { redirect: "manual" });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function waitForServer(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp(baseUrl)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Dev server did not become ready at ${baseUrl} within ${timeoutMs}ms.`);
}

/** Spawn `next dev` in its own process group so we can kill the whole tree. */
function spawnDevServer(port: string): ChildProcess {
  console.log(`[e2e] starting \`next dev\` on :${port} (NODE_ENV=development)…`);
  const child = spawn("node_modules/.bin/next", ["dev", "--port", port], {
    env: { ...process.env, NODE_ENV: "development" },
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
  });
  return child;
}

function killTree(child: ChildProcess | null): void {
  if (!child || child.pid == null || child.killed) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

function printSurface(audit: SurfaceAudit): void {
  const comfort = audit.belowComfort.length;
  console.log(
    `\n— ${audit.label}: ${audit.results.length} targets, ${audit.fails.length} FAIL` +
      ` (${comfort} below 44px comfort target, reported not enforced)`,
  );
  for (const f of audit.fails) {
    console.log(`   FAIL  ${f.target}\n         ${f.reason}`);
  }
}

async function newMobileContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ...DEVICE });
  // tsx/esbuild compiles the injected measurement fn with `keepNames`, which
  // emits `__name(...)` calls that don't exist in the browser. Shim it (identity)
  // before any page script runs so `page.evaluate(measureTapTargetsInPage)` works.
  await ctx.addInitScript(() => {
    const w = window as unknown as { __name?: (fn: unknown) => unknown };
    if (!w.__name) {
      w.__name = function (fn: unknown) {
        return fn;
      };
    }
  });
  return ctx;
}

/**
 * Open the first card's item-actions dropdown on /library and wait for the menu
 * rows to render, so a following `auditSurface` measures the trigger + every
 * `role="menuitem"` row. Returns the number of menu rows that became visible.
 * Returns null (caller logs a SKIP) if no card / trigger is present.
 */
async function openItemActionsMenu(page: Page): Promise<number | null> {
  const trigger = page.locator('[aria-label="Item actions"]').first();
  if ((await trigger.count()) === 0) return null;
  await trigger.click();
  // Real DOM signal: the menu and at least one row are visible — no fixed sleep.
  const menu = page.locator('[role="menu"]').first();
  await menu.waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('[role="menuitem"]').first().waitFor({ state: "visible", timeout: 10_000 });
  return page.locator('[role="menuitem"]').count();
}

/**
 * Find a shelf whose Recommend control is rendered AND enabled (gateway
 * configured + enough titled items). Tries the two gated shelves; returns the
 * shelf id, or null so the caller can log a clear SKIP.
 */
async function findEnabledRecommendShelf(page: Page, baseUrl: string): Promise<string | null> {
  for (const shelf of ["books", "watch"]) {
    await page.goto(`${baseUrl}/library?shelf=${shelf}`, { waitUntil: "networkidle" });
    const btn = page.getByRole("button", { name: "Recommend" }).first();
    if ((await btn.count()) === 0) continue;
    if (!(await btn.isDisabled())) return shelf;
  }
  return null;
}

/**
 * Open the recommend deck and resolve which run state it reached, keyed on real
 * DOM signals (auto-waiting locators, never a fixed sleep). The deck run hits an
 * AI endpoint that may or may not complete locally, so we race the terminal
 * signals and fall back to "loading" if none arrives in time. The Minimize /
 * Close controls render in every state, so whatever we measure must still pass.
 */
async function openRecommendDeck(
  page: Page,
  shelf: string,
): Promise<"ready" | "empty" | "done" | "error" | "loading"> {
  await page.getByRole("button", { name: "Recommend" }).first().click();
  // Overlay present: the always-rendered Minimize control is visible.
  await page
    .locator('[aria-label="Minimize to keep browsing"]')
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });

  // Exact-match the verdict buttons so "Save" can't resolve against "Saved" / "Save
  // for later" on the library still rendered behind the deck overlay (a false "ready").
  const signals: { state: string; locator: ReturnType<Page["locator"]> }[] = [
    { state: "ready", locator: page.getByRole("button", { name: "Save", exact: true }) },
    { state: "error", locator: page.getByRole("button", { name: "Try again", exact: true }) },
    { state: "empty", locator: page.locator("text=/No new recommendations/i") },
    { state: "done", locator: page.locator("text=/all caught up/i") },
  ];
  const TIMEOUT = 45_000;
  const raced = await Promise.race(
    signals.map(({ state, locator }) =>
      locator
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUT })
        .then(() => state)
        .catch(() => null),
    ),
  );
  return (raced as "ready" | "empty" | "done" | "error" | null) ?? "loading";
}

async function main(): Promise<void> {
  const env = { ...process.env, ...readEnvLocal() };
  const secret = env.QA_DEV_SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing QA_DEV_SESSION_SECRET (set it in .env.local, like `npm run qa:session-url`).");
  }

  const reuseUrl = process.env.E2E_BASE_URL;
  const baseUrl = (reuseUrl || `http://localhost:${E2E_PORT}`).replace(/\/+$/, "");

  let devServer: ChildProcess | null = null;
  let browser: Browser | null = null;

  try {
    if (reuseUrl) {
      console.log(`[e2e] reusing dev server at ${baseUrl} (E2E_BASE_URL)`);
      if (!(await isUp(baseUrl))) throw new Error(`E2E_BASE_URL=${baseUrl} is not reachable.`);
    } else {
      devServer = spawnDevServer(E2E_PORT);
      await waitForServer(baseUrl, 120_000);
    }

    try {
      browser = await chromium.launch();
    } catch (err) {
      throw new Error(
        `Could not launch Chromium for Playwright. If the browser is missing, run \`npm run qa:install-browsers\`.\n` +
          `Original error: ${(err as Error).message}`,
      );
    }

    const audits: SurfaceAudit[] = [];

    // --- Login: reachable WITHOUT auth, so measure it in a fresh context. ---
    const guestCtx = await newMobileContext(browser);
    const guestPage = await guestCtx.newPage();
    await guestPage.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    audits.push(await auditSurface(guestPage, "/login"));
    await guestCtx.close();

    // --- Authenticated surfaces. ---
    const ctx = await newMobileContext(browser);
    const page = await ctx.newPage();
    await authenticate(page, baseUrl, secret);

    const authedSurfaces: { label: string; path: string }[] = [
      { label: "/library", path: "/library" },
      { label: "/add", path: "/add" },
      { label: "/search", path: "/search" },
      { label: "/settings", path: "/settings" },
    ];
    for (const s of authedSurfaces) {
      await page.goto(`${baseUrl}${s.path}`, { waitUntil: "networkidle" });
      audits.push(await auditSurface(page, s.label));
    }

    // --- Item detail: derive a real id from the library; skip if empty. ---
    await page.goto(`${baseUrl}/library`, { waitUntil: "networkidle" });
    const itemHref = await page
      .locator('a[href^="/item/"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (itemHref) {
      await page.goto(`${baseUrl}${itemHref}`, { waitUntil: "networkidle" });
      audits.push(await auditSurface(page, `/item (${itemHref})`));
    } else {
      console.log("\n— /item/[id]: SKIPPED (library has no items to open). Other surfaces still walked.");
    }

    // --- Overlay state: per-card item-actions dropdown menu (issue #35). ---
    await page.goto(`${baseUrl}/library`, { waitUntil: "networkidle" });
    const menuRows = await openItemActionsMenu(page);
    if (menuRows != null) {
      console.log(`\n[e2e] item-actions menu opened — ${menuRows} menu row(s) visible.`);
      audits.push(await auditSurface(page, "/library — item-actions menu"));
      await page.keyboard.press("Escape"); // close before the deck walk
    } else {
      console.log("\n— /library — item-actions menu: SKIPPED (no cards on the library shelf).");
    }

    // --- Overlay state: recommendation run deck (issue #35). ---
    const recShelf = await findEnabledRecommendShelf(page, baseUrl);
    if (recShelf) {
      const state = await openRecommendDeck(page, recShelf);
      console.log(`\n[e2e] recommend deck opened on "${recShelf}" — runStatus reached: ${state}.`);
      audits.push(await auditSurface(page, `/library — recommend deck (${recShelf}, ${state})`));
    } else {
      console.log(
        "\n— /library — recommend deck: SKIPPED (Recommend not enabled on books/watch: " +
          "gateway unconfigured or too few titled items in the QA data).",
      );
    }

    await ctx.close();

    // --- Report. ---
    console.log("\n==================== TAP-TARGET GUARD (WCAG 2.5.8 AA, 24px) ====================");
    let totalTargets = 0;
    let totalFails = 0;
    for (const a of audits) {
      printSurface(a);
      totalTargets += a.results.length;
      totalFails += a.fails.length;
    }
    console.log(
      `\n================================================================================\n` +
        `Total: ${totalTargets} targets across ${audits.length} surfaces, ${totalFails} AA failure(s).`,
    );

    if (totalFails > 0) {
      console.error(`\n✗ Tap-target regression: ${totalFails} target(s) below the WCAG 2.5.8 AA minimum.`);
      process.exitCode = 1;
    } else {
      console.log("\n✓ All measured tap targets clear the WCAG 2.5.8 AA minimum.");
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    killTree(devServer);
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
  // Ensure spawned children don't keep the process alive on a thrown error.
  setTimeout(() => process.exit(process.exitCode ?? 1), 500).unref();
});
