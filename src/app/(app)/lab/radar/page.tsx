import { titleScore } from "@/lib/enrichment/resolvers/title-match";

import { LabHeader } from "../LabHeader";
import { labNow, loadLabItems, type LabItem } from "../lab-data";
import { recentBooksByAuthors } from "../lab-hardcover";
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

function inLibrary(items: LabItem[], title: string): boolean {
  return items.some((item) => titleScore(item.title, title) === 2);
}

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
    for (const { book } of author.contributions) {
      const key = book.title.toLowerCase();
      if (seen.has(key) || inLibrary(items, book.title)) continue;
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
      if ((credit.date && credit.date < since) || inLibrary(items, credit.title)) continue;
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
