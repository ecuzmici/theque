---
status: accepted
---

# Public-launch posture: repository stays private; security rests on RLS, not secrecy

At product launch (Chrome/Edge stores + web, paired with the open registration of
ADR 0010) we keep the **GitHub repository private** and treat the *running app and
shipped artifacts* — not the source — as the real exposure surface. A pre-launch
review confirmed the security model does **not** depend on the code being secret: it
rests on Supabase **RLS**, server-only secrets, and three production env gates. Two
adjacent decisions came out of the same pass: the public contact address is
de-personalized to **`hello@theque.app`**, and **inbound mail moves from Resend Inbound
to Cloudflare Email Routing**.

## Why these choices

- **The repo stays private; "people will find my code" is moot.** A private GitHub
  repo is not discoverable — there is nothing to search for. Open-sourcing buys nothing
  for the launch (there is no contribution or portfolio goal today) and is opt-in, not
  required. We are launching the *product*, not the source.
- **Security cannot rely on code secrecy — and doesn't.** Even private, parts of the
  code are effectively public: the Chrome/Edge extension ships as readable JS and the
  web client bundle is downloadable. The model was verified to hold under public
  reading: a full-history scan (202 commits) found **no committed secrets** (only a fake
  `bmly_demo…` placeholder); `.env.local` is untracked; **RLS is enabled on all 7
  tables** (30 policies); the identifiers that ship in the bundle (Supabase project ref,
  anon key, prod URLs) are **public-by-design**; and the one session-minting route
  (`src/app/api/dev/qa-session/route.ts`) is **triple-gated** off in the cloud
  (`NODE_ENV === "development"` **and** `VERCEL_ENV !== "production"`, *then* the secret
  check), so it lives only on localhost.
- **Three production env gates are load-bearing — confirmed set.** The rate limiter
  (`src/lib/rate-limit.ts`, Upstash Redis) **fails open**: with `UPSTASH_REDIS_REST_*`
  absent it returns `{ ok: true }` for every request. So real throttling exists only
  because Upstash is configured in Vercel **Production**. Likewise
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (+ secret) gates bot sign-ups and `CRON_SECRET` guards
  the paid enrich/digest jobs. All three were confirmed present in Vercel Production
  before launch.
- **Contact address de-personalized to `hello@theque.app`.** The owner's personal Gmail
  was hardcoded on the public privacy/terms/landing pages and in the Chrome/Edge
  store-listing copy. A public launch multiplies scraping and ties personal identity to
  the product, so it is replaced with a role alias on the owned domain.
- **Inbound mail: Cloudflare Email Routing, not Resend Inbound.** `hello@` needs to
  behave like a normal inbox a human reads and replies to. Resend Inbound (which had
  quietly owned the apex MX via AWS SES — discovered during this review, set up ~May 2026
  while wiring email/branding) is **webhook-only**: forwarding to Gmail would mean
  building and maintaining an app route. Nothing in Theque consumes inbound email, so
  Cloudflare Email Routing (native forwarding, free, no code) is the right tool. Resend
  **sending** (the weekly digest) is untouched — it authenticates on the
  `send.theque.app` subdomain + root DKIM, independent of the apex MX.

## Considered and rejected

- **Open-source the repo at launch** — only worth it with a contribution, portfolio, or
  transparency goal, none of which apply now. The clean security posture keeps this a
  cheap *future* option, not a launch task. **Deferred.**
- **Rely on the repo being private as a security measure** — rejected as
  security-through-obscurity. The shipped extension/bundle already expose front-end code,
  so the model must hold without secrecy (and does, via RLS + server-only secrets).
- **Keep the personal Gmail, reword later** — rejected; the asymmetry (personal inbox
  scraped at launch, owner identity exposed) is cheap to avoid now.
- **Keep Resend Inbound + build a webhook forwarder** — viable only if the *app* later
  needs to ingest email (save-by-email / reply-by-email). No such feature is planned, so
  the code + maintenance cost isn't justified. **Deferred** — revisit if app-side inbound
  becomes a feature, at which point Resend Inbound is the right tool.
- **Read `hello@` in the Resend dashboard** — the inbound dashboard is a developer log,
  awkward to reply from. Rejected for a human support address.

## Consequences / follow-ups

- **DNS swap** (owner, in dashboards — not in this repo): disable Resend Inbound; delete
  the apex `inbound-smtp.eu-west-1.amazonaws.com` MX in Cloudflare; enable Cloudflare
  Email Routing (adds its MX + SPF + DKIM); verify the Gmail destination; route `hello@`
  (and optionally `security@`) → Gmail. There is a short MX-propagation window — do the
  delete → enable back-to-back; sender retries make it low-risk.
- **DMARC**: `rua=mailto:dmarc@theque.app` now lands via Cloudflare — either catch-all it
  to Gmail or ignore the reports. The `p=quarantine` policy is unchanged.
- **Published store listings still need a manual edit**: the code and listing markdown
  now say `hello@theque.app`, but the **live** Chrome Web Store / Edge dashboards (the
  support-email field, plus any screenshot showing the old address) must be updated
  there separately.
- **Keep the prod env gates set**: removing Upstash / Turnstile / `CRON_SECRET` from
  Vercel Production silently disables throttling / bot-protection / job auth (fail-open).
  Treat them as launch-critical configuration.
- **Residual abuse/cost vector**: open registration + paid enrichment means mass account
  creation could drive Gemini/AI-gateway spend even with per-user rate limits — monitor
  billing and consider a global cap. (Relates to ADR 0010's Turnstile rationale.)
- This decision records **posture, not schema** — it changes no tables and no `AGENTS.md`
  product constraints.
