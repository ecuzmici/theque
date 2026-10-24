"use client";

import type { ComponentProps } from "react";

import type { getCoverImageUrls } from "@/lib/item-display";

export type CoverUrls = NonNullable<ReturnType<typeof getCoverImageUrls>>;

type CoverImgProps = Omit<ComponentProps<"img">, "src" | "alt"> & {
  urls: CoverUrls;
  alt?: string;
};

/**
 * A small cover image. It loads the cached thumbnail, and the full image when
 * the thumbnail is missing. It loads lazily and decodes off the main thread,
 * so a long wall of covers does not block scrolling.
 */
export function CoverImg({ urls, alt = "", onError, ...props }: CoverImgProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy.
    <img
      loading="lazy"
      decoding="async"
      {...props}
      src={urls.src}
      alt={alt}
      onError={(e) => {
        const img = e.currentTarget;
        if (urls.fallback && img.src !== urls.fallback) img.src = urls.fallback;
        onError?.(e);
      }}
    />
  );
}
