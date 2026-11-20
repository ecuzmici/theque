"use client";

import { useRef, useState } from "react";

import { CoverImg, type CoverUrls } from "@/components/items/CoverImg";

/**
 * A timeline cover. When the thumbnail and the full image both fail, it shows
 * the colour placeholder and no broken-image icon.
 */
export function DiaryCover({ cover, color }: { cover: CoverUrls | null; color: string | null }) {
  const [failed, setFailed] = useState(false);
  const errors = useRef(0);
  const tries = cover?.fallback && cover.fallback !== cover.src ? 2 : 1;

  return (
    <div
      className="h-[84px] w-14 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm"
      style={(!cover || failed) && color ? { backgroundColor: color } : undefined}
    >
      {cover && !failed ? (
        <CoverImg
          urls={cover}
          className="size-full object-cover"
          onError={() => {
            errors.current += 1;
            if (errors.current >= tries) setFailed(true);
          }}
        />
      ) : null}
    </div>
  );
}
