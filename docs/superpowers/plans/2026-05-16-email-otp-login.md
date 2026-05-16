# Email OTP Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mobile sign-in smoother by making email OTP entry the primary login path while keeping the existing magic-link callback as a fallback.

**Architecture:** Theque continues to use Supabase Auth as the source of truth for OTP generation, verification, sessions, and cookies. The login page becomes a two-step client flow: request an email OTP with `signInWithOtp`, then verify the copied code with `verifyOtp({ email, token, type: "email" })`; the existing `/auth/callback` route remains for users who click the email link. Resend is used only as Supabase's SMTP delivery provider, not as the OTP authority.

**Tech Stack:** Next.js App Router, React client components, TypeScript, `@supabase/ssr`, `@supabase/supabase-js`, Supabase Auth email templates, Resend SMTP, Vitest/ESLint.

**References:**
- Supabase email passwordless docs: `https://supabase.com/docs/guides/auth/auth-email-passwordless`
- Supabase email template variables: `https://supabase.com/docs/guides/auth/auth-email-templates`
- Supabase Auth rate limits: `https://supabase.com/docs/guides/auth/rate-limits`
- Resend SMTP dashboard/docs for SMTP credentials and disabled click tracking.

---

## File Structure

- Modify `src/app/login/page.tsx`: convert the single magic-link form into a two-step email OTP form.
- Keep `src/app/auth/callback/route.ts`: no code change expected; it remains the magic-link fallback endpoint.
- Modify `supabase/templates/magic_link.html`: show `{{ .Token }}` prominently and keep `{{ .ConfirmationURL }}` as the secondary fallback CTA.
- Modify `supabase/config.toml`: update the local template subject to match the OTP-first flow.
- Optionally modify `scripts/update-supabase-auth.mjs`: extend the existing Management API helper to sync the hosted magic-link subject/content from the local template.
- Optionally modify `README.md` or create `docs/auth-email-otp.md`: document dashboard steps for Supabase and Resend.

---

## Task 1: Confirm Auth Provider Configuration

**Files:**
- No repo changes required in this task.

- [ ] **Step 1: Confirm Supabase email provider state**

Open Supabase Dashboard for project `jucaqjkgyhyzixzaisjr` (`theque`) and check:

```text
Authentication -> Providers -> Email
Email provider enabled: yes
Confirm email: acceptable either way for the current single-user PoC
Email OTP expiration: choose 300-600 seconds
```

Expected: Email auth remains enabled and OTP expiry is short enough to be safe but long enough for mobile app switching.

- [ ] **Step 2: Confirm Auth rate limits**

Open:

```text
Authentication -> Rate Limits
```

Recommended values for PoC:

```text
OTP requests per hour: keep Supabase default unless testing requires more
OTP resend period: keep default or set 60 seconds
Verification requests: keep default
```

Expected: Users cannot spam resend, and verify attempts return `429 Too Many Requests` when Supabase limits are exceeded.

- [ ] **Step 3: Configure Resend as Supabase SMTP**

In Resend, create or verify the sending domain used by Theque. In Supabase Dashboard, configure custom SMTP using Resend credentials:

```text
Authentication -> SMTP Settings
Sender email: sign-in@<verified-domain>
Sender name: Theque
Host: smtp.resend.com
Port: 465 or 587, matching Resend's current SMTP docs
Username: resend
Password: <Resend SMTP/API credential from dashboard>
```

Disable Resend click tracking for auth emails if available. Supabase warns that link rewriting can break `{{ .ConfirmationURL }}`.

Expected: Supabase still generates OTPs and sessions; Resend only delivers the email.

---

## Task 2: Update the Email Template for OTP-First Sign-In

**Files:**
- Modify: `supabase/templates/magic_link.html`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Update the local subject**

In `supabase/config.toml`, change:

```toml
[auth.email.template.magic_link]
subject = "Welcome to — theque"
content_path = "./supabase/templates/magic_link.html"
```

to:

```toml
[auth.email.template.magic_link]
subject = "Your Theque sign-in code"
content_path = "./supabase/templates/magic_link.html"
```

Expected: Local Supabase email previews and generated emails use OTP-first language.

- [ ] **Step 2: Change template headline and intro copy**

In `supabase/templates/magic_link.html`, change the existing magic-link framing from:

```html
Email sign-in
Finish signing in
Tap the button to open your library. For your security, this link expires soon and works only once.
```

to copy with this meaning:

```html
Email sign-in
Your sign-in code
Copy this code into Theque. For your security, it expires soon and works only once.
```

Expected: The email tells mobile users to copy a code, not primarily tap a link.

- [ ] **Step 3: Add a prominent OTP block**

Add this block above the existing CTA table, adapting inline styles to the surrounding template:

```html
<div
  style="
    margin: 0 0 28px 0;
    padding: 18px 20px;
    border: 1px dashed #d97706;
    border-radius: 16px;
    background-color: #fffbeb;
    text-align: center;
  "
>
  <p
    style="
      margin: 0 0 8px 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #92400e;
      line-height: 1.4;
    "
  >
    One-time code
  </p>
  <p
    style="
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace;
      font-size: 34px;
      font-weight: 800;
      letter-spacing: 0.22em;
      color: #1c1917;
      line-height: 1.2;
    "
  >
    {{ .Token }}
  </p>
</div>
```

Expected: Mobile users can select/copy the 6-digit OTP easily.

- [ ] **Step 4: Demote the magic-link CTA to fallback language**

Keep the existing anchor `href="{{ .ConfirmationURL }}"`, but update nearby labels:

```html
Open Theque instead
```

Add fallback explanatory copy below it:

```html
If copying the code is inconvenient, this button opens Theque and signs you in directly.
```

Expected: Desktop users still have a one-click path, and mobile users have a reliable code path.

- [ ] **Step 5: Sync the hosted Supabase template**

For production, copy the resulting HTML into:

```text
Supabase Dashboard -> Authentication -> Email Templates -> Magic Link
Subject: Your Theque sign-in code
Body: contents of supabase/templates/magic_link.html
```

Expected: Production emails include both `{{ .Token }}` and `{{ .ConfirmationURL }}`.

---

## Task 3: Add the Two-Step OTP Flow to the Login Page

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Add login state for the OTP step**

Inside `LoginForm`, keep `email`, `status`, and `message`, and add:

```tsx
const [step, setStep] = useState<"email" | "code">("email");
const [token, setToken] = useState("");
```

Expected: The component can switch from email entry to code entry without navigating away.

- [ ] **Step 2: Update the send handler copy and state transition**

Keep the existing `signInWithOtp` call with `emailRedirectTo` so magic links still work:

```tsx
const supabase = createClient();
const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

const { error } = await supabase.auth.signInWithOtp({
  email: email.trim(),
  options: { emailRedirectTo: redirectTo },
});
```

After success, replace the current success state with:

```tsx
setStatus("sent");
setStep("code");
setMessage("Check your email for a 6-digit code. You can also use the sign-in button in the email.");
```

Expected: Sending an email moves the user to the code-entry UI while preserving the magic-link fallback.

- [ ] **Step 3: Add a verify handler**

Add this handler inside `LoginForm`:

```tsx
async function handleVerify(e: React.FormEvent) {
  e.preventDefault();
  const normalizedEmail = email.trim();
  const normalizedToken = token.replace(/\D/g, "");

  if (normalizedToken.length !== 6) {
    setStatus("error");
    setMessage("Enter the 6-digit code from your email.");
    return;
  }

  setStatus("loading");
  setMessage(null);

  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedToken,
    type: "email",
  });

  if (error) {
    setStatus("error");
    setMessage(error.message);
    return;
  }

  window.location.assign(next);
}
```

Expected: A valid OTP creates a Supabase browser session and sends the user to the requested destination.

- [ ] **Step 4: Render the email form only in the email step**

Wrap the current email form with:

```tsx
{step === "email" ? (
  <form onSubmit={handleSubmit} className="space-y-4" aria-describedby="login-description">
    {/* existing email field and submit button */}
  </form>
) : null}
```

Change the button label to:

```tsx
{status === "loading" ? "Sending..." : "Send sign-in code"}
```

Expected: First screen communicates OTP-first sign-in.

- [ ] **Step 5: Render the code form in the code step**

Add this form below the email form:

```tsx
{step === "code" ? (
  <form onSubmit={handleVerify} className="space-y-4" aria-describedby="login-description">
    <div className="grid gap-2">
      <Label htmlFor="token">Sign-in code</Label>
      <Input
        id="token"
        type="text"
        required
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={token}
        onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="123456"
        className="h-12 rounded-xl text-center font-mono text-xl tracking-[0.3em]"
      />
    </div>
    <Button type="submit" className="h-11 w-full min-h-11 text-base" disabled={status === "loading"}>
      {status === "loading" ? "Checking..." : "Continue to library"}
    </Button>
    <Button
      type="button"
      variant="ghost"
      className="h-11 w-full"
      disabled={status === "loading"}
      onClick={() => {
        setStep("email");
        setToken("");
        setStatus("idle");
        setMessage(null);
      }}
    >
      Use a different email
    </Button>
  </form>
) : null}
```

Expected: iOS and Android can offer OTP autofill because the input uses `autoComplete="one-time-code"` and numeric input mode.

- [ ] **Step 6: Add a resend action**

Add a small resend button in the code step that reuses `handleSubmit` through a helper, or refactor the send logic into:

```tsx
async function sendOtp() {
  setStatus("loading");
  setMessage(null);

  const supabase = createClient();
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });

  if (error) {
    setStatus("error");
    setMessage(error.message);
    return false;
  }

  setStatus("sent");
  setStep("code");
  setMessage("Check your email for a 6-digit code. You can also use the sign-in button in the email.");
  return true;
}
```

Then make `handleSubmit` call:

```tsx
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  await sendOtp();
}
```

Expected: The resend path uses the same Supabase rate limits and error messages as the initial send.

---

## Task 4: Preserve and Test the Magic-Link Fallback

**Files:**
- Keep: `src/app/auth/callback/route.ts`
- Modify only if manual testing reveals a callback issue.

- [ ] **Step 1: Confirm callback route remains compatible**

Do not remove `emailRedirectTo` from `signInWithOtp`, and do not remove `{{ .ConfirmationURL }}` from the email template.

Expected: Clicking `Open Theque instead` still reaches:

```text
/auth/callback?next=<encoded-path>&code=<auth-code>
```

- [ ] **Step 2: Manual callback test**

Run the app:

```bash
npm run dev
```

Expected: Next.js starts on `http://localhost:3000`.

Request a sign-in email, click the fallback link, and verify the app redirects to:

```text
/library
```

Expected: No `?error=auth` appears in the URL.

---

## Task 5: Optional Management API Sync for Hosted Supabase

**Files:**
- Optionally modify: `scripts/update-supabase-auth.mjs`

- [ ] **Step 1: Extend the script to read the local template**

Add this near the top after token resolution:

```js
const magicLinkTemplate = fs.readFileSync("supabase/templates/magic_link.html", "utf8");
```

- [ ] **Step 2: Include mailer fields in the existing auth PATCH**

Extend the existing body in the `PATCH /config/auth` request:

```js
body: JSON.stringify({
  site_url: "https://theque.vercel.app",
  uri_allow_list: allow.join(","),
  mailer_subjects_magic_link: "Your Theque sign-in code",
  mailer_templates_magic_link_content: magicLinkTemplate,
}),
```

Expected: `npm run supabase:sync-auth` updates redirect URLs and the hosted magic-link email template in one command.

- [ ] **Step 3: Run the sync script only with a valid Management API token**

Run:

```powershell
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
npm run supabase:sync-auth
```

Expected output includes:

```text
PATCH_AUTH 200
PATCH_PROJECT 200
OK
```

Do not commit `.env.local` or any access token.

---

## Task 6: Verification

**Files:**
- Verify: `src/app/login/page.tsx`
- Verify: `supabase/templates/magic_link.html`
- Verify: `supabase/config.toml`

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: no new lint errors.

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

Expected: extension TypeScript build and Next.js build both pass.

- [ ] **Step 3: Test OTP login locally**

Start dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/login?next=/library
```

Flow:

```text
Enter email -> Send sign-in code -> copy {{ .Token }} from delivered email -> paste into Sign-in code -> Continue to library
```

Expected: user lands on `/library` and remains authenticated after refresh.

- [ ] **Step 4: Test fallback link locally or in production**

Flow:

```text
Enter email -> Send sign-in code -> click Open Theque instead in email
```

Expected: `/auth/callback` exchanges the code and redirects to `/library`.

- [ ] **Step 5: Test resend and invalid-code behavior**

Use an invalid 6-digit code:

```text
000000
```

Expected: Supabase returns an auth error and the login page shows the error without clearing the email.

Click resend before the rate-limit window expires.

Expected: Supabase may return a rate-limit message; the UI shows it via `setMessage(error.message)`.

---

## Completion Criteria

- The login page's primary copy says "sign-in code", not "magic link".
- The email template displays `{{ .Token }}` prominently.
- The email template still includes a secondary `{{ .ConfirmationURL }}` fallback link.
- `verifyOtp({ email, token, type: "email" })` signs the user in from the login page.
- Resend is configured as Supabase SMTP, with link/click tracking disabled for auth emails if available.
- Supabase OTP expiry and resend rate limits are reviewed in Dashboard.
- `npm run lint` and `npm run build` pass.

