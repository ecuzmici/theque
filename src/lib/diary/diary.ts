/**
 * Pure aggregates for the reading diary (/diary): the calendar of finished
 * books, the verdict timeline and the pace against a yearly goal.
 *
 * Time zone: all day, month and year boundaries use UTC. The item page and
 * the stats page show `done_at` in UTC too, so a book shows the same date in
 * each place. A book that you finish between local midnight and the UTC
 * midnight can show on the day before or after.
 */

import type { ItemCategory } from "@/lib/database.types";

/** The item fields that the diary reads. `SnapshotItem` satisfies this type. */
export type DiaryInput = {
  id: string;
  title: string;
  category: ItemCategory | null;
  status: string;
  doneAt: string | null;
};

export type CalendarDay<T extends DiaryInput = DiaryInput> = { date: string; books: T[] };

export type CalendarMonth<T extends DiaryInput = DiaryInput> = {
  /** 0 = January. */
  month: number;
  count: number;
  /** Monday-first weeks. A null cell is a day of another month. */
  weeks: Array<Array<CalendarDay<T> | null>>;
};

export type Calendar<T extends DiaryInput = DiaryInput> = {
  months: CalendarMonth<T>[];
  daysWithBooks: number;
  /** Books finished in the year. */
  total: number;
};

const DAY_MS = 86_400_000;
/** The first day of the year that gives a projection. */
const PROJECTION_MIN_DAYS = 14;

function dayKey(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function doneTime(item: DiaryInput): number | null {
  if (item.category !== "books" || item.status !== "done" || !item.doneAt) return null;
  const time = Date.parse(item.doneAt);
  return Number.isFinite(time) ? time : null;
}

export function buildCalendar<T extends DiaryInput>(items: T[], year: number): Calendar<T> {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const time = doneTime(item);
    if (time == null) continue;
    const key = dayKey(time);
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }

  const months: CalendarMonth<T>[] = [];
  for (let month = 0; month < 12; month++) {
    const first = Date.UTC(year, month, 1);
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const offset = (new Date(first).getUTCDay() + 6) % 7;
    const cells: Array<CalendarDay<T> | null> = Array.from({ length: offset }, () => null);
    let count = 0;
    for (let d = 0; d < days; d++) {
      const date = dayKey(first + d * DAY_MS);
      const books = byDay.get(date) ?? [];
      count += books.length;
      cells.push({ date, books });
    }
    while (cells.length % 7) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    months.push({ month, count, weeks });
  }

  const daysWithBooks = months
    .flatMap((m) => m.weeks.flat())
    .filter((cell) => cell && cell.books.length > 0).length;
  const total = months.reduce((sum, m) => sum + m.count, 0);
  return { months, daysWithBooks, total };
}

export type TimelineMonth<T extends DiaryInput = DiaryInput> = {
  /** 0 = January. */
  month: number;
  entries: T[];
};

/** The year's finished books by month. Months and entries are newest first. */
export function buildTimeline<T extends DiaryInput>(items: T[], year: number): TimelineMonth<T>[] {
  const dated = items
    .map((item) => ({ item, time: doneTime(item) }))
    .filter((d): d is { item: T; time: number } => d.time != null && new Date(d.time).getUTCFullYear() === year)
    .sort((a, b) => b.time - a.time);
  const groups: TimelineMonth<T>[] = [];
  for (const { item, time } of dated) {
    const month = new Date(time).getUTCMonth();
    const last = groups[groups.length - 1];
    if (last?.month === month) last.entries.push(item);
    else groups.push({ month, entries: [item] });
  }
  return groups;
}

/** The current year plus each year with a finished book, newest first. */
export function diaryYears(items: DiaryInput[], currentYear: number): number[] {
  const years = new Set([currentYear]);
  for (const item of items) {
    const time = doneTime(item);
    if (time != null) years.add(new Date(time).getUTCFullYear());
  }
  return [...years].sort((a, b) => b - a);
}

export type PacePoint = {
  /** Day of the year, 1 = 1 January. */
  day: number;
  date: string;
  /** Books finished up to the end of this day. */
  count: number;
};

export type Pace = {
  finished: number;
  goal: number;
  /** Books that a steady pace to the goal needs by the end of today. */
  expected: number;
  status: "ahead" | "behind" | "on-pace";
  /** The gap to `expected`, always zero or more. */
  by: number;
  reached: boolean;
  /**
   * The year-end count if the pace so far continues. Null before day 14,
   * because a few days give a wild projection.
   */
  projected: number | null;
  daysInYear: number;
  /** Days of the year that have started: 0 before the year, `daysInYear` after it. */
  today: number;
  points: PacePoint[];
};

/**
 * Pace against a yearly goal. A steady pace needs `goal * today / daysInYear`
 * books by the end of today, rounded down.
 */
export function computePace(items: DiaryInput[], year: number, goal: number, now: number): Pace {
  const start = Date.UTC(year, 0, 1);
  const daysInYear = (Date.UTC(year + 1, 0, 1) - start) / DAY_MS;
  const today = Math.min(daysInYear, Math.max(0, Math.floor((now - start) / DAY_MS) + 1));

  const days = new Map<number, number>();
  for (const item of items) {
    const time = doneTime(item);
    if (time == null || new Date(time).getUTCFullYear() !== year) continue;
    const day = Math.floor((time - start) / DAY_MS) + 1;
    days.set(day, (days.get(day) ?? 0) + 1);
  }
  let count = 0;
  const points = [...days.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, n]) => {
      count += n;
      return { day, date: dayKey(start + (day - 1) * DAY_MS), count };
    });

  const finished = count;
  const expected = Math.floor((goal * today) / daysInYear);
  const delta = finished - expected;
  return {
    finished,
    goal,
    expected,
    status: delta > 0 ? "ahead" : delta < 0 ? "behind" : "on-pace",
    by: Math.abs(delta),
    reached: finished >= goal,
    projected: today >= PROJECTION_MIN_DAYS ? Math.round((finished * daysInYear) / today) : null,
    daysInYear,
    today,
    points,
  };
}
