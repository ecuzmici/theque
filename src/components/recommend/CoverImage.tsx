"use client";

import { useState } from "react";

export function CoverImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-amber-950/50 via-amber-900/30 to-stone-900/40 ${className ?? ""}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] font-medium leading-tight text-amber-100/70">
          {alt}
        </div>
      )}
    </div>
  );
}
