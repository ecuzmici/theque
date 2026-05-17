import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { sanitizeRedirectPath } from "@/app/login/login-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

function isDevQaEnabled(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  return Boolean(process.env.QA_DEV_SESSION_SECRET);
}

export async function GET(request: Request) {
  if (!isDevQaEnabled()) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const { searchParams, origin } = new URL(request.url);
  const secret = searchParams.get("secret");
  const expected = process.env.QA_DEV_SESSION_SECRET;
  if (!secret || !expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const next = sanitizeRedirectPath(searchParams.get("next"));
  const email = process.env.QA_DEV_EMAIL?.trim();
  if (!email) {
    return NextResponse.json(
      { error: "missing_config", message: "Set QA_DEV_EMAIL in .env.local to your Supabase auth user email." },
      { status: 500 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "missing_env" }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (linkError || !linkData.properties?.email_otp) {
    console.error("[dev/qa-session] generateLink:", linkError?.message);
    return NextResponse.json({ error: "generate_link_failed" }, { status: 500 });
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

  const { error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: "email",
  });

  if (verifyError) {
    console.error("[dev/qa-session] verifyOtp:", verifyError.message);
    return NextResponse.json({ error: "verify_failed" }, { status: 500 });
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}
