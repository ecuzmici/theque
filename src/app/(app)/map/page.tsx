import { PageHeader } from "@/components/layout/PageHeader";
import { Constellations } from "@/components/taste-map/Constellations";
import { GenreGraph } from "@/components/taste-map/GenreGraph";
import { TasteGrid } from "@/components/taste-map/TasteGrid";
import type { MapStar, TasteMapData } from "@/components/taste-map/types";
import { VariantSwitcher } from "@/components/taste-map/VariantSwitcher";
import { loadLibrarySnapshot } from "@/lib/library-snapshot/load";
import {
  coOccurrence,
  edgeLift,
  emptySky,
  layoutGraph,
  starsOf,
  strongestEdges,
  tagStats,
  tagsOf,
} from "@/lib/taste-map/taste-map";

// Round 1 prototype: three variants on /map, picked with ?v=1|2|3.
const VARIANTS = [
  { key: "1", name: "Genre graph" },
  { key: "2", name: "Constellations" },
  { key: "3", name: "Taste grid" },
];

/** Fewer tagged books and films than this shows the empty state. */
const MIN_ITEMS = 8;
const GRAPH_NODES = 20;

export default async function TasteMapPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ v }, snapshot] = await Promise.all([searchParams, loadLibrarySnapshot("/map")]);
  const variant = VARIANTS.some((x) => x.key === v) ? (v as string) : "1";

  const items = snapshot.filter(
    (i) => (i.category === "books" || i.category === "movies_and_tv") && tagsOf(i).length > 0,
  );

  const header = <PageHeader title="Taste map" description="The genres and moods you save, finish and rate." />;

  if (items.length < MIN_ITEMS) {
    return (
      <div>
        {header}
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-heading text-xl">Not enough to map yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Save and rate a few more books and films. The map needs {MIN_ITEMS} with genres to draw anything useful.
          </p>
        </div>
      </div>
    );
  }

  const stats = tagStats(items);
  const graphStats = stats.filter((s) => s.count >= 3).slice(0, GRAPH_NODES);
  const keys = graphStats.map((s) => s.key);
  const counts = new Map(stats.map((s) => [s.key, s.count]));
  const edges = strongestEdges(coOccurrence(items, { minWeight: 3 }), keys, 2, (e) =>
    edgeLift(e, counts, items.length),
  );
  // The pads keep room for the labels under and beside each circle.
  const place = (radius: (count: number) => number, box: { width: number; height: number; x: number; top: number; bottom: number }) =>
    layoutGraph(
      graphStats.map((s) => ({ key: s.key, r: radius(s.count) })),
      edges,
      { width: box.width - box.x * 2, height: box.height - box.top - box.bottom },
    ).map((n) => ({ ...n, x: n.x + box.x, y: n.y + box.top }));
  const wide = place((c) => 10 + Math.sqrt(c) * 2.6, { width: 1000, height: 560, x: 70, top: 12, bottom: 28 });
  const tall = place((c) => 7 + Math.sqrt(c) * 1.6, { width: 360, height: 500, x: 44, top: 8, bottom: 22 });

  const stars: MapStar[] = items.map((i) => ({
    id: i.id,
    title: i.title,
    creator: i.authors[0] ?? i.directors[0] ?? null,
    category: i.category as MapStar["category"],
    done: i.status === "done",
    stars: starsOf(i),
    year: i.year,
    color: i.color,
    tags: tagsOf(i),
  }));

  const data: TasteMapData = {
    stars,
    stats,
    sky: emptySky(stats),
    graph: { stats: graphStats, edges, wide, tall },
  };

  return (
    <div className="pb-20">
      {header}
      {variant === "1" ? <GenreGraph data={data} /> : null}
      {variant === "2" ? <Constellations data={data} /> : null}
      {variant === "3" ? <TasteGrid data={data} /> : null}
      <VariantSwitcher variants={VARIANTS} current={variant} />
    </div>
  );
}
