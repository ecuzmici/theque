# Overnight idea: one-time "Made for you" unlock celebration

**Status:** in-progress (stub commit)
**Branch:** `overnight/unlock-celebration`

Deferred follow-up #1 from the recommend-unlock-banner work: fire a calm,
on-brand, one-time celebration when a category's AI recommendations cross the
unlock threshold (locked → unlocked). Persisted via the existing
`unlock-storage.ts` localStorage pattern (no DB). Reuses the banner's existing
unlock detection. Respects `prefers-reduced-motion`.

This marker flips to "complete" in the final commit.
