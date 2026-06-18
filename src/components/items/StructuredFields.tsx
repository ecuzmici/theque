import type { Json } from "@/lib/database.types";
import { formatItemMetadataValue } from "@/lib/item-labels";

function formatKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return formatItemMetadataValue(key, value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.every((x) => typeof x === "string" || typeof x === "number")) {
      return value.join(", ");
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function StructuredFields({
  structured,
  omitKeys,
}: {
  structured: Json | null;
  /** Keys already rendered elsewhere on the page (e.g. description). */
  omitKeys?: string[];
}) {
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) {
    return null;
  }

  const entries = Object.entries(structured as Record<string, unknown>).filter(
    ([key]) =>
      key && typeof key === "string" && !key.startsWith("_") && !omitKeys?.includes(key),
  );

  if (!entries.length) return null;

  return (
    <section className="mt-8">
      <h2 className="font-heading text-lg text-foreground">Details</h2>
      {/* Catalog-card rows: one bordered list, label column + value column */}
      <dl className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-baseline sm:gap-4"
          >
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {formatKey(key)}
            </dt>
            <dd className="text-sm leading-relaxed break-words text-foreground">
              {formatValue(key, value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
