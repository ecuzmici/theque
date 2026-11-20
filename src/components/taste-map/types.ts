import type { EmptySkyTag, OftenWith, TagStat } from "@/lib/taste-map/taste-map";

/** One book or film, in the small shape that the client variants read. */
export type MapStar = {
  id: string;
  title: string;
  creator: string | null;
  category: "books" | "movies_and_tv";
  done: boolean;
  /** Star value 1-5 of a finished item, or null. */
  stars: number | null;
  year: number | null;
  color: string | null;
  tags: string[];
};

export type TasteMapData = {
  stars: MapStar[];
  stats: TagStat[];
  sky: EmptySkyTag[];
  /** Your mean rating over the items on the map, or null. */
  mean: number | null;
  /** For each tag key, the tags that occur with it more often than chance. */
  often: Record<string, OftenWith[]>;
};
