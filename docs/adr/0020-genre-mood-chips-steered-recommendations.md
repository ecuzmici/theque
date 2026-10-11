---
status: accepted
---

# Genre and mood chips on Books and Watch, and a mood field that steers recommendations

## Context

The Books and Watch shelves have no way to narrow the grid by kind of title. The recommender (ADR 0015, ADR 0016) uses only the taste profile. You cannot ask it for "something eerie tonight".

Data on 2026-10-11 (SQL on the production project):

- `movies_and_tv`: 86 of 88 items have `structured.genres` from TMDB. The labels are clean. "Drama" is on 50 of 88 items.
- `books`: 35 of 136 items have `structured.genres`. The 54 labels are messy ("Dystopia" and "Dystopian", "Fiction / Fantasy / Epic", "adult", "Electronic books"). 132 of 136 books have a description.
- The library loads 24 items per page. A filter must run in the database, not on the loaded page.
- `/api/recommend` has no result cache. `RECOMMEND_CACHE_TTL_SEC` is defined but no code reads it. The route has a rate limit of 20 runs per user per day.

We built two prototypes on the real `/library` route. Emil picked variant C for the chip row and variant B for the mood field.

These terms apply in this ADR:

- **Genre key**: one value from the fixed genre list of a category, for example `horror`.
- **Mood key**: one value from the fixed mood list, for example `eerie`.
- **Steer**: the free text that the user types in the "In the mood for…" field.

## Decisions

### 1. The genre lists are fixed, one list for each category

Watch has 12 genre keys. The table shows the TMDB labels that map to each key.

| Key | Label | TMDB labels |
|---|---|---|
| `horror` | Horror | Horror |
| `thriller` | Thriller | Thriller |
| `mystery` | Mystery | Mystery |
| `crime` | Crime | Crime |
| `scifi-fantasy` | Sci-Fi & Fantasy | Sci-Fi, Science Fiction, Fantasy, Sci-Fi & Fantasy |
| `comedy` | Comedy | Comedy |
| `action-adventure` | Action & Adventure | Action, Adventure, Action & Adventure |
| `war-history` | War & History | War, History, War & Politics |
| `romance` | Romance | Romance |
| `documentary` | Documentary | Documentary |
| `animation` | Animation | Animation |
| `family` | Family | Family, Kids |

- "Drama" maps to no key. It is on 57% of the Watch shelf, so a Drama chip does not narrow the grid.
- Reality, TV Movie, Music, Western, Soap, Talk and News map to no key.

Books has 12 genre keys:

| Key | Label | Example raw labels |
|---|---|---|
| `fantasy` | Fantasy | Fantasy, Urban Fantasy, Magic, dragons, Fiction / Fantasy / Epic |
| `scifi` | Sci-Fi | Science Fiction, Sci-fi, Space, Aliens, Dystopian, Dystopia, Post-Apocalyptic, Time Travel |
| `mystery-crime` | Mystery & Crime | Mystery, Crime, Murder |
| `thriller` | Thriller | Thriller, Thrillers, Conspiracies |
| `horror` | Horror | Horror |
| `literary` | Literary | Literary Fiction, Literature, World Literature, Contemporary, Magical Realism |
| `historical` | Historical | Historical Fiction |
| `romance` | Romance | Romance |
| `classics` | Classics | Classics |
| `young-adult` | Young Adult | Young Adult |
| `nonfiction` | Nonfiction | Nonfiction, History, Science, Essays, Philosophy, Religion, social science, Medical |
| `memoir-biography` | Memoir & Bio | Memoir, Biography, Biography & Autobiography |

- "Science Fiction & Fantasy" maps to `scifi` and `fantasy`.
- Fiction, Novels, adult, Electronic books, LGBTQ, Queer, Adventure, War and Humor map to no key.
- The alias match ignores case and trims spaces. A label with " / " is split, and each part is matched.

### 2. The mood list is fixed and shared by Books and Watch

The 10 mood keys are: `cozy`, `funny`, `heartfelt`, `dark`, `tense`, `eerie`, `mind-bending`, `slow-burn`, `epic`, `thought-provoking`.

- An item has 0 to 3 mood keys.
- The LLM picks moods only from this list. The code drops any other value.
- Users cannot create, rename or add moods or genres. This keeps ADR 0001 and the removal of tags and collections.

### 3. Genre keys and mood keys are columns on `items`

A migration adds three columns:

- `genre_keys text[] not null default '{}'`
- `mood_keys text[] not null default '{}'`
- `taste_tagged_at timestamptz null`. Null means that the LLM did not tag the item yet.

Reasons:

- The grid loads 24 rows per page, so the filter must run in SQL. `genre_keys @> '{horror}'` is a simple filter on an array column.
- `structured` holds per-category facts from sources. The keys are derived values that we compute again when the lists change.
- `structured.genres` stays as it is. It is the deterministic source for `genre_keys`, and the item detail page can still show it.

The lists, the alias maps and the derive function live in `src/lib/taste/`. The database has no check constraint on the values. The code validates every write.

### 4. Genre keys come from data first, and the LLM fills the gaps

The order for each item is:

1. Map `structured.genres` through the alias table. This gives the genre keys for nearly all Watch items and the 35 books that have genres.
2. For a book without `structured.genres`, run the Hardcover resolver to get genres. Then map them through the alias table.
3. For a book that still has no genre key, the LLM tagging call (decision 5) picks 1 to 3 genre keys.

Each enrichment run computes `genre_keys` again from the alias table when it writes `structured.genres`. A deterministic genre key always replaces an LLM genre key.

### 5. One LLM call tags moods and fills book genres

The tagging call sends a batch of up to 10 items. For each item, it sends the title, the creator, the year, the raw genres and the description (cut to 600 characters).

- The call does not send `note` or `verdict`. Both are private and encrypted (ADR 0013).
- The call uses structured output with an enum of the mood keys and the genre keys.
- The call uses the enrichment models in `llm-config.ts` (ADR 0017).
- For a new item, the enrichment job tags the item after enrichment ends. Only `books` and `movies_and_tv` items get tags.
- The tagging call counts against `ENRICH_LLM_DAILY_LIMIT`. Past the cap, the job leaves `taste_tagged_at` null. The next backfill run tags the item.
- The tagging call runs only when `LLM_ENRICHMENT_ENABLED=true` and the AI Gateway is configured.

### 6. Two backfill scripts, each with a dry run and a backup

1. `scripts/backfill-book-genres.ts` runs the Hardcover resolver for books without `structured.genres`. It sends batched queries (ADR 0018).
2. `scripts/backfill-taste-tags.ts` sets `genre_keys` from the alias table for all items. Then it runs the tagging call for items with null `taste_tagged_at`.

Both scripts obey these rules:

- The default mode is a dry run. The dry run writes a proposal file in JSON and prints a summary. It writes nothing to the database.
- `--apply --from <proposal.json>` writes exactly the rows in the proposal. It makes no new LLM call. So you review the same values that the script writes.
- Before `--apply` writes, the script writes a backup in JSON of each changed row (`id`, `structured`, `genre_keys`, `mood_keys`, `taste_tagged_at`).
- `--max-calls` limits the LLM calls. The default is 40.

Cost: the library has 224 books and Watch items. With batches of 10, the backfill makes about 23 LLM calls and sends about 80,000 input tokens. The backfill does not count against the daily cap of a user.

### 7. One chip row on Books and Watch, with a Mood chip first (prototype `taste-chips`, variant C)

- The chip row sits inside the sticky search block, under the shelf chips. It shows only on the Books and Watch shelves.
- The row starts with a "Mood ▾" chip. A tap opens a popover with the mood chips. A divider follows, then the genre chips.
- A genre chip shows only when 2 or more items on the shelf carry its key. The chips are in order of count, highest first. Each chip shows its count.
- One genre and one mood can be active at the same time. The grid shows items that match both.
- An active chip has an outline, a light tint and a ×. It does not use the foreground fill of the active shelf chip. No chip uses amber (ADR 0019).
- The active keys live in the URL as `?genre=` and `?mood=`, so they survive a reload. A change of shelf clears them.
- The chips also filter search results while a search query is active.
- `GET /api/items` accepts `genre` and `mood` parameters. A new endpoint returns the chip counts for a shelf.

### 8. The chips filter the library and steer recommendations

- An active chip filters the grid (decision 7).
- An active chip also fills the mood field of the "Made for you" sheet (decision 9). A mood chip gives its label ("eerie"). A genre chip gives its label ("Horror"). Both together give "eerie Horror".
- The search text does not fill the mood field. A query is often a part of a title, which is a bad steer.

### 9. "Made for you" opens a sheet with a mood field (prototype `steer-field`, variant B)

- A tap on the "Made for you" tile opens a sheet. The sheet replaces the Books and Watch dropdown.
- The sheet holds a Books and Watch toggle, an "In the mood for…" field, a row of the 10 mood chips, and one amber "Recommend" button.
- The toggle starts on the active shelf when it is Books or Watch. Otherwise it starts on Books. A locked shelf (fewer than `RECOMMEND_MIN_ITEMS` items) is disabled.
- A tap on a mood chip puts its label in the field.
- An empty field starts a run without a steer, as today.
- The deck header shows "In the mood for: <steer>". To change the steer, close the deck and open the sheet again.

### 10. The steer reaches the recommender prompt as one bounded section

- `POST /api/recommend` accepts an optional `steer` string. The server trims it, removes control characters and quotes, and cuts it to 80 characters.
- `buildRecommendPrompt` adds a section after the taste profile when the steer is not empty:
  `REQUEST FOR THIS RUN: the user is in the mood for "<steer>". Every suggestion must fit this request. Use the taste profile to choose among titles that fit it.`
- The rules section stays the same. The steer cannot remove the NEVER list or the owned list.
- A steered run counts against the same limit of 20 runs per day.
- There is no result cache, so there is no cache key to change. We delete the unused `RECOMMEND_CACHE_TTL_SEC`.
- The run state in `useRecommendationRun` stores the steer, so the deck header and the minimized pill can show it.

## Consequences

- Each Watch item gets genre chips at once from TMDB data. Books need the Hardcover backfill and the tagging backfill before their chips are useful.
- The moods are LLM opinions. A wrong mood shows a wrong item under a chip. You cannot correct a mood in the UI in this version.
- A steered run can find fewer titles than an open run. The empty-state copy of ADR 0016 covers this case.
- A change to a list needs a backfill run. The `taste_tagged_at` column lets a script find the rows to tag again.

## Out of scope

- Genre and mood chips on the item detail page.
- A manual edit of the moods of an item.
- A taste profile that puts loved items with the active genre or mood first.
- Chips on the All, Articles and Other shelves.
