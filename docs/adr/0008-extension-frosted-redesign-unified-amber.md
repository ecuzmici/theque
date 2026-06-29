---
status: accepted
---

# Extension popup: simulated-frosted redesign and one brand amber across modes

We refreshed the Chrome extension popup to a modern "macOS vibrancy" look —
translucent layered panels, rounded inner panels with soft shadows, adaptive
light/dark — and in doing so **unified the brand amber** so the dark mode is amber,
not the gold it had drifted to. Brand anchor stays `#b45309` (light); dark mode uses a
brightened tone of the *same* amber hue (`#d97706` fills, `~#e8923a` for amber text on
graphite) rather than the previous `#fbbf24` gold. This retoken applies to the **web
app's `.dark` accent tokens** (`src/app/globals.css`) as well as the extension, so the
two surfaces share one identity color.

## Why these choices

- **Simulated frosted material, not real vibrancy.** A Chrome MV3 popup window is
  composited opaquely over the toolbar; it cannot be made transparent, and
  `backdrop-filter` only blurs *other elements inside the popup*, never the page or
  chrome behind it. True macOS vibrancy is therefore impossible here. We fake the look
  with translucent gradient backgrounds, layered semi-opaque panels, inner highlights,
  and blur applied between internal layers. This is the only way to deliver the
  requested "transparency vibe" in this surface.
- **Edge-to-edge frame.** The popup window's own outer edge is browser-drawn and can't
  carry a visible drop shadow, so the requested rounded-corners + shadow live on the
  **inner panels** (page-context card, form fields) floating against a full-bleed
  frosted background — not on a single floating card. Chosen over a floating-inset card
  for content room in a 360 px popup.
- **One amber, tuned per mode.** Deep `#b45309` is low-luminance: as thin accent/link
  *text* on dark graphite it only reaches ~3:1 and fails WCAG AA — which is why dark
  mode had reached for bright gold `#fbbf24`. Rather than accept gold (off-brand) or
  literal `#b45309` everywhere (sub-AA text on dark), we keep the amber *hue* and
  brighten it for dark (`#d97706` fills, `~#e8923a` text) so it stays unmistakably amber
  and AA-legible. The cost: light and dark are not the same hex — they are the same
  brand color, deliberately tuned.
- **Retoken the web app dark mode too.** The gold→amber change is applied at the
  `.dark` accent tokens, so every amber surface (buttons, links, focus rings, active
  shelf tab, "N forgotten" chip) shifts at once and the extension and web app match.

## Considered and rejected

- **Real `backdrop-filter` vibrancy** — physically can't blur page content from a
  popup; rejected as impossible, not merely undesirable.
- **Dark-only or light-only popup** — rejected; adaptive `prefers-color-scheme` keeps
  the warm brand in daylight and delivers the iconic dark frosted look at night.
- **Literal `#b45309` in dark mode** — purest single value but leaves amber text on
  graphite below AA; rejected for accessibility.
- **macOS system blue accent in dark** — most "native" but abandons the brand; rejected.
