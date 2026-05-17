# Theque — Product Brief

## One-liner

A personal **visual taste library** with one-tap capture from browser and phone. Saved links become rich cards (books, films, restaurants, products, travel, etc.), not dead bookmarks.

## Problem

While browsing, you find things you want to remember later: a book on Goodreads, a film on IMDb, a restaurant on Maps, a gift idea, a recipe, an article. Bookmarks and read-later apps store URLs; notes apps require manual structure. Nothing gives you a **beautiful private library** that understands *what* you saved and lets you browse by taste and context.

## Solution

1. **Capture** — Chrome extension, iOS Shortcut, or paste URL (optional note/tags/collection).
2. **Enrich** — Server fetches OG/schema.org metadata, classifies the item, and can optionally ask Gemini to fill sparse category-specific fields.
3. **Library** — Image-forward shelves (smart views by category) plus user **collections** (trip, gifts, date night).
4. **Inbox** — Secondary triage queue for low-confidence or unprocessed items.

## Target user (PoC)

- Personal use only (you).
- iPhone for mobile capture; desktop Chrome for browsing capture.
- Private data; no sharing in v0.1.

## Core concepts

| Concept | Definition | Example |
|---------|------------|---------|
| **Item** | One saved thing with metadata and lifecycle | IMDb title for *Inception* |
| **Category** | What kind of thing it is (system-guessed, user-overridable) | `movies_and_tv` |
| **Status** | Lifecycle in your library | `inbox` → `want` → `done` |
| **Shelf** (UI) | Fixed smart view over items | “Watchlist” = movies + non-dismissed |
| **Collection** | Why/where you saved it (user-created) | “Japan 2026”, “Birthday gifts” |
| **Tag** | Freeform label | `sci-fi`, `for-mom` |

**Important:** Shelves are **not** database entities in PoC (Option A). Collections are **not** categories.

## PoC success criteria

- [ ] Share an IMDb link from iPhone via Shortcut → appears as a visual card.
- [ ] Save a Goodreads page from Chrome extension → appears as a visual card.
- [ ] Both start in inbox or land on the right shelf when confidence is high.
- [ ] Process inbox items: set status, category, collections, tags.
- [ ] Browse and search library on phone and laptop (PWA).

## Non-goals (PoC)

- Multi-user product, public lists, social features
- Native iOS app / Share Extension (Shortcut only)
- Always-on AI-driven category decisions. The default pipeline is deterministic; Gemini enrichment is optional, server-side, and gated by env vars.
- Google Places API (restaurants may have sparse cards)
- Offline sync, email import, collaborative editing
- Full-text search engine beyond Postgres

## Experience principles

1. **Library first** — Home feels like browsing your taste, not an admin dashboard.
2. **Capture in one gesture** — Share or one click; note/tags optional.
3. **Instant feedback** — Card appears immediately; enrichment upgrades it in place.
4. **Mobile-first polish** — Large imagery, clear typography, minimal chrome.
5. **Fail gracefully** — Bad scrape still yields a usable card (title, domain, link).

## Tech stack (approved)

| Layer | Choice |
|-------|--------|
| App | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Supabase (Auth, Postgres, RLS, Storage, Realtime) |
| Deploy | Vercel (app) + Supabase (data) |
| Desktop capture | Chrome extension (MV3) |
| Mobile capture | iOS Shortcut → `POST /api/capture` with personal token |
| Auth (web) | Supabase Auth email OTP, with magic-link callback fallback |
| Auth (capture clients) | Personal capture token (scoped) |

## Related docs

- [Data model](./data-model.md)
- [API contract](./api-contract.md)
- [Category schemas](./category-schemas.md)
- [UI shelves](./ui-shelves.md)
- [Design spec](./superpowers/specs/2026-05-15-theque-design.md)
- [Implementation plan](./superpowers/plans/2026-05-15-theque.md)
