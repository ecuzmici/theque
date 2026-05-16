# Sender avatar / logo (free only)

Inbox avatars are chosen by **each mail app** (Gravatar, BIMI, contacts, etc.). Nothing in the HTML template controls the Gmail row icon.

## Already done in this repo

- [x] **`public/bimi-logo.svg`** — Square logo asset you can reference from DNS if you use BIMI (see below). After deploy it will be at **`https://theque.app/bimi-logo.svg`** (and preview URL if you test there).

## Your tasks (manual — accounts / DNS)

### 1. Gravatar (free, ~10 minutes)

Works in **some** clients; **Gmail often ignores Gravatar** for transactional senders, but it’s still worth doing.

1. Create/log in at [gravatar.com](https://gravatar.com).
2. Add **`auth@theque.app`** and confirm the verification email that lands in that inbox.
3. Upload your logo as the image for that email.

### 2. BIMI DNS record (free; logo display varies by inbox)

**Reality check:** **Gmail** usually shows BIMI logos only with extra verification (often a **paid VMC**). **Without VMC**, BIMI is still useful for **some** providers and signals brand consistency — all steps below are free.

Prerequisites you should already aim for on **`theque.app`**:

- **SPF** includes your mail sender (e.g. Resend).
- **DKIM** signing by Resend (aligned with `theque.app`).
- **DMARC** TXT at `_dmarc.theque.app` with something like `v=DMARC1; p=none` at minimum (stricter `quarantine`/`reject` later if you’re confident).

Then add **one BIMI TXT record** (replace domain if needed):

| Type | Name | Value |
|------|------|--------|
| TXT | `default._bimi.theque.app` | `v=BIMI1; l=https://theque.app/bimi-logo.svg` |

1. Deploy so **`https://theque.app/bimi-logo.svg`** returns **200** and **`Content-Type: image/svg+xml`**.
2. Add the TXT record at your DNS host (Cloudflare, Vercel DNS, etc.).
3. Wait for propagation; validate with a public **BIMI checker** (search the web for “BIMI record checker”).

If validation fails, open `public/bimi-logo.svg` and simplify further per the checker’s SVG rules (BIMI is picky).

### 3. Personal Gmail only — Contacts photo (free, instant for you)

This does **not** change how **other people** see the sender; only your own Gmail.

1. In Google Contacts, create a contact for **`auth@theque.app`**.
2. Add a photo (your theque logo).

### 4. Optional — Google Workspace

If **`auth@theque.app`** were a **Google Workspace** user, you could set a profile photo in Admin — not applicable for typical Resend SMTP.

---

**Summary:** Free levers = **Gravatar** + **BIMI (DNS + hosted SVG)** + **your own Gmail Contact**. No code changes left unless you swap the logo file in **`public/bimi-logo.svg`**.
