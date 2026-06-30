# Overnight idea: Library "binding" themes

STATUS: complete

Accent personalization: a user picks a "binding" — the cloth their library is
bound in — that re-skins the app's accent family. It is a second axis,
orthogonal to light/dark.

- Bindings: **Amber** (default, unchanged), **Leather**, **Claret**, **Forest**,
  **Midnight**, **Plum** — each a deep, legible accent in light mode with a
  lighter dark-mode variant.
- Applied as `data-binding` on `<html>`; default (amber) sets no attribute, so
  existing screens are pixel-identical unless a user opts in.
- Persisted in `localStorage` (`theque-binding`); no DB/migration.
- No FOUC: the root layout's inline init script applies the stored binding
  before first paint (mirrors the existing light/dark init).
- Picker lives in **Settings → Binding**.

Files:
- `src/components/theme/binding.ts` (+ `binding.test.ts`) — bindings + pure helpers.
- `src/components/theme/BindingProvider.tsx` — context + apply/persist.
- `src/components/theme/BindingPicker.tsx` — swatch radiogroup (Settings).
- `src/app/globals.css` — per-binding accent overrides, scheme-scoped.
- `src/app/layout.tsx` — init script + provider nesting.
- `src/app/(app)/settings/page.tsx` — Binding section.
