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
