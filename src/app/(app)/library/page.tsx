import Link from "next/link";

import { SHELVES, type ShelfId } from "@/lib/shelves";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{ shelf?: string }>;
};

export default async function LibraryPage({ searchParams }: PageProps) {
  const { shelf: shelfParam } = await searchParams;
  const shelfId = (SHELVES.some((s) => s.id === shelfParam) ? shelfParam : "all") as ShelfId;
  const shelf = SHELVES.find((s) => s.id === shelfId)!;

  const supabase = await createClient();
  let query = supabase
    .from("items")
    .select("id, title, subtitle, image_url, domain, category, status, processing_status, created_at")
    .order("created_at", { ascending: false })
    .limit(48);

  if (shelf.filter.status) {
    query = query.eq("status", shelf.filter.status);
  } else if (shelf.filter.excludeDismissed) {
    query = query.neq("status", "dismissed");
  }

  if (shelf.filter.category) {
    const categories = Array.isArray(shelf.filter.category)
      ? shelf.filter.category
      : [shelf.filter.category];
    query = query.in("category", categories);
  }

  const { data: items } = await query;

  const { count: inboxCount } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("status", "inbox");

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-none">
        {SHELVES.map((s) => (
          <Link
            key={s.id}
            href={s.id === "all" ? "/library" : `/library?shelf=${s.id}`}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              s.id === shelfId
                ? "bg-stone-900 text-white dark:bg-amber-100 dark:text-stone-900"
                : "bg-stone-200/80 text-stone-700 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-300"
            }`}
          >
            {s.label}
            {s.id === "inbox" && inboxCount != null && inboxCount > 0 ? (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-white dark:bg-amber-600">
                {inboxCount}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      {items && items.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/item/${item.id}`}
                className="group block overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
              >
                <div className="aspect-[2/3] bg-stone-100 dark:bg-stone-800">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-stone-400">
                      {item.processing_status === "pending" ||
                      item.processing_status === "processing"
                        ? "Loading…"
                        : item.domain}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">
                    {item.title ?? item.domain}
                  </p>
                  {item.subtitle && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">{item.subtitle}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-stone-300 px-6 py-16 text-center dark:border-stone-700">
          <p className="font-serif text-lg text-stone-700 dark:text-stone-300">
            Nothing on this shelf yet
          </p>
          <p className="mt-2 text-sm text-stone-500">
            Save something from Chrome or your phone to start your library.
          </p>
          <Link
            href="/add"
            className="mt-6 inline-block rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white dark:bg-amber-100 dark:text-stone-900"
          >
            Add a link
          </Link>
        </div>
      )}
    </div>
  );
}
