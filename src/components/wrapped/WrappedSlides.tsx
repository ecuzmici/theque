import Link from "next/link";

import { CoverImg } from "@/components/items/CoverImg";
import { Button } from "@/components/ui/button";
import type { ItemCategory } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { MONTH_NAMES, type SlideKind, type Wrapped, type WrappedCover } from "@/lib/wrapped/wrapped";

const NOUNS: Record<ItemCategory, [string, string]> = {
  books: ["book", "books"],
  movies_and_tv: ["film or show", "films and shows"],
  articles: ["article", "articles"],
  restaurants: ["restaurant", "restaurants"],
  products: ["product", "products"],
  travel: ["place", "places"],
  recipes: ["recipe", "recipes"],
};

function noun(category: ItemCategory, count: number): string {
  return NOUNS[category][count === 1 ? 0 : 1];
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

function listPhrase(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function stars(count: number): string {
  return "★".repeat(count);
}

/* Type scale for a slide. The hero figure uses the sans face (dataviz skill). */
function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-base text-white/75">{children}</p>;
}

function Hero({ children }: { children: React.ReactNode }) {
  return <p className="text-7xl leading-none font-semibold tracking-tight sm:text-8xl">{children}</p>;
}

function Headline({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("font-heading text-3xl leading-tight text-balance [overflow-wrap:anywhere]", className)}>{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-white/70">{children}</p>;
}

function CoverGrid({ items, label }: { items: WrappedCover[]; label: string }) {
  return (
    <ul aria-label={label} className="grid w-full max-w-[min(100%,20rem)] grid-cols-3 gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="aspect-[2/3] overflow-hidden rounded-md shadow-lg ring-1 ring-white/10"
          style={{ background: item.color ?? "#292524" }}
        >
          {item.cover ? (
            <CoverImg urls={item.cover} alt={item.title} className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-end p-1.5 font-heading text-[0.7rem] leading-tight text-white/90">
              {item.title}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Ranked horizontal bars, one hue, value at the bar tip (dataviz: part-to-whole, compare the parts). */
function CategoryBars({ wrapped }: { wrapped: Wrapped }) {
  const max = Math.max(1, ...wrapped.categories.map((c) => c.count));
  return (
    <ul className="flex w-full flex-col gap-3">
      {wrapped.categories.map((c) => (
        <li key={c.category} className="flex flex-col gap-1">
          <span className="text-sm text-white/80">{c.label}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-5 rounded-r-[4px] bg-white/85"
              style={{ width: `${Math.max(2, (c.count / max) * 82)}%` }}
              aria-hidden
            />
            <span className="text-sm font-medium tabular-nums">{c.count}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Twelve columns, the busiest month in full ink and the rest muted (dataviz: emphasis). */
function MonthColumns({ wrapped }: { wrapped: Wrapped }) {
  const max = Math.max(1, ...wrapped.months);
  const busiest = wrapped.busiestMonth?.month;
  return (
    <figure className="w-full">
      <div className="flex h-36 items-end gap-[2px]" role="list" aria-label="Finishes per month">
        {wrapped.months.map((count, month) => {
          const isBusiest = month === busiest;
          const label = `${MONTH_NAMES[month]}: ${plural(count, "finish", "finishes")}`;
          return (
            <div key={month} role="listitem" aria-label={label} title={label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              {isBusiest ? <span className="text-xs font-medium tabular-nums">{count}</span> : null}
              <span
                className={cn("w-full max-w-6 rounded-t-[4px]", isBusiest ? "bg-white" : "bg-white/35")}
                style={{ height: count > 0 ? `${(count / max) * 100}%` : "1px" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px] border-t border-white/20 pt-1.5" aria-hidden>
        {MONTH_NAMES.map((name, month) => (
          <span key={name} className={cn("flex-1 text-center text-[0.65rem] text-white/55", month === busiest && "text-white")}>
            {name[0]}
          </span>
        ))}
      </div>
    </figure>
  );
}

function ColourStripes({ colors }: { colors: string[] }) {
  return (
    <div className="flex h-36 w-full overflow-hidden rounded-lg ring-1 ring-white/10" aria-hidden>
      {colors.map((color, i) => (
        <span key={i} className="h-full flex-1" style={{ background: color }} />
      ))}
    </div>
  );
}

function yearPhrase(wrapped: Wrapped): string {
  return wrapped.partial ? `${wrapped.year} so far` : String(wrapped.year);
}

export type SlideActions = { onRestart: () => void; closeHref: string };

/** The body of one slide. The story player draws the frame, the progress row and the controls. */
export function SlideBody({ kind, wrapped, actions }: { kind: SlideKind; wrapped: Wrapped; actions: SlideActions }) {
  const { reading, watching } = wrapped;
  switch (kind) {
    case "empty":
      return (
        <>
          <Kicker>Your {yearPhrase(wrapped)}</Kicker>
          <Headline className="text-4xl">Nothing finished in {wrapped.year}{wrapped.partial ? " yet" : ""}.</Headline>
          <Note>Mark a book or a film as done and it shows up here.</Note>
          <Button nativeButton={false} size="lg" className="self-start px-4" render={<Link href={actions.closeHref} />}>
            Back to library
          </Button>
        </>
      );
    case "intro": {
      const parts = wrapped.categories.map((c) => `${c.count} ${noun(c.category, c.count)}`);
      return (
        <>
          <Kicker>Your {yearPhrase(wrapped)}</Kicker>
          <Hero>{wrapped.total.toLocaleString("en-US")}</Hero>
          <Headline>
            {wrapped.categories.length === 1
              ? `${noun(wrapped.categories[0]!.category, wrapped.total)} finished`
              : "finished"}
          </Headline>
          {parts.length > 1 || wrapped.throughLabel ? (
            <Note>
              {parts.length > 1 ? `${listPhrase(parts)}. ` : ""}
              {wrapped.throughLabel ? `Counted up to ${wrapped.throughLabel}.` : ""}
            </Note>
          ) : null}
          <p className="text-xs text-white/55">
            <span className="pointer-coarse:hidden">Press → to go on.</span>
            <span className="hidden pointer-coarse:inline">Tap or swipe to go on.</span>
          </p>
        </>
      );
    }
    case "split":
      return (
        <>
          <Kicker>What you finished</Kicker>
          <Headline>Mostly {wrapped.categories[0]!.label.toLowerCase()}</Headline>
          <CategoryBars wrapped={wrapped} />
        </>
      );
    case "pages": {
      const weeks = wrapped.days / 7;
      const perWeek = weeks >= 2 && reading.books >= 3 ? Math.round(reading.pages / weeks) : null;
      return (
        <>
          <Kicker>You read</Kicker>
          <Hero>{reading.pages.toLocaleString("en-US")}</Hero>
          <Headline>pages</Headline>
          <Note>
            {reading.booksWithPages < reading.books
              ? `From the ${reading.booksWithPages} of your ${plural(reading.books, "book", "books")} with a page count.`
              : `Across ${plural(reading.books, "book", "books")}.`}
            {perWeek ? ` About ${perWeek.toLocaleString("en-US")} a week.` : ""}
          </Note>
        </>
      );
    }
    case "hours":
      return (
        <>
          <Kicker>You watched</Kicker>
          <Hero>{watching.hours.toLocaleString("en-US")}</Hero>
          <Headline>{watching.hours === 1 ? "hour of film and TV" : "hours of film and TV"}</Headline>
          <Note>
            {watching.titlesWithRuntime < watching.titles
              ? `From the ${watching.titlesWithRuntime} of your ${plural(watching.titles, "title", "titles")} with a runtime.`
              : `Across ${plural(watching.titles, "title", "titles")}.`}
            {" A show counts once, at the runtime on its page."}
            {watching.longest ? ` Longest: ${watching.longest.title}, ${formatMinutes(watching.longest.minutes)}.` : ""}
          </Note>
        </>
      );
    case "favourites": {
      const fav = wrapped.favourites!;
      const starWord = fav.stars === 5 ? "five-star" : "four-star";
      return (
        <>
          <Kicker>Your top shelf</Kicker>
          <Headline>
            {fav.count === 1 ? `One ${starWord} finish` : `${fav.count.toLocaleString("en-US")} ${starWord} finishes`}
          </Headline>
          <CoverGrid items={fav.items} label={`${starWord} finishes`} />
          {fav.count > fav.items.length ? <Note>The newest {fav.items.length} of them.</Note> : null}
        </>
      );
    }
    case "author": {
      const author = wrapped.topAuthor!;
      return (
        <>
          <Kicker>Your author of the year</Kicker>
          <Headline className="text-5xl">{author.name}</Headline>
          <Note>{plural(author.count, "book", "books")} finished.</Note>
          <CoverGrid items={author.items} label={`Books by ${author.name}`} />
        </>
      );
    }
    case "longest": {
      const book = reading.longest!;
      return (
        <>
          <Kicker>Your longest book</Kicker>
          <Headline className="text-4xl">{book.title}</Headline>
          <Hero>{book.pages.toLocaleString("en-US")}</Hero>
          <Note>pages.</Note>
        </>
      );
    }
    case "months": {
      const busiest = wrapped.busiestMonth!;
      return (
        <>
          <Kicker>Your busiest month</Kicker>
          <Headline className="text-5xl">{busiest.name}</Headline>
          <Note>{plural(busiest.count, "finish", "finishes")}.</Note>
          <MonthColumns wrapped={wrapped} />
        </>
      );
    }
    case "taste": {
      const { genre, mood } = wrapped.taste;
      const line = [mood?.label, mood ? genre?.label.toLowerCase() : genre?.label].filter(Boolean).join(" ");
      const notes = [
        genre ? `${plural(genre.count, "finish", "finishes")} tagged ${genre.label}.` : null,
        mood ? `${plural(mood.count, "finish", "finishes")} tagged ${mood.label.toLowerCase()}.` : null,
      ].filter(Boolean);
      return (
        <>
          <Kicker>Your year in two words</Kicker>
          <Headline className="text-5xl">{line}</Headline>
          <Note>{notes.join(" ")}</Note>
        </>
      );
    }
    case "verdict": {
      const verdict = wrapped.verdict!;
      return (
        <>
          <Kicker>In your own words</Kicker>
          <blockquote className="font-serif text-2xl leading-snug text-pretty italic sm:text-3xl">
            “{verdict.text}”
          </blockquote>
          <Note>
            On {verdict.title}, <span aria-label={`${verdict.rating} stars`}>{stars(verdict.rating)}</span>
          </Note>
        </>
      );
    }
    case "colours": {
      const { palette } = wrapped;
      return (
        <>
          <Kicker>The colour of your year</Kicker>
          <Headline className="text-5xl capitalize">{palette.name}</Headline>
          <ColourStripes colors={palette.colors} />
          <Note>One stripe for each cover you finished, in colour order.</Note>
        </>
      );
    }
    case "outro":
      return (
        <>
          <Kicker>{wrapped.partial ? "That is your year so far" : "That was your year"}</Kicker>
          <Hero>{wrapped.year}</Hero>
          <Note>
            {wrapped.partial
              ? `${plural(wrapped.total, "finish", "finishes")} up to ${wrapped.throughLabel}. Come back in January for the full year.`
              : `${plural(wrapped.total, "finish", "finishes")} in all.`}
          </Note>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={actions.onRestart}
              className="border-white/30 bg-transparent px-4 text-white hover:bg-white/10 hover:text-white dark:bg-transparent dark:hover:bg-white/10"
            >
              Watch again
            </Button>
            <Button nativeButton={false} size="lg" className="px-4" render={<Link href={actions.closeHref} />}>
              Back to library
            </Button>
          </div>
        </>
      );
  }
}
