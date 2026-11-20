import { PageHeader } from "@/components/layout/PageHeader";
import { Constellations } from "@/components/taste-map/Constellations";
import { TasteGrid } from "@/components/taste-map/TasteGrid";
import type { MapStar, TasteMapData } from "@/components/taste-map/types";
import { VariantSwitcher } from "@/components/taste-map/VariantSwitcher";
import { loadLibrarySnapshot } from "@/lib/library-snapshot/load";
import { emptySky, meanRating, oftenWith, starsOf, tagStats, tagsOf } from "@/lib/taste-map/taste-map";

// Round 2 prototype: the taste grid by default, the constellations at ?v=2.
const VARIANTS = [
  { key: "3", name: "Taste grid" },
  { key: "2", name: "Constellations" },
];

/** Fewer tagged books and films than this shows the empty state. */
const MIN_ITEMS = 8;

export default async function TasteMapPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ v }, snapshot] = await Promise.all([searchParams, loadLibrarySnapshot("/map")]);
  const variant = v === "2" ? "2" : "3";

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
  const mean = meanRating(items);

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
    sky: emptySky(stats, mean),
    mean,
    often: Object.fromEntries(stats.map((s) => [s.key, oftenWith(s.key, items)])),
  };

  return (
    // The bottom pad keeps the last rows clear of the + button and the prototype bar.
    <div className="pb-36">
      {header}
      {variant === "3" ? <TasteGrid data={data} /> : <Constellations data={data} />}
      <VariantSwitcher variants={VARIANTS} current={variant} />
    </div>
  );
}
