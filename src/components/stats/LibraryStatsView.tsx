import Link from "next/link";
import { Sparkles, Star } from "lucide-react";

import { formatCategory } from "@/lib/item-labels";
import type { LibraryStats } from "@/lib/stats/library-stats";
import { cn } from "@/lib/utils";

function SectionCard({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--ks-radius-card)] border border-border bg-card p-5 shadow-[var(--ks-shadow)]",
        className,
      )}
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg tracking-tight text-foreground">{title}</h2>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function HeadlineTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[var(--ks-radius-card)] border border-border bg-card p-4 text-center shadow-[var(--ks-shadow)]">
      <p className="font-heading text-3xl tabular-nums text-foreground sm:text-4xl">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function BarRow({
  label,
  count,
  max,
  swatch,
}: {
  label: React.ReactNode;
  count: number;
  max: number;
  swatch?: string;
}) {
  const pct = max > 0 ? Math.max(count > 0 ? 6 : 0, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-28 shrink-0 items-center gap-2 text-sm text-foreground sm:w-32">
        {swatch ? (
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: swatch }}
            aria-hidden
          />
        ) : null}
        <span className="truncate">{label}</span>
      </div>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[var(--ks-radius-card)] border border-dashed border-border bg-card p-10 text-center">
      <Sparkles className="mx-auto size-7 text-primary" aria-hidden />
      <p className="mt-3 font-heading text-xl text-foreground">No taste to count — yet</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Save a few things and this page fills with the shape of your library: what you collect,
        how much you finish, and the colors you lean toward.
      </p>
      <Link
        href="/add"
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        Save your first link
      </Link>
    </div>
  );
}

export function LibraryStatsView({ stats }: { stats: LibraryStats }) {
  if (stats.totalSaved === 0) {
    return <EmptyState />;
  }

  const categoryMax = stats.categories[0]?.count ?? 0;
  const ratingMax = Math.max(1, ...stats.ratings.map((r) => r.count));
  const hueMax = Math.max(1, ...stats.hueHistogram.map((b) => b.count));
  const monthMax = Math.max(1, ...stats.byMonth.map((m) => m.count));
  const domainMax = stats.topDomains[0]?.count ?? 0;
  const hasPalette = stats.palette.length >= 8;
  const capped = stats.totalSaved > stats.sampleSize;

  return (
    <div className="space-y-5">
      {hasPalette ? (
        <div
          className="flex h-12 overflow-hidden rounded-[var(--ks-radius-card)]"
          style={{ filter: "saturate(0.66)" }}
          aria-hidden
        >
          {stats.palette.map((color, i) => (
            <div key={i} className="flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <HeadlineTile value={String(stats.totalSaved)} label="Saved" />
        <HeadlineTile value={String(stats.doneCount)} label="Finished" />
        <HeadlineTile value={`${stats.completionPct}%`} label="Completed" />
      </div>

      {stats.forgottenCount > 0 ? (
        <Link
          href="/library?shelf=forgotten"
          className="flex items-center justify-between gap-3 rounded-[var(--ks-radius-card)] border border-border bg-accent px-5 py-4 text-accent-foreground transition hover:opacity-90"
        >
          <span className="text-sm font-medium">
            <span className="tabular-nums">{stats.forgottenCount}</span>{" "}
            {stats.forgottenCount === 1 ? "save has" : "saves have"} been waiting a long while
          </span>
          <span className="shrink-0 text-sm font-semibold">Revisit →</span>
        </Link>
      ) : null}

      <SectionCard title="By category">
        {stats.categories.length > 0 ? (
          <div className="space-y-2.5">
            {stats.categories.map((c) => (
              <BarRow
                key={c.category}
                label={formatCategory(c.category === "uncategorized" ? null : c.category)}
                count={c.count}
                max={categoryMax}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing categorized yet.</p>
        )}
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Your palette" hint="hue of your saves">
          <div className="flex h-28 items-end gap-1" role="img" aria-label="Distribution of saves by color hue">
            {stats.hueHistogram.map((bucket) => {
              const h = bucket.count > 0 ? Math.max(8, Math.round((bucket.count / hueMax) * 100)) : 3;
              return (
                <div
                  key={bucket.startHue}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${h}%`,
                    backgroundColor: bucket.count > 0 ? bucket.color : "var(--muted)",
                    opacity: bucket.count > 0 ? 0.9 : 0.5,
                  }}
                  title={`${bucket.count}`}
                />
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Each bar is a slice of the color wheel; taller means more of your saves carry that tone.
          </p>
        </SectionCard>

        <SectionCard title="Your verdicts">
          {stats.ratedDoneCount > 0 ? (
            <>
              <div className="space-y-2.5">
                {stats.ratings.map((r) => (
                  <BarRow
                    key={r.star}
                    label={
                      <span className="inline-flex items-center gap-1">
                        <span className="tabular-nums">{r.star}</span>
                        <Star className="size-3.5 fill-amber-500 text-amber-500" aria-hidden />
                      </span>
                    }
                    count={r.count}
                    max={ratingMax}
                  />
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                You&rsquo;ve loved{" "}
                <span className="font-semibold tabular-nums text-foreground">{stats.lovedCount}</span>{" "}
                and left{" "}
                <span className="font-semibold tabular-nums text-foreground">{stats.verdictCount}</span>{" "}
                {stats.verdictCount === 1 ? "verdict" : "verdicts"}.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Mark something done and rate it — your taste record starts to take shape here.
            </p>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Top sources">
          {stats.topDomains.length > 0 ? (
            <div className="space-y-2.5">
              {stats.topDomains.map((d) => (
                <BarRow key={d.domain} label={d.domain} count={d.count} max={domainMax} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No sources yet.</p>
          )}
        </SectionCard>

        <SectionCard title="Saved over time" hint="last 6 months">
          <div className="flex h-28 items-end gap-2">
            {stats.byMonth.map((m) => {
              const h = m.count > 0 ? Math.max(8, Math.round((m.count / monthMax) * 100)) : 3;
              return (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-sm bg-primary/75"
                      style={{ height: `${h}%`, opacity: m.count > 0 ? 1 : 0.4 }}
                      title={`${m.count}`}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{m.label}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {capped ? (
        <p className="text-center text-xs text-muted-foreground">
          Category, color, verdict and source breakdowns reflect your{" "}
          <span className="tabular-nums">{stats.sampleSize}</span> most recent saves.
        </p>
      ) : null}
    </div>
  );
}
