# Login redesign — implementation runbook

Decision record: [`docs/adr/0010-login-code-otp-oauth-open-registration.md`](adr/0010-login-code-otp-oauth-open-registration.md).

**Goal:** one hybrid login screen — **Continue with GitHub**, **Continue with Google**,
and an **email code** fallback — with the magic link removed and registration open to
the public, protected by Cloudflare Turnstile.

```
        thèque
 ┌─────────────────────────┐
 │  Continue with GitHub    │   ← lead with GitHub (HN audience)
 │  Continue with Google    │
 ├──────── or ─────────────┤
 │  Email  [____________]   │   ← Turnstile widget here
 │      Send sign-in code   │
 └─────────────────────────┘
```

---

## Who does what

Three buckets. Only **Bucket B** needs you, and most of it is unavoidable because it
lives in third-party consoles.

### Bucket A — code (Claude does this, no MCP needed)

- [ ] Login page (`src/app/login/page.tsx`): add **Continue with GitHub** / **Continue
      with Google** buttons calling `supabase.auth.signInWithOAuth({ provider, options:{
      redirectTo: ${origin}/auth/callback?next=… } })`; keep the email step as the
      code path; add the Turnstile widget to the email step.
- [ ] Turnstile: `npm i @marsidev/react-turnstile`, render
      `<Turnstile siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} onSuccess={setCaptchaToken} />`,
      pass `options:{ captchaToken }` to `signInWithOtp`, reset after each send.
- [ ] Remove `emailRedirectTo` from `signInWithOtp` (no more clickable link).
- [ ] Delete `src/app/auth/confirm/` (the magic-link interstitial).
- [ ] Trim `src/app/auth/callback/route.ts` to the OAuth `code` → `exchangeCodeForSession`
      branch (drop the `token_hash`/magic-link branch).
- [ ] Rewrite `supabase/templates/magic_link.html` to **code-only** (remove the
      "Open thèque instead" button and the two `token_hash` links; keep `{{ .Token }}`).
- [ ] `.env.local.example`: add `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- [ ] Update `AGENTS.md` (auth-flow section + drop the "single user, private" framing)
      and `CONTEXT.md` (sign-in vocabulary).
- [ ] *(Optional, recommended)* extend `scripts/update-supabase-auth.mjs` to also PATCH
      the provider/CAPTCHA/rate-limit auth-config fields, so Bucket B step 4 becomes
      "paste secrets into `.env.local`, run `npm run supabase:sync-auth`" instead of
      dashboard clicking.
- [ ] `npm test` + `npm run build`.

### Bucket B — YOUR PART (third-party consoles + Supabase config) 🔴

These produce credentials no API can generate for you. Do **1–3** to unblock Claude;
do **4–6** after the code is deployed.

1. **GitHub OAuth app** — GitHub → Settings → Developer settings → OAuth Apps → New.
   - Authorization callback URL: `https://jucaqjkgyhyzixzaisjr.supabase.co/auth/v1/callback`
   - Copy **Client ID** + **Client Secret**.
2. **Google OAuth client** — Google Cloud Console → APIs & Services → Credentials →
   OAuth client ID (Web). Configure the consent screen first.
   - Authorized redirect URI: `https://jucaqjkgyhyzixzaisjr.supabase.co/auth/v1/callback`
   - Copy **Client ID** + **Client Secret**.
3. **Cloudflare Turnstile widget** — Cloudflare dash → Turnstile → Add widget.
   - Add domains: `localhost`, `theque.app`, `theque.vercel.app`.
   - Copy **Site key** (→ Claude, becomes `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) and
     **Secret key** (→ Supabase, step 6).
4. **Enable providers in Supabase** — Dashboard → Authentication → Providers → enable
   **GitHub** and **Google**, paste each Client ID + Secret. *(Or run the extended
   sync script from Bucket A.)*
5. **Raise the auth email rate limit** — Dashboard → Authentication → Rate Limits →
   raise "emails per hour" well above the default ~30 for a launch spike. (Resend can
   send more; Supabase throttles first.)
6. **Enable CAPTCHA** — Dashboard → Authentication → Bot and Abuse Protection → Enable
   CAPTCHA → provider **Turnstile** → paste the **Secret key** → Save.

### Bucket C — already done ✅

- Custom SMTP via **Resend** (the email code will actually deliver to strangers).
- `/auth/callback` is already in the Supabase redirect allow-list for all three hosts.

---

## ⚠️ Ordering gotcha — do not flip CAPTCHA early

**Step 6 (enable CAPTCHA) must come AFTER the Turnstile frontend is deployed.** If you
turn on CAPTCHA in Supabase before the login page is sending a `captchaToken`, Supabase
rejects every `signInWithOtp` call and **email login breaks for everyone**. Safe order:

```
You: B1, B2, B3  ─►  Claude: Bucket A (needs the Site key from B3)
        ─►  You: B4 (providers)  ─►  deploy  ─►  set NEXT_PUBLIC_TURNSTILE_SITE_KEY in Vercel
        ─►  You: B5 (rate limit)  ─►  You: B6 (CAPTCHA, last)  ─►  push email template
```

Push the rewritten email template last via `npm run supabase:sync-auth` (it PATCHes the
hosted magic-link template + subject; needs `SUPABASE_ACCESS_TOKEN`).

---

## Notes & edges

- **Identity linking is automatic.** Google + GitHub both return verified emails, so all
  methods for one person fold into one Profile. Edge: a provider returning an *unverified*
  email creates a duplicate — documented, not engineered around.
- **OAuth is not captcha-gated** — only the email-send step is, so social sign-in stays
  one-click.
- **Local Turnstile testing** — either add `localhost` to the widget allowlist (step 3)
  or use Cloudflare's test sitekeys.
- **Deferred providers:** Apple (paid acct + 6-month secret rotation + Hide-My-Email
  breaks linking) and Reddit (no native support, no verified email). See ADR 0010.
