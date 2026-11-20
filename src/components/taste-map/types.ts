import type { EmptySkyTag, PlacedNode, TagEdge, TagStat } from "@/lib/taste-map/taste-map";

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

export type GraphData = {
  stats: TagStat[];
  edges: TagEdge[];
  wide: PlacedNode[];
  tall: PlacedNode[];
};

export type TasteMapData = {
  stars: MapStar[];
  stats: TagStat[];
  sky: EmptySkyTag[];
  graph: GraphData;
};
