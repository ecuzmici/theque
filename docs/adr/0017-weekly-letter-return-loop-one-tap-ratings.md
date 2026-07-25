---
status: accepted
---

# Close the verdict loop from the inbox: profiles, a per-user weekly letter, and one-tap rating links

thèque's moat is the **verdict loop** — `rating_personal` / `verdict` / `done_at`
feeding a verdict-driven recommender (ADR 0002). Everything downstream of that
loop is good; the loop itself was never closed, because closing it required the
user to *return to the app and perform unrewarded data entry*. That is a negative
flywheel: disengagement → fewer verdicts → thinner taste profile → worse
recommendations → more disengagement. ADR 0016 measured the far end of it
(suppression outgrowing supply); this is the near end.

The product was also write-heavy and read-light in the literal sense: capture had
three clients (extension, capture API, manual add) and there was **no outbound
touchpoint at all**. The weekly digest existed in code and had never run:

- absent from `vercel.json` crons, so it was never invoked;
- its item query carried **no `user_id` filter** — it selected the five oldest
  `want` items across *every* profile;
- it mailed them to a single hardcoded `DIGEST_EMAIL_TO`.

In other words, the only re-engagement channel in the product was, if switched
on, a cross-tenant data leak to the operator's own inbox. And there was no
`profiles` table, so there was nowhere to store "does this person want email"
even in principle.

This ADR records the return loop: `public.profiles` and notification
preferences (W1), stateless one-tap rating links (W3), the pipeline extraction
that lets a session-less cron generate a recommendation (W4), and the per-user
weekly letter that carries them (W2).

## Decisions

### Cadence lives in the job, not in the cron expression

The Vercel cron fires `/api/jobs/digest` **daily** (`0 9 * * *`); the job selects
who is due — `digest_enabled`, `digest_day` matches today's UTC weekday, and
`last_digest_sent_at` is older than `MIN_DIGEST_INTERVAL_DAYS` (6). Three
reasons, in order of weight:

1. **Vercel Hobby allows daily-only cron expressions, max two.** The other slot
   is already `/api/jobs/enrich`. A weekly expression is not available to us at
   all, so this is a constraint before it is a preference.
2. **Retry safety.** A weekly expression that misses its window (deploy, outage,
   cold platform) skips a whole week silently. Daily invocation with an in-job
   due predicate self-heals on the next run.
3. **Per-user weekday** becomes a preference (`profiles.digest_day`) rather than
   a property of the schedule, which a single cron expression cannot express.

`markDigestSent` stamps `last_digest_sent_at` **only after a 2xx from Resend**.
A double cron fire therefore cannot double-send (the second pass sees the stamp
and the profile is no longer due), and a failed send is retried on the next daily
run instead of being silently consumed. The 6-day minimum interval, rather than
7, gives the daily scan a day of slack without ever producing two letters in a
week.

### Rating links write on tap; correction is one more tap

`/rate/<token>` **applies the rating on load** and then confirms, showing the
other four star values one tap away. It does not render a "confirm your rating"
button.

The whole feature exists to remove friction from a single gesture. A confirm page
converts one tap into two and reintroduces exactly the "come back and do data
entry" cost the letter is meant to eliminate. Correctness is bought differently:
the write is idempotent (constrained by `id` **and** `user_id`), `done_at` is
stamped only if absent so a later tap cannot push a completion date forward,
`verdict` and `note` are never touched, and a wrong star costs one tap to fix.
An accidental 3★ is a recoverable, low-stakes error; a lost verdict is the thing
we are actually trying to prevent.

**The asymmetry with unsubscribe is deliberate.** `/unsubscribe/<token>` does the
opposite: `GET` renders a one-button confirmation and writes nothing; `POST`
unsubscribes with no confirmation. Mail scanners, security proxies and link
prefetchers follow every URL in an email — a GET-writes unsubscribe would opt
people out of a letter they never saw. The same prefetch risk exists on `/rate`,
but the outcomes are not symmetric: a prefetched star is correctable from the
page it lands on, whereas a prefetched unsubscribe is invisible and terminal.
POST-unsubscribes-immediately is also what RFC 8058 one-click requires, and the
letter carries `List-Unsubscribe` + `List-Unsubscribe-Post` headers so mailbox
providers show their own unsubscribe button instead of a spam report.

### Stateless HMAC tokens signed over the whole payload, 30-day TTL

`rl.v1.<base64url(itemId:userId:stars:exp)>.<base64url(HMAC-SHA256)>`, keyed on
`RATING_LINK_SECRET`.

- **The link is the credential** — it writes to a library with no session — so
  every field is inside one signature. Signing only the item id (or only the
  payload minus `stars`) would let a recipient swap a 1 for a 5, or swap in
  another item id.
- The `rl.v1` prefix is part of the **signed input**, so a token cannot be
  downgraded to a future, looser version. The convention mirrors `enc.v1` in
  `src/lib/crypto/field-crypto.ts` (ADR 0013) and leaves room for rotation.
- **Verification order is signature → parse.** Untrusted bytes are never decoded
  into fields we then act on. Comparison is constant-time; the star range is
  re-validated at verify, so a token signed by an older or buggy minter still
  cannot write an out-of-range rating.
- **Fail closed.** A missing secret makes minting *throw* and verification
  *fail*; a link is never accepted unsigned. Rotating the secret invalidates
  every link already sitting in an inbox — that is the intended kill switch.
- **TTL is 30 days**, roughly four send cycles. Long enough for "I archived it
  and came back to it", short enough that a forwarded email or a mail-server log
  is not a permanent write handle to someone's library. Correction links
  **inherit the original expiry** rather than minting a fresh one, so tapping
  around the star row cannot slide the window forward indefinitely.

Stateless was chosen over a `rating_links` table because the alternative buys
little and costs a lot: a table needs its own cleanup job, a write on every send
(five rows per prompted item), and it makes the email path depend on a second
piece of durable state that can drift from the letter that was actually sent.
The one thing a table would give us — revocation of an individual link — is
covered adequately by expiry plus secret rotation at this scale.

### The star-correction links are plain `<a>`, not `<Link>`

Next's router prefetches `<Link>` targets that enter the viewport. Since
`/rate/<token>` writes on load, prefetching the correction row would have
rendered all five sibling pages and **written all five ratings in turn**,
leaving whichever finished last. The links are plain anchors for that reason,
and the reason is recorded in the component — it is precisely the kind of
detail a later "let's make this consistent, use `<Link>` everywhere" refactor
would quietly undo.

### `public.profiles`: trigger-owned rows, column-level grants, failure-swallowing triggers

- One row per `auth.users` id, created by `handle_new_user()` (SECURITY DEFINER,
  pinned `search_path`), **never by the client** — there is deliberately no
  insert policy for `authenticated`. Columns: denormalized `email`,
  `digest_enabled`, `digest_day`, `unsubscribe_token`, `last_digest_sent_at`.
- **Column-level grants, because RLS does not restrict columns.** Supabase's
  default privileges hand `anon`/`authenticated` full DML on new public tables,
  and an `update-own` policy authorizes the *row*, not the fields. Without
  `revoke all … ` followed by `grant update (digest_enabled, digest_day)`, a
  signed-in user could rewrite their own `email`, mint themselves a new
  `unsubscribe_token`, or reset `last_digest_sent_at` to re-trigger sends. Those
  three columns are server-owned.
- **Both `auth.users` triggers swallow their own failures.** An exception in an
  `AFTER INSERT` trigger on `auth.users` rolls back the signup transaction and
  surfaces as an opaque "Database error saving new user" — i.e. one bad profile
  write makes the product unregisterable. A missing profile row, by contrast, is
  recoverable: the migration's backfill is re-runnable and the accessors fall
  back to `DEFAULT_DIGEST_PREFERENCES`. Availability of signup outranks
  completeness of a preferences row, so the triggers `raise warning` and let the
  signup through.
- **Accessors fail soft** to the defaults, which is also what makes `/settings`
  render correctly *before* the migration is applied.
- The email is denormalized onto the profile (kept in sync by an
  `after update of email` trigger) so the digest job never reads the `auth`
  schema.

### The recommendation pipeline moved out of the route (W4)

`generateRecommendations` now lives in `src/lib/recommend/generate.ts`. The
Supabase client is **injected and required**; the module imports neither the
server client nor `next/headers`, so it carries no request-scoped surface. The
route passes the session client (RLS unchanged); the cron passes the admin
client. Scoping is **enforced rather than inherited** — every read and the
outcome insert names `user_id` explicitly, because a service-role client has no
RLS identity to fall back on. This is the same discipline the letter's own
queries follow, and it is the direct fix for the old digest's missing filter.

Two things stayed behind in the route on purpose:

- **Rate limiting.** `aiDailyLimitForUser` shares the `recommend:<uid>` bucket.
  Moving it into the library would let the weekly email consume the interactive
  deck's daily budget — a user who never opens their email would silently lose
  deck runs. The digest uses its own bucket, `digest:recommend:<uid>`, sized to
  one card per minimum interval.
- **HTTP policy** generally (401 / 503 / 429), since it is per-surface.

The **min-items gate moved into the library**, because it is data-dependent and
the email path wants the same floor; it surfaces as an `insufficient_items` code
that the route re-renders into its existing 400. **Outcome logging stayed
inside**, so an emailed card suppresses on the next run exactly like a deck card
(ADR 0002), and an empty run remains a success with a `reason` rather than an
error (ADR 0016). The route dropped from 356 to 111 lines, log strings are
byte-identical under the default prefix, and no existing test changed.

### The letter is titles only, and silence beats an empty nag

Three sections: up to three still-`want` items ("still on your shelves"), up to
two recently-done-but-unrated items rendered as star rows, and at most one
recommendation card. `hasDigestContent` suppresses the send entirely when all
three are empty — a user with nothing worth saying gets no email.

`verdict` and `note` are **not selected** by the letter's queries. They are
encrypted at rest (ADR 0013), ADR 0002 flags verdict text as needing consent
before it leaves the profile, and an email is the least revocable place to put
it. Titles are not encrypted, so the letter is titles only. Every interpolated
value is escaped: titles come from scraped pages and the recommendation copy
comes from an LLM — neither is trusted markup.

Only two rating prompts per letter, because each one costs five signed links and
the entire proposition is *one easy tap*, not a form.

### Safety rails before the first real send

- `?dry=1` renders every letter and returns the HTML **without** touching Resend
  and without stamping `last_digest_sent_at`. This is the intended review path.
- Recommendation cards are skipped in a dry run (generating one spends an LLM
  call and writes `shown` outcome rows); `&recommend=1` opts into that side
  effect for a full preview.
- `DIGEST_MAX_RECIPIENTS` (default **5**, `0` disables sending outright) bounds a
  run. A cron that fans out is the one mistake here that cannot be taken back.
- Recipients are processed **sequentially** — a handful per run, and one slow LLM
  call should not multiply into concurrent load.
- Recommendation generation fails open at every level (shelf pick, rate limit,
  timeout, empty result, thrown error): a missing card costs the letter one
  section, never the send.

### The AI-consent question: contained first, then resolved by opt-in

Generating a card runs `generateRecommendations`, which feeds **item titles and
free-text `verdict` notes** into the taste-profile prompt. ADR 0002 had flagged
that as an open question, and the letter is what made it urgent: the interactive
deck is *user-initiated* (someone presses "Get my picks" and their own notes go
out as a direct consequence), whereas a cron would send every due profile's notes
to the Gateway on a schedule nobody triggered.

W2 shipped **containment**: `DIGEST_RECOMMEND_MAX_USERS` defaulted to `0`, so
merely deploying the job sent nobody's notes anywhere and enabling it was a
deliberate act. That was never a resolution — a config default is not consent.

The resolution landed alongside, and is recorded in full in **ADR 0002 §Consent
resolution (2026-07-25)**. In summary, as it affects this job:

- `profiles.ai_personalization_enabled` — `boolean not null default false`,
  migration `20260725170000_profiles_ai_personalization_consent.sql`,
  client-writable through the same column-level UPDATE grant pattern (the grant
  has to be *re-issued* with the new column, or the toggle fails with "permission
  denied for column").
- The digest checks consent **before** `buildRecommendation`, so a
  non-consenting profile is never read for a prompt and no LLM call is made on
  their behalf. The gate is on the call, not on the rendered card.
- `toDigestPreferences` reads consent with a strict `=== true`, so a row from
  before the migration (no such column) reads as *not consented* rather than
  undefined-as-truthy. This is the deliberate exception to the accessors'
  otherwise opt-out defaults: the letter should not silently stop for a lagging
  row, but absence must never be mistaken for consent.
- The patch parser accepts only an explicit boolean — no truthy strings, no
  coercion — so a malformed client can neither grant nor forge consent.
- Declining costs the user nothing but the suggestion: shelf items and star links
  involve no provider at all.
- With consent doing the consent job, `DIGEST_RECOMMEND_MAX_USERS` reverts to
  what it always should have been — a cost/fan-out ceiling — and now defaults to
  **2**, deliberately below the recipient cap of 5.

## Considered and rejected

- **A weekly cron expression** (`0 9 * * 0`). Not available on Vercel Hobby
  (daily-only, max two crons), and even where available it skips a whole week on
  a missed run and cannot express a per-user weekday.
- **Keeping the digest's global query and just adding a filter.** The job needed
  a recipient concept, a preference, an unsubscribe credential and a
  last-sent stamp; there was no table to hang any of them on. Patching the filter
  would have left a job that mails everyone on the same day forever, with no way
  to opt out except a code change.
- **A confirm page on `/rate`.** Doubles the tap count and reinstates the
  friction the feature removes. Rejected in favour of write-then-correct — see
  the asymmetry argument above for why unsubscribe went the other way.
- **A `rating_links` table (stateful tokens).** Adds a cleanup job, five rows
  per prompted item per send, and a second source of truth that can drift from
  the letter actually delivered. Its only real advantage — per-link revocation —
  is served well enough by a 30-day TTL plus secret rotation.
- **Signing only the item id.** Would let a recipient (or anyone who saw the URL)
  edit the star value in the path. Every field is signed together.
- **Sliding the expiry on correction.** Would make a single letter an
  indefinitely renewable write handle. Corrections inherit the original expiry.
- **Session-authenticated rating links.** Requiring a login is exactly the
  friction that broke the loop; a recipient on a phone, in a mail app, is often
  not signed in.
- **Moving rate limiting into `generateRecommendations`.** Shared bucket, so the
  email would eat the interactive deck's daily budget. Per-surface policy stays
  with the surface.
- **A `<Link>`-based star row.** Router prefetch would write all five ratings.
- **Sending verdict/note text in the letter.** Encrypted at rest by ADR 0013 and
  the subject of an open consent question; email is the least revocable channel
  we have.
- **Client-created profile rows.** Would let a client forge a profile for another
  user id or mint its own unsubscribe token. Trigger-only creation, no insert
  policy.

## Consequences

- **New table** (`public.profiles`) and a new public route class: two
  session-less, token-authorized surfaces (`/rate/<token>`,
  `/unsubscribe/<token>`). Both are excluded from `src/middleware.ts`'s protected
  prefixes — an auth guard must never bounce someone away from opting out — and
  both are `noindex`, `no-store`, and listed in `src/app/robots.ts`.
- **New secret to lose.** `RATING_LINK_SECRET` joins `FIELD_ENCRYPTION_KEY` and
  `CRON_SECRET` in the set of env vars whose absence degrades a feature to
  fail-closed rather than breaking loudly at deploy time.
- **The cron slot budget is now full** on Vercel Hobby: enrich + digest = 2 of 2.
  Any future scheduled job has to fold into one of these two handlers or wait for
  a plan change.
- **Recommendation generation is now reachable from two callers** with different
  auth, different clients and different budgets. `generate.ts` must stay
  request-free; adding a `next/headers` import there would silently break the
  cron.
- The letter is a **new attacker-influenced rendering surface** (scraped titles,
  LLM copy) in a medium with no CSP. Escaping is centralized in
  `digest-html.ts` and asserted in tests.

## Not yet true (state at the time of writing)

An honest inventory, because everything above describes code, not production
behaviour:

- **The letter has never sent.** Not once, in any environment. Every claim about
  deliverability, rendering across mail clients, spam placement and one-click
  unsubscribe recognition is untested against a real provider.
- **Both profile migrations are written and deliberately not applied** —
  `20260725120000_profiles_notification_preferences.sql` and
  `20260725170000_profiles_ai_personalization_consent.sql`. Local development
  shares the production Supabase project, so applying them is a production
  change. Until the first runs there is no `profiles` table at all: the accessors
  fail soft to defaults, `/settings` renders, `listProfilesDueForDigest` finds
  nobody, and the job is a no-op. They must be applied **in order** — the second
  re-issues the column grant that the first established.
- **Env vars gate everything.** `RESEND_API_KEY` (without it the job reports what
  it *would* have sent), `DIGEST_EMAIL_FROM`, `RATING_LINK_SECRET` (without it
  every rating prompt is dropped from the letter and `/rate/*` refuses every
  link), `CRON_SECRET`, and `NEXT_PUBLIC_APP_URL` — a wrong value here mints
  links pointing at the wrong host, which is unrecoverable once mailed.
- **`DIGEST_MAX_RECIPIENTS` defaults to 5** and `DIGEST_RECOMMEND_MAX_USERS` to
  2, so even a fully configured production run is a trickle — and no card is
  generated for anyone until they opt in, which nobody has.
- The intended first-run sequence is: apply the migration → set the env vars →
  `GET /api/jobs/digest?dry=1` with the cron bearer → read the rendered HTML →
  only then let the scheduled run send.

## Open questions

- **AI consent is resolved for the scheduled path only.** The opt-in flag governs
  the letter's card. The interactive deck and LLM enrichment remain
  *user-initiated and disclosed on `/privacy`* rather than gated on the flag —
  turning it off must not silently disable a feature the user just asked for by
  pressing a button. Whether that distinction survives contact with a real user's
  expectation ("I turned AI off, why did it still send my notes anywhere?") is
  untested, and the flag's copy in Settings is the only thing carrying it.
- **Deliverability from a cold domain.** A brand-new sending domain mailing a
  weekly letter with one-click unsubscribe headers is the good case, but nothing
  here is validated. SPF/DKIM/DMARC posture for the `From:` domain is out of this
  ADR's scope and unverified.
- **Is "3 forgotten + 2 rating prompts" the right letter?** The section sizes are
  guesses. There is no open/click instrumentation of any kind, so the only
  observable outcome today is whether verdicts start appearing without
  corresponding app sessions.
- **Bounce and complaint handling.** Nothing consumes Resend webhooks; a hard
  bounce will be retried every cycle forever, and `email` is only refreshed by
  the `auth.users` trigger.
- **`digest_day` is UTC** (`Date#getUTCDay()`), with no timezone stored on the
  profile. A recipient far enough east or west gets their "Sunday" letter on a
  neighbouring day. Acceptable for a weekly cadence; revisit if the cadence ever
  tightens.
