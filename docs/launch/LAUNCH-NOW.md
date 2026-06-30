# thèque — LAUNCH NOW

Phone-glance launch runbook. Everything below is paste-ready. Edit *italics* before posting.

- **App:** https://theque.app
- **Extension:** https://chromewebstore.google.com/detail/blahodpkabcnliljldelkoggeemfgdak
- Full strategy: `launch-kit.md` · Demo recorder: `../../.demo/record-demo.mjs`

---

## The one rule

**Only launch when you can sit with it for a full hour.** HN, Reddit, and PH all weight the
first 30–60 minutes heavily — a post you can't tend dies. Your free hours (evenings 17:00+ CEST,
weekends) land on **US peak daytime** (8am–3pm PT / 11am–6pm ET), which is ideal. So this works
*around* your job, not against it. **Never launch mid-workday.**

### Why this order (research, June 2026)

- Timing is a **1.3–1.5× multiplier on content**, never a substitute. ~10% of HN posts hit the
  front page regardless of hour.
- **Show HN does better on weekends** (Sunday ~11.75% vs weekday ~9.5% breakout) — overrides the
  old "weekday morning" advice.
- **Product Hunt requires being glued to it 9am–3pm CEST** (12:01am PT reset + first-4–6h
  ranking). That's your workday → **defer or skip** (also no friend squad lined up).

---

## Schedule (your time, CEST)

| When | Channel | Window rationale |
|---|---|---|
| **Tonight, ~30 min** | Pre-flight smoke test | Irreversible attention — funnel must work |
| **Sun 5 Jul, 14:00** *(best)* | **Show HN** | Data-best Show HN window + free all day to reply |
| **or any Tue–Thu, 17:00** *(faster)* | **Show HN** | 8–10am PT weekday window, reply all evening |
| Next evening, 18:00+ | Reddit (1 sub/day) | Overlaps US afternoon; you can reply |
| Once HN/Reddit move | X thread | Lowest timing-sensitivity; phone-friendly |
| A day you're off, 09:00 | Product Hunt *(optional)* | Only if you can babysit 9:00–15:00 |

Pick **one** Show HN slot. Sunday has the data edge; Tue–Thu evening is sooner and nearly as good.

---

## Account prerequisites — set these up FIRST

New/brand accounts are gated differently per platform. Sort these before the schedule above means anything.

| Platform | Gate | Action | Ready in |
|---|---|---|---|
| **HN** | No karma to post; new accounts get extra scrutiny | Create account, then **warm it**: 3–7 genuine comments on other stories → ~20+ karma | **1–2 days** |
| **PH** | **1-week** account-age wait; **personal accounts only** (brand accounts can't post) | Create a **personal** account today; or subscribe to PH newsletter to skip the wait | **~1 week** (or now via newsletter) |
| **Reddit** | Each sub sets age + karma gates (e.g. r/productivity = 50 karma + 14 days) | ✅ **Using `u/kuzmoff`** — clears the gates; ready now | now |
| **X** | No hard gate; new accounts get low reach | Use existing, or accept limited reach | now |

> **Reddit account: `u/kuzmoff` (personal).** It clears the age/karma gates, and Reddit self-promo
> is meant to come from a real human, not a brand — so this is the right call. Just keep a sane
> self-promo ratio (don't make the account look single-purpose): mix in genuine comments, don't blast
> all the subs at once, one per day as scheduled.

---

## STEP 0 — Pre-flight (tonight, before any post)

The demo is route-mocked, so this is the first real test of the live path. ~30 min.

- [ ] Fresh signup on https://theque.app (incognito, as a stranger would)
- [ ] Install the extension from the live store link
- [ ] Capture 3 pages: a book, a film, **one messy/blocked page**
- [ ] Cards come back **accurate and good-looking**
- [ ] Leave one verdict → confirm a **real** recommendation deck returns
- [ ] Note anything ugly → fix before spending the launch
- [ ] Stage assets for fast paste (see bottom)

---

## STEP 0b — Store pages to refresh  *(do before you link anyone)*

People click the store link straight from your HN/Reddit/X posts, so the listing has to
match the current app first. The canonical copy + assets live in
[`../chrome-store/listing.md`](../chrome-store/listing.md) — **diff the live dashboard
against that file** and update anything stale. (The live listing predates the screenshot +
copy refresh recorded in that file, so expect the screenshots especially to be out of date.)

**Chrome Web Store** → dashboard → *Store listing* (<https://chrome.google.com/webstore/devconsole>):

- [x] **Screenshots** — remove any old **synthetic mockups** (fake address bar / old shelf
      names; the deleted `extension-popup-1280x800.png` + `library-result-1280x800.png`).
      Upload the 5 real **1280×800** shots from `docs/chrome-store/`, lead-first:
      library → item-detail → shelf-watch → shelf-books → extension-popup.
- [x] **Detailed description** — paste the block from `chrome-store/listing.md`. Scan for
      **stale taxonomy**: shelves are **Books · Watch · Articles · Other** (+ All/Done) — no
      Listen/Eat/Shop/Cook/Tools, no "gifts", no tags, no collections.
- [x] **Short description (132)** — matches `listing.md` exactly.
- [x] **Small promo tile 440×280** — `promo-small-440x280.png` (optional marquee 1400×560:
      `promo-marquee-1400x560.png`).
- [x] **Privacy policy URL** — `https://theque.app/privacy`.
- [x] **Permission justifications + single purpose** — copied from `listing.md`.
- [x] **Category / Language** — Productivity / English.
- [x] **Version** — if the live build is older than the `theque-extension-v1.0.0.zip`
      produced by `npm run package:extension`, re-upload the fresh zip.

> Couldn't auto-pull the live page to pre-fill this (the store URL loops through a Google
> consent redirect), so confirm each field in the dashboard by eye.

**Edge Add-ons** *(new — same package)* → see
[`../edge-store/listing.md`](../edge-store/listing.md). Needs a free Partner Center account
and a 300×300 logo; otherwise reuses the Chrome copy and screenshots. Once live, add the
Edge link to the top of this file and to the Reddit/X posts below.

---

## STEP 1 — Show HN  *(your lead channel)*

1. Sit down where you can reply for ~60 min (Sun 14:00 CEST, or a Tue–Thu 17:00 CEST).
2. Go to https://news.ycombinator.com/submit
3. **Title** (paste exactly):

```
Show HN: thèque, a private visual library for the things you save
```

4. **URL:** `https://theque.app`  (leave the text box empty)
5. Submit, open your post, and **immediately** post this as the first comment:

```
I was not happy with the hundreds of bookmarks I had for movies and books, and the idea of having "watch" or "read" lists in separate websites was cumbersome. So I built thèque to manage my taste, and added AI recommendations on top.

Stack: Next.js 16 + Supabase (Postgres/RLS) on Vercel; a Chrome MV3 extension for capture. Classification is deterministic first (a domain map + schema.org + heuristics + free resolvers like Open Library and TMDB), and only falls back to an LLM (Gemini) to fill sparse fields, gated behind env flags. The server-side fetcher has SSRF guards (IP/redirect validation, body caps) since it fetches arbitrary user URLs.

There's also a recommender, but it leans on you: it builds a taste profile from the verdicts you leave (4-5★ items as positive signal, 1-2★ as negative), keeps a persisted outcome log so it never re-suggests the same title, and grounds picks against Open Library/TMDB rather than free-associating. It's deliberately weak until you've rated a handful of things, since there's nothing to reason from on day one.

It's free while I figure out what it wants to be. Happy to go deep on the enrichment pipeline or the privacy/abuse model. Feedback welcome.
```

6. **Reply to every comment, fast, for the first hour.** Don't get defensive. HN rewards the
   technical-honesty angle (deterministic-first, the cold-start admission) — lean in.
- [ ] Posted · [ ] First-hour replies done

---

## STEP 2 — Reddit  *(from `u/kuzmoff`, one subreddit per day, evenings 18:00+ CEST)*

Posting as **`u/kuzmoff`** — clears the gates. Keep a sane self-promo ratio: one sub per day (not all
at once), mix in genuine comments so the account doesn't read as single-purpose. Read each sub's rules
first; many require flair or a self-promo ratio. Reply in the first hour.
GIF: use `theque-demo-1280.gif` (Reddit handles big files).

**Day A — r/chrome_extensions** (most permissive):

```
[Tool] thèque: save any page as a visual card in a private library

I built a Chrome extension that does more than bookmark: click it on any page and it pulls the cover/title/author/rating and files it on a shelf in your private library (no feed, no ads). Books, films, recipes, products, etc. Free. Would love feedback from this sub specifically: https://chromewebstore.google.com/detail/blahodpkabcnliljldelkoggeemfgdak. Happy to answer anything about the MV3 side.
```

**Day B — r/productivity or r/PKMS** (lead with the problem; link in a comment if rules require):

```
I replaced my bookmark graveyard with a "taste library" — here's the idea

Bookmarks I never reopened kept piling up, so I wanted a visual, private library that auto-organizes what I save into cards on shelves. I ended up building it; link in a comment if allowed. Curious how others here handle the "saved and forgot" problem.
```

**Day C — r/DigitalMinimalism** (lead with the anti-feed angle):

```
A bookmark tool with no feed, no likes, nothing built to keep you scrolling

I got tired of "save it later" apps that turn into another feed. So I built a private visual library: click once, it saves the page as a clean card on a shelf, and that's it. No infinite scroll, no notifications, no ads. *Curious whether others here have found calm alternatives to the usual read-later apps.*
```

**Opportunistic — r/pocket / Pocket-alternative threads** (be helpful, not spammy):

```
Pocket shut down, so I've been using a private, visual alternative I built — thèque. It reads the page and files it as a card on a shelf instead of a flat list. Free: https://theque.app
```

- [ ] Day A · [ ] Day B · [ ] Day C

---

## STEP 3 — X / Twitter thread  *(once HN/Reddit show traction)*

Attach `theque-demo-960.gif` to tweet 1 (the 1280 GIF is over X's ~15MB cap). Post from phone is fine.

```
1/ Your bookmarks are a graveyard. I built a library instead. 👇 [attach 960 GIF]

2/ One click on any page → thèque reads it and builds a card: cover, author, rating, price. No copy-paste.

3/ It sorts itself onto shelves: Books, Watch, Articles, and an Other shelf for the rest. Rate what you finish and it starts finding you more.

4/ Private by design. No feed, no likes, no ads, nothing built to keep you scrolling. It's your library.

5/ Free while it grows. Try it: theque.app · Chrome: https://chromewebstore.google.com/detail/blahodpkabcnliljldelkoggeemfgdak
```

- [ ] Thread posted · [ ] Replied to everyone who engaged

---

## STEP 4 — Product Hunt  *(DEFERRED — only on a day off)*

Skip unless you can be present **09:00–15:00 CEST** (12:01am PT reset; first 4–6h set ranking).
No friend squad lined up, so this is low-priority. If/when you do it:

- **Tagline (≤60 char):** `A private, visual library for everything you save`
- **Description (≤260 char):**

```
thèque turns the links you save into a beautiful private library. One click captures any page (a book, film, place, recipe, product) and thèque builds a rich card and files it on a shelf. No feed, no likes, no ads. Just your taste, organized.
```

- **First (maker's) comment:**

```
Hi PH 👋 I built thèque because my bookmarks were a graveyard, hundreds of URLs I never reopened. I wanted a library, not a list: something that reads the page, pulls the cover and details, and sorts it onto a shelf automatically. It's private by design: no feed, no ads, nothing built to keep you scrolling. Capture is one click from Chrome (or your phone). Enrichment is mostly deterministic, with optional AI only to fill gaps. And as you rate what you finish, it starts suggesting new things to read or watch, pulled from your taste instead of a trending feed. Free while it grows. I'd love your honest feedback on the capture → shelf flow. — Emil
```

- Use the **mp4** (`theque-demo.mp4`) as the launch video.

---

## Assets  (`.demo/out/`, gitignored — upload-only)

| File | Size | Use on |
|---|---|---|
| `theque-demo.mp4` | 2 MB | Product Hunt, landing, anywhere video is allowed (sharpest) |
| `theque-demo-960.gif` | 13 MB | X/Twitter (under the ~15MB GIF cap) |
| `theque-demo-1280.gif` | 22 MB | Reddit (native upload handles large files) |
| `theque-demo.webm` | 3.2 MB | Backup video |

The demo's 4 beats: capture (Goodreads + popup) → card lands on Books shelf → recommend deck
(skip w/ reason, save another) → close the loop with a 5★ verdict.

---

## Metrics to watch (week 1) — from `launch-kit.md` §6

1. **Activation:** % of signups who save ≥3 items. *If low, fix onboarding before anything else.*
2. **Verdict rate:** % of actives who leave ≥1 verdict by end of week 2 (the on-ramp to recs).
3. **Retention:** % back in week 2 with ≥10 items or ≥1 verdict.
4. **Capture source mix:** extension vs web vs mobile.
5. **Cost per active user** (enrichment + recommendation inference).

Don't spend on paid acquisition until week-2 retention looks healthy.
