# Overnight idea: interactive landing-page demo library

Status: **complete**.

Adds an interactive, read-only "try it" demo library to the logged-out landing
page (`src/app/page.tsx`), replacing the static screenshot, so prospects can
feel the real product before signing up:

- A framed "live demo" panel with a Spine Band echo, a working shelf switcher
  (All · Books · Watch · Articles · Other · Done), and a color-sort toggle.
- A curated 13-item sample library (`src/lib/demo/demo-library.ts`) spanning
  every category, with on-brand typographic covers tinted from each item's
  `dominantColor` — no remote image hotlinks, robust on any preview.
- A sign-up CTA closing the section.

ADR-safe: static marketing data, no account, no network, no Postgres, no
social/sharing. Pure functions (shelf filter, hex→hue, color sort) are unit
tested in `src/lib/demo/demo-library.test.ts`.
