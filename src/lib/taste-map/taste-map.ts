import type { ItemCategory } from "@/lib/database.types";
import { BOOK_GENRES, MOODS, WATCH_GENRES } from "@/lib/taste/taste-lists";

// Pure data shaping for the taste map (/map). The page loads the items; this
// module counts, links and buckets them. It has no I/O.

/** The item fields that the taste map reads. `SnapshotItem` has all of them. */
export type TasteItem = {
  id: string;
  category: ItemCategory | null;
  status: string;
  rating: number | null;
  year: number | null;
  genres: string[];
  moods: string[];
};

export type TagKind = "genre" | "mood";

export type TagStat = {
  key: string;
  label: string;
  kind: TagKind;
  /** Items that carry the key. */
  count: number;
  /** Finished items. */
  done: number;
  /** Finished items with a rating. */
  rated: number;
  /** Mean rating of the rated items, or null when no item has a rating. */
  avgRating: number | null;
  /** Items that are not finished yet. */
  backlog: number;
  /** Rated items for each star value. Index 0 is 1 star. */
  stars: [number, number, number, number, number];
  /** Items on the Books shelf. */
  books: number;
  /** Items on the Watch shelf. */
  watch: number;
};

const BOOK_KEYS = new Set<string>(BOOK_GENRES.map((g) => g.key));
const WATCH_KEYS = new Set<string>(WATCH_GENRES.map((g) => g.key));

/**
 * The library shelf with this tag's chip turned on. A genre goes to the shelf
 * whose list holds it. A mood, or a genre on both lists, goes to the shelf
 * with more items.
 */
export function libraryHref(stat: Pick<TagStat, "key" | "kind" | "books" | "watch">): string {
  let shelf: "books" | "watch" = stat.books >= stat.watch ? "books" : "watch";
  if (stat.kind === "genre") {
    if (!BOOK_KEYS.has(stat.key)) shelf = "watch";
    else if (!WATCH_KEYS.has(stat.key)) shelf = "books";
  }
  return `/library?shelf=${shelf}&${stat.kind}=${encodeURIComponent(stat.key)}`;
}

const LABELS = new Map<string, { label: string; kind: TagKind }>([
  ...[...BOOK_GENRES, ...WATCH_GENRES].map((g) => [g.key, { label: g.label, kind: "genre" as const }] as const),
  ...MOODS.map((m) => [m.key, { label: m.label, kind: "mood" as const }] as const),
]);

/** The chip label of a genre or mood key, or null for an unknown key. */
export function tagLabel(key: string): string | null {
  return LABELS.get(key)?.label ?? null;
}

/** The known genre and mood keys of an item, each one time. */
export function tagsOf(item: Pick<TasteItem, "genres" | "moods">): string[] {
  return [...new Set([...item.genres, ...item.moods])].filter((key) => LABELS.has(key));
}

export function isDone(item: Pick<TasteItem, "status">): boolean {
  return item.status === "done";
}

/** The star value (1-5) of a finished, rated item, or null. */
export function starsOf(item: Pick<TasteItem, "status" | "rating">): number | null {
  if (!isDone(item) || !item.rating) return null;
  return Math.min(5, Math.max(1, Math.round(item.rating)));
}

/** Counts, finish rate and mean rating for each genre and mood, largest count first. */
export function tagStats(items: TasteItem[]): TagStat[] {
  const byKey = new Map<string, TagStat & { sum: number }>();
  for (const item of items) {
    const stars = starsOf(item);
    for (const key of tagsOf(item)) {
      const meta = LABELS.get(key)!;
      const stat =
        byKey.get(key) ??
        { key, label: meta.label, kind: meta.kind, count: 0, done: 0, rated: 0, avgRating: null, backlog: 0, stars: [0, 0, 0, 0, 0], books: 0, watch: 0, sum: 0 };
      stat.count += 1;
      if (item.category === "books") stat.books += 1;
      if (item.category === "movies_and_tv") stat.watch += 1;
      if (isDone(item)) stat.done += 1;
      else stat.backlog += 1;
      if (stars) {
        stat.rated += 1;
        stat.sum += stars;
        stat.stars[stars - 1] += 1;
      }
      byKey.set(key, stat);
    }
  }
  return [...byKey.values()]
    .map(({ sum, ...stat }) => ({ ...stat, avgRating: stat.rated ? sum / stat.rated : null }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export type TagEdge = { a: string; b: string; weight: number };

/**
 * Links each pair of tags that occur on the same item. The weight is the
 * number of shared items. Key `a` sorts before key `b`. Heaviest edges first.
 */
export function coOccurrence(items: TasteItem[], { minWeight = 1 }: { minWeight?: number } = {}): TagEdge[] {
  const weights = new Map<string, number>();
  for (const item of items) {
    const keys = tagsOf(item).sort();
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const id = `${keys[i]}|${keys[j]}`;
        weights.set(id, (weights.get(id) ?? 0) + 1);
      }
    }
  }
  return [...weights.entries()]
    .filter(([, weight]) => weight >= minWeight)
    .map(([id, weight]) => {
      const [a, b] = id.split("|") as [string, string];
      return { a, b, weight };
    })
    .sort((x, y) => y.weight - x.weight || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}

export type DecadeBucket<T> = {
  /** First year of the decade, or null for the Earlier bucket. */
  start: number | null;
  label: string;
  from: number;
  to: number;
  items: T[];
};

/**
 * Sorts dated items into decades. Items before `earliest` share one Earlier
 * bucket, so a few old classics do not stretch the axis. The decades between
 * the first and the last bucket stay in the list, also when empty.
 */
export function decadeBuckets<T extends Pick<TasteItem, "year">>(
  items: T[],
  { earliest: cutoff = 1950 }: { earliest?: number } = {},
): DecadeBucket<T>[] {
  // The Earlier bucket ends where a decade starts, so the next label is correct.
  const earliest = Math.floor(cutoff / 10) * 10;
  const dated = items.filter((i): i is T & { year: number } => typeof i.year === "number");
  if (dated.length === 0) return [];
  const old = dated.filter((i) => i.year < earliest);
  const recent = dated.filter((i) => i.year >= earliest);
  const buckets: DecadeBucket<T>[] = [];
  if (old.length) {
    buckets.push({ start: null, label: "Earlier", from: Math.min(...old.map((i) => i.year)), to: earliest - 1, items: old });
  }
  if (recent.length) {
    const decadeOf = (year: number) => Math.floor(year / 10) * 10;
    const first = old.length ? decadeOf(earliest) : Math.min(...recent.map((i) => decadeOf(i.year)));
    const last = Math.max(...recent.map((i) => decadeOf(i.year)));
    for (let start = first; start <= last; start += 10) {
      buckets.push({
        start,
        label: `${start}s`,
        from: start,
        to: start + 9,
        items: recent.filter((i) => decadeOf(i.year) === start),
      });
    }
  }
  return buckets;
}

export type EmptySkyReason = "unfinished" | "low";
export type EmptySkyTag = TagStat & { reason: EmptySkyReason };

/** A tag needs this many saved items before the empty sky can list it. */
export const EMPTY_SKY_MIN_SAVED = 3;
/** Below this share of finished items, a tag counts as saved but not finished. */
export const EMPTY_SKY_MAX_DONE_SHARE = 0.25;
/** A tag needs this many ratings before the empty sky can call it rated low. */
export const EMPTY_SKY_MIN_RATED = 3;
/** A tag is rated low when its mean is this many stars or more below your mean. */
export const EMPTY_SKY_LOW_GAP = 0.75;

/**
 * The "empty sky": tags you save but rarely finish, or rate below your usual.
 * `mean` is your mean rating over all items (see `meanRating`). A low rating
 * wins over a low finish rate. Largest backlog first.
 */
export function emptySky(stats: TagStat[], mean: number | null): EmptySkyTag[] {
  const out: EmptySkyTag[] = [];
  for (const stat of stats) {
    if (stat.count < EMPTY_SKY_MIN_SAVED) continue;
    if (
      mean !== null &&
      stat.rated >= EMPTY_SKY_MIN_RATED &&
      stat.avgRating !== null &&
      stat.avgRating <= mean - EMPTY_SKY_LOW_GAP + 1e-9
    ) {
      out.push({ ...stat, reason: "low" });
    } else if (stat.done / stat.count < EMPTY_SKY_MAX_DONE_SHARE) {
      out.push({ ...stat, reason: "unfinished" });
    }
  }
  return out.sort((a, b) => b.backlog - a.backlog || b.count - a.count);
}

/** Your mean star rating over finished, rated items, or null when none has a rating. */
export function meanRating(items: TasteItem[]): number | null {
  const stars = items.map(starsOf).filter((s): s is number => s !== null);
  return stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : null;
}

/** The weight of your mean in a shrunk rating, counted in ratings. */
export const SHRINK_WEIGHT = 3;

/**
 * The tag's mean rating, pulled toward your mean as if the tag had
 * SHRINK_WEIGHT more ratings at your mean. Two 5★ ratings then do not beat
 * twenty 4★ ratings. Null when the tag has no rating.
 */
export function shrunkRating(stat: Pick<TagStat, "avgRating" | "rated">, mean: number): number | null {
  if (stat.avgRating === null || stat.rated === 0) return null;
  return (stat.avgRating * stat.rated + mean * SHRINK_WEIGHT) / (stat.rated + SHRINK_WEIGHT);
}

/** Best shrunk rating first. Tags without a rating go last, largest count first. */
export function sortByRating<T extends TagStat>(stats: T[], mean: number | null): T[] {
  const m = mean ?? 0;
  return [...stats].sort((a, b) => {
    const ra = shrunkRating(a, m);
    const rb = shrunkRating(b, m);
    if (ra === null && rb === null) return b.count - a.count;
    if (ra === null) return 1;
    if (rb === null) return -1;
    return rb - ra || b.rated - a.rated;
  });
}

export type OftenWith = { key: string; label: string; kind: TagKind; shared: number; lift: number };

/**
 * The tags that occur with `key` more often than chance: lift above 1,
 * highest lift first. A pair needs 2 or more shared items. Ties go to more shared items.
 */
export function oftenWith(key: string, items: TasteItem[], limit = 3): OftenWith[] {
  const counts = new Map<string, number>();
  for (const item of items) for (const k of tagsOf(item)) counts.set(k, (counts.get(k) ?? 0) + 1);
  if (!counts.has(key)) return [];
  return coOccurrence(items, { minWeight: 2 })
    .filter((e) => e.a === key || e.b === key)
    .map((e) => {
      const other = e.a === key ? e.b : e.a;
      const meta = LABELS.get(other)!;
      return { key: other, label: meta.label, kind: meta.kind, shared: e.weight, lift: edgeLift(e, counts, items.length) };
    })
    .filter((o) => o.lift > 1)
    .sort((x, y) => y.lift - x.lift || y.shared - x.shared || x.label.localeCompare(y.label))
    .slice(0, limit);
}

/**
 * Lift of a pair: shared items against the count that chance gives. A large
 * tag such as Tense meets each other tag often, so raw weight favors it. Lift
 * does not.
 */
export function edgeLift(edge: TagEdge, counts: Map<string, number>, total: number): number {
  const ca = counts.get(edge.a) ?? 0;
  const cb = counts.get(edge.b) ?? 0;
  if (!ca || !cb || !total) return 0;
  return (edge.weight * total) / (ca * cb);
}

/**
 * Packs n equal dots in a grid inside a box, row by row from the top left.
 * The function picks the column count that gives the largest dots. Dots never
 * overlap, and the radius is at most `maxR`. A box without room gives no dots.
 */
export function packGrid(
  n: number,
  { width, height, maxR }: { width: number; height: number; maxR: number },
): { x: number; y: number; r: number }[] {
  if (n <= 0 || width <= 0 || height <= 0) return [];
  let cols = 1;
  let cell = 0;
  for (let c = 1; c <= n; c++) {
    const size = Math.min(width / c, height / Math.ceil(n / c));
    if (size >= cell) {
      cell = size;
      cols = c;
    }
  }
  const rows = Math.ceil(n / cols);
  const r = Math.min(maxR, (cell / 2) * 0.9);
  const left = (width - cols * cell) / 2;
  const top = (height - rows * cell) / 2;
  return Array.from({ length: n }, (_, i) => ({
    x: left + ((i % cols) + 0.5) * cell,
    y: top + (Math.floor(i / cols) + 0.5) * cell,
    r,
  }));
}

/**
 * Links points with the shortest total line length (Prim). Each edge is
 * [index already in the tree, new index]. The constellation lines use it.
 */
export function spanningTree(points: { x: number; y: number }[]): [number, number][] {
  if (points.length < 2) return [];
  const inTree = new Array<boolean>(points.length).fill(false);
  const best = new Array<number>(points.length).fill(Infinity);
  const parent = new Array<number>(points.length).fill(-1);
  const edges: [number, number][] = [];
  best[0] = 0;
  for (let n = 0; n < points.length; n++) {
    let next = -1;
    for (let i = 0; i < points.length; i++) {
      if (!inTree[i] && (next === -1 || best[i]! < best[next]!)) next = i;
    }
    inTree[next] = true;
    if (parent[next]! >= 0) edges.push([parent[next]!, next]);
    for (let i = 0; i < points.length; i++) {
      if (inTree[i]) continue;
      const d = Math.hypot(points[i]!.x - points[next]!.x, points[i]!.y - points[next]!.y);
      if (d < best[i]!) {
        best[i] = d;
        parent[i] = next;
      }
    }
  }
  return edges;
}
