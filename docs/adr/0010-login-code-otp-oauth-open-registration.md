---
status: accepted
---

# Login: code-only email OTP + Google/GitHub OAuth, open registration, magic link removed

We are simplifying sign-in and opening it to the public for launch. The web login
becomes **three methods on one hybrid screen**: **Continue with GitHub**, **Continue
with Google**, and a **6–10 digit email code** as the universal fallback — social
buttons on top, a divider, email below. The **magic link is removed entirely**: no
clickable sign-in link, no `/auth/confirm` interstitial, and the email contains only
the code. Registration is **open** (anyone may create a Profile), protected by
**Cloudflare Turnstile** on the email-send step. `/auth/callback` is kept — it is now
the **OAuth** code-exchange route, not a magic-link route.

This pairs with the launch on Hacker News, Product Hunt, and Reddit.

## Why these choices

- **Code-only email (drop the magic link).** The old flow sent *both* a code and a
  link, which was confusing, and the link path carried extra moving parts (an
  interstitial page to defend against email scanners, plus a server route). The
  one-time **code** is verified client-side in the browser the user started in, so
  there is no "it only works in the same browser" ambiguity and nothing to explain.
  One path, one mental model.
- **Google + GitHub, not the maximal set.** The launch audience is developer-leaning
  (HN especially). GitHub is the highest-signal button for that crowd and Google is
  universal; both are **native Supabase providers** (pure config), and both return a
  **verified email** so identity-linking works. The research is consistent that more
  providers is *worse* (decision paralysis, the "which did I use?" duplicate-account
  problem), so we deliberately ship two plus the email fallback.
- **Open registration relaxes "private", not the data model.** `CONTEXT.md` already
  defines single-user as *per Profile* — the system "holds many" RLS-isolated
  profiles. So opening sign-up adds **no new multi-tenancy** and **no social surface**;
  it does not conflict with ADR 0001. Each new user still gets a private, isolated
  library.
- **Automatic identity linking (Supabase default).** A person who uses Google once and
  GitHub another time — or the email code — collapses into **one Profile**, because
  Supabase auto-links identities that share a *verified* email. Both chosen providers
  return verified emails, so no engineering is needed; we just document the edge
  (a provider returning an *unverified* email would create a duplicate).
- **Custom SMTP (Resend) is mandatory and already configured.** Supabase's default
  email service *"will refuse to deliver messages to addresses that are not part of the
  team"* and has a very low rate limit — i.e. the email code would silently fail for
  exactly the public users we are launching to. Resend (already used for the digest)
  is wired as custom SMTP.
- **Turnstile CAPTCHA on the email-send step.** Open registration plus a working email
  pipe is a free-email-sending machine for bots. Turnstile is free, native to Supabase,
  invisible to most real users, and gates only `signInWithOtp` — `signInWithOAuth` is a
  redirect and is not captcha-gated, so Google/GitHub stay one-click. The cost of
  deferring is asymmetric: discovering abuse via a Resend bill mid-launch is the worst
  time to wire it.

## Considered and rejected

- **Link-only email** — simplest email, but reintroduces the "signed in on the wrong
  browser" problem (clicking in a phone mail app lands the session there, not where you
  started). Rejected.
- **Keep both code and link, just reword** — lowest effort but leaves the confusing
  moving parts (interstitial, dual paths) in place. Rejected.
- **Apple sign-in** — native, but needs a paid Apple Developer account, **a client
  secret that must be regenerated every 6 months or logins break**, name returned only
  once, and *Hide My Email* relay addresses that defeat email-based identity linking
  (→ duplicate empty-library users). Low ROI for a web-only launch. **Deferred** —
  revisit only alongside a future iOS app.
- **Reddit sign-in** — **not a native Supabase provider** and OAuth2-only (no OIDC),
  so it requires a hand-rolled edge-function bridge minting sessions via the admin API,
  with no reliable verified email (→ duplicate accounts). Thematic appeal for the Reddit
  launch does not justify a bespoke auth path we own forever; the Reddit crowd will
  mostly click Google anyway. **Deferred.**
- **Supabase default SMTP** — cannot deliver to public addresses; a launch-killer.
  Rejected in favour of Resend.
- **Ship without CAPTCHA, add it if abuse appears** — viable but asymmetric risk on a
  public launch with the owner's name on it. Rejected in favour of shipping Turnstile.

## Consequences / follow-ups

- Update `AGENTS.md` (the "Single user, private; no multi-tenant" product constraint and
  the auth-flow description) and `CONTEXT.md` (sign-in vocabulary) to match.
- `src/app/auth/confirm/` is deleted; `src/app/auth/callback/route.ts` keeps only the
  OAuth `code` → `exchangeCodeForSession` branch (the `token_hash`/magic-link branch can
  go).
- Operational setup is tracked in `docs/login-redesign-runbook.md`.
