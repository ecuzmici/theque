import type { ItemCategory } from "@/lib/database.types";
import { CATEGORY_LABELS } from "@/lib/item-labels";
import { hexToHsl, hueSortKey } from "@/lib/library-snapshot/color";
import type { SnapshotItem } from "@/lib/library-snapshot/load";
import { BOOK_GENRES, MOODS, WATCH_GENRES } from "@/lib/taste/taste-lists";

/** The item fields that the year recap reads. */
export type WrappedSourceItem = Pick<
  SnapshotItem,
  | "id"
  | "title"
  | "category"
  | "status"
  | "rating"
  | "verdict"
  | "doneAt"
  | "color"
  | "cover"
  | "genres"
  | "moods"
  | "authors"
  | "pages"
  | "runtime"
>;

/**
 * The recap counts years in UTC. The app has no time zone for a user, and the
 * other date labels in the app also use UTC. An item that you finish near
 * midnight on 31 December can go into the next or the previous year.
 */
export const WRAPPED_TIME_ZONE = "UTC";

function yearOf(iso: string, timeZone: string): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone }).format(date);
  return Number.parseInt(year, 10);
}

/** The year of an instant in the time zone. The page uses it to find the current year. */
export function currentWrappedYear(now: Date, timeZone = WRAPPED_TIME_ZONE): number {
  return yearOf(now.toISOString(), timeZone)!;
}

/** 1 for 1 January, 365 or 366 for 31 December, in the time zone. */
function dayOfYear(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "numeric", day: "numeric", timeZone })
    .formatToParts(date)
    .reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.type]: Number.parseInt(p.value, 10) }), {});
  const start = Date.UTC(parts.year!, 0, 1);
  return Math.round((Date.UTC(parts.year!, parts.month! - 1, parts.day!) - start) / 86_400_000) + 1;
}

function finishedYear(item: WrappedSourceItem, timeZone: string): number | null {
  if (item.status !== "done" || !item.doneAt) return null;
  return yearOf(item.doneAt, timeZone);
}

/** The years that have one or more finished items, newest first. */
export function finishedYears(items: WrappedSourceItem[], timeZone = WRAPPED_TIME_ZONE): number[] {
  const years = new Set<number>();
  for (const item of items) {
    const year = finishedYear(item, timeZone);
    if (year != null) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

export type WrappedCategory = { category: ItemCategory; label: string; count: number };

/** The year recap. All values are plain data, so a server page can pass them to a client component. */
export type Wrapped = {
  year: number;
  /** True when the year is the current year and so is not complete. */
  partial: boolean;
  /** The last day that the recap counts, as "20 November", for a partial year. */
  throughLabel: string | null;
  /** The days that the recap covers: up to today for a partial year, else 365 or 366. */
  days: number;
  total: number;
  categories: WrappedCategory[];
  reading: {
    books: number;
    pages: number;
    /** The number of finished books that have a page count. */
    booksWithPages: number;
    longest: (WrappedCover & { pages: number }) | null;
  };
  watching: {
    titles: number;
    minutes: number;
    hours: number;
    /** The number of finished films and shows that have a runtime. */
    titlesWithRuntime: number;
    longest: (WrappedCover & { minutes: number }) | null;
  };
  /** The finishes with the top rating (5, or 4 when no item has 5). Null below 4 stars. */
  favourites: { stars: number; count: number; items: WrappedCover[] } | null;
  /** One verdict to quote: the best-rated finish (4 stars or more), the longest verdict that fits a slide. */
  verdict: { id: string; title: string; rating: number; text: string } | null;
  /** Finishes per month, January first. */
  months: number[];
  busiestMonth: { month: number; name: string; count: number } | null;
  /** The first-listed author with the most finished books, when that is 2 or more. */
  topAuthor: { name: string; count: number; items: WrappedCover[] } | null;
  palette: {
    /** The cover colours of the finishes, in colour-wheel order, greys last. */
    colors: string[];
    /** The hue name that the most covers share, for example "red". Null without colours. */
    name: string | null;
  };
  /** The most common genre and mood. Each needs 2 or more finishes. */
  taste: { genre: WrappedTag | null; mood: WrappedTag | null };
};

export type WrappedTag = { key: string; label: string; count: number };

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** An author, genre or mood needs this many finishes to get a slide. */
const MIN_REPEAT = 2;
/** The author slide shows up to this many covers. */
const AUTHOR_COVERS_MAX = 6;

const GENRE_LABELS = new Map<string, string>([...BOOK_GENRES, ...WATCH_GENRES].map((g) => [g.key, g.label]));
const MOOD_LABELS = new Map<string, string>(MOODS.map((m) => [m.key, m.label]));

/** A plain name for the hue of a cover colour. Greys get "grey" or "black". */
export function hueName(hex: string | null): string | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  if (hsl.s < 0.12) return hsl.l < 0.3 ? "black" : "grey";
  const h = hsl.h;
  if (h < 15 || h >= 340) return "red";
  if (h < 45) return "amber";
  if (h < 70) return "gold";
  if (h < 160) return "green";
  if (h < 200) return "teal";
  if (h < 255) return "blue";
  if (h < 290) return "violet";
  return "rose";
}

/** The key with the highest count. On a tie, the key that came first wins. */
function topEntry<K>(counts: Map<K, number>): [K, number] | null {
  let best: [K, number] | null = null;
  for (const entry of counts) {
    if (!best || entry[1] > best[1]) best = entry;
  }
  return best;
}

function topTag(keys: string[], labels: Map<string, string>): WrappedTag | null {
  const top = topEntry(countBy(keys.filter((k) => labels.has(k))));
  if (!top || top[1] < MIN_REPEAT) return null;
  return { key: top[0], label: labels.get(top[0])!, count: top[1] };
}

function monthOf(iso: string, timeZone: string): number {
  const month = new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone }).format(new Date(iso));
  return Number.parseInt(month, 10) - 1;
}

/** The favourites slide shows a 3 x 3 grid of covers. */
export const FAVOURITES_MAX = 9;
/** A longer verdict does not fit on a phone slide. */
export const VERDICT_MAX_LENGTH = 280;

function newestFirst(a: WrappedSourceItem, b: WrappedSourceItem): number {
  return (b.doneAt ?? "").localeCompare(a.doneAt ?? "");
}

/** The fields that a slide needs to show one item. */
export type WrappedCover = Pick<SnapshotItem, "id" | "title" | "cover" | "color">;

function toCover(item: WrappedSourceItem): WrappedCover {
  return { id: item.id, title: item.title, cover: item.cover, color: item.color };
}

/** The item with the largest value. On a tie, the first item wins. */
function maxBy<T>(items: T[], value: (item: T) => number | null): T | null {
  let best: T | null = null;
  let bestValue = 0;
  for (const item of items) {
    const v = value(item) ?? 0;
    if (v > bestValue) {
      best = item;
      bestValue = v;
    }
  }
  return best;
}

function sum(values: Array<number | null>): number {
  return values.reduce<number>((total, v) => total + (v ?? 0), 0);
}

export type WrappedOptions = { now?: Date; timeZone?: string };

function countBy<K>(keys: K[]): Map<K, number> {
  const counts = new Map<K, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

/** Builds the recap of one year from the library items. */
export function computeWrapped(
  items: WrappedSourceItem[],
  year: number,
  { now = new Date(), timeZone = WRAPPED_TIME_ZONE }: WrappedOptions = {},
): Wrapped {
  const finished = items.filter((item) => finishedYear(item, timeZone) === year);
  const partial = yearOf(now.toISOString(), timeZone) === year;

  const categories = [...countBy(finished.map((item) => item.category).filter((c): c is ItemCategory => !!c))]
    .map(([category, count]) => ({ category, label: CATEGORY_LABELS[category], count }))
    .sort((a, b) => b.count - a.count);

  const books = finished.filter((item) => item.category === "books");
  const longestBook = maxBy(books, (b) => b.pages);
  const watched = finished.filter((item) => item.category === "movies_and_tv");
  const longestWatch = maxBy(watched, (w) => w.runtime);
  const minutes = sum(watched.map((w) => w.runtime));

  const byNewest = [...finished].sort(newestFirst);
  const topStars = [5, 4].find((stars) => finished.some((item) => item.rating === stars)) ?? null;
  const topRated = topStars ? byNewest.filter((item) => item.rating === topStars) : [];

  const quoted = byNewest
    .filter((item) => {
      const text = item.verdict?.trim() ?? "";
      return (item.rating ?? 0) >= 4 && text.length > 0 && text.length <= VERDICT_MAX_LENGTH;
    })
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.verdict!.trim().length - a.verdict!.trim().length)[0];

  const months = Array.from({ length: 12 }, () => 0);
  for (const item of finished) months[monthOf(item.doneAt!, timeZone)]! += 1;
  const busiest = topEntry(new Map(months.map((count, month) => [month, count])));

  const author = topEntry(countBy(books.map((b) => b.authors[0]).filter((a): a is string => !!a)));
  const topAuthor =
    author && author[1] >= MIN_REPEAT
      ? {
          name: author[0],
          count: author[1],
          items: byNewest
            .filter((b) => b.category === "books" && b.authors[0] === author[0])
            .slice(0, AUTHOR_COVERS_MAX)
            .map(toCover),
        }
      : null;

  const colors = finished
    .map((item) => item.color)
    .filter((c): c is string => hexToHsl(c) != null)
    .sort((a, b) => hueSortKey(a) - hueSortKey(b));
  const colourName = topEntry(countBy(colors.map(hueName)))?.[0] ?? null;

  return {
    year,
    partial,
    throughLabel: partial
      ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone }).format(now)
      : null,
    days: partial ? dayOfYear(now, timeZone) : dayOfYear(new Date(Date.UTC(year, 11, 31, 12)), "UTC"),
    total: finished.length,
    categories,
    reading: {
      books: books.length,
      pages: Math.round(sum(books.map((b) => b.pages))),
      booksWithPages: books.filter((b) => b.pages).length,
      longest: longestBook ? { ...toCover(longestBook), pages: longestBook.pages! } : null,
    },
    watching: {
      titles: watched.length,
      minutes: Math.round(minutes),
      hours: Math.round(minutes / 60),
      titlesWithRuntime: watched.filter((w) => w.runtime).length,
      longest: longestWatch ? { ...toCover(longestWatch), minutes: longestWatch.runtime! } : null,
    },
    favourites: topStars
      ? { stars: topStars, count: topRated.length, items: topRated.slice(0, FAVOURITES_MAX).map(toCover) }
      : null,
    verdict: quoted
      ? { id: quoted.id, title: quoted.title, rating: quoted.rating!, text: quoted.verdict!.trim() }
      : null,
    months,
    busiestMonth:
      busiest && busiest[1] > 0 ? { month: busiest[0], name: MONTH_NAMES[busiest[0]]!, count: busiest[1] } : null,
    topAuthor,
    palette: { colors, name: colourName },
    taste: {
      genre: topTag(finished.flatMap((item) => item.genres), GENRE_LABELS),
      mood: topTag(finished.flatMap((item) => item.moods), MOOD_LABELS),
    },
  };
}

/**
 * The year that `/wrapped?year=` opens. No parameter gives the current year.
 * An earlier year must have finished items. Null means "go to /wrapped".
 */
export function resolveWrappedYear(
  param: string | string[] | undefined,
  years: number[],
  currentYear: number,
): number | null {
  if (param === undefined) return currentYear;
  if (typeof param !== "string" || !/^\d{4}$/.test(param)) return null;
  const year = Number.parseInt(param, 10);
  return year === currentYear || years.includes(year) ? year : null;
}

export type SlideKind =
  | "empty"
  | "intro"
  | "split"
  | "pages"
  | "hours"
  | "favourites"
  | "author"
  | "longest"
  | "months"
  | "taste"
  | "verdict"
  | "colours"
  | "outro";

/** A month chart and a colour strip need this many finishes to show a pattern. */
const MIN_FOR_PATTERN = 3;

/** The slides for a recap, in order. A slide shows only when its data can fill it. */
export function planSlides(wrapped: Wrapped): SlideKind[] {
  if (wrapped.total === 0) return ["empty"];
  const show: Array<[SlideKind, boolean]> = [
    ["intro", true],
    ["split", wrapped.categories.length >= 2],
    ["pages", wrapped.reading.pages > 0],
    ["hours", wrapped.watching.hours >= 1],
    ["favourites", wrapped.favourites != null],
    ["author", wrapped.topAuthor != null],
    ["longest", wrapped.reading.longest != null && wrapped.reading.booksWithPages >= 2],
    ["months", wrapped.total >= MIN_FOR_PATTERN],
    ["taste", wrapped.taste.genre != null || wrapped.taste.mood != null],
    ["verdict", wrapped.verdict != null],
    ["colours", wrapped.palette.colors.length >= MIN_FOR_PATTERN],
    ["outro", true],
  ];
  return show.filter(([, visible]) => visible).map(([kind]) => kind);
}
