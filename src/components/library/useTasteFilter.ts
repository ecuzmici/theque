"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { tasteHref } from "@/lib/library-search";
import { narrowFacets, type TasteFacets } from "@/lib/taste/taste-facets";
import { parseShelfParam, type ShelfId } from "@/lib/shelves";
import {
  isGenreKeyFor,
  isMoodKey,
  tasteShelfCategory,
} from "@/lib/taste/taste-lists";

export type { TasteFacet, TasteFacets } from "@/lib/taste/taste-facets";

export type TasteSelection = { genre: string | null; mood: string | null };

const NO_TASTE: TasteSelection = { genre: null, mood: null };

/**
 * Reads the genre and mood from the URL params. A key that is not in the list
 * of the shelf becomes null. A shelf without chips always gives null.
 */
export function parseTasteSelection(
  params: { get: (name: string) => string | null },
  shelfId: ShelfId,
): TasteSelection {
  const category = tasteShelfCategory(shelfId);
  if (!category) return NO_TASTE;
  const genre = params.get("genre");
  const mood = params.get("mood");
  return {
    genre: isGenreKeyFor(category, genre) ? genre : null,
    mood: isMoodKey(mood) ? mood : null,
  };
}

/**
 * The key of the shelf cache. A shelf without a filter uses the shelf id. A
 * filtered list gets its own key, so it never shows as the full shelf.
 */
export function libraryCacheKey(
  shelfId: ShelfId,
  taste: TasteSelection = NO_TASTE,
): string {
  if (!taste.genre && !taste.mood) return shelfId;
  return `${shelfId}|genre:${taste.genre ?? ""}|mood:${taste.mood ?? ""}`;
}

type Override = { shelf: ShelfId; urlSignature: string; selection: TasteSelection };

/**
 * Genre and mood filter of the library. The URL (`?genre=`, `?mood=`) holds the
 * state, so it survives a reload. A change shows at once through a local
 * override. The override ends when the URL changes. The hook also loads the chip
 * counts of the active shelf.
 *
 * `shelfId` is the shelf on screen. While a shelf change is still pending, the
 * URL shelf differs from it, and the hook gives no filter.
 */
export function useTasteFilter(shelfId: ShelfId) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [override, setOverride] = useState<Override | null>(null);
  const [facetsByShelf, setFacetsByShelf] = useState<
    Partial<Record<ShelfId, TasteFacets | "error">>
  >({});

  const category = tasteShelfCategory(shelfId);
  const urlShelf = parseShelfParam(searchParams.get("shelf"));
  const urlSelection =
    urlShelf === shelfId ? parseTasteSelection(searchParams, shelfId) : NO_TASTE;
  const urlSignature = `${urlShelf}|${urlSelection.genre ?? ""}|${urlSelection.mood ?? ""}`;
  const selection =
    override && override.shelf === shelfId && override.urlSignature === urlSignature
      ? override.selection
      : urlSelection;

  const facetsState = category ? facetsByShelf[shelfId] : undefined;
  const hasFacets = facetsState !== undefined;

  useEffect(() => {
    if (!category || hasFacets) return;
    let cancelled = false;
    void (async () => {
      let next: TasteFacets | "error" = "error";
      try {
        const res = await fetch(`/api/items/taste-facets?shelf=${shelfId}`);
        if (res.ok) {
          const body = (await res.json()) as Partial<TasteFacets>;
          next = {
            genres: Array.isArray(body.genres) ? body.genres : [],
            moods: Array.isArray(body.moods) ? body.moods : [],
            pairs: body.pairs && typeof body.pairs === "object" ? body.pairs : undefined,
          };
        }
      } catch {
        // The row stays hidden. A shelf switch tries again.
      }
      if (!cancelled) setFacetsByShelf((prev) => ({ ...prev, [shelfId]: next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [category, hasFacets, shelfId]);

  const apply = useCallback(
    (next: TasteSelection) => {
      if (!tasteShelfCategory(shelfId)) return;
      setOverride({ shelf: shelfId, urlSignature, selection: next });
      router.replace(tasteHref(pathname, window.location.search, next), { scroll: false });
    },
    [pathname, router, shelfId, urlSignature],
  );

  const setGenre = useCallback(
    (genre: string | null) => apply({ genre, mood: selection.mood }),
    [apply, selection.mood],
  );
  const setMood = useCallback(
    (mood: string | null) => apply({ genre: selection.genre, mood }),
    [apply, selection.genre],
  );
  const clear = useCallback(() => apply(NO_TASTE), [apply]);

  return {
    /** True on Books and Watch, the only shelves with chips. */
    enabled: category !== null,
    genre: selection.genre,
    mood: selection.mood,
    active: selection.genre !== null || selection.mood !== null,
    /** Counts narrowed to the active filter. Null while loading or when the load failed. */
    facets: facetsState && facetsState !== "error" ? narrowFacets(facetsState, selection) : null,
    facetsLoading: category !== null && facetsState === undefined,
    setGenre,
    setMood,
    clear,
  };
}
