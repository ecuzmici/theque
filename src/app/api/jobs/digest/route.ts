import { timingSafeEqual } from "node:crypto";

import { parseBearerToken } from "@/lib/auth/capture-token";
import { formatCategory } from "@/lib/item-labels";
import { createAdminClient } from "@/lib/supabase/admin";

const DIGEST_SIZE = 5;
const STALE_AFTER_DAYS = 30;

function hasValidCronSecret(bearer: string | null, secret: string | undefined): boolean {
  if (!bearer || !secret) return false;
  const bearerBuffer = Buffer.from(bearer);
  const secretBuffer = Buffer.from(secret);
  return bearerBuffer.length === secretBuffer.length && timingSafeEqual(bearerBuffer, secretBuffer);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type DigestItem = {
  id: string;
  title: string | null;
  domain: string;
  category: string | null;
  created_at: string;
};

function renderDigestHtml(items: DigestItem[], appUrl: string): string {
  const rows = items
    .map((item) => {
      const title = escapeHtml(item.title ?? item.domain);
      const meta = escapeHtml(
        `${formatCategory(item.category as Parameters<typeof formatCategory>[0])} · saved ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(item.created_at))}`,
      );
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #e7e0d6;">
        <a href="${appUrl}/item/${item.id}" style="color:#1c1917;font-size:16px;font-weight:600;text-decoration:none;">${title}</a>
        <div style="color:#78716c;font-size:13px;margin-top:2px;">${meta}</div>
      </td></tr>`;
    })
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#faf6ef;font-family:Georgia,serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <h1 style="font-size:22px;color:#1c1917;margin:0;">thèque — five things you saved and forgot</h1>
    <p style="color:#78716c;font-size:14px;">Still on your shelves, still waiting.</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="margin-top:24px;"><a href="${appUrl}/library?shelf=forgotten" style="color:#b45309;font-size:14px;">Open the Forgotten shelf →</a></p>
  </div></body></html>`;
}

/**
 * GET/POST /api/jobs/digest (cron) — picks the oldest still-wanted items and
 * composes the weekly "saved and forgotten" digest. Sends via Resend when
 * RESEND_API_KEY + DIGEST_EMAIL_TO are configured; otherwise returns the
 * rendered HTML so the cron stays testable without an email provider.
 */
async function handleDigestJob(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = parseBearerToken(req.headers.get("authorization"));
  if (!hasValidCronSecret(bearer, secret)) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86_400_000).toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("items")
    .select("id, title, domain, category, created_at")
    .eq("status", "want")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(DIGEST_SIZE);

  if (error) {
    console.error("[api/jobs/digest] query_failed:", error.message);
    return Response.json({ code: "query_failed" }, { status: 500 });
  }
  if (!data?.length) {
    return Response.json({ sent: false, reason: "nothing_stale" });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://theque.app";
  const html = renderDigestHtml(data, appUrl);

  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.DIGEST_EMAIL_TO;
  if (resendKey && to) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.DIGEST_EMAIL_FROM ?? "theque <digest@theque.app>",
        to: [to],
        subject: "Five things you saved and forgot",
        html,
      }),
    });
    if (!res.ok) {
      console.error("[api/jobs/digest] send_failed:", res.status);
      return Response.json({ code: "send_failed" }, { status: 502 });
    }
    return Response.json({ sent: true, items: data.length });
  }

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request) {
  return handleDigestJob(req);
}

export async function POST(req: Request) {
  return handleDigestJob(req);
}
