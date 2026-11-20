/**
 * The rule for `items.rank_order` (one user, one category).
 *
 * - Sort order: `rating_personal` desc, then `rank_order` asc. A low key is
 *   a better place. The key only splits items with the same rating.
 * - The key of an item with rating R is in the open band (R, R + 1). So
 *   `Math.floor(rank_order)` is the rating at the time of the match.
 * - When the user changes the rating later, the trigger
 *   `items_clear_rank_order_on_rating` sets the key to null. The item then
 *   counts as not placed: Head to head puts it back in the queue, and the top
 *   10 sorts it after the placed items with its new rating. A key outside its
 *   band (from before the trigger) also counts as not placed.
 * - The RPC `set_item_rank_orders` writes a batch and checks each band.
 * - A new item gets the midpoint between its two neighbours (or a band
 *   edge). When the gap is smaller than MIN_GAP, the caller gives the whole
 *   rating block new, even keys (`spreadKeys`).
 */

/** About 2^-30. A double near 5 still has about 2^20 distinct values in a gap this size. */
export const MIN_GAP = 1e-9;

export function isPlaced(rating: number, key: number): boolean {
  return key > rating && key < rating + 1;
}

/**
 * The key between `above` (the better neighbour) and `below`. A null
 * neighbour means the band edge. Returns null when the gap is too small.
 */
export function keyBetween(rating: number, above: number | null, below: number | null): number | null {
  const low = above ?? rating;
  const high = below ?? rating + 1;
  if (high - low < MIN_GAP) return null;
  const key = (low + high) / 2;
  return key > low && key < high ? key : null;
}

/** `count` even keys inside the band of `rating`, best first. */
export function spreadKeys(rating: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => rating + (i + 1) / (count + 1));
}
