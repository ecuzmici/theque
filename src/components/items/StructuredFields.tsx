import type { ItemCategory, Json } from "@/lib/database.types";
import { getDetailFields } from "@/lib/item-detail-display";

export function StructuredFields({
  category,
  structured,
  omitKeys,
}: {
  category: ItemCategory | null;
  structured: Json | null;
  /** Keys already rendered elsewhere on the page (e.g. description). */
  omitKeys?: string[];
}) {
  const fields = getDetailFields(category, structured, omitKeys);

  if (!fields.length) return null;

  return (
    <section className="mt-8">
      <h2 className="font-heading text-lg text-foreground">Details</h2>
      {/* Catalog-card rows: one bordered list, label column + value column */}
      <dl className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {fields.map(({ key, label, value }) => (
          <div
            key={key}
            className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-baseline sm:gap-4"
          >
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd className="text-sm leading-relaxed break-words text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
