import { authorsOverlap, titleScore } from "@/lib/enrichment/resolvers/title-match";

import { LabHeader } from "../LabHeader";
import { loadLabItems, type LabItem } from "../lab-data";
import { seriesByName } from "../lab-hardcover";
import { SeriesTracker, type SeriesView, type SlotView } from "./SeriesTracker";

function author(items: LabItem[]): string {
  return items.find((i) => i.authors[0])?.authors[0] ?? "";
}

export default async function SeriesPage() {
  const items = await loadLabItems();
  const allBooks = items.filter((item) => item.category === "books");
  const books = allBooks.filter((item) => item.series);

  const groups = new Map<string, LabItem[]>();
  for (const book of books) {
    const key = book.series!.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), book]);
  }

  const hc = await seriesByName([...new Set(books.map((b) => b.series!))]);
  const today = new Date().toISOString().slice(0, 10);

  const views: SeriesView[] = [...groups.entries()].map(([key, owned]) => {
    const remote = hc.get(key);
    // One book per whole-number position: the most-read one. Novellas (4.5) are extras.
    const byPosition = new Map<number, NonNullable<typeof remote>["book_series"][number]>();
    for (const entry of remote?.book_series ?? []) {
      const p = entry.position;
      if (p === null || !Number.isInteger(p) || p < 1) continue;
      // Hardcover lists announced books as "Untitled …" placeholders years ahead.
      if (/^untitled\b/i.test(entry.book.title)) continue;
      const current = byPosition.get(p);
      if (!current || (entry.book.users_count ?? 0) > (current.book.users_count ?? 0)) byPosition.set(p, entry);
    }
    const positions = new Set<number>([...byPosition.keys(), ...owned.map((o) => o.seriesIndex).filter((n): n is number => !!n && Number.isInteger(n))]);

    const slots: SlotView[] = [...positions]
      .sort((a, b) => a - b)
      .map((position) => {
        const remoteBook = byPosition.get(position)?.book;
        // Many books have no series stored, so match on title and author across the whole library.
        const seriesAuthor = author(owned);
        const mine =
          owned.find((o) => o.seriesIndex === position) ??
          (remoteBook
            ? allBooks.find(
                (b) =>
                  titleScore(b.title, remoteBook.title) === 2 &&
                  (!seriesAuthor || authorsOverlap(b.authors, [seriesAuthor])),
              )
            : undefined);
        return {
          position,
          title: mine?.title ?? remoteBook?.title ?? `Book ${position}`,
          itemId: mine?.id ?? null,
          state: mine ? (mine.status === "done" ? "done" : "want") : "missing",
          rating: mine?.rating ?? null,
          cover: mine?.cover ?? null,
          remoteCover: remoteBook?.image?.url ?? null,
          color: mine?.color ?? null,
          hasFile: mine?.hasFile ?? false,
          releaseDate: remoteBook?.release_date ?? null,
          upcoming: !!remoteBook?.release_date && remoteBook.release_date > today,
        } satisfies SlotView;
      });

    const matchedIds = new Set(slots.map((slot) => slot.itemId).filter(Boolean));
    const lastDone =
      allBooks
        .filter((b) => matchedIds.has(b.id) && b.doneAt)
        .map((b) => b.doneAt!)
        .sort()
        .pop() ?? null;
    return {
      name: owned[0]!.series!,
      author: author(owned),
      slots,
      total: remote?.primary_books_count ?? slots.length,
      matched: !!remote,
      lastDone,
    };
  });

  return (
    <div className="mx-auto max-w-5xl">
      <LabHeader slug="series" />
      <SeriesTracker series={views} />
    </div>
  );
}
