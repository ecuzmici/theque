import type { NextConfig } from "next";

function getSupabaseConnectSources(): string[] {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }

  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    return [url.origin, `wss://${url.host}`];
  } catch {
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }
}

const supabaseConnectSources = getSupabaseConnectSources();
const scriptSrc = [
  "script-src",
  "'self'",
  "'unsafe-inline'",
  ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
  "https://va.vercel-scripts.com",
  // Cloudflare Turnstile (login CAPTCHA) — loads its script and renders in an iframe.
  "https://challenges.cloudflare.com",
].join(" ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      scriptSrc,
      // Cloudflare Turnstile renders its challenge inside an iframe.
      "frame-src 'self' https://challenges.cloudflare.com",
      `connect-src 'self' ${supabaseConnectSources.join(" ")} https://vitals.vercel-insights.com https://challenges.cloudflare.com`,
      "upgrade-insecure-requests",
    ].join("; "),
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // The service worker must always be revalidated so installs pick up new
        // versions promptly, and be served as JavaScript.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
