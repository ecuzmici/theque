# Item and Collection Delete Actions Design

## Goal

Make cleanup fast enough that stale saves do not stay on the primary library screen indefinitely, while keeping destructive actions deliberate and usable on phones.

## Decisions

- Use permanent deletes after a confirmation dialog. No archive, undo, or soft-delete layer in this version.
- Add a compact overflow action button to each library item card.
- Keep the overflow button phone-friendly with a roughly 44px tap target, matching the existing Inbox triage action pattern. Desktop can use the existing compact `lg-fine` sizing.
- First-version item card actions:
  - Change status
  - Open original URL
  - Delete item
- Do not include collection add/remove in the card menu yet. Collection editing stays on item detail to avoid a crowded mobile menu.
- Add a delete item control on item detail as the stable management location.
- Add delete collection on the collection detail page only. Do not add collection deletion to collection list cards in this version.

## Item Delete Flow

The item card overflow menu exposes `Delete item` as a destructive menu item. Selecting it opens a confirmation dialog that names the saved item when possible and explains that deletion is permanent.

After confirmation, the client calls `DELETE /api/items/:id`. On success, the item is removed from the current grid state and the route is refreshed where needed. On failure, the item remains visible and the user sees a concise error message.

The item detail page uses the same delete behavior. On success, it redirects back to `/library`.

## Item Quick Action Flow

The overflow menu lives in the image area at the top-right of each item card, above the card link. It must stop click propagation so opening the menu does not navigate to item detail.

The `Change status` action can reuse the existing item patch API. It should optimistically update or remove the item only when the current shelf filter no longer includes the new status. If that logic is not already available for the current shelf, prefer a simple route refresh over duplicating shelf rules in the component.

`Open original URL` opens the saved URL in a new tab using a normal link/action from the menu. If an item has no usable original URL, hide or disable the action.

## Collection Delete Flow

The collection detail page gets a destructive `Delete collection` button near the page header. Selecting it opens a confirmation dialog that names the collection and explains that deleting the collection does not delete its items.

After confirmation, the client calls `DELETE /api/collections/:id`. On success, redirect to `/collections` and refresh. On failure, keep the user on the detail page and show a concise error message.

## Components and Data Flow

- Reuse existing API routes:
  - `DELETE /api/items/:id`
  - `PATCH /api/items/:id`
  - `DELETE /api/collections/:id`
- Extend the current item card action pattern rather than introducing a new action surface. The existing `InboxActions` component is the sizing and menu-behavior reference.
- Keep mutation UI in client components, with server routes enforcing ownership through the current user.

## Error Handling

- Confirmation dialogs protect all permanent deletes.
- Failed deletes should not remove UI state.
- Failed status changes should fall back to route refresh so the shelf grid returns to server truth.
- Destructive actions should use destructive menu/button styling where available.

## Testing

- Add or update focused component tests where practical for menu rendering and confirmation flows.
- Exercise item delete from the library grid and item detail.
- Exercise collection delete from collection detail and confirm it returns to `/collections`.
- Verify on a narrow/mobile viewport that the overflow trigger is easy to tap and does not conflict with card navigation.
