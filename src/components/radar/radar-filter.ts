import type { RadarEntry } from "@/lib/radar";

export type RadarKind = "all" | RadarEntry["kind"];

/** The entries of one kind, in the given order. `upcomingOnly` keeps releases that are not out yet. */
export function filterRadar(entries: RadarEntry[], kind: RadarKind, upcomingOnly: boolean): RadarEntry[] {
  return entries.filter((e) => (kind === "all" || e.kind === kind) && (!upcomingOnly || e.release.upcoming));
}

/** The chip counts for each kind under the current upcoming toggle. */
export function radarCounts(entries: RadarEntry[], upcomingOnly: boolean): Record<RadarKind, number> {
  return {
    all: filterRadar(entries, "all", upcomingOnly).length,
    book: filterRadar(entries, "book", upcomingOnly).length,
    film: filterRadar(entries, "film", upcomingOnly).length,
  };
}
