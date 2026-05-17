import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { sanitizeRedirectPath } from "@/app/login/login-utils";
import type { Database } from "@/lib/database.types";

/** Routes that require a session; must stay in sync with matcher (excluding public entries). */
const PROTECTED_PREFIXES = [
  "/library",
  "/settings",
  "/item",
  "/search",
  "/add",
] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Keep refreshed Supabase cookies when returning a new Response (e.g. redirect). */
function redirectPreservingCookies(from: NextResponse, url: URL): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const { name, value, ...opts } of from.cookies.getAll()) {
    redirect.cookies.set(name, value, opts);
  }
  return redirect;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headersToSet ?? {}).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (user && pathname === "/") {
    return redirectPreservingCookies(response, new URL("/library", request.url));
  }

  if (user && pathname === "/login") {
    const next = request.nextUrl.searchParams.get("next");
    const dest = sanitizeRedirectPath(next);
    return redirectPreservingCookies(response, new URL(dest, request.url));
  }

  if (!user && isProtectedPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    const returnPath = `${pathname}${request.nextUrl.search}`;
    loginUrl.searchParams.set("next", returnPath === "/login" ? "/library" : returnPath);
    return redirectPreservingCookies(response, loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/login/:path*",
    "/library",
    "/library/:path*",
    "/settings",
    "/settings/:path*",
    "/item/:path*",
    "/search",
    "/search/:path*",
    "/add",
    "/add/:path*",
  ],
};
