/**
 * Public unsubscribe endpoint for the weekly letter.
 *
 * The recipient has no session — the unguessable `profiles.unsubscribe_token`
 * is the only credential, exactly like the one-tap rating links. It is not
 * matched by `src/middleware.ts`'s protected prefixes, so no auth guard can
 * bounce someone away from opting out.
 *
 * Two verbs on purpose:
 *   GET  — the visible link in the letter. Renders a one-button confirmation
 *          instead of unsubscribing outright, because mail scanners and
 *          prefetchers follow links in email and would otherwise silently turn
 *          someone's letter off.
 *   POST — the write. Unsubscribes immediately with no confirmation step, which
 *          is what RFC 8058 one-click (`List-Unsubscribe-Post`) requires; the
 *          confirmation form above posts to the same URL.
 *
 * Served as a route handler rather than a page so both verbs can live at one
 * path; the HTML is a self-contained document with inline styles.
 */
import { disableDigestByUnsubscribeToken, createProfilesAdminClient } from "@/lib/profiles/profiles";

// Writes on POST and must never be cached or prerendered.
export const dynamic = "force-dynamic";

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  // These URLs carry a credential — keep them out of search indexes entirely.
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(heading: string, body: string, action?: string): string {
  const form = action
    ? `<form method="post" action="${escapeHtml(action)}" style="margin-top:24px;">
         <button type="submit" style="font-family:Georgia,serif;font-size:16px;padding:12px 20px;min-height:44px;border-radius:10px;border:0;background:#1c1917;color:#faf6ef;cursor:pointer;">Unsubscribe</button>
       </form>`
    : "";

  return `<!doctype html><html lang="en"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>thèque</title>
</head><body style="margin:0;background:#faf6ef;font-family:Georgia,serif;color:#1c1917;">
  <main style="max-width:420px;margin:0 auto;padding:15vh 20px 40px;text-align:center;">
    <h1 style="font-size:22px;margin:0;">${escapeHtml(heading)}</h1>
    <p style="color:#78716c;font-size:15px;line-height:1.6;">${body}</p>
    ${form}
    <p style="margin-top:32px;font-size:13px;"><a href="/settings" style="color:#b45309;">Change it in settings</a></p>
  </main>
</body></html>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return new Response(
    page(
      "Stop the weekly letter?",
      "Your library stays exactly as it is — only the weekly email stops. You can turn it back on any time.",
      `/unsubscribe/${encodeURIComponent(token)}`,
    ),
    { headers: HTML_HEADERS },
  );
}

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let ok = false;
  try {
    ok = await disableDigestByUnsubscribeToken(createProfilesAdminClient(), token);
  } catch (error) {
    console.error("[unsubscribe] admin_client_unavailable:", (error as Error).message);
  }

  if (!ok) {
    return new Response(
      page(
        "We couldn't find that link",
        "It may already have been used, or the address was cut short by your email app. You can also turn the letter off from settings.",
      ),
      { status: 404, headers: HTML_HEADERS },
    );
  }

  return new Response(
    page(
      "Unsubscribed",
      "You won't get the weekly letter any more. Your library is untouched.",
    ),
    { headers: HTML_HEADERS },
  );
}
