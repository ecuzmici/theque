# Overnight idea: "On this day" resurfacing + saving-cadence insight

Status: **in progress** (stub marker commit).

Re-engagement on the library `all` shelf, in the same calm spirit as the
existing "N forgotten" nudge:

- Resurface a meaningful past save — prefer one saved ~1 year ago, else ~6
  months ago, else the oldest still-unfinished save — as a quiet, dismissible
  "A year ago you saved X. Still interested?" card. Never `done`/`dismissed`
  items; nothing for a too-young/empty library.
- A quiet "N saved this month" cadence line.

Selection logic is pure + unit-tested in `src/lib/insights/on-this-day.ts`;
surfaced via a self-contained `OnThisDay` client component mounted with a
minimal edit to `LibraryPageClient`. localStorage-dismissible, no DB/migration,
private — ADR-safe.
