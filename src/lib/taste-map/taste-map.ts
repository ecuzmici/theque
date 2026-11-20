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
  { earliest = 1950 }: { earliest?: number } = {},
): DecadeBucket<T>[] {
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
/** At or below this mean rating (with 2 or more ratings), a tag counts as rated low. */
export const EMPTY_SKY_LOW_RATING = 3;

/**
 * The "empty sky": tags you save but rarely finish, or finish and rate low.
 * A low rating wins over a low finish rate. Largest backlog first.
 */
export function emptySky(stats: TagStat[]): EmptySkyTag[] {
  const out: EmptySkyTag[] = [];
  for (const stat of stats) {
    if (stat.count < EMPTY_SKY_MIN_SAVED) continue;
    if (stat.rated >= 2 && stat.avgRating !== null && stat.avgRating <= EMPTY_SKY_LOW_RATING) {
      out.push({ ...stat, reason: "low" });
    } else if (stat.done / stat.count < EMPTY_SKY_MAX_DONE_SHARE) {
      out.push({ ...stat, reason: "unfinished" });
    }
  }
  return out.sort((a, b) => b.backlog - a.backlog || b.count - a.count);
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
 * Thins a dense graph: each kept node keeps its `perNode` best edges to other
 * kept nodes. `score` ranks the edges (default: the weight). The result keeps
 * the input order.
 */
export function strongestEdges(
  edges: TagEdge[],
  keys: string[],
  perNode = 2,
  score: (edge: TagEdge) => number = (e) => e.weight,
): TagEdge[] {
  const kept = new Set(keys);
  const inside = edges.filter((e) => kept.has(e.a) && kept.has(e.b));
  const chosen = new Set<TagEdge>();
  for (const key of keys) {
    const own = inside.filter((e) => e.a === key || e.b === key).sort((x, y) => score(y) - score(x));
    for (const e of own.slice(0, perNode)) chosen.add(e);
  }
  return inside.filter((e) => chosen.has(e));
}

/**
 * Packs n equal dots in a grid inside a box, row by row from the top left.
 * The function picks the column count that gives the largest dots. Dots never
 * overlap, and the radius is at most `maxR`.
 */
export function packGrid(
  n: number,
  { width, height, maxR }: { width: number; height: number; maxR: number },
): { x: number; y: number; r: number }[] {
  if (n <= 0) return [];
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

export type GraphNodeInput = { key: string; r: number };
export type PlacedNode = GraphNodeInput & { x: number; y: number };

/**
 * Places graph nodes with a force layout (Fruchterman-Reingold). Linked nodes
 * pull together, all nodes push apart. The start positions sit on a circle in
 * input order, so the result is the same on each run. Each node and its
 * radius stay inside the box.
 */
export function layoutGraph(
  nodes: GraphNodeInput[],
  edges: TagEdge[],
  { width, height, iterations = 400 }: { width: number; height: number; iterations?: number },
): PlacedNode[] {
  const n = nodes.length;
  if (n === 0) return [];
  const index = new Map(nodes.map((node, i) => [node.key, i]));
  const pos = nodes.map((_, i) => {
    const angle = (2 * Math.PI * i) / n;
    const ring = 0.35 + 0.1 * (i % 2);
    return { x: width / 2 + Math.cos(angle) * width * ring, y: height / 2 + Math.sin(angle) * height * ring };
  });
  const links = edges
    .map((e) => ({ s: index.get(e.a), t: index.get(e.b), w: e.weight }))
    .filter((l): l is { s: number; t: number; w: number } => l.s !== undefined && l.t !== undefined);
  const maxW = Math.max(1, ...links.map((l) => l.w));
  const k = Math.sqrt((width * height) / n) * 0.75;
  let temp = Math.min(width, height) / 8;
  const cool = temp / (iterations + 1);

  for (let step = 0; step < iterations; step++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i]!.x - pos[j]!.x || 0.01;
        const dy = pos[i]!.y - pos[j]!.y || 0.01;
        const d = Math.max(0.01, Math.hypot(dx, dy));
        const gap = Math.max(1, d - nodes[i]!.r - nodes[j]!.r);
        const force = (k * k) / gap;
        disp[i]!.x += (dx / d) * force;
        disp[i]!.y += (dy / d) * force;
        disp[j]!.x -= (dx / d) * force;
        disp[j]!.y -= (dy / d) * force;
      }
    }
    for (const { s, t, w } of links) {
      const dx = pos[s]!.x - pos[t]!.x;
      const dy = pos[s]!.y - pos[t]!.y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const force = ((d * d) / k) * (0.3 + w / maxW);
      disp[s]!.x -= (dx / d) * force;
      disp[s]!.y -= (dy / d) * force;
      disp[t]!.x += (dx / d) * force;
      disp[t]!.y += (dy / d) * force;
    }
    for (let i = 0; i < n; i++) {
      // A weak pull to the center keeps unlinked nodes on the page.
      disp[i]!.x += (width / 2 - pos[i]!.x) * 0.05;
      disp[i]!.y += (height / 2 - pos[i]!.y) * 0.05;
      const len = Math.max(0.01, Math.hypot(disp[i]!.x, disp[i]!.y));
      const r = nodes[i]!.r;
      pos[i]!.x = clamp(pos[i]!.x + (disp[i]!.x / len) * Math.min(len, temp), r, width - r);
      pos[i]!.y = clamp(pos[i]!.y + (disp[i]!.y / len) * Math.min(len, temp), r, height - r);
    }
    temp = Math.max(0.5, temp - cool);
  }
  return nodes.map((node, i) => ({ ...node, x: pos[i]!.x, y: pos[i]!.y }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
