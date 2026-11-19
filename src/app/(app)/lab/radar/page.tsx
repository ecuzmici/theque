import { titleScore } from "@/lib/enrichment/resolvers/title-match";

import { LabHeader } from "../LabHeader";
import { labNow, loadLabItems, type LabItem } from "../lab-data";
import { isEnglishOrUnknown, recentBooksByAuthors } from "../lab-hardcover";
import { directorCredits } from "../lab-tmdb";
import { Radar, type RadarEntry } from "./Radar";

const MONTHS_BACK = 18;
const MAX_DIRECTORS = 14;

/** Creators of finished items rated 4 or 5, best first, with the item that earned the spot. */
function lovedCreators(items: LabItem[], pick: (i: LabItem) => string | undefined) {
  const best = new Map<string, LabItem>();
  for (const item of items) {
    const name = pick(item);
    if (!name || item.status !== "done" || (item.rating ?? 0) < 4) continue;
    const current = best.get(name);
    if (!current || (item.rating ?? 0) > (current.rating ?? 0)) best.set(name, item);
  }
  return [...best.entries()].sort((a, b) => (b[1].rating ?? 0) - (a[1].rating ?? 0));
}

/** Teasers, placeholders, and audio dramas that are not a new book or film. */
const NOT_A_RELEASE = /^(untitled|sneak peek|excerpt|sampler|preview)\b|dramatized|dramatised|\baudio drama\b/i;

/** "Station Eleven: a post-apocalyptic tale…" → "Station Eleven". */
function baseTitle(title: string): string {
  return title.split(/\s*[:([]/)[0]!.trim();
}

/**
 * True when the library already holds the title. A book also matches on its
 * base title, so a re-edition with a long subtitle drops out. A film matches
 * on the full title, so "Dune: Part Three" stays next to "Dune: Part Two".
 */
function inLibrary(items: LabItem[], title: string, kind: "book" | "film"): boolean {
  if (kind === "film") return items.some((item) => titleScore(item.title, title) === 2);
  return items.some((item) => titleScore(baseTitle(item.title), baseTitle(title)) === 2);
}

/** Hardcover lists translations as their own books. Few readers log them, and some use another script. */
const NON_LATIN = /[^\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{S}]/u;
const MIN_READERS_RELEASED = 5;

export default async function RadarPage() {
  const items = await loadLabItems();
  const now = labNow();
  const since = new Date(now - MONTHS_BACK * 30 * 86_400_000).toISOString().slice(0, 10);

  const authors = lovedCreators(items.filter((i) => i.category === "books"), (i) => i.authors[0]);
  const directors = lovedCreators(items.filter((i) => i.category === "movies_and_tv"), (i) => i.directors[0]).slice(0, MAX_DIRECTORS);

  const [authorBooks, directorFilms] = await Promise.all([
    recentBooksByAuthors(authors.map(([name]) => name), since),
    Promise.all(directors.map(async ([name, because]) => ({ because, data: await directorCredits(name) }))),
  ]);

  const entries: RadarEntry[] = [];
  for (const author of authorBooks) {
    const because = authors.find(([name]) => name.toLowerCase() === author.name.toLowerCase())?.[1];
    const seen = new Set<string>();
    // Most-read first, so a duplicate record of the same book loses to the main one.
    const books = [...author.contributions].map((c) => c.book).sort((a, b) => (b.users_count ?? 0) - (a.users_count ?? 0));
    for (const book of books) {
      const key = baseTitle(book.title).toLowerCase();
      const released = !!book.release_date && Date.parse(book.release_date) <= now;
      if (
        seen.has(key) ||
        NOT_A_RELEASE.test(book.title) ||
        NON_LATIN.test(book.title) ||
        !isEnglishOrUnknown(book) ||
        (released && (book.users_count ?? 0) < MIN_READERS_RELEASED) ||
        inLibrary(items, book.title, "book")
      ) {
        continue;
      }
      seen.add(key);
      entries.push({
        kind: "book",
        title: book.title,
        creator: author.name,
        date: book.release_date,
        image: book.image?.url ?? null,
        popularity: book.users_count ?? 0,
        link: book.slug ? `https://hardcover.app/books/${book.slug}` : null,
        goodreads: `https://www.goodreads.com/search?q=${encodeURIComponent(`${book.title} ${author.name}`)}`,
        because: because ? { id: because.id, title: because.title, rating: because.rating ?? 0 } : null,
      });
    }
  }
  for (const { because, data } of directorFilms) {
    if (!data) continue;
    for (const credit of data.credits) {
      if ((credit.date && credit.date < since) || NOT_A_RELEASE.test(credit.title) || inLibrary(items, credit.title, "film")) continue;
      entries.push({
        kind: "film",
        title: credit.title,
        creator: data.person,
        date: credit.date,
        image: credit.poster,
        popularity: 0,
        link: `https://www.themoviedb.org/movie/${credit.id}`,
        goodreads: null,
        because: { id: because.id, title: because.title, rating: because.rating ?? 0 },
      });
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <LabHeader slug="radar" />
      <Radar entries={entries} authorCount={authors.length} directorCount={directors.length} now={now} />
    </div>
  );
}
