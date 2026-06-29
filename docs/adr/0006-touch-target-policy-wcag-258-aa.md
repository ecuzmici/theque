---
status: accepted
---

# Touch targets: WCAG 2.5.8 AA via a 44 px coarse-pointer floor

We hold all interactive controls to **WCAG 2.5.8 Target Size (Minimum), Level AA**
(24×24 CSS px, with the spec's full exceptions), and **implement** that by flooring
controls to **~44 px** (`--tap-target-min: 2.75rem`) — but *only* on coarse pointers
(`@media (pointer: coarse)`), so mouse/desktop layouts stay compact. The floor is
**height-only on text buttons** and **height + width on icon buttons**; plain
text-in-a-sentence links are deliberately exempt.

## Why these choices

- **AA, not AAA, as the conformance bar.** 24 px AA is the legally-relevant target and
  has real exceptions (spacing, inline, UA-default, essential) that suit a dense UI.
  We nonetheless *aim* at the 44 px AAA "comfort" target as the default size, because
  it costs nothing on touch and a finger-friendly UI is the point on mobile. So the
  app is AA-conformant with a large margin rather than scraping the line.
- **Coarse-pointer-only floor.** Bumping every control to 44 px on a mouse UI would
  make desktop bulky. Gating the floor on `(pointer: coarse)` (plus `lg-fine:` opt-outs)
  keeps desktop at the compact `h-7`/`h-8`/`h-9` heights while mobile gets finger
  targets. Trade-off: the same control has two sizes; this is intentional.
- **Height-only on text buttons.** The size scale is height-based, and a text button's
  width is always content + padding, which clears 24 px easily — so a width floor is
  unnecessary there. **Icon buttons** have no text to widen them, so they get
  `min-w-[44px]` too. This asymmetry looks arbitrary in the code without this rationale.
- **Inline links exempt.** `variant="link"` sets `pointer-coarse:!min-h-0`; a link
  inside a sentence is constrained by line-height and is explicitly exempt under 2.5.8.
  Flooring it would break text flow. The cost: authors must not use `variant="link"` as
  a standalone block control on touch.
- **Dragging has button equivalents.** Inbox triage is a swipe, but ships Dismiss /
  File / Keep buttons (56 / 44 px) so it also satisfies WCAG 2.5.7 (AA).

The floor is delivered through three mechanisms — `<Button>`'s built-in
`pointer-coarse:min-h`, explicit `min-h-11` on bespoke controls, and the
`.ks-pointer-coarse-min-hit` utility for plain links — which all resolve to the same
44 px. A 2026-06-29 static + live audit (`docs/a11y/touch-targets.md`) measured 324
real targets and found **0 AA failures**, with every real control at ≥44 px.

## Considered and rejected

- **Strict 24 px with no comfort target** — technically AA, but a worse mobile feel for
  no saving; we already had the 44 px floor and kept it.
- **44 px floor on all pointer types** — rejected; bloats desktop. Hence the
  `pointer: coarse` gate.
