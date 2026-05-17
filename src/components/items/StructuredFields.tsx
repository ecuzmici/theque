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

export function StructuredFields({ structured }: { structured: Json | null }) {
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) {
    return null;
  }

  const entries = Object.entries(structured as Record<string, unknown>).filter(
    ([key]) => key && typeof key === "string" && !key.startsWith("_"),
  );

  if (!entries.length) return null;

  return (
    <section className="mt-8">
      <h2 className="font-serif text-lg text-foreground">Details</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="rounded-xl border border-border bg-card px-4 py-3 ring-1 ring-foreground/10"
          >
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {formatKey(key)}
            </dt>
            <dd className="mt-1 text-sm text-foreground">{formatValue(key, value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
