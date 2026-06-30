---
status: proposed
type: constraint-challenge
---

# PROPOSAL (constraint-challenge): a shareable "taste card" for attraction

> **This ADR deliberately challenges a standing product constraint.** AGENTS.md says
> theque has **no social/sharing features** and ADR 0001 removed the public
> `/share/[token]` capability. The shareable parts of this proposal **conflict with
> that constraint**. This document exists so the owner can *consciously accept or
> reject* a sharing surface — it is **not** a normal feature ADR, and nothing here
> ships a public surface until this ADR is marked `accepted`.

## Context

theque is launching to a public, developer-leaning audience (ADR 0010) but has **no
built-in growth loop**. Every acquisition channel today is outbound: the landing page,
the `/pocket-alternative` SEO page, and manual word-of-mouth. The product's single most
*screenshot-worthy* asset — a user's enriched, color-sorted library — currently never
leaves the authenticated app.

A "taste card" is a compact, visual summary of a profile (palette of the year, top
shelves, counts, a standout pick) designed to be **spread**. It is the natural
attraction artifact for a *visual taste* product: the thing people post is the thing
the product makes beautiful. The "Wrapped" pattern (Spotify, Letterboxd, Oku) shows the
loop works precisely *because* the artifact is personal and pretty.

## The conflict, stated plainly

- **AGENTS.md product constraint:** "no social/sharing features — each Profile is a
  private, RLS-isolated library."
- **ADR 0001:** removed `collections`, the `share_token` column, and the public
  `/share/[token]` route, on the reasoning that grouping/sharing was *entirely unused*
  by the single owner and was pure surface area.

ADR 0001's evidence was **usage by one private owner**, not a verdict on *acquisition*.
Sharing-as-organization (what 0001 killed) and sharing-as-growth (what this proposes)
are different jobs. So this proposal does not "undo" 0001 so much as ask a question 0001
never weighed: *is a narrow, outbound-only sharing surface worth it for growth now that
registration is open and launch needs a loop?*

## Options

### A. Private downloadable card only (no new public surface) — **ADR-safe**
A signed-in user views their taste card on a **private, authenticated** page and
**downloads/screenshots** it themselves; any posting is a manual act outside the app
(identical, privacy-wise, to screenshotting any app screen). No public route, no DB
column, no RLS change, no hosted page, no auto-publish.
- **Pros:** zero new attack surface; honors the *spirit* of "no social"; ships today;
  still produces the shareable artifact (the user is the distribution channel).
- **Cons:** higher friction (manual share); no link unfurl / OG preview; no analytics on
  reach; the recipient who clicks lands on the generic landing page, not the card.
- **Privacy/abuse:** none beyond the existing private app.

### B. Unguessable-token public card (opt-in, per-snapshot) — **needs this ADR**
A user explicitly "publishes" a *snapshot* of their card to an unguessable
`/c/<token>` URL (like the old share token, but a frozen image/summary, not a live
library). Off by default; revocable; never indexed.
- **Pros:** real link unfurl + OG image → the loop closes (click → see card → land on a
  tailored signup); still opt-in and not a feed/profile.
- **Cons:** reintroduces exactly the public-route + token + revocation machinery 0001
  deleted; a snapshot can leak item titles the user forgot were sensitive; needs a
  `taste_card_snapshots` table + RLS + a public read path (anon, RLS-scoped to published
  rows only); abuse vectors (token enumeration, scraping, takedown requests).
- **Privacy/abuse:** moderate — must be opt-in, snapshot-only (never live), revocable,
  `noindex`, and rate-limited.

### C. Full public taste profile (`/u/<handle>`) — **largest 0001 reversal**
A persistent, handle-based public profile of a user's library.
- **Pros:** strongest virality + SEO surface.
- **Cons:** this *is* the social product 0001 and AGENTS.md rule out — handles,
  always-live exposure, moderation, impersonation, the "which of my saves are public?"
  burden. Highest privacy risk for a single-owner-feeling product.
- **Recommendation:** **reject for the PoC.** It trades the product's core promise
  ("only yours") for reach.

## Recommendation

**Ship Option A now (no ADR exception needed for A); adopt this ADR only if/when Option
B is wanted.** A delivers the artifact and tests whether users *want* to share at all,
with zero risk to the privacy promise. If A shows organic sharing, escalate to **B**
(opt-in, snapshot, revocable, `noindex`) as the smallest possible public surface — and
**only** then is this ADR's exception actually exercised. **Reject C** for the PoC.

Concretely: this branch ships **Option A** (a private `/taste-card` page + client-side
image download) as the ADR-safe slice, and leaves B/C gated behind acceptance of this
ADR.

## Consequences if B is later accepted

- New `taste_card_snapshots` table (frozen summary JSON + image), RLS: owner read/write,
  anon read **only** where `published = true`; a public `/c/[token]` route with
  `noindex` + rate limiting; explicit publish/unpublish UI; update AGENTS.md to carve out
  "outbound snapshot sharing is allowed; live libraries stay private"; revisit ADR 0001's
  blanket "no sharing" wording to scope it to *organizational* sharing.
- Until then, AGENTS.md's "no social/sharing" stands and only Option A exists.
