# Theque

Theque is a single-user, private **visual taste library**: you capture URLs, they
become enriched cards, and you browse them to decide what to consume next and to
remember what you thought. It is not a sharing, publishing, or curation tool.

## Language

**Theque**:
The product — a personal taste library built around capture, consume, and verdict.
_Avoid_: bookmarks app, read-it-later app, curation tool

**Taste loop**:
The core cycle the whole app exists to serve: **capture** a URL → **triage** it →
**consume** it → record a **verdict**. Anything that does not serve this loop is
peripheral and must justify its complexity.
_Avoid_: workflow, pipeline

**Item**:
One saved URL, enriched into a category-aware card. The central entity.
_Avoid_: bookmark, link, entry

**Profile**:
One person's private, isolated account and library. "Single-user" means *per
profile* — there is no sharing or social surface between profiles, but the system
holds many. All signal (shelves, verdicts, recommendations) is scoped to one
profile.
_Avoid_: tenant, workspace

**Verdict**:
What you thought after consuming an item — a personal star rating and/or a one-line
note, captured when you mark it done. Turns the Done shelf into a record of taste
rather than a graveyard.
_Avoid_: review; "rating" alone (the rating is only one half of a verdict)

**Shelf**:
A code-defined smart view over your items, sliced by category and/or status (Books,
Watch, Articles, Other, Done, …). Not user-created and not stored in the database.
The steady-state strip is **All · Books · Watch · Articles · Done**; **Inbox** and
**Other** are shown only when they hold something (see _Dynamic shelf_).
_Avoid_: filter, view, custom list; the old "Read" tab is now **Articles**

**Backlog shelf**:
A category shelf (Books, Watch, Articles, Other). Shows only items you have *not* yet
consumed — done items drop out. Answers "what's left to consume?"

**Other shelf**:
The single grouped backlog shelf for the long-tail categories — `restaurants`,
`products`, `travel`, `recipes`. One tab instead of four, so a category with a handful
of items still has a home without crowding the strip. A _Dynamic shelf_.

**Dynamic shelf**:
A shelf that appears in the strip only while it has at least one item (currently
**Other** and **Inbox**); the always-on shelves never hide. If the shelf you are
viewing empties out, you fall back to **All**.

**Forgotten**:
`want` items saved more than 180 days ago — a nudge, **not** a standing tab. Surfaced
as a count chip in the library insights and via the weekly "saved and forgot" digest.
_Avoid_: a shelf you browse (it is a reminder, not a destination)

**Done shelf**:
The single archive of consumed items across all categories, each showing its
Verdict. The browsable record of taste. Answers "what did I think?"
_Avoid_: history, completed, archive (the shelf is named Done)

## Recommendations

**Recommendation**:
A generated, externally-grounded suggestion of something *not* in your library,
shown for a Save/Dismiss decision. Becomes an Item only if you save it.
_Avoid_: suggestion, pick (informal), result

**Taste profile**:
The signal the recommender reasons from, assembled per profile: items you
**loved** (4-5★) and **disliked** (1-2★) with their verdict notes, topped up with
backlog items. The verdict loop's payoff as an input, not just a record.
_Avoid_: preferences, history, training data

**Outcome log**:
The persisted record of what each recommendation became — **shown**, **saved**,
or **dismissed** — keyed on the resolver's external id. Powers "never show this
again" and the negative signal from rejections.
_Avoid_: history, cache, impressions

**Recommendation run**:
One invocation of the recommender for a single shelf, from request through the deck
of picks it produces. Has a lifecycle — *loading* → *ready* (or *error*) — and is
tagged with the shelf it was started for.
_Avoid_: request, job, session

**Active run**:
The **one** recommendation run the profile can have going at a time. Theque holds a
single global slot: starting a run for another shelf **replaces** the current one
(cancelling it). There is no parallel "Books and Watch at once."
_Avoid_: queue, parallel runs

**Minimize**:
Stashing the open recommendation deck without ending its run — the run keeps loading
or keeps its place in the deck, and a floating indicator stands in for it. The user
can roam the app and is told when it is ready. Triggered by clicking outside the deck.
_Avoid_: close, hide (minimize *keeps* the run; close/dismiss ends it)

**Dismiss**:
Ending the active run and discarding it — cancelling an in-flight load or throwing
away a loaded deck, leaving the slot empty. Triggered by the deck's close (×) control
or the indicator's own ×.
_Avoid_: minimize, cancel-the-app (dismiss is the deliberate "I'm done with this")

## Categories

There are **seven** categories: `books`, `movies_and_tv`, `restaurants`, `products`,
`travel`, `recipes`, `articles`. `music`, `apps`, and `videos` were **retired** — see
`docs/adr/0004-fewer-shelves-retired-categories.md`. Their URLs now re-home to a
surviving category rather than vanish: video → `movies_and_tv`, music → `articles`,
apps → `products`.

**Retired category**:
A category removed from the taxonomy. Its existing rows are migrated to the nearest
surviving category (keeping their status), and its classifier rules are retargeted so
*future* captures land the same place — never orphaned as uncategorized.

## Item lifecycle

The status of an item moves along a single line: `inbox → want → done`, with
`dismissed` as a side exit. There is no second backlog tier.

**Inbox**:
A freshly captured item awaiting triage. The only place items land on capture.

**Triage**:
Deciding, per inbox item, between Want and Dismissed (swipe right / left).

**Want**:
An item you intend to consume — the single, flat backlog.
_Avoid_: planned, on-deck, saved (there is no separate "planned" tier)

**Done**:
An item you have consumed and given a Verdict. The end of the taste loop.

**Dismissed**:
An item you triaged away — a non-destructive "no" that hides it from shelves but
keeps the row (so dedup and history survive).
_Avoid_: deleted, archived (dismissed items are kept, not removed)

## Accessibility

See `docs/adr/0006-touch-target-policy-wcag-258-aa.md` and the audit in
`docs/a11y/touch-targets.md`.

**Touch target**:
The hit area of an interactive control — the region a finger can land on, which may be
larger than the visible control. The thing WCAG 2.5.8 sizes. The conformance bar is
**AA (24 px)**; the app aims at the 44 px _comfort target_.
_Avoid_: button size, click area (it is the *hit* area, and not only for buttons)

**Coarse pointer**:
A touch (finger) input, detected via `@media (pointer: coarse)`. The app's touch
accommodations are gated on this so desktop (fine pointer) stays compact.
_Avoid_: mobile, touchscreen (the signal is the *pointer*, not the device or width)

**Tap-target floor**:
The minimum size controls are bumped to on a _coarse pointer_ — **44 px**
(`--tap-target-min`). Height-only on text buttons, height + width on icon buttons.
Delivered three ways that all resolve to 44 px: `<Button>`'s built-in floor, explicit
`min-h-11`, and the `.ks-pointer-coarse-min-hit` utility for plain links.
_Avoid_: min-height (that's one mechanism, not the concept), padding

**Comfort target**:
The 44 px size (WCAG 2.5.5 AAA) the app defaults to even though only **24 px** (AA) is
required — finger-friendly with margin to spare. "Compliant" means 24 px; "comfortable"
means 44 px.
_Avoid_: minimum size (44 px is the comfortable size, 24 px is the minimum)

**Spacing exception**:
The 2.5.8 rule that lets an under-24 px target still pass AA if a 24 px-diameter
_undisturbed circle_ centred on it does not overlap another target's circle — i.e.
neighbours are far enough apart. The audit found the app never relies on it (every real
target is ≥44 px).
_Avoid_: padding rule, gap rule

**Undisturbed circle**:
The 24 px-diameter circle centred on a target used to test the _spacing exception_:
two targets are adequately spaced when their circles don't intersect (centre-to-centre
≥ 24 px).
_Avoid_: bounding box, hit radius

## Plan & subscription (proposed, not built)

> Speculative vocabulary from the "Theque Pro" thought experiment. **Nothing here is
> built or committed.** See `docs/adr/0003-theque-pro-recommendations-paywall.md`.
> These terms are kept out of the live Language section above until a real decision
> to monetize.

**Plan**:
A Profile's entitlement level — `free` or `pro`. A property *of* the existing
**Profile**, not a new entity. Pro touches **only** the Recommendation concept;
capture, enrichment, shelves, search, and the verdict loop are identical on both.
_Avoid_: tier, account-type.

**Pro**:
The paid plan. Its sole entitlement is **unmetered Recommendations** (unlimited,
on-demand decks across all shelves). Everything else in this document is unchanged.
_Avoid_: premium, paid-tier (use the name).

**Rec allowance**:
The free plan's metered budget of recommendation decks (one short deck per week).
The only meter in the system; Pro removes it.
_Avoid_: credits, tokens.

## Taste-social (thought experiment, not built)

> Speculative vocabulary from the "what else is possible" thought experiment
> (2026-06-29). **Nothing here is built or committed.** It explores breaking ADR
> 0001's "no sharing/social" no along its narrowest edge: *signal without a
> surface*. Kept fenced, out of the live Language section above, until a real
> decision.

**Social signal**:
Other profiles' verdicts improving *your* private recommendations through invisible
matching — no profile pages, feed, follower counts, or named people ever shown. The
library keeps its single-user *feeling*; the social part is an engine, not a screen.
_Avoid_: social features, community, sharing.

**Social surface** (rejected branch):
The opposite of Social signal — taste as public identity: profiles, following,
visible taste-twins, a feed. Exactly what ADR 0001 refused; named here only to
forbid it.
_Avoid_: profile page, feed, followers.
