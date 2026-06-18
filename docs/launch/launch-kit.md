# thèque — go-to-market launch kit

Practical, copy-paste launch playbook for a solo maker. Written for someone doing this for the
first time. Work top to bottom: **positioning → pre-launch gate → channels → launch week → metrics.**

App: https://theque.app · Extension: https://chromewebstore.google.com/detail/blahodpkabcnliljldelkoggeemfgdak

---

## 1. Positioning

**One-liner:** A private, visual library for the things you want to come back to.

**The wedge (say this everywhere):** *Not a feed. Not a read-later graveyard. A library of your taste.*
Bookmarks and read-later apps store URLs you forget. thèque reads the page and builds a beautiful
card — cover, author, rating, price — and files it on a shelf. No likes, no algorithm, no ads.

**Timely hook:** Pocket shut down in 2025. There's an active wave of people searching for
"Pocket alternative." thèque is a prettier, private home for saves — lean into this.

**Closest competitor:** mymind (visual, private, AI — but a paid subscription). thèque's angle:
free, taste-library framing, category-aware shelves, one-click capture.

**Who to target first (warm, specific communities — not "everyone"):**
- Book people (Goodreads / StoryGraph crowd), film people (Letterboxd crowd).
- PKM / "second brain" / digital-minimalism folks who dislike feeds.
- Design-minded people who care that a tool is *beautiful*.

**Voice:** calm, understated, a little literary. Lowercase "thèque". Never hype-y. Never "AI-powered
everything" — the enrichment is mostly deterministic, and that honesty plays well (especially on HN).

---

## 2. Pre-launch gate (do NOT launch until these are true)

Launching drives your one-time burst of attention at each channel. Don't waste it on a leaky funnel.

- [ ] **Store listing refreshed** — real screenshots (not the old synthetic mockups), new description. See `docs/chrome-store/listing.md`.
- [ ] **Landing page** shows what the product looks like (add 1–2 real screenshots to `src/app/page.tsx` where the decorative shelf is) and has the **Add to Chrome** button (done) + Privacy/Terms in the footer (done).
- [ ] **Terms + Privacy** live (done: `/terms`, `/privacy`).
- [ ] **You've watched 5–10 real people use it** and fixed the worst friction. Today: 9 users, 3 active, **0 collections** — validate that the core loop (save → browse → come back) actually lands before buying attention.
- [ ] **Cost guardrails confirmed** — rate limits + quotas are on (they are). Know your Gemini/enrichment spend per active user so growth doesn't surprise you.
- [ ] **A 20–40s demo video/GIF** of: click extension → card appears → shelf fills. This is the single highest-converting asset across every channel.

---

## 3. Channel playbook (ready-to-paste copy)

> Edit the personal bits (in *italics*) before posting. Read each community's rules first — most ban
> drive-by self-promo. Show up as a participant, not an ad.

### Product Hunt (best fit — "beautiful tool" audience)
Launch 12:01am PT on a Tue/Wed/Thu. Have 5–8 friends ready to genuinely try it and comment (never
ask for upvotes — that's against the rules).

- **Name:** thèque
- **Tagline (60 char max), pick one:**
  - `A private, visual library for everything you save` (49)
  - `Your saves, as a beautiful private library` (43)
  - `Bookmarks, reimagined as a library of your taste` (49)
- **Description (260 char):**
  > thèque turns the links you save into a beautiful private library. One click captures any page — a book, film, place, recipe, product — and thèque builds a rich card and files it on a shelf. No feed, no likes, no ads. Just your taste, organized.
- **First (maker's) comment:**
  > Hi PH 👋 I built thèque because my bookmarks were a graveyard — hundreds of URLs I never reopened. I wanted a *library*, not a list: something that reads the page, pulls the cover and details, and sorts it onto a shelf automatically. It's private by design — no feed, no algorithm, no ads. Capture is one click from Chrome (or your phone). Enrichment is mostly deterministic, with optional AI only to fill gaps. Free while it grows. I'd love your honest feedback on the capture → shelf flow. *— [name]*

### Hacker News — "Show HN"
HN rewards technical honesty and dislikes marketing language. Post the bare link + a plain first
comment. Best ~8–10am ET weekday. Reply to everyone; don't get defensive.

- **Title:** `Show HN: Thèque – a private visual library for the things you save`
- **First comment:**
  > I got tired of bookmarks I never reopened, so I built a personal "taste library." You click once on any page and it becomes a visual card — cover, author/director, rating, price — filed on a shelf (Books, Watch, Listen, Eat, Shop, Read, Cook, Tools…). It's single-purpose and private: no feed, no social graph, no ads.
  >
  > Stack: Next.js 16 + Supabase (Postgres/RLS) on Vercel; a Chrome MV3 extension for capture. Classification is deterministic first — a domain map + schema.org + heuristics + free resolvers (Open Library, TMDB, etc.) — and only falls back to an LLM (Gemini) to fill sparse fields, gated behind env flags. The server-side fetcher has SSRF guards (IP/redirect validation, body caps) since it fetches arbitrary user URLs.
  >
  > It's free while I figure out what it wants to be. Happy to go deep on the enrichment pipeline or the privacy/abuse model. Feedback welcome.

### Reddit (tailor per subreddit; read rules; many require flair or a self-promo ratio)
- **r/chrome_extensions** (most permissive for tools):
  > **[Tool] thèque — save any page as a visual card in a private library**
  > I built a Chrome extension that does more than bookmark: click it on any page and it pulls the cover/title/author/rating and files it on a shelf in your private library (no feed, no ads). Books, films, recipes, products, etc. Free. Would love feedback from this sub specifically — [store link]. Happy to answer anything about the MV3 side.
- **r/productivity / r/PKMS / r/Notion refugees:** lead with the *problem*, not the tool:
  > **I replaced my bookmark graveyard with a "taste library" — here's the idea**
  > *(short story: bookmarks I never reopened → wanted a visual, private library that auto-organizes)*. I ended up building it; link in a comment if allowed. Curious how others here handle the "saved and forgot" problem.
- **r/DigitalMinimalism:** lead with the anti-feed angle (no algorithm, no likes, private).
- **r/pocket / r/save / Pocket-alternative threads:** "Pocket shut down — I built/found a private, visual alternative." Be helpful, not spammy.

### Indie Hackers
Post a "I built X, here's what I learned" milestone rather than an ad. Share the deterministic-first
enrichment decision and the PoC→public hardening (rate limits, quotas, SSRF) as the interesting story.

### X / Twitter launch thread (5 tweets)
1. Hook + GIF: "Your bookmarks are a graveyard. I built a library instead. → [20s GIF of capture → shelf]"
2. "One click on any page → thèque reads it and builds a card: cover, author, rating, price. No copy-paste."
3. "It sorts itself onto shelves — Books, Watch, Listen, Eat, Shop, Read, Cook. Group anything into collections."
4. "Private by design. No feed, no likes, no algorithm, no ads. It's *your* library."
5. "Free while it grows. Try it: theque.app · Chrome: [store link]. RTs appreciated 🙏"

---

## 4. Evergreen / SEO (compounds after launch)
- **Build a `/pocket-alternative` page** (and "visual bookmark manager", "Raindrop alternative", "mymind alternative"). These are searched consistently and convert intent traffic.
- **Comparison posts:** thèque vs Pocket / Raindrop / mymind — honest tables. Linkable, rank-able.
- Make sure the **OG image** (added: `src/app/opengraph-image.tsx`) and titles look good when shared — every Reddit/Twitter/Slack link preview is free marketing.

---

## 5. Launch-week sequence
- **T-7 to T-1:** finish the pre-launch gate. Record the demo GIF. Line up 5–10 friends. Soft-share in 1–2 small communities/Discords for last feedback.
- **Day 1 (Tue/Wed/Thu):** Product Hunt at 12:01am PT. Maker comment up immediately. Reply all day.
- **Day 1, ~8–10am ET:** Show HN. Different framing (technical). Reply all day.
- **Day 2–3:** Reddit, one subreddit per day (avoid blasting — looks like spam). Indie Hackers post.
- **Day 2–5:** X thread + reply to anyone who engages. DM thank-yous to early signups.
- **Ongoing:** turn the best feedback into a public changelog; the built-in **weekly digest email** is your re-engagement loop — make sure it's sending.

---

## 6. Metrics & when to spend money
Watch, in order of importance:
1. **Activation:** % of signups who save ≥3 items in week 1. (If low, fix onboarding before anything else.)
2. **Retention:** % who come back in week 2 and have ≥1 collection or ≥10 items. This is the real signal.
3. **Capture source mix:** extension vs web vs mobile — tells you where to invest.
4. **Cost per active user** (enrichment/AI) — keep it sane.

**Only consider paid acquisition once week-2 retention is healthy.** Paid traffic into an unvalidated
loop just burns money. Until then, every dollar of effort goes into the funnel (landing + store) and
the product (the "aha" of the first 3 saves).
