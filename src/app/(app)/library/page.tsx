import Link from "next/link";
import { redirect } from "next/navigation";

import { LibraryItemsSection } from "@/components/library/LibraryItemsSection";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let query = supabase
    .from("items")
    .select(
      "id, title, subtitle, image_url, domain, category, status, processing_status, created_at, display",
    )
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
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
              s.id === shelfId
                ? "bg-[color:var(--ks-fg)] text-[color:var(--ks-bg)] dark:bg-[color:var(--ks-accent-soft)] dark:text-[color:var(--ks-accent-hover)]"
                : "bg-[color:var(--ks-bg-muted)] text-[color:var(--ks-fg-muted)] ring-1 ring-[color:var(--ks-border)] hover:bg-[color:var(--ks-surface)]"
            }`}
          >
            {s.label}
            {s.id === "inbox" && inboxCount != null && inboxCount > 0 ? (
              <span className="ml-1.5 rounded-full bg-[color:var(--ks-accent)] px-2 py-0.5 text-[11px] font-semibold text-stone-950">
                {inboxCount}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      <LibraryItemsSection
        key={shelfId}
        userId={user.id}
        shelfId={shelfId}
        initialItems={items ?? []}
      />
    </div>
  );
}
