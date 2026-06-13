import Link from "next/link";

import { getDisplayImageUrl } from "@/lib/item-display";
import { categoryPlaceholderClass } from "@/lib/category-placeholder";
import type { LibraryItemRow } from "@/lib/types/library-item";
import { cn } from "@/lib/utils";

/** "More from your shelves" — same author/domain/category pulls from the user's own library. */
export function RelatedItemsStrip({ items }: { items: LibraryItemRow[] }) {
  if (!items.length) return null;

  return (
    <section className="mt-10" aria-label="More from your shelves">
      <h2 className="font-serif text-lg text-foreground">More from your shelves</h2>
      <ul className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-2 scrollbar-none">
        {items.map((item) => {
          const imgSrc = getDisplayImageUrl(item.image_storage_path, item.image_url);
          return (
            <li key={item.id} className="w-28 shrink-0 sm:w-32">
              <Link
                href={`/item/${item.id}`}
                className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div
                  className={cn(
                    "aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-foreground/10",
                    !imgSrc &&
                      !item.dominant_color &&
                      `bg-gradient-to-br ${categoryPlaceholderClass(item.category)}`,
                  )}
                  style={
                    item.dominant_color && !imgSrc
                      ? { backgroundColor: item.dominant_color }
                      : undefined
                  }
                >
                  {imgSrc ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy. */}
                      <img src={imgSrc} alt="" className="h-full w-full object-cover" />
                    </>
                  ) : null}
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-snug text-foreground">
                  {item.title ?? item.domain}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
