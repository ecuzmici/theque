# Possible features

Brainstormed ideas that haven't been grilled, planned, or built — raw and
undetailed, captured before they evaporate. Append-only, newest first. To add
one, use the `/note-idea` skill (or let a `/grill-me` session offer it when
nothing concrete came out).

## Steer the recommendation run with a preference before it runs (2026-08-14)

Let the user say what they're in the mood for *before* a recommendation run, instead of only getting whatever the taste profile implies. Today the run is fully implicit: `buildRecommendPrompt` assembles LOVED / DISLIKED / BACKLOG / OWNED from `taste-profile.ts` and asks the LLM to "look for patterns in genre, tone, era, themes, style" — the user has no way to nudge it. Two shapes of nudge, both wanted: **narrower** ("more sci-fi specifically", "something short", "non-fiction this time") and **wider/off-piste** ("I always read sci-fi and fantasy — give me something outside that"). Note that the second overlaps with the "Reach further" explore-mode idea below, but arrives from the opposite direction: explore mode is a *system-triggered* fallback when the taste graph is exhausted, this is a *user-stated* intent on any run. Possibly the same underlying prompt lever with two entry points.

Open questions, none resolved: free-text box vs. preset chips (genre / mood / length / "surprise me") — free text is more expressive but harder to eval and opens prompt-injection surface into the recommendation prompt; per-run ephemeral steer vs. a sticky preference stored on the profile (a standing "never horror" is a different thing from tonight's mood); how a stated preference interacts with DISLIKED, which currently just says "avoid things that resemble these"; whether the steer should be echoed back in the reason chips so the user can tell it was honored; and how to keep the yield/eval axis honest when the user has deliberately asked for lower on-taste precision. Where it lives in the UI is unclear too — the recommend pill fires a run immediately today, so a steer step means either an intermediate sheet or an inline control on the deck.

## "Reach further" explore mode for recommendations (2026-07-23)

An opt-in (or auto-triggered) recommendation mode that deliberately broadens beyond the user's core taste — adjacent genres, other eras, cross-category leaps — trading precision for freshness. Surfaced while fixing the empty-recommendations bug (books/watch returning zero cards): supply-widening + suppression decay (A+C in that grill) keep the *precise* recommender alive longer, but a bounded taste graph still exhausts eventually. Explore mode is the answer to "you've seen everything close to your taste" — instead of an honest-empty state, offer a distinct "reach further" path. Needs its own prompt mode (loosen the "look for patterns in genre/tone/era" framing into deliberate divergence), its own UX affordance (a toggle or a low-yield fallback CTA), and its own eval axis (novelty/diversity weighted *up*, on-taste weighted *down* — the opposite of the precise recommender's yield metric). Distinct feature from the mechanical empty-recs fix; deferred so it doesn't balloon that change.

## War-room-queryable funnel analytics — no GA4 (2026-07-04)

Visits/referrers are already covered: the mounted `@vercel/analytics` collects them and Vercel's Web Analytics REST API (`/v1/query/web-analytics/visits/*`) lets the `/war-room` agent query visitors, pageviews, and referrer breakdowns with a plain access token — wired into the war-room command. Custom `track()` events turned out to be Pro-only (not on Hobby), so for funnel events (signup → save → recommend) the free path is a tiny first-party, no-PII event table in Supabase (path, referrer, day bucket, rate-limited insert) that the agent can SQL-query alongside the rest. GA4 considered and rejected: adblock-blind for the HN/PH/Reddit launch audience, cookies would force a GDPR consent banner that clashes with the private-library positioning, and no lightweight API for an agent to poll.

## Smoother tab/shelf/page transitions (2026-07-01)

Navigation between tabs, shelves, and pages currently feels clunky/abrupt. Wants transitions to feel smooth and calming — likely needs deliberate motion/animation design (easing, shared-element or fade transitions) rather than instant cuts.

## Library shelf navigation redesign (2026-06-30)

Move the main library screen's shelf navigation away from the horizontal pill-tab strip toward something more "library-like." Prototyped three directions (Netflix-style preview rows, accordion expand-in-place, and tabs-unchanged-but-restyled-as-shelf-rows-with-dividers) — none felt right. Open problem; needs more thought on what "library-like" should actually mean before trying again.

## Profile page with stats (2026-06-30)

A user profile page showing stats about their library (e.g. items saved, completed, by category). Noted speculatively — not fully convinced this is worth building.

## Onboarding tutorial for new users (2026-06-30)

A guided first-run walkthrough for brand new users — explains capture (extension/manual add), shelves vs. collections, and the done/taste-loop verb so the value isn't lost on an empty library.
