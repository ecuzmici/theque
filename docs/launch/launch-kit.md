# thèque go-to-market launch kit

Practical, copy-paste launch playbook for a solo maker. Written for someone doing this for the
first time. Work top to bottom: **positioning → pre-launch gate → channels → launch week → metrics.**

App: https://theque.app · Extension: https://chromewebstore.google.com/detail/blahodpkabcnliljldelkoggeemfgdak

---

## 1. Positioning

**One-liner:** A private, visual library for the things you want to come back to.

**The wedge (say this everywhere):** *A library, not a feed.* Your bookmarks pile up and you forget
them. thèque reads the page and builds a card with the cover, author, rating, and price, then files
it on a shelf. No likes, no ads, nothing built to keep you scrolling. And as you rate what you
finish, it starts turning up new things you'll probably love.

**Timely hook:** Pocket shut down in 2025. There's an active wave of people searching for
"Pocket alternative." thèque is a prettier, private home for saves. Lean into this.

**Closest competitor:** mymind (visual, private, AI, but a paid subscription). thèque's angle:
free, taste-library framing, category-aware shelves, and recommendations that learn from the
verdicts you leave.

**Who to target first (warm, specific communities, not "everyone"):**
- Book people (Goodreads / StoryGraph crowd), film people (Letterboxd crowd).
- PKM / "second brain" / digital-minimalism folks who dislike feeds.
- Design-minded people who care that a tool is *beautiful*.

**Voice:** calm, understated, a little literary. Lowercase "thèque". Never hype-y. Never "AI-powered
everything." The enrichment is mostly deterministic, and that honesty plays well (especially on HN).
When you do talk about recommendations, say plainly that they lean on your ratings and stay weak
until you've left a few. Owning the cold start beats overselling the magic.

---

## 2. Pre-launch gate (do NOT launch until these are true)

Launching drives your one-time burst of attention at each channel. Don't waste it on a leaky funnel.

- [ ] **Store listing refreshed:** real screenshots (not the old synthetic mockups), new description. See `docs/chrome-store/listing.md`.
- [ ] **Landing page** shows what the product looks like (real screenshot embedded) and has the **Add to Chrome** button (done) + Privacy/Terms in the footer (done).
- [ ] **Terms + Privacy** live (done: `/terms`, `/privacy`).
- [ ] **You've watched 7–10 real people run the current build** (post verdict-loop) and fixed the worst friction. Today: 9 users, 3 active. Bar: most of them save 3+ items, get cards they call accurate and good-looking, and come back at least once without you nudging them. Recommender quality is **not** a launch gate; cold-start makes it unfair to judge on day one. By this bar you are not through the gate yet, so finish it before you spend the launch.
- [ ] **Cost guardrails confirmed:** rate limits + quotas are on (they are). Know your Gemini spend per active user, both enrichment and recommendation inference, so growth doesn't surprise you.
- [ ] **A 20–40s demo video/GIF** that leads with the instant loop: click extension → card appears → shelf fills, then a short closing tag of the recommendation deck getting smarter. The instant loop is the hook; the deck is the "it grows with you" promise. This is the single highest-converting asset across every channel.

---

## 3. Channel playbook (ready-to-paste copy)

> Edit the personal bits (in *italics*) before posting. Read each community's rules first. Most ban
> drive-by self-promo. Show up as a participant, not an ad.

### Product Hunt (best fit: "beautiful tool" audience)
Launch 12:01am PT on a Tue/Wed/Thu. Have 5–8 friends ready to genuinely try it and comment (never
ask for upvotes, that's against the rules).

- **Name:** thèque
- **Tagline (60 char max), pick one:**
  - `A private, visual library for everything you save` (49)
  - `Your saves, as a beautiful private library` (43)
  - `Bookmarks, reimagined as a library of your taste` (49)
- **Description (260 char):**
  > thèque turns the links you save into a beautiful private library. One click captures any page (a book, film, place, recipe, product) and thèque builds a rich card and files it on a shelf. No feed, no likes, no ads. Just your taste, organized.
- **First (maker's) comment:**
  > Hi PH 👋 I built thèque because my bookmarks were a graveyard, hundreds of URLs I never reopened. I wanted a *library*, not a list: something that reads the page, pulls the cover and details, and sorts it onto a shelf automatically. It's private by design: no feed, no ads, nothing built to keep you scrolling. Capture is one click from Chrome (or your phone). Enrichment is mostly deterministic, with optional AI only to fill gaps. And as you rate what you finish, it starts suggesting new things to read or watch, pulled from your taste instead of a trending feed. Free while it grows. I'd love your honest feedback on the capture → shelf flow. *[name]*

### Hacker News, "Show HN"
HN rewards technical honesty and dislikes marketing language. Post the bare link + a plain first
comment. Best ~8–10am ET weekday. Reply to everyone; don't get defensive.

- **Title:** `Show HN: thèque, a private visual library for the things you save`
- **First comment:**
  > I got tired of bookmarks I never reopened, so I built a personal "taste library." You click once on any page and it becomes a visual card (cover, author/director, rating, price) filed on a shelf (Books, Watch, Listen, Eat, Shop, Read, Cook, Tools…). It's single-purpose and private: no feed, no social graph, no ads.
  >
  > Stack: Next.js 16 + Supabase (Postgres/RLS) on Vercel; a Chrome MV3 extension for capture. Classification is deterministic first (a domain map + schema.org + heuristics + free resolvers like Open Library and TMDB), and only falls back to an LLM (Gemini) to fill sparse fields, gated behind env flags. The server-side fetcher has SSRF guards (IP/redirect validation, body caps) since it fetches arbitrary user URLs.
  >
  > There's also a recommender, but it leans on you: it builds a taste profile from the verdicts you leave (4-5★ items as positive signal, 1-2★ as negative), keeps a persisted outcome log so it never re-suggests the same title, and grounds picks against Open Library/TMDB rather than free-associating. It's deliberately weak until you've rated a handful of things, since there's nothing to reason from on day one.
  >
  > It's free while I figure out what it wants to be. Happy to go deep on the enrichment pipeline or the privacy/abuse model. Feedback welcome.

### Reddit (tailor per subreddit; read rules; many require flair or a self-promo ratio)
- **r/chrome_extensions** (most permissive for tools):
  > **[Tool] thèque: save any page as a visual card in a private library**
  > I built a Chrome extension that does more than bookmark: click it on any page and it pulls the cover/title/author/rating and files it on a shelf in your private library (no feed, no ads). Books, films, recipes, products, etc. Free. Would love feedback from this sub specifically: [store link]. Happy to answer anything about the MV3 side.
- **r/productivity / r/PKMS / r/Notion refugees:** lead with the *problem*, not the tool:
  > **I replaced my bookmark graveyard with a "taste library": here's the idea**
  > *(short story: bookmarks I never reopened → wanted a visual, private library that auto-organizes)*. I ended up building it; link in a comment if allowed. Curious how others here handle the "saved and forgot" problem.
- **r/DigitalMinimalism:** lead with the anti-feed angle (no feed, no likes, nothing built to keep you scrolling, private).
- **r/pocket / r/save / Pocket-alternative threads:** "Pocket shut down, so I built/found a private, visual alternative." Be helpful, not spammy.

### Indie Hackers
Post a "I built X, here's what I learned" milestone rather than an ad. Share the deterministic-first
enrichment decision and the PoC→public hardening (rate limits, quotas, SSRF) as the interesting story.

### X / Twitter launch thread (5 tweets)
1. Hook + GIF: "Your bookmarks are a graveyard. I built a library instead. → [20s GIF of capture → shelf]"
2. "One click on any page → thèque reads it and builds a card: cover, author, rating, price. No copy-paste."
3. "It sorts itself onto shelves: Books, Watch, Listen, Eat, Shop, Read, Cook. Rate what you finish and it starts finding you more."
4. "Private by design. No feed, no likes, no ads, nothing built to keep you scrolling. It's *your* library."
5. "Free while it grows. Try it: theque.app · Chrome: [store link]. RTs appreciated 🙏"

---

## 4. Evergreen / SEO (compounds after launch)
- **Build a `/pocket-alternative` page** (and "visual bookmark manager", "Raindrop alternative", "mymind alternative"). These are searched consistently and convert intent traffic.
- **Comparison posts:** thèque vs Pocket / Raindrop / mymind, with honest tables. Linkable, rank-able.
- Make sure the **OG image** (added: `src/app/opengraph-image.tsx`) and titles look good when shared, since every Reddit/Twitter/Slack link preview is free marketing.

---

## 5. Launch-week sequence
- **T-7 to T-1:** finish the pre-launch gate. Record the demo GIF. Line up 5–10 friends. Soft-share in 1–2 small communities/Discords for last feedback.
- **Day 1 (Tue/Wed/Thu):** Product Hunt at 12:01am PT. Maker comment up immediately. Reply all day.
- **Day 1, ~8–10am ET:** Show HN. Different framing (technical). Reply all day.
- **Day 2–3:** Reddit, one subreddit per day (avoid blasting; it looks like spam). Indie Hackers post.
- **Day 2–5:** X thread + reply to anyone who engages. DM thank-yous to early signups.
- **Ongoing:** turn the best feedback into a public changelog; the built-in **weekly digest email** is your re-engagement loop, so make sure it's sending.

---

## 6. Metrics & when to spend money
Watch, in order of importance:
1. **Activation:** % of signups who save ≥3 items in week 1. (If low, fix onboarding before anything else.)
2. **Verdict rate (the canary):** % of active users who record ≥1 verdict by end of week 2. This is the on-ramp to recommendations, your one differentiated payoff. If it's flat, nobody is reaching the loop that makes thèque more than a bookmark app, so fix that before anything else.
3. **Retention:** % who come back in week 2 and have ≥10 items or ≥1 verdict. This is the real signal.
4. **Capture source mix:** extension vs web vs mobile, which tells you where to invest.
5. **Cost per active user** (enrichment + recommendation inference): keep it sane.

**Only consider paid acquisition once week-2 retention is healthy.** Paid traffic into an unvalidated
loop just burns money. Until then, every dollar of effort goes into the funnel (landing + store) and
the product (the "aha" of the first 3 saves).
