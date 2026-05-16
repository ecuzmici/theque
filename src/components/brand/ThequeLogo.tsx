import Link from "next/link";

import { cn } from "@/lib/utils";

import { IndexCardMark, ShelfFlatMark, ShelfRoundedMark } from "./marks";

export type ThequeLogoMark = "shelf-flat" | "shelf-rounded" | "index-card" | "none";

type ThequeLogoProps = {
  mark?: ThequeLogoMark;
  /** Text size: sidebar (lg), mobile header (md), login hero (xl), compact (sm). */
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  href?: string;
  markClassName?: string;
};

const marks = {
  "shelf-flat": ShelfFlatMark,
  "shelf-rounded": ShelfRoundedMark,
  "index-card": IndexCardMark,
} as const;

const textSize = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
  xl: "text-2xl",
} as const;

const markSize = {
  sm: "size-5",
  md: "size-6",
  lg: "size-7",
  xl: "size-8",
} as const;

export function ThequeLogo({
  mark = "none",
  size = "lg",
  className,
  href = "/library",
  markClassName,
}: ThequeLogoProps) {
  const Mark = mark === "none" ? null : marks[mark];
  const inner = (
    <>
      {Mark ? <Mark className={cn(markSize[size], markClassName)} /> : null}
      <span
        className={cn(
          "font-serif lowercase tracking-[0.04em] text-inherit",
          textSize[size],
        )}
      >
        theque
      </span>
    </>
  );

  return (
    <Link
      href={href}
      aria-label="theque home"
      className={cn(
        "inline-flex items-center rounded-md text-foreground outline-none ring-ring/50 focus-visible:ring-3",
        mark === "none" ? "gap-0" : "gap-2",
        className,
      )}
    >
      {inner}
    </Link>
  );
}
