import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { Database } from "@/lib/database.types";

function sanitizeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/library";
  }

  return value;
}

// OAuth (GitHub, Google) redirects back here with a `code` to exchange for a session.
// The email-code path no longer routes through here — it verifies client-side on /login.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const oauthDescription = searchParams.get("error_description");
  const next = sanitizeRedirectPath(searchParams.get("next"));

  if (oauthError) {
    console.error("[auth/callback] oauth error:", oauthError, oauthDescription);
    return NextResponse.redirect(`${origin}/login?error=auth&reason=${encodeURIComponent(oauthError)}`, {
      status: 307,
    });
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth&reason=missing_code`, { status: 307 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(`${origin}/login?error=auth&reason=missing_env`, { status: 307 });
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] session exchange:", error.message);
    return NextResponse.redirect(`${origin}/login?error=auth&reason=${encodeURIComponent(error.message)}`, {
      status: 307,
    });
  }

  const response = NextResponse.redirect(`${origin}${next}`, { status: 307 });
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}
