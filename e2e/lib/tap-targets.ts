/**
 * Shared contract + helpers for the mobile tap-target regression guard.
 *
 * WCAG 2.5.8 Target Size (Minimum), Level AA — 24x24 CSS px, applying the
 * spec's exceptions (spacing / undisturbed-circle, inline link, user-agent
 * default control). See `docs/a11y/touch-targets.md` and ADR 0006
 * (`docs/adr/0006-touch-target-policy-wcag-258-aa.md`).
 *
 * The measurement contract lives in EXACTLY ONE place (`measureTapTargetsInPage`)
 * so issue #35 can extend coverage to overlay states (item-actions menu,
 * recommend deck) by importing these helpers — never by re-deriving thresholds.
 */
import fs from "node:fs";

import type { Page } from "playwright";

/** WCAG 2.5.8 AA minimum target dimension, in CSS px. This is the bar we enforce. */
export const TAP_TARGET_AA_MIN = 24;

/** WCAG 2.5.5 AAA comfort target. Reported for context, but NOT enforced. */
export const TAP_TARGET_COMFORT = 44;

export type TapTargetVerdict = "PASS" | "FAIL";

export interface TapTargetResult {
  /** Human-readable description of the element (tag, id, classes, role, label/text). */
  target: string;
  width: number;
  height: number;
  minDim: number;
  /** Nearest centre-to-centre distance to another candidate target, or null if alone. */
  nearestCenter: number | null;
  verdict: TapTargetVerdict;
  reason: string;
  /** Below the 44px comfort target (reported only — not a failure). */
  belowComfort: boolean;
}

/**
 * Runs INSIDE the browser (serialized into `page.evaluate`). Must be fully
 * self-contained — no closure over module-level values; thresholds come in via
 * `opts`. This is the single source of truth for the AA contract + exceptions.
 */
export function measureTapTargetsInPage(opts: { aaMin: number; comfort: number }): TapTargetResult[] {
  const { aaMin, comfort } = opts;

  const SELECTOR = [
    "button",
    "a[href]",
    '[role="button"]',
    '[role="link"]',
    "input",
    "select",
    "textarea",
    '[data-slot="button"]',
    '[role="menuitem"]',
    '[role="menuitemradio"]',
    '[role="menuitemcheckbox"]',
    '[role="tab"]',
    '[role="option"]',
    '[role="switch"]',
    '[role="checkbox"]',
    '[role="radio"]',
    "summary",
  ].join(",");

  const nodes = Array.from(document.querySelectorAll(SELECTOR)) as HTMLElement[];

  // Exclude elements that are not real, visible layout boxes: display:none,
  // visibility:hidden/collapse, zero/<=1px boxes (Base UI form-proxy inputs and
  // focus-guard spans collapse to these), and pointer-events:none decorations.
  function isRendered(el: HTMLElement): boolean {
    const cs = getComputedStyle(el);
    if (cs.display === "none") return false;
    if (cs.visibility === "hidden" || cs.visibility === "collapse") return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    return true;
  }

  const candidates = nodes.filter(isRendered).map((el) => {
    const r = el.getBoundingClientRect();
    return { el, rect: r, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });

  function nearestCenterDist(i: number): number {
    const a = candidates[i];
    let best = Infinity;
    for (let j = 0; j < candidates.length; j++) {
      if (j === i) continue;
      const b = candidates[j];
      const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      if (d < best) best = d;
    }
    return best;
  }

  // Inline-link exception: an <a> laid out inline (in a sentence / text flow) has
  // its box size constrained by the surrounding line-height — CSS ignores
  // width/height on inline non-replaced elements. This is exactly the spec
  // carve-out the `link` button variant opts into via `pointer-coarse:!min-h-0`.
  function isInlineAnchor(el: HTMLElement): boolean {
    if (el.tagName !== "A") return false;
    return getComputedStyle(el).display === "inline";
  }

  // User-agent default exception: a native control with no author styling that
  // overrides its intrinsic size.
  function isUaDefaultControl(el: HTMLElement): boolean {
    const tag = el.tagName;
    if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") return false;
    const cls = (el.getAttribute("class") || "").trim();
    if (cls.length) return false;
    const style = el.getAttribute("style");
    if (style && /(width|height|min-|padding)/i.test(style)) return false;
    return true;
  }

  function describe(el: HTMLElement): string {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const slot = el.getAttribute("data-slot");
    const role = el.getAttribute("role");
    const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const aria = el.getAttribute("aria-label");
    let s = tag + id + (cls ? `.${cls}` : "") + (role ? `[role=${role}]` : "") + (slot ? `[data-slot=${slot}]` : "");
    if (aria) s += ` aria="${aria.slice(0, 40)}"`;
    else if (text) s += ` "${text}"`;
    return s;
  }

  const r1 = (n: number) => Math.round(n * 10) / 10;

  return candidates.map((c, i) => {
    const { el, rect } = c;
    const minDim = Math.min(rect.width, rect.height);
    const dist = nearestCenterDist(i);

    let verdict: TapTargetVerdict = "FAIL";
    let reason = "";
    if (minDim >= aaMin) {
      verdict = "PASS";
      reason = `size ${r1(rect.width)}x${r1(rect.height)} >= ${aaMin}`;
    } else if (isInlineAnchor(el)) {
      verdict = "PASS";
      reason = "inline-link exception (size constrained by line-height)";
    } else if (isUaDefaultControl(el)) {
      verdict = "PASS";
      reason = "user-agent default control exception";
    } else if (dist >= aaMin) {
      verdict = "PASS";
      reason = `spacing exception (nearest centre ${r1(dist)}px >= ${aaMin})`;
    } else {
      reason = `minDim ${r1(minDim)}px < ${aaMin} and nearest centre ${dist === Infinity ? "none" : `${r1(dist)}px`} < ${aaMin}`;
    }

    return {
      target: describe(el),
      width: r1(rect.width),
      height: r1(rect.height),
      minDim: r1(minDim),
      nearestCenter: dist === Infinity ? null : r1(dist),
      verdict,
      reason,
      belowComfort: minDim < comfort,
    };
  });
}

export interface SurfaceAudit {
  label: string;
  results: TapTargetResult[];
  fails: TapTargetResult[];
  belowComfort: TapTargetResult[];
}

/**
 * Critical acceptance criterion: if the coarse-pointer emulation is not active,
 * the `pointer-coarse` Tailwind floors never apply and the guard would pass
 * vacuously. Fail LOUDLY instead.
 */
export async function assertCoarsePointer(page: Page, label: string): Promise<void> {
  const coarse = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
  if (!coarse) {
    throw new Error(
      `[${label}] pointer: coarse is NOT active. The mobile/touch emulation is misconfigured — ` +
        `use a coarse-pointer device context (iPhone 13) so the coarse-pointer tap floors apply. Refusing to pass vacuously.`,
    );
  }
}

/** Measure the currently-loaded page after asserting the coarse-pointer invariant. */
export async function auditSurface(page: Page, label: string): Promise<SurfaceAudit> {
  await assertCoarsePointer(page, label);
  const results = await page.evaluate(measureTapTargetsInPage, {
    aaMin: TAP_TARGET_AA_MIN,
    comfort: TAP_TARGET_COMFORT,
  });
  return {
    label,
    results,
    fails: results.filter((r) => r.verdict === "FAIL"),
    belowComfort: results.filter((r) => r.belowComfort),
  };
}

/** Parse `.env.local` the same way `scripts/qa-local-session-url.mjs` does. */
export function readEnvLocal(): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!fs.existsSync(".env.local")) return vars;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return vars;
}

/**
 * Authenticate the browser context without sending email, via the dev-only
 * QA session route (same mechanism as `npm run qa:session-url`). The route sets
 * Supabase cookies on a redirect to `next`; afterwards the context is signed in.
 */
export async function authenticate(page: Page, baseUrl: string, secret: string): Promise<void> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/dev/qa-session?secret=${encodeURIComponent(secret)}&next=${encodeURIComponent("/library")}`;
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  // The route 404s outside NODE_ENV=development and 401s on a bad secret.
  if (response && response.status() >= 400 && page.url().includes("/api/dev/qa-session")) {
    throw new Error(
      `QA auth failed (HTTP ${response.status()}). The dev server must run under \`next dev\` (NODE_ENV=development) ` +
        `with QA_DEV_SESSION_SECRET + QA_DEV_EMAIL set in .env.local.`,
    );
  }
  await page.waitForURL("**/library", { timeout: 30_000 }).catch(() => {
    /* some setups land directly; the cookie is set regardless */
  });
  // Definitively confirm we are signed in. If the route ever fails by redirecting
  // with a 2xx/3xx (instead of a 4xx) the checks above pass silently and the whole
  // authed walk would measure the login page under authed labels — a vacuous PASS.
  // Hit a guarded route and require we are NOT bounced to /login.
  await page.goto(`${baseUrl.replace(/\/+$/, "")}/library`, { waitUntil: "domcontentloaded" });
  if (/\/login(\?|$)/.test(page.url())) {
    throw new Error(
      `QA auth did not establish a session — landed on ${page.url()} instead of /library. ` +
        `Check QA_DEV_EMAIL points at a real Supabase auth user and the service-role key is set.`,
    );
  }
}
