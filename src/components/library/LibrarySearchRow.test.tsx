import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ItemStatus } from "@/lib/database.types";
import type { ShelfId } from "@/lib/shelves";

import { LibrarySearchRow } from "./LibrarySearchRow";
import { ShelfChips, nextShelfForKey } from "./ShelfChips";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function Harness({ onSelect = vi.fn() }: { onSelect?: (id: ShelfId) => void }) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<ItemStatus | null>(null);
  const [active, setActive] = useState<ShelfId>("all");
  return (
    <LibrarySearchRow
      value={value}
      onChange={setValue}
      onClear={() => {
        setValue("");
        setStatus(null);
      }}
      shelfLabel={active === "all" ? null : "Books"}
      showStatus={value.trim().length > 0}
      status={status}
      onStatusChange={setStatus}
    >
      <ShelfChips
        shelves={["all", "books", "watch", "read", "inbox"]}
        active={active}
        onSelect={(id) => {
          setActive(id);
          onSelect(id);
        }}
        inboxCount={3}
      />
    </LibrarySearchRow>
  );
}

describe("LibrarySearchRow", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
  });

  async function render(ui: React.ReactNode) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(ui));
    return container;
  }

  const statusGroup = () => container?.querySelector('[role="group"][aria-label="Status"]');
  const input = () => container?.querySelector("input") as HTMLInputElement;

  it("shows the status chips only while a query is active", async () => {
    await render(<Harness />);
    expect(statusGroup()).toBeNull();

    await act(async () => typeInto(input(), "dune"));
    expect(statusGroup()?.textContent).toContain("Want");
    expect(statusGroup()?.textContent).toContain("Done");
    expect(statusGroup()?.textContent).toContain("Inbox");
  });

  it("toggles a status chip and clears it with the query", async () => {
    await render(<Harness />);
    await act(async () => typeInto(input(), "dune"));

    const done = [...(statusGroup()?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === "Done",
    );
    await act(async () => done?.click());
    expect(done?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => done?.click());
    expect(done?.getAttribute("aria-pressed")).toBe("false");

    await act(async () =>
      (container?.querySelector('[aria-label="Clear search"]') as HTMLButtonElement).click(),
    );
    expect(input().value).toBe("");
    expect(statusGroup()).toBeNull();
  });

  it("clears the query on Escape", async () => {
    await render(<Harness />);
    await act(async () => typeInto(input(), "dune"));
    await act(async () =>
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(input().value).toBe("");
  });

  it("renders the filter row under the shelf chips, and only when given", async () => {
    await render(
      <LibrarySearchRow
        value=""
        onChange={vi.fn()}
        onClear={vi.fn()}
        shelfLabel="Books"
        showStatus={false}
        status={null}
        onStatusChange={vi.fn()}
        filters={<div data-testid="taste-row" />}
      >
        <ShelfChips shelves={["all", "books"]} active="books" onSelect={vi.fn()} />
      </LibrarySearchRow>,
    );
    const shelves = container?.querySelector('[role="tablist"]') as HTMLElement;
    const row = container?.querySelector('[data-testid="taste-row"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(shelves.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the active shelf in the placeholder", async () => {
    await render(<Harness />);
    expect(input().placeholder).toBe("Search your library");
    const books = container?.querySelector('[data-shelf-id="books"]') as HTMLButtonElement;
    await act(async () => books.click());
    expect(input().placeholder).toBe("Search Books");
  });
});

describe("ShelfChips", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("marks the active chip with the foreground color, not the accent", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root?.render(
        <ShelfChips shelves={["all", "books", "inbox"]} active="books" onSelect={vi.fn()} inboxCount={4} />,
      ),
    );
    const books = container.querySelector('[data-shelf-id="books"]') as HTMLButtonElement;
    expect(books.getAttribute("aria-selected")).toBe("true");
    expect(books.tabIndex).toBe(0);
    expect(books.className).toContain("bg-foreground");
    expect(books.className).not.toContain("bg-primary");
    expect(container.querySelector('[data-shelf-id="inbox"]')?.textContent).toBe("Inbox4");
  });

  it("moves between chips with the arrow keys", async () => {
    const onSelect = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Harness onSelect={onSelect} />));
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    await act(async () =>
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
    );
    expect(onSelect).toHaveBeenLastCalledWith("books");
    expect(document.activeElement?.getAttribute("data-shelf-id")).toBe("books");
  });

  it("wraps around and jumps to the ends", () => {
    const shelves: ShelfId[] = ["all", "books", "watch"];
    expect(nextShelfForKey("ArrowLeft", shelves, "all")).toBe("watch");
    expect(nextShelfForKey("ArrowRight", shelves, "watch")).toBe("all");
    expect(nextShelfForKey("Home", shelves, "watch")).toBe("all");
    expect(nextShelfForKey("End", shelves, "all")).toBe("watch");
    expect(nextShelfForKey("a", shelves, "all")).toBeNull();
  });
});
