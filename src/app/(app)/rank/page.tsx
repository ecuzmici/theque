import { PageHeader } from "@/components/layout/PageHeader";
import { HeadToHead, type RankItem } from "@/components/rank/HeadToHead";
import { loadLibrarySnapshot } from "@/lib/library-snapshot/load";
import { RANK_CATEGORIES, type RankCategory } from "@/lib/rank/top-ten";

import { saveRankOrders } from "./actions";

/**
 * Head to head. The server loads the finished, rated books and films through
 * the session client (RLS). The client plays the matches and saves each
 * place with the `saveRankOrders` server action.
 */
export default async function HeadToHeadPage() {
  const snapshot = await loadLibrarySnapshot("/rank");

  const items: RankItem[] = snapshot
    .filter(
      (i): i is typeof i & { category: RankCategory; rating: number } =>
        i.status === "done" &&
        i.rating !== null &&
        (RANK_CATEGORIES as readonly string[]).includes(i.category ?? ""),
    )
    .map((i) => ({
      id: i.id,
      title: i.title,
      byline: i.category === "books" ? (i.authors[0] ?? null) : (i.directors[0] ?? null),
      year: i.year,
      category: i.category,
      status: i.status,
      rating: i.rating,
      rankOrder: i.rankOrder,
      doneAt: i.doneAt,
      cover: i.cover,
      color: i.color,
    }));

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <PageHeader title="Head to head" description="Pick the better of two. Your top 10 in each category follows." />
      <HeadToHead items={items} saveAction={saveRankOrders} />
    </div>
  );
}
