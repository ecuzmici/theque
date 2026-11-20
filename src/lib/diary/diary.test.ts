import { describe, expect, it } from "vitest";

import { buildCalendar, buildTimeline, computePace, diaryYears, type DiaryInput } from "./diary";

function book(id: string, doneAt: string | null, extra: Partial<DiaryInput> = {}): DiaryInput {
  return { id, title: id, category: "books", status: "done", doneAt, ...extra };
}

describe("buildCalendar", () => {
  it("puts each finished book on its UTC day", () => {
    const cal = buildCalendar(
      [book("a", "2026-03-04T10:00:00+00:00"), book("b", "2026-03-04T22:00:00Z")],
      2026,
    );
    const day = cal.months[2]!.weeks.flat().find((cell) => cell?.date === "2026-03-04");
    expect(day?.books.map((b) => b.id)).toEqual(["a", "b"]);
    expect(cal.daysWithBooks).toBe(1);
  });

  it("keeps only finished books inside the UTC year", () => {
    const cal = buildCalendar(
      [
        book("old", "2025-12-31T23:59:59Z"),
        book("first", "2026-01-01T00:00:00Z"),
        book("last", "2026-12-31T23:59:59Z"),
        book("next", "2027-01-01T00:00:00Z"),
        book("film", "2026-05-05T12:00:00Z", { category: "movies_and_tv" }),
        book("want", "2026-05-06T12:00:00Z", { status: "want" }),
        book("undated", null),
        book("bad", "not a date"),
      ],
      2026,
    );
    const ids = cal.months.flatMap((m) => m.weeks.flat()).flatMap((c) => c?.books ?? []);
    expect(ids.map((b) => b.id)).toEqual(["first", "last"]);
    expect(cal.daysWithBooks).toBe(2);
  });

  it("counts books per month", () => {
    const cal = buildCalendar(
      [
        book("a", "2026-02-01T08:00:00Z"),
        book("b", "2026-02-28T08:00:00Z"),
        book("c", "2026-11-20T08:00:00Z"),
      ],
      2026,
    );
    expect(cal.months.map((m) => m.count)).toEqual([0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]);
    expect(cal.total).toBe(3);
  });

  it("lays out each month in Monday-first weeks", () => {
    const jan = buildCalendar([], 2026).months[0]!;
    // 1 January 2026 is a Thursday.
    expect(jan.weeks[0]!.slice(0, 4).map((c) => c?.date ?? null)).toEqual([
      null,
      null,
      null,
      "2026-01-01",
    ]);
    expect(jan.weeks.every((w) => w.length === 7)).toBe(true);
    // February in a leap year has 29 days.
    const feb = buildCalendar([], 2028).months[1]!;
    expect(feb.weeks.flat().filter(Boolean)).toHaveLength(29);
  });
});

describe("buildTimeline", () => {
  it("groups the year's books by month, newest first", () => {
    const groups = buildTimeline(
      [
        book("mar-early", "2026-03-02T09:00:00Z"),
        book("nov", "2026-11-19T09:00:00Z"),
        book("mar-late", "2026-03-30T09:00:00Z"),
        book("last-year", "2025-12-30T09:00:00Z"),
        book("film", "2026-04-01T09:00:00Z", { category: "movies_and_tv" }),
      ],
      2026,
    );
    expect(groups.map((g) => [g.month, g.entries.map((e) => e.id)])).toEqual([
      [10, ["nov"]],
      [2, ["mar-late", "mar-early"]],
    ]);
  });
});

describe("diaryYears", () => {
  it("lists the current year and each year with a finished book, newest first", () => {
    const years = diaryYears(
      [
        book("a", "2024-06-01T09:00:00Z"),
        book("b", "2024-07-01T09:00:00Z"),
        book("c", "2022-12-31T23:00:00Z"),
        book("film", "2019-01-01T09:00:00Z", { category: "movies_and_tv" }),
      ],
      2026,
    );
    expect(years).toEqual([2026, 2024, 2022]);
  });

  it("always offers the current year", () => {
    expect(diaryYears([], 2026)).toEqual([2026]);
  });
});

function finishes(count: number, from: string): DiaryInput[] {
  const start = Date.parse(from);
  return Array.from({ length: count }, (_, i) =>
    book(`b${i}`, new Date(start + i * 86_400_000).toISOString()),
  );
}

describe("computePace", () => {
  it("is ahead when more books are done than a steady pace needs by today", () => {
    // 20 November 2026 is day 324 of 365: a steady pace to 40 needs 35 books.
    const pace = computePace(finishes(43, "2026-01-05T12:00:00Z"), 2026, 40, Date.parse("2026-11-20T15:00:00Z"));
    expect(pace).toMatchObject({ finished: 43, goal: 40, expected: 35, status: "ahead", by: 8, reached: true });
  });

  it("is behind by the gap to a steady pace", () => {
    // 2 July 2026 is day 183: 40 * 183 / 365 = 20.05, so 20 books.
    const pace = computePace(finishes(10, "2026-01-05T12:00:00Z"), 2026, 40, Date.parse("2026-07-02T08:00:00Z"));
    expect(pace).toMatchObject({ finished: 10, expected: 20, status: "behind", by: 10, reached: false });
  });

  it("is on pace when the count matches", () => {
    const pace = computePace(finishes(1, "2026-01-10T12:00:00Z"), 2026, 12, Date.parse("2026-01-31T12:00:00Z"));
    expect(pace).toMatchObject({ expected: 1, status: "on-pace", by: 0 });
  });

  it("projects the year-end count from the pace so far", () => {
    // 10 books in the first 73 days of 365 is a pace of 50 a year.
    const pace = computePace(finishes(10, "2026-01-05T12:00:00Z"), 2026, 40, Date.parse("2026-03-14T12:00:00Z"));
    expect(pace.projected).toBe(50);
  });

  it("uses the full year for a year that is over", () => {
    const pace = computePace(finishes(30, "2025-02-01T12:00:00Z"), 2025, 40, Date.parse("2026-11-20T12:00:00Z"));
    expect(pace).toMatchObject({ finished: 30, expected: 40, status: "behind", by: 10, projected: 30 });
  });

  it("counts 366 days in a leap year", () => {
    // 31 December 2028 at noon is day 366 of 366.
    const pace = computePace([], 2028, 366, Date.parse("2028-12-31T12:00:00Z"));
    expect(pace.expected).toBe(366);
    expect(pace.daysInYear).toBe(366);
  });

  it("gives a running count for each day with a finish, oldest first", () => {
    const pace = computePace(
      [
        book("c", "2026-03-10T12:00:00Z"),
        book("a", "2026-01-02T12:00:00Z"),
        book("b", "2026-01-02T18:00:00Z"),
        book("old", "2025-12-31T12:00:00Z"),
      ],
      2026,
      12,
      Date.parse("2026-11-20T12:00:00Z"),
    );
    expect(pace.points).toEqual([
      { day: 2, date: "2026-01-02", count: 2 },
      { day: 69, date: "2026-03-10", count: 3 },
    ]);
    expect(pace.today).toBe(324);
  });
});
