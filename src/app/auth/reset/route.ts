import { NextResponse } from "next/server";

import { sanitizeRedirectPath } from "@/app/login/login-utils";

function getSupabaseProjectRef() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  try {
    return new URL(supabaseUrl).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

function expireCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    secure: true,
  });
}

function buildResetPage(redirectTo: string) {
  const redirectLiteral = JSON.stringify(redirectTo);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Resetting sign-in</title>
  </head>
  <body>
    <p>Resetting sign-in state...</p>
    <script>
      try {
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach((cookie) => {
          const name = cookie.split("=")[0].trim();
          if (!name) return;
          document.cookie = name + "=; Max-Age=0; path=/; SameSite=Lax";
        });
      } finally {
        window.location.replace(${redirectLiteral});
      }
    </script>
  </body>
</html>`;
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const next = sanitizeRedirectPath(url.searchParams.get("next"));
  const loginUrl = new URL("/login", url.origin);
  loginUrl.searchParams.set("next", next);
  loginUrl.searchParams.set("reset", "1");

  const response = new NextResponse(buildResetPage(loginUrl.toString()), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
  response.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
  response.headers.set("Cache-Control", "no-store");

  const projectRef = getSupabaseProjectRef();
  if (projectRef) {
    [
      `sb-${projectRef}-auth-token`,
      `sb-${projectRef}-auth-token.0`,
      `sb-${projectRef}-auth-token.1`,
      `sb-${projectRef}-auth-token-code-verifier`,
    ].forEach((cookieName) => expireCookie(response, cookieName));
  }

  return response;
}
