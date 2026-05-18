# Item and Collection Delete Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add phone-friendly library card quick actions plus permanent item and collection delete controls.

**Architecture:** Reuse the existing API routes for item/collection deletes and the existing Base UI dialog/dropdown primitives. Add a focused card action component that owns menu, status patching, and delete confirmation, then wire it into item cards and detail pages without changing the data model.

**Tech Stack:** Next.js App Router, React client components, Base UI shadcn-style wrappers, Supabase-backed API routes, Vitest/jsdom component tests.

---

### Task 1: Library Card Action Data

**Files:**
- Modify: `src/lib/types/library-item.ts`
- Modify: `src/lib/library-items-for-shelf.ts`
- Test: `src/components/library/LibraryItemsSection.test.tsx`

- [ ] **Step 1: Extend the library row type with `canonical_url`**

```ts
export type LibraryItemRow = Pick<
  Database["public"]["Tables"]["items"]["Row"],
  | "id"
  | "title"
  | "subtitle"
  | "image_url"
  | "domain"
  | "category"
  | "status"
  | "processing_status"
  | "created_at"
  | "display"
  | "canonical_url"
>;
```

- [ ] **Step 2: Map API summaries into the new field**

```ts
export function libraryItemFromSummary(summary: ItemSummaryPayload): LibraryItemRow {
  return {
    id: summary.id,
    title: summary.title,
    subtitle: summary.subtitle,
    image_url: summary.image_url,
    domain: summary.domain,
    category: summary.category,
    status: summary.status,
    processing_status: summary.processing_status,
    created_at: summary.created_at,
    display: summary.display,
    canonical_url: summary.canonical_url,
  };
}
```

- [ ] **Step 3: Select `canonical_url` in shelf queries**

```ts
const LIBRARY_ITEM_COLUMNS =
  "id, title, subtitle, image_url, domain, category, status, processing_status, created_at, display, canonical_url";
```

- [ ] **Step 4: Update test fixture rows**

```ts
function makeItem(patch: Partial<LibraryItemRow> = {}): LibraryItemRow {
  return {
    id: "item-1",
    title: "Goodreads",
    subtitle: null,
    image_url: null,
    domain: "goodreads.com",
    category: "books",
    status: "want",
    processing_status: "pending",
    created_at: "2026-05-17T12:00:00.000Z",
    display: {},
    canonical_url: "https://www.goodreads.com/book/show/123",
    ...patch,
  };
}
```

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/components/library/LibraryItemsSection.test.tsx`

Expected: PASS.

### Task 2: Shared Item Card Actions

**Files:**
- Create: `src/components/items/ItemCardActions.tsx`
- Modify: `src/components/items/ItemCard.tsx`
- Modify: `src/components/items/ItemGrid.tsx`
- Modify: `src/components/library/LibraryItemsSection.tsx`
- Test: `src/components/items/ItemCardActions.test.tsx`

- [ ] **Step 1: Create a component test for menu rendering**

```tsx
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LibraryItemRow } from "@/lib/types/library-item";

import { ItemCardActions } from "./ItemCardActions";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function makeItem(patch: Partial<LibraryItemRow> = {}): LibraryItemRow {
  return {
    id: "item-1",
    title: "Dune",
    subtitle: null,
    image_url: null,
    domain: "example.com",
    category: "books",
    status: "want",
    processing_status: "ready",
    created_at: "2026-05-17T12:00:00.000Z",
    display: {},
    canonical_url: "https://example.com/dune",
    ...patch,
  };
}

describe("ItemCardActions", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
    vi.restoreAllMocks();
  });

  it("opens a phone-friendly action menu", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ItemCardActions item={makeItem()} shelfId="all" onItemPatch={vi.fn()} />);
    });

    const trigger = document.querySelector("button");
    expect(trigger?.getAttribute("aria-label")).toBe("Item actions");

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("Open original");
    expect(document.body.textContent).toContain("Change status");
    expect(document.body.textContent).toContain("Delete item");
  });
});
```

- [ ] **Step 2: Run the new test and verify failure**

Run: `npm test -- src/components/items/ItemCardActions.test.tsx`

Expected: FAIL because `ItemCardActions` does not exist.

- [ ] **Step 3: Implement `ItemCardActions`**

Use `InboxActions` as the structural reference. The trigger is `MoreHorizontal`, `aria-label="Item actions"`, `size="xs"`, `variant="secondary"`, and class `h-11 min-h-11 min-w-11 px-3 bg-card/95 shadow-sm backdrop-blur lg-fine:h-7 lg-fine:min-h-7 lg-fine:w-auto lg-fine:min-w-0`.

The menu contains:
- `Open original`, rendered as an anchor when `canonical_url` is a valid `http` or `https` URL.
- A `Change status` submenu with `Want`, `Planned`, `Done`, `Dismissed`.
- A destructive `Delete item` menu item that opens a confirmation dialog.

Status changes call `PATCH /api/items/:id`, optimistically patch the item if `itemMatchesShelf(next, shelfId)` remains true, and remove it from the current grid if not. Delete calls `DELETE /api/items/:id` after confirmation and removes the item only after a `204` response.

- [ ] **Step 4: Wire the component into item cards**

Add `shelfId` to `ItemCardProps`, pass it from `ItemGrid`, and render `ItemCardActions` for all non-inbox cards. Keep `InboxActions` for inbox items on the inbox shelf.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/components/items/ItemCardActions.test.tsx src/components/inbox/InboxActions.test.tsx src/components/library/LibraryItemsSection.test.tsx`

Expected: PASS.

### Task 3: Item Detail Delete

**Files:**
- Modify: `src/components/items/ItemDetail.tsx`
- Test: optional manual verification if the component test setup becomes brittle around navigation mocks.

- [ ] **Step 1: Add delete state and navigation**

Import `Trash2` and `useRouter`. Track `deleteOpen`, `deleteBusy`, and `deleteError`. On confirmed delete, call `DELETE /api/items/:id`; on success, `router.replace("/library")` and `router.refresh()`.

- [ ] **Step 2: Add the destructive button and confirmation dialog**

Place `Delete item` in the existing action button row with `variant="destructive"` or the closest available destructive styling. Dialog copy must say deletion is permanent.

- [ ] **Step 3: Run lint for the edited file**

Run: `npm run lint -- src/components/items/ItemDetail.tsx`

Expected: PASS for the edited file.

### Task 4: Collection Detail Delete

**Files:**
- Modify: `src/components/collections/CollectionDetailClient.tsx`

- [ ] **Step 1: Add delete state and navigation**

Use `useRouter`. Track `deleteOpen`, `deleteBusy`, and `deleteError`. On confirmed delete, call `DELETE /api/collections/:id`; on success, `router.replace("/collections")` and `router.refresh()`.

- [ ] **Step 2: Add the destructive button and confirmation dialog**

Place `Delete collection` near the collection header after the back link and before the item grid. Dialog copy must say items will remain in the library.

- [ ] **Step 3: Run lint for the edited file**

Run: `npm run lint -- src/components/collections/CollectionDetailClient.tsx`

Expected: PASS for the edited file.

### Task 5: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused component tests**

Run: `npm test -- src/components/items/ItemCardActions.test.tsx src/components/inbox/InboxActions.test.tsx src/components/library/LibraryItemsSection.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run lints on edited source files**

Run: `npm run lint -- src/components/items/ItemCardActions.tsx src/components/items/ItemCard.tsx src/components/items/ItemGrid.tsx src/components/items/ItemDetail.tsx src/components/collections/CollectionDetailClient.tsx src/lib/types/library-item.ts src/lib/library-items-for-shelf.ts`

Expected: PASS.

- [ ] **Step 3: Manual browser checks**

On a narrow viewport, verify:
- The library card overflow trigger is tappable.
- Tapping it does not navigate to item detail.
- `Open original` opens a new tab.
- Status changes update or remove the card appropriately.
- `Delete item` requires confirmation and removes the card after success.
- `Delete collection` requires confirmation, keeps items intact, and returns to `/collections`.

## Self-Review

- Spec coverage: item card overflow, permanent confirmation deletes, item detail delete, collection detail delete, mobile tap target, existing API reuse, and testing are covered.
- Placeholder scan: no placeholder tasks remain.
- Type consistency: `LibraryItemRow.canonical_url`, `ItemCardActions`, `onItemPatch`, and `ShelfId` are used consistently across tasks.
