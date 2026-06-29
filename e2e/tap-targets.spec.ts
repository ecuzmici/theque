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

import { chromium, devices, type Browser, type BrowserContext } from "playwright";

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
