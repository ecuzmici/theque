/**
 * One shared signal for a failed optimistic save. A component undoes its
 * optimistic change and calls `reportSaveError()`. `SaveErrorRegion` (in the
 * app shell) shows the message in a live region, so a screen reader reads it.
 */
export const SAVE_ERROR_EVENT = "theque:save-error";

export const SAVE_ERROR_MESSAGE = "Could not save. Try again.";

export function reportSaveError(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SAVE_ERROR_EVENT));
}

/**
 * PATCH an item and report whether the server saved it. A network error
 * counts as a failure. It never throws.
 */
export async function patchItemRequest(itemId: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
