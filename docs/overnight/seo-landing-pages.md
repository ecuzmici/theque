# Overnight idea: SEO / comparison landing pages

Status: **complete**

Adds public, indexable comparison landing pages mirroring `/pocket-alternative` to
capture high-intent search traffic:

- `/visual-bookmark-manager`
- `/goodreads-alternative`
- `/letterboxd-alternative`

Shared, data-driven `ComparisonLanding` component + per-page metadata, wired into
`sitemap.ts`. Public (not behind the middleware auth matcher). ADR-safe: marketing
only, no user data, no social/sharing, no schema changes.
