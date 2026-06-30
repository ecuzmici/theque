import Link from "next/link";
import { ArrowRight, Sparkles, Star } from "lucide-react";

import { formatCategory } from "@/lib/item-labels";
import type { WrappedData } from "@/lib/wrapped/wrapped-stats";
import { cn } from "@/lib/utils";

const ENTER = "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700";
const RISE = `${ENTER} motion-safe:slide-in-from-bottom-2`;

function Overline({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
      {children}
    </p>
  );
}

function Moment({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-border/60 py-12 first:border-t-0 sm:py-16", RISE, className)}>
      {children}
    </section>
  );
}

export function WrappedView({ data }: { data: WrappedData }) {
  const yearLabel = data.period.kind === "year" ? `Your ${data.period.label}` : "Your taste";
  const periodSuffix = data.period.kind === "year" ? "in taste" : "so far";

  if (data.isEmpty) {
    return (
      <div className="mx-auto max-w-2xl px-1">
        <div className={cn("flex flex-col items-center gap-4 py-20 text-center", ENTER)}>
          <Sparkles className="size-8 text-primary" aria-hidden />
          <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">Your Wrapped is waiting</h1>
          <p className="max-w-md text-balance text-muted-foreground">
            Save a few things you love and this page will reflect your taste back to
            you — your palette, your busiest month, the standouts.
          </p>
          <Link
            href="/library"
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Start your library
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-1">
      {/* Hero */}
      <header className={cn("pt-6 pb-2 text-center", ENTER)}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent-foreground">
          <Sparkles className="size-3.5" aria-hidden />
          Wrapped
        </span>
        <h1 className="mt-5 font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
          {yearLabel} {periodSuffix}
        </h1>
        <p className="mt-3 text-balance text-muted-foreground">
          A look back at what you saved, finished, and loved.
        </p>
      </header>

      {/* Total saved */}
      <Moment>
        <Overline>{data.period.kind === "year" ? "This year" : "All together"}</Overline>
        <p className="mt-3">
          <span className="font-heading text-6xl tabular-nums tracking-tight text-primary sm:text-7xl">
            {data.totalSaved.toLocaleString()}
          </span>
        </p>
        <p className="mt-2 text-lg text-muted-foreground">
          {data.totalSaved === 1 ? "thing saved to your library" : "things saved to your library"}
          {data.finishedCount > 0 ? (
            <>
              {" — and you finished "}
              <span className="font-medium text-foreground">{data.finishedCount}</span> of them
            </>
          ) : null}
          .
        </p>
        {data.truncated ? (
          <p className="mt-3 text-xs text-muted-foreground/70">
            Showing your most recent {data.totalSaved.toLocaleString()} saves.
          </p>
        ) : null}
      </Moment>

      {/* Busiest month */}
      {data.busiestMonth ? (
        <Moment>
          <Overline>Your busiest stretch</Overline>
          <p className="mt-3 font-heading text-4xl tracking-tight sm:text-5xl">
            {data.busiestMonth.label}
          </p>
          <p className="mt-2 text-lg text-muted-foreground">
            {data.busiestMonth.count} {data.busiestMonth.count === 1 ? "save" : "saves"} — your
            most curious month.
          </p>
        </Moment>
      ) : null}

      {/* Top categories */}
      {data.topCategories.length > 0 ? (
        <Moment>
          <Overline>What you reached for</Overline>
          <ul className="mt-5 space-y-3">
            {data.topCategories.map((c, i) => {
              const max = data.topCategories[0]?.count || 1;
              const pct = Math.max(8, Math.round((c.count / max) * 100));
              return (
                <li key={c.category}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">
                      <span className="mr-2 text-sm text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>
                      {c.label}
                    </span>
                    <span className="text-sm tabular-nums text-muted-foreground">{c.count}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Moment>
      ) : null}

      {/* Palette of the year */}
      {data.paletteColors.length > 0 ? (
        <Moment>
          <Overline>Your palette {data.period.kind === "year" ? "this year" : ""}</Overline>
          <p className="mt-3 text-lg text-muted-foreground">
            The colors running through your library, from{" "}
            <span className="font-medium text-foreground">{data.colorCount}</span> covers.
          </p>
          <div
            className="mt-5 flex h-24 overflow-hidden rounded-xl shadow-[var(--ks-shadow-md)] ring-1 ring-border sm:h-28"
            role="img"
            aria-label={`A band of ${data.paletteColors.length} colors from your library`}
          >
            {data.paletteColors.map((color, i) => (
              <div
                key={`${color}-${i}`}
                className="h-full flex-1"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </Moment>
      ) : null}

      {/* Standout pick */}
      {data.standoutPick ? (
        <Moment>
          <Overline>Your standout</Overline>
          <div className="mt-4 flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--ks-shadow)]">
            <div
              className="mt-1 size-12 shrink-0 rounded-lg ring-1 ring-border"
              style={{
                backgroundColor: data.standoutPick.dominantColor ?? "var(--ks-accent-soft)",
              }}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="font-heading text-xl leading-snug">
                {data.standoutPick.title || "Untitled"}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {formatCategory(data.standoutPick.category)}
                {data.standoutPick.domain ? ` · ${data.standoutPick.domain}` : ""}
              </p>
              {data.standoutPick.rating != null ? (
                <div
                  className="mt-2 flex items-center gap-0.5"
                  aria-label={`${data.standoutPick.rating} of 5 stars`}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={cn(
                        "size-4",
                        n <= (data.standoutPick?.rating ?? 0)
                          ? "fill-amber-500 text-amber-500"
                          : "text-muted-foreground/40",
                      )}
                      aria-hidden
                    />
                  ))}
                </div>
              ) : null}
              {data.standoutPick.verdict ? (
                <p className="mt-2 font-serif text-sm italic leading-snug text-muted-foreground">
                  &ldquo;{data.standoutPick.verdict}&rdquo;
                </p>
              ) : null}
            </div>
          </div>
        </Moment>
      ) : null}

      {/* Top source */}
      {data.topDomain ? (
        <Moment>
          <Overline>Where it came from</Overline>
          <p className="mt-3 font-heading text-3xl tracking-tight sm:text-4xl">
            {data.topDomain.domain}
          </p>
          <p className="mt-2 text-lg text-muted-foreground">
            your most-saved source, {data.topDomain.count}{" "}
            {data.topDomain.count === 1 ? "time" : "times"}.
          </p>
        </Moment>
      ) : null}

      {/* Closing */}
      <Moment className="text-center">
        <h2 className="font-heading text-2xl tracking-tight sm:text-3xl">
          Here&rsquo;s to what&rsquo;s next.
        </h2>
        <p className="mt-2 text-muted-foreground">Keep collecting the things you love.</p>
        <Link
          href="/library"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          Back to your library
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Moment>
    </div>
  );
}
