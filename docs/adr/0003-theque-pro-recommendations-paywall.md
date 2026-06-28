---
status: proposed
---

# Theque Pro: a single-feature subscription that gates Recommendations

This is a **thought-experiment ADR**, recorded to inform roadmap — not a commitment
to launch billing or open public signups. It maps Theque's cost structure to a
free/paid split and pins the design that survives that mapping. Status stays
`proposed` until there is an actual decision to monetize.

The pitch in one line: **Free saves and organizes your taste; Pro recommends what's
next.**

## Decisions

- **Gate the AI layer, not volume or quality.** The free/paid line follows real
  per-profile cost, not artificial scarcity. The library is **never** the paywall —
  capping how much someone can save fights the "a taste library wants to grow" ethos,
  and an item costs ~storage only.
- **Single paywall: Recommendations.** Of the AI features, only the
  **Recommendations deck** carries a *recurring* per-profile cost (live LLM on every
  open). **LLM enrichment, grounding/Jina, and the weekly digest stay free** — they
  are one-time-per-item (or near-zero) costs whose job is to make every saved card
  good, which is what earns word-of-mouth and keeps people saving. One clean line.
- **Free gets a capped taste, not a wall.** Free = one short deck per week (~3
  picks), **hard-capped**. The cap is the point: ADR 0002 shows even a flagship model
  is ~€1/mo realistic per profile, and the scary ~€16/mo only appears at rate-limit
  abuse — so a small recurring taste is genuinely cheap *and* is the single most
  honest conversion driver (you've felt it work on your own verdicts).
- **Pro is access/volume, not a better engine.** Pro = **unlimited, on-demand,
  full-length decks across all shelves + a cross-category "surprise me" deck.** Same
  engine. We do **not** route free to a deliberately worse model: ADR 0002 chose
  `gemini-3.1-flash-lite` for *latency*, not cost — the cheap model is the good one,
  so a crippled free tier would be both against the grain and pointless.
- **Recs only, pure.** No companion perks (export, extra capture tokens, on-demand
  re-enrich) ride along. A fuller bag was considered and rejected in favor of the
  minimum-surface story: *free saves, Pro recommends.*
- **Price is value-based, ~$3/mo or ~$24/yr.** Margin is a non-issue (cost ~€1/mo),
  so price is pure willingness-to-pay for a niche personal-taste app. Low impulse-tier
  monthly with an annual discount gives the cleanest free-vs-paid framing.

## Considered and rejected

- **Gate by volume** (cap library/captures, Pro = unlimited) — artificial scarcity;
  an item costs ~storage, and it betrays the grow-your-library ethos.
- **Gate by quality** (everyone gets every feature, Pro gets it "better") — requires a
  deliberately worse free model, which contradicts ADR 0002's latency-driven choice
  and feels punitive.
- **Hard wall, all-LLM-is-paid** — free cards look worse on hard/blocked pages and
  free users never feel the magic, so "why upgrade" stays abstract.
- **One-time rec trial then locked** — strong first impression but bait-and-switch,
  and gives no recurring reason to keep the app open.
- **Recs + cheap companions / + power automation** — more perceived value, but more
  surface (and, for automation, new recurring cost). Rejected for the pure one-line
  story.
- **Lifetime / pay-what-you-want pricing** — fine for a passion tool, but weak
  recurring revenue and (lifetime) caps upside if costs rise.

## What it would entail to build (when/if)

Smaller than it looks, because the paywall is one feature:

1. **`plan` on profiles** (`free` | `pro`, default `free`) — one migration. `plan` is
   a property *of* the existing Profile, not a new entity.
2. **One entitlement check + one meter**, both in `src/app/api/recommend/route.ts`:
   `pro` → proceed; `free` → count this week's decks and return empty/`402` past the
   cap.
3. **No new table for the meter** — the **outcome log already records `shown` events
   per profile** (ADR 0002); count distinct deck-opens this week from it. The
   verdict-loop plumbing pays off again.
4. **Locked-state UI** on the deck after the weekly cap: show the cap, the reset day,
   and an upgrade CTA — *not* a blurred fake deck.
5. **Billing** (Stripe Checkout + webhook → flip `plan`) — the only genuinely new
   system, and the thing to defer longest.

## Open questions

- **Willingness-to-pay is the real risk**, not economics. The next step a pricing
  study should take is validating that anyone pays ~$3/mo for one feature, however
  magic — before any billing is built.
- **A subscription is a philosophical pivot.** ADR 0001 ruthlessly cut surface area;
  a paywall *adds* it (billing, plan states, locked UX). "Recs only, pure" is the
  minimum-surface way, but this memo is coherent **only** if Theque would actually
  open signups and stop being a private personal tool.
