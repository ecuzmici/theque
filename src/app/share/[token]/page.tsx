import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ThequeLogo } from "@/components/brand/ThequeLogo";
import { categoryPlaceholderClass } from "@/lib/category-placeholder";
import { getDisplayImageUrl } from "@/lib/item-display";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Read-only shared collection. Unauthenticated by design: the unguessable
 * token is the credential, the service-role client scopes the query to that
 * single collection, and nothing links back into the private app.
 */
export default async function SharedCollectionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();

  const admin = createAdminClient();
  const { data: collection } = await admin
    .from("collections")
    .select("id, name, description")
    .eq("share_token", token)
    .maybeSingle();

  if (!collection) notFound();

  const { data: links } = await admin
    .from("collection_items")
    .select("item_id")
    .eq("collection_id", collection.id);

  const itemIds = (links ?? []).map((l) => l.item_id);
  const { data: items } = itemIds.length
    ? await admin
        .from("items")
        .select(
          "id, title, subtitle, canonical_url, domain, category, image_url, image_storage_path, dominant_color",
        )
        .in("id", itemIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="text-center">
        <ThequeLogo size="md" />
        <h1 className="mt-6 font-heading text-3xl leading-tight tracking-tight text-foreground">
          {collection.name}
        </h1>
        {collection.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{collection.description}</p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          A shared collection · {items?.length ?? 0} {(items?.length ?? 0) === 1 ? "item" : "items"}
        </p>
      </header>

      {items && items.length > 0 ? (
        <ul className="mt-10 columns-2 gap-3 sm:columns-3 lg:columns-4 lg:gap-4">
          {items.map((item) => {
            const imgSrc = getDisplayImageUrl(item.image_storage_path, item.image_url);
            return (
              <li key={item.id} className="mb-3 break-inside-avoid lg:mb-4">
                <a
                  href={item.canonical_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:ring-2 hover:ring-foreground/20"
                >
                  <div
                    className={cn(
                      "relative aspect-[2/3] w-full bg-muted",
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
                        <img src={imgSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      </>
                    ) : null}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 font-serif text-[15px] font-semibold leading-snug tracking-tight text-card-foreground">
                      {item.title ?? item.domain}
                    </p>
                    {item.subtitle ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {item.subtitle}
                      </p>
                    ) : null}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-12 text-center text-sm text-muted-foreground">
          This collection is empty.
        </p>
      )}

      <footer className="mt-14 text-center text-xs text-muted-foreground">
        Collected with thèque, a private taste library.
      </footer>
    </main>
  );
}
