# Theque is a personal taste loop: no manual grouping, no sharing

Theque exists to serve one loop — **capture → triage → consume → verdict** — for a
single private user. We are removing everything that does not serve that loop:
**collections** (and the public `/share/[token]` capability that rode on them),
**tags**, and the **`planned`** status. The organizing story is just code-defined
**shelves** (by category/status) plus full-text **search**; the payoff is the
**Verdict** captured at "mark done" and surfaced on a new **Done shelf**.

## Why

A row-count of the production database (2026-06-28) showed the features were not
underused — they were **entirely unused**: 0 tags and 0 collections across 92 items,
and only 2 `planned` items. The owner did not know collection sharing existed. The
app carried three overlapping grouping mechanisms (shelves, collections, tags) and a
two-tier backlog (`want` + `planned`); for a single user who never reaches for them,
that is pure surface area and cognitive load with no payoff.

## Considered options

- **Keep one manual grouping mechanism (tags *or* collections).** Rejected: the user
  confirmed no need for cross-category named sets ("one category at a time"), which is
  the only job a manual mechanism does that shelves can't. Tags remain the cheaper
  thing to reintroduce later if that ever changes (no nav slot, no detail page, no
  share infra) — so the reversible path is "zero now, tags later if proven," never
  "keep collections just in case."
- **Soft-deprecate (hide UI, keep tables/data).** Rejected: it preserves exactly the
  dead schema and dead code the simplification is meant to remove. With zero rows
  there is nothing to preserve anyway.

## Consequences

- **Hard delete, zero data loss.** Drop `tags`, `item_tags`, `collections`,
  `collection_items`, the `collections.share_token` column, the `/share/[token]`
  route + share API, the `/tags` and `/collections` pages, search tag/collection
  filters, edit-sheet inputs, detail-page badges/"In …", and the related quotas.
- **Status enum loses `planned`** (`inbox → want → done`, plus `dismissed`); migrate
  the 2 existing `planned` items → `want`.
- **Shelf model shifts:** category shelves become **backlogs** (exclude `done`); a new
  **Done shelf** is the single archive of consumed items with their verdicts.
- **Chrome extension needs a new version:** the capture API drops the `tag_names` and
  `collection_ids` params, and 1.0.0 already shipped to the Web Store.
