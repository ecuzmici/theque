import { Link } from "next-view-transitions";

import { DiaryCalendar, type CalendarBook } from "@/components/diary/DiaryCalendar";
import { DiaryTimeline, type DiaryEntry } from "@/components/diary/DiaryTimeline";
import { GoalForm } from "@/components/diary/GoalForm";
import { PaceChart } from "@/components/diary/PaceChart";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { buildCalendar, buildTimeline, computePace, diaryYears, type Pace } from "@/lib/diary/diary";
import { readingGoalFromMetadata } from "@/lib/diary/goal";
import { loadLibrarySnapshot } from "@/lib/library-snapshot/load";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type SearchParams = Promise<{ year?: string | string[]; verdicts?: string | string[] }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function diaryHref(year: number, currentYear: number, verdicts: boolean): string {
  const params = new URLSearchParams();
  if (year !== currentYear) params.set("year", String(year));
  if (verdicts) params.set("verdicts", "1");
  const query = params.toString();
  return query ? `/diary?${query}` : "/diary";
}

function books(n: number): string {
  return `${n} ${n === 1 ? "book" : "books"}`;
}

function chipClass(active: boolean): string {
  return cn(
    "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition pointer-coarse:min-h-[var(--tap-target-min)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-card text-muted-foreground hover:text-foreground",
  );
}

function paceHeadline(pace: Pace): string {
  if (pace.reached) return `Goal reached: ${pace.finished} of ${pace.goal}`;
  if (pace.status === "ahead") return `Ahead by ${books(pace.by)}`;
  if (pace.status === "behind") return `Behind by ${books(pace.by)}`;
  return "On pace";
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={cn(
        "rounded-[var(--ks-radius-card)] border border-border bg-card p-4 shadow-[var(--ks-shadow)] sm:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export default async function ReadingDiaryPage({ searchParams }: { searchParams: SearchParams }) {
  const [items, supabase, params] = await Promise.all([
    loadLibrarySnapshot("/diary"),
    createClient(),
    searchParams,
  ]);
  // The goal is in the session JWT claims; the save action refreshes the token.
  const { data: claims } = await supabase.auth.getClaims();
  const goal = readingGoalFromMetadata(claims?.claims?.user_metadata);

  const now = Date.now();
  const currentYear = new Date(now).getUTCFullYear();
  const years = diaryYears(items, currentYear);
  const askedYear = Number(first(params.year));
  const year = years.includes(askedYear) ? askedYear : currentYear;
  const onlyVerdicts = first(params.verdicts) === "1";
  const isCurrentYear = year === currentYear;

  const entries: DiaryEntry[] = items
    .filter((item) => item.category === "books")
    .map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      status: item.status,
      doneAt: item.doneAt,
      color: item.color,
      cover: item.cover,
      rating: item.rating,
      verdict: item.verdict,
      authors: item.authors,
    }));
  const calendarBooks: CalendarBook[] = entries.map(({ id, title, category, status, doneAt, color }) => ({
    id,
    title,
    category,
    status,
    doneAt,
    color,
  }));

  const calendar = buildCalendar(calendarBooks, year);
  const timeline = buildTimeline(entries, year);
  const withVerdict = timeline.reduce((n, m) => n + m.entries.filter((e) => e.verdict).length, 0);
  const shownTimeline = onlyVerdicts
    ? timeline
        .map((m) => ({ ...m, entries: m.entries.filter((e) => e.verdict) }))
        .filter((m) => m.entries.length > 0)
    : timeline;
  const pace = isCurrentYear && goal != null ? computePace(entries, year, goal, now) : null;
  const hasAnyBook = years.length > 1 || calendar.total > 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Reading diary" description="The books you finished, day by day." />

      {years.length > 1 ? (
        <nav aria-label="Year" className="-mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {years.map((y) => (
            <Link
              key={y}
              href={diaryHref(y, currentYear, false)}
              aria-current={y === year ? "page" : undefined}
              className={chipClass(y === year)}
            >
              {y}
            </Link>
          ))}
        </nav>
      ) : null}

      {!hasAnyBook ? (
        <Card className="py-10 text-center">
          <h2 className="font-heading text-xl tracking-tight">No finished books yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Rate a book on its page to mark it done. It shows up here on the day you finish it.
          </p>
          <Button nativeButton={false} render={<Link href="/library?shelf=books" />} variant="outline" size="lg" className="mt-5">
            Open your books
          </Button>
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="font-heading text-xl tracking-tight">{year}</h2>
            <p className="text-sm text-muted-foreground">
              {calendar.total
                ? `${books(calendar.total)} on ${calendar.daysWithBooks} ${calendar.daysWithBooks === 1 ? "day" : "days"}`
                : isCurrentYear
                  ? "No books finished yet this year"
                  : "No books finished"}
            </p>
          </div>
          <DiaryCalendar calendar={calendar} year={year} />
        </Card>
      )}

      {isCurrentYear ? (
        <Card>
          {pace ? (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-xl tracking-tight">{paceHeadline(pace)}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {pace.finished} of {books(pace.goal)} so far. A steady pace needs {pace.expected} by today. At
                    this rate you finish {year} with {pace.projected}.
                  </p>
                </div>
              </div>
              <PaceChart pace={pace} year={year} />
              <div className="mt-4">
                <GoalForm goal={goal} year={year} />
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Set a yearly goal to see your pace.</p>
              <GoalForm goal={null} year={year} />
            </div>
          )}
        </Card>
      ) : null}

      {calendar.total > 0 ? (
        <section aria-labelledby="diary-timeline" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="diary-timeline" className="font-heading text-2xl tracking-tight">
              Diary
            </h2>
            {withVerdict > 0 ? (
              <div className="flex gap-2" role="group" aria-label="Show">
                <Link href={diaryHref(year, currentYear, false)} aria-current={!onlyVerdicts ? "true" : undefined} className={chipClass(!onlyVerdicts)}>
                  All
                  <span className={cn("text-xs tabular-nums", onlyVerdicts ? "text-muted-foreground/70" : "text-background/70")}>
                    {calendar.total}
                  </span>
                </Link>
                <Link href={diaryHref(year, currentYear, true)} aria-current={onlyVerdicts ? "true" : undefined} className={chipClass(onlyVerdicts)}>
                  With a verdict
                  <span className={cn("text-xs tabular-nums", onlyVerdicts ? "text-background/70" : "text-muted-foreground/70")}>
                    {withVerdict}
                  </span>
                </Link>
              </div>
            ) : null}
          </div>
          <DiaryTimeline months={shownTimeline} />
        </section>
      ) : null}
    </div>
  );
}
