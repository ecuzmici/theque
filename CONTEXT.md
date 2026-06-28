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
A code-defined smart view over your items, sliced by category and/or status (Watch,
Read, Forgotten, Inbox, …). Not user-created and not stored in the database.
_Avoid_: filter, view, custom list

**Backlog shelf**:
A category shelf (Watch, Read, Cook, …). Shows only items you have *not* yet
consumed — done items drop out. Answers "what's left to consume?"

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
