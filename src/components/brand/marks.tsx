import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

const vb = "0 0 24 24";

type MarkProps = {
  className?: string;
  style?: CSSProperties;
  /** Accessible name when the mark is used alone; omit when decorative next to wordmark. */
  title?: string;
};

/** Two upright rectangles on a thick shelf — crisp at small sizes. */
export function ShelfFlatMark({ className, title, style }: MarkProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      style={style}
      viewBox={vb}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M3 19h18v2.25H3V19Z"
        className="fill-[#78716c] dark:fill-[#a8a29e]"
      />
      <rect
        x="4.5"
        y="5"
        width="6.5"
        height="13.25"
        rx="1"
        className="fill-[#fffefb] stroke-[#d6d3d1] stroke-[0.75] dark:fill-stone-900 dark:stroke-stone-600"
      />
      <rect
        x="13"
        y="7"
        width="6.5"
        height="11.25"
        rx="1"
        className="fill-[#fffefb] stroke-[#d6d3d1] stroke-[0.75] dark:fill-stone-900 dark:stroke-stone-600"
      />
      <rect
        x="6.25"
        y="7.5"
        width="3"
        height="2.25"
        rx="0.35"
        className="fill-[#b45309] dark:fill-[#fbbf24]"
      />
    </svg>
  );
}

/** Same layout with rounder corners — reads a bit softer / more “card-like”. */
export function ShelfRoundedMark({ className, title, style }: MarkProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      style={style}
      viewBox={vb}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M3 19h18v2.25H3V19Z"
        className="fill-[#78716c] dark:fill-[#a8a29e]"
      />
      <rect
        x="4.25"
        y="5.25"
        width="6.75"
        height="13"
        rx="2.25"
        className="fill-[#fffefb] stroke-[#d6d3d1] stroke-[0.75] dark:fill-stone-900 dark:stroke-stone-600"
      />
      <rect
        x="12.75"
        y="7"
        width="7"
        height="11.25"
        rx="2.25"
        className="fill-[#fffefb] stroke-[#d6d3d1] stroke-[0.75] dark:fill-stone-900 dark:stroke-stone-600"
      />
      <rect
        x="6.25"
        y="7.5"
        width="3"
        height="2.25"
        rx="0.35"
        className="fill-[#b45309] dark:fill-[#fbbf24]"
      />
    </svg>
  );
}

/** Tri diagonal bands (matches `app/icon.svg`), scaled to 24×24. */
export function IndexCardMark({ className, title, style }: MarkProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      style={style}
      viewBox={vb}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id="theque-index-card-clip">
          <rect width="24" height="24" rx="5.25" ry="5.25" />
        </clipPath>
      </defs>
      <g clipPath="url(#theque-index-card-clip)">
        <path d="M0 0h8.25L0 8.25V0Z" fill="#57534e" />
        <path d="M8.25 0h15.75v10.5L10.5 24H0V8.25L8.25 0Z" fill="#faf8f5" />
        <path d="M24 24V10.5L10.5 24H24z" fill="#b45309" />
      </g>
    </svg>
  );
}
