# overnight/adr-taste-card — DONE

Constraint-challenge idea: a shareable "taste card" (attraction/virality), which
conflicts with AGENTS.md "no social/sharing" + ADR 0001.

Delivered:
- Primary: draft ADR docs/adr/0013-shareable-taste-card.md (status: proposed,
  type: constraint-challenge) laying out the conflict and three options
  (A private download / B opt-in token snapshot / C public profile), recommending
  A now and B only if/when sharing demand is proven; C rejected for the PoC.
- ADR-safe slice (Option A only): a private, authenticated /taste-card page
  rendering the signed-in user's own summary, with a dependency-free canvas PNG
  download. No public route, no DB/RLS change, no auto-publish — an export, like a
  screenshot. B/C stay gated behind ADR acceptance.
