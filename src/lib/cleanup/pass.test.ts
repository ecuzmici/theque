import { describe, expect, it } from "vitest";

import { createPass, decide, passQueue, passSummary, revertDecision, savedAgo, undoLast } from "./pass";

const NOW = Date.parse("2026-11-20T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function item(
  id: string,
  created: number,
  patch: Partial<{ status: string; kept_at: string | null; pinned_at: string | null }> = {},
) {
  return { id, status: "want", created_at: daysAgo(created), kept_at: null, pinned_at: null, ...patch };
}

describe("passQueue", () => {
  it("holds the forgotten items for the age choice, oldest first", () => {
    const pass = createPass([
      item("new", 30),
      item("old", 900),
      item("mid", 400),
      item("done", 900, { status: "done" }),
      item("kept", 900, { kept_at: daysAgo(20) }),
    ]);
    expect(passQueue(pass, 180, NOW).map((i) => i.id)).toEqual(["old", "mid"]);
    expect(passQueue(pass, 730, NOW).map((i) => i.id)).toEqual(["old"]);
  });
});

describe("decide", () => {
  const items = () => createPass([item("a", 900), item("b", 800, { kept_at: daysAgo(750) }), item("c", 700)]);
  const at = new Date(NOW).toISOString();

  it("takes a kept item out of the queue and stamps kept_at", () => {
    const pass = decide(items(), "a", "keep", at, 1);
    expect(passQueue(pass, 180, NOW).map((i) => i.id)).toEqual(["b", "c"]);
    expect(pass.items.find((i) => i.id === "a")?.kept_at).toBe(at);
  });

  it("takes a let-go item out of the queue and dismisses it", () => {
    const pass = decide(items(), "a", "let_go", at, 2);
    expect(passQueue(pass, 180, NOW).map((i) => i.id)).toEqual(["b", "c"]);
    expect(pass.items.find((i) => i.id === "a")?.status).toBe("dismissed");
  });

  it("ignores an unknown item", () => {
    const pass = items();
    expect(decide(pass, "zzz", "keep", at, 3)).toBe(pass);
  });
});

describe("undoLast", () => {
  const at = new Date(NOW).toISOString();

  it("puts the last decision back at the front of the queue", () => {
    let pass = createPass([item("a", 900), item("b", 800, { kept_at: daysAgo(750) }), item("c", 700)]);
    pass = decide(pass, "a", "let_go", at, 4);
    pass = decide(pass, "b", "keep", at, 5);
    const { state, undone } = undoLast(pass);
    expect(undone).toMatchObject({ id: "b", choice: "keep", before: { status: "want", kept_at: daysAgo(750) } });
    expect(passQueue(state, 180, NOW).map((i) => i.id)).toEqual(["b", "c"]);
    expect(state.items.find((i) => i.id === "b")?.kept_at).toBe(daysAgo(750));

    const again = undoLast(state);
    expect(again.undone?.id).toBe("a");
    expect(again.state.items.find((i) => i.id === "a")?.status).toBe("want");
    expect(passQueue(again.state, 180, NOW).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("does nothing when there is no decision", () => {
    const pass = createPass([item("a", 900)]);
    expect(undoLast(pass)).toEqual({ state: pass, undone: null });
  });
});

describe("revertDecision", () => {
  const at = new Date(NOW).toISOString();

  it("undoes one decision that is not the last, for a failed save", () => {
    let pass = createPass([item("a", 900), item("b", 800)]);
    pass = decide(pass, "a", "let_go", at, 1);
    pass = decide(pass, "b", "keep", at, 2);
    pass = revertDecision(pass, 1);
    expect(passQueue(pass, 180, NOW).map((i) => i.id)).toEqual(["a"]);
    expect(passSummary(pass)).toEqual({ kept: 1, letGo: 0 });
  });

  it("leaves a later decision on the same item alone", () => {
    let pass = createPass([item("a", 900)]);
    pass = decide(pass, "a", "let_go", at, 1);
    pass = undoLast(pass).state;
    pass = decide(pass, "a", "keep", at, 2);
    const after = revertDecision(pass, 1);
    expect(after).toBe(pass);
    expect(passSummary(after)).toEqual({ kept: 1, letGo: 0 });
  });
});

describe("pins", () => {
  it("clears the pin on let go and gives it back on undo", () => {
    const pinned = "2026-11-01T00:00:00.000Z";
    let pass = createPass([item("a", 900, { pinned_at: pinned })]);
    pass = decide(pass, "a", "let_go", new Date(NOW).toISOString(), 1);
    expect(pass.items[0]?.pinned_at).toBeNull();
    const { state, undone } = undoLast(pass);
    expect(undone?.before.pinned_at).toBe(pinned);
    expect(state.items[0]?.pinned_at).toBe(pinned);
  });
});

describe("savedAgo", () => {
  it("says days, then months, then years", () => {
    expect(savedAgo(daysAgo(1), NOW)).toBe("1 day ago");
    expect(savedAgo(daysAgo(30), NOW)).toBe("30 days ago");
    expect(savedAgo(daysAgo(200), NOW)).toBe("7 months ago");
    expect(savedAgo(daysAgo(400), NOW)).toBe("13 months ago");
    expect(savedAgo(daysAgo(730), NOW)).toBe("2 years ago");
    expect(savedAgo(daysAgo(1200), NOW)).toBe("3 years ago");
  });
});

describe("passSummary", () => {
  it("counts the decisions that stand", () => {
    const at = new Date(NOW).toISOString();
    let pass = createPass([item("a", 900), item("b", 800), item("c", 700)]);
    expect(passSummary(pass)).toEqual({ kept: 0, letGo: 0 });
    pass = decide(pass, "a", "let_go", at, 8);
    pass = decide(pass, "b", "keep", at, 9);
    pass = decide(pass, "c", "let_go", at, 10);
    expect(passSummary(pass)).toEqual({ kept: 1, letGo: 2 });
    expect(passSummary(undoLast(pass).state)).toEqual({ kept: 1, letGo: 1 });
  });
});
