import { Link } from "next-view-transitions";
import { Star } from "lucide-react";

import { CoverImg } from "@/components/items/CoverImg";
import type { TopTenEntry } from "@/lib/rank/top-ten";
import { cn } from "@/lib/utils";

/** A numbered list of the best items in one category. */
export function TopTenList({ entries, dense = false }: { entries: TopTenEntry[]; dense?: boolean }) {
  return (
    <ol className="space-y-0.5">
      {entries.map((entry, index) => (
        <li key={entry.id}>
          <Link
            href={`/item/${entry.id}`}
            className="flex min-h-10 items-center gap-3 rounded-lg px-2 py-1 transition hover:bg-muted pointer-coarse:min-h-[var(--tap-target-min)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="w-5 shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            {dense ? null : (
              <span
                className="h-10 w-7 shrink-0 overflow-hidden rounded-sm bg-muted"
                style={entry.color ? { backgroundColor: entry.color } : undefined}
              >
                {entry.cover ? <CoverImg urls={entry.cover} className="size-full object-cover" /> : null}
              </span>
            )}
            <span className={cn("min-w-0 flex-1 truncate text-foreground", dense ? "text-sm" : "text-[15px]")}>
              {entry.title}
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs tabular-nums text-muted-foreground">
              {entry.rating}
              <Star className="size-3 fill-amber-500 text-amber-500" aria-label="stars" />
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
