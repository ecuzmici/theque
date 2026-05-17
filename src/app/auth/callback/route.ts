import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { Database } from "@/lib/database.types";

function sanitizeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/library";
  }

  return value;
}

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return (
    value === "signup" ||
    value === "invite" ||
    value === "magiclink" ||
    value === "recovery" ||
    value === "email_change" ||
    value === "email"
  );
}

async function finishAuthCallback({
  origin,
  code,
  tokenHash,
  type,
  oauthError,
  oauthDescription,
  next,
  redirectStatus = 307,
}: {
  origin: string;
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  oauthError: string | null;
  oauthDescription: string | null;
  next: string;
  redirectStatus?: 303 | 307;
}) {
  if (oauthError) {
    console.error("[auth/callback] oauth error:", oauthError, oauthDescription);
    return NextResponse.redirect(
      `${origin}/login?error=auth&reason=${encodeURIComponent(oauthError)}`,
      { status: redirectStatus },
    );
  }

  if (!code && (!tokenHash || !isEmailOtpType(type))) {
    return NextResponse.redirect(`${origin}/login?error=auth&reason=missing_code`, {
      status: redirectStatus,
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(`${origin}/login?error=auth&reason=missing_env`, {
      status: redirectStatus,
    });
  }

  const cookieStore = await cookies();
  const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = [];
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookies, headers) {
        cookiesToSet.push(...cookies);
        cacheHeaders = headers ?? {};
      },
    },
  });

  let exchangeError: Error | null = null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    exchangeError = error;
  } else if (tokenHash && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    exchangeError = error;
  }

  if (exchangeError) {
    console.error("[auth/callback] session exchange:", exchangeError.message);
    return NextResponse.redirect(
      `${origin}/login?error=auth&reason=${encodeURIComponent(exchangeError.message)}`,
      { status: redirectStatus },
    );
  }

  const response = NextResponse.redirect(`${origin}${next}`, { status: redirectStatus });
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  return finishAuthCallback({
    origin,
    code: searchParams.get("code"),
    tokenHash: searchParams.get("token_hash"),
    type: searchParams.get("type"),
    oauthError: searchParams.get("error"),
    oauthDescription: searchParams.get("error_description"),
    next: sanitizeRedirectPath(searchParams.get("next")),
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const tokenHash = formData.get("token_hash");
  const type = formData.get("type");
  const next = formData.get("next");
  const { origin } = new URL(request.url);

  return finishAuthCallback({
    origin,
    code: null,
    tokenHash: typeof tokenHash === "string" ? tokenHash : null,
    type: typeof type === "string" ? type : null,
    oauthError: null,
    oauthDescription: null,
    next: sanitizeRedirectPath(typeof next === "string" ? next : null),
    redirectStatus: 303,
  });
}

export function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
    },
  });
}
