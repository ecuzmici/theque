"use client";

import { Check, RefreshCw, Star } from "lucide-react";
import { useCallback, useState } from "react";

import type { ItemCategory } from "@/lib/database.types";
import { cleanDisplayTitle } from "@/lib/display-title";
import { cardAspectRatio, getDisplayImageUrl } from "@/lib/item-display";
import { formatCategory } from "@/lib/item-labels";
import type { LibraryItemRow } from "@/lib/types/library-item";
import { cn } from "@/lib/utils";

/** Cleaned title for a card caption or cover. Falls back to the domain. */
export function cardTitle(item: Pick<LibraryItemRow, "title" | "domain">): string {
  return (item.title ? cleanDisplayTitle(item.title) : "") || item.domain;
}

/** First creator part of the subtitle ("Ursula K. Le Guin · 1969" gives "Ursula K. Le Guin"). */
export function cardByline(item: Pick<LibraryItemRow, "subtitle" | "domain">): string {
  const first = item.subtitle?.split(/\s[·•-]\s/)[0]?.trim();
  if (first) return first;
  return item.domain.replace(/^www\./, "");
}

function ratioOf(value: string): number {
  const [w, h] = value.split("/").map(Number);
  return w > 0 && h > 0 ? w / h : 2 / 3;
}

/** A ratio wider than this sits on a blurred copy instead of a crop. */
const LANDSCAPE_MIN_RATIO = 0.9;

/** Expected image shape before the image loads, from the category or stored card aspect. */
export function expectsLandscape(item: Pick<LibraryItemRow, "category" | "display">): boolean {
  return ratioOf(cardAspectRatio(item.category, item.display)) >= LANDSCAPE_MIN_RATIO;
}

const FALLBACK_TINT: Record<ItemCategory, string> = {
  books: "#6b3a1f",
  movies_and_tv: "#2b2550",
  articles: "#3f3a36",
  products: "#1e3a52",
  restaurants: "#5a2a2a",
  travel: "#1f4a48",
  recipes: "#3a4a1f",
};

const HEX = /^#?([0-9a-f]{6})$/i;

/** Cover tint: the extracted dominant color, else a category color. */
export function coverTint(item: Pick<LibraryItemRow, "dominant_color" | "category">): string {
  if (item.dominant_color && HEX.test(item.dominant_color)) {
    return item.dominant_color.startsWith("#") ? item.dominant_color : `#${item.dominant_color}`;
  }
  return FALLBACK_TINT[item.category ?? "articles"];
}

/** True when light text reads better than dark text on this color. */
export function isDarkTint(hex: string): boolean {
  const m = HEX.exec(hex);
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const luminance = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return luminance < 150;
}

/** Book-like cover for an item without an image: serif title, byline, spine shadow. */
function TypeCover({ item, processing }: { item: LibraryItemRow; processing: boolean }) {
  const tint = coverTint(item);
  const dark = isDarkTint(tint);
  return (
    <div
      data-testid="type-cover"
      aria-hidden
      className={cn(
        "absolute inset-0 flex flex-col justify-between overflow-hidden",
        dark ? "text-white" : "text-stone-900",
      )}
      style={{ backgroundColor: tint }}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/35 via-black/10 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_70%_0%,rgba(255,255,255,0.14),transparent_60%)]" />
      <div className="relative pt-[16%] pr-[9%] pl-[14%]">
        <div className={cn("mb-2 h-px w-8", dark ? "bg-white/50" : "bg-stone-900/40")} />
        <p className="line-clamp-5 font-serif text-[clamp(15px,2.2vw,22px)] leading-[1.1] font-semibold tracking-tight hyphens-auto [overflow-wrap:break-word]">
          {cardTitle(item)}
        </p>
      </div>
      <div className="relative pr-[9%] pb-[10%] pl-[14%]">
        <p
          className={cn(
            "line-clamp-2 text-[10px] tracking-[0.14em] uppercase",
            dark ? "text-white/75" : "text-stone-900/70",
          )}
        >
          {processing ? "Gathering details…" : cardByline(item)}
        </p>
        <p
          className={cn(
            "mt-1 text-[9px] tracking-[0.18em] uppercase",
            dark ? "text-white/45" : "text-stone-900/45",
          )}
        >
          {formatCategory(item.category)}
        </p>
      </div>
    </div>
  );
}

function CoverImage({ src, landscapeHint }: { src: string; landscapeHint: boolean }) {
  // Start from the category's expected shape. Correct it once the real image size is known.
  const [landscape, setLandscape] = useState(landscapeHint);
  const measure = useCallback((img: HTMLImageElement | null) => {
    if (!img?.complete || !img.naturalWidth || !img.naturalHeight) return;
    setLandscape(img.naturalWidth / img.naturalHeight >= LANDSCAPE_MIN_RATIO);
  }, []);

  if (!landscape) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy.
      <img
        ref={measure}
        src={src}
        alt=""
        onLoad={(e) => measure(e.currentTarget)}
        className="absolute inset-0 size-full object-cover"
      />
    );
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy. */}
      <img
        src={src}
        alt=""
        aria-hidden
        data-testid="cover-backdrop"
        className="absolute inset-0 size-full scale-125 object-cover opacity-60 blur-xl"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy. */}
      <img
        ref={measure}
        src={src}
        alt=""
        onLoad={(e) => measure(e.currentTarget)}
        className="absolute inset-0 size-full object-contain"
      />
    </>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-px text-amber-300" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("size-2.5", n <= value ? "fill-current" : "opacity-35")} />
      ))}
    </span>
  );
}

/** Text a screen reader hears for the status drawn on the cover. */
export function coverStatusLabel(
  item: Pick<LibraryItemRow, "status" | "rating_personal"> & Partial<Pick<LibraryItemRow, "file_uploaded_at">>,
): string | null {
  let label: string | null = null;
  if (item.status === "inbox") label = "In inbox";
  else if (item.status === "done") {
    label = item.rating_personal != null ? `Done, ${item.rating_personal} of 5 stars` : "Done";
  }
  if (!item.file_uploaded_at) return label;
  return label ? `${label}, synced to your e-reader` : "Synced to your e-reader";
}

/** The 2:3 cover with its image (or typographic cover) and the status marks. */
export function ItemCardCover({ item, selected }: { item: LibraryItemRow; selected?: boolean }) {
  const processing = item.processing_status === "pending" || item.processing_status === "processing";
  const src = getDisplayImageUrl(item.image_storage_path, item.image_url);

  return (
    <div
      className={cn(
        "relative aspect-[2/3] w-full overflow-hidden rounded-md bg-muted shadow-[0_1px_2px_rgba(0,0,0,0.12),0_6px_16px_-8px_rgba(0,0,0,0.35)] ring-1 ring-black/5",
        selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
      )}
      // The extracted color is the loading base under the image.
      style={item.dominant_color ? { backgroundColor: item.dominant_color } : undefined}
    >
      {src ? (
        <CoverImage key={src} src={src} landscapeHint={expectsLandscape(item)} />
      ) : (
        <TypeCover item={item} processing={processing} />
      )}
      {processing ? <div className="pointer-events-none absolute inset-0 ks-shimmer bg-transparent" /> : null}

      {item.file_uploaded_at || item.status === "inbox" ? (
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5" aria-hidden>
          {item.file_uploaded_at ? (
            <span
              data-testid="synced-mark"
              className="inline-flex size-5 items-center justify-center rounded-full bg-white/95 text-stone-900 shadow-sm"
            >
              <RefreshCw className="size-3" strokeWidth={2.5} />
            </span>
          ) : null}
          {item.status === "inbox" ? (
            <span data-testid="inbox-dot" className="size-2 rounded-full bg-amber-500 ring-2 ring-white/80" />
          ) : null}
        </div>
      ) : null}
      {item.status === "done" ? (
        <div
          data-testid="done-mark"
          className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 to-transparent px-2 pt-6 pb-1.5 text-white"
          aria-hidden
        >
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-white/95 text-stone-900">
            <Check className="size-3" strokeWidth={3} />
          </span>
          {item.rating_personal != null ? <Stars value={item.rating_personal} /> : null}
        </div>
      ) : null}
    </div>
  );
}
