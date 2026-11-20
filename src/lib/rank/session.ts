/**
 * Head to head: binary insertion inside each star rating.
 *
 * Each unplaced item finds its place among the placed items with the same
 * rating, one match at a time. A 5-star item never drops below a 4-star item,
 * so the matches only split ties that stars cannot.
 *
 * The session is immutable. Each step returns the next session and the
 * `rank_order` writes that make the database agree with it. The caller sends
 * the writes and keeps the next session. See `rank-key.ts` for the key rule.
 */
import { isPlaced, keyBetween, spreadKeys } from "./rank-key";

export type Contender = { id: string; rating: number; rankOrder: number | null };
export type RankWrite = { id: string; rankOrder: number | null };
export type Match = { challenger: string; opponent: string };
export type Winner = "challenger" | "opponent";
export type Step = { session: RankSession; writes: RankWrite[] };

type Placed = { id: string; rating: number; rankOrder: number };
type Board = { ranked: Placed[]; queue: Contender[]; lo: number; hi: number };

export type RankSession = Readonly<
  Board & {
    /** The contenders as given, so a restart can start from them. */
    contenders: Contender[];
    /** The `rank_order` that the database holds for each id, as far as the session knows. */
    saved: Record<string, number | null>;
    history: Board[];
  }
>;

const HISTORY_LIMIT = 50;

function byRatingThenKey(a: Placed, b: Placed) {
  return b.rating - a.rating || a.rankOrder - b.rankOrder;
}

function byRatingThenId(a: Contender, b: Contender) {
  return b.rating - a.rating || a.id.localeCompare(b.id);
}

/** The slice [lo, hi) of `ranked` that holds the items with this rating. */
function block(ranked: Placed[], rating: number) {
  const lo = ranked.filter((p) => p.rating > rating).length;
  const hi = ranked.filter((p) => p.rating >= rating).length;
  return { lo, hi };
}

/** Puts `item` at `index` and gives it a key between its neighbours in the same rating. */
function insert(ranked: Placed[], index: number, item: Contender): Placed[] {
  const prev = ranked[index - 1];
  const next = ranked[index];
  const above = prev && prev.rating === item.rating ? prev.rankOrder : null;
  const below = next && next.rating === item.rating ? next.rankOrder : null;
  const key = keyBetween(item.rating, above, below);
  if (key !== null) {
    return [...ranked.slice(0, index), { ...item, rankOrder: key }, ...ranked.slice(index)];
  }
  // The gap is too small: give the whole rating block new, even keys.
  const { lo, hi } = block(ranked, item.rating);
  const members = [...ranked.slice(lo, index), item, ...ranked.slice(index, hi)];
  const keys = spreadKeys(item.rating, members.length);
  const respaced = members.map((m, i) => ({ id: m.id, rating: m.rating, rankOrder: keys[i]! }));
  return [...ranked.slice(0, lo), ...respaced, ...ranked.slice(hi)];
}

/** Places queued items that have no peer to play, and sets lo/hi for the next match. */
function settle(board: Board): Board {
  let { ranked, queue } = board;
  while (queue.length > 0) {
    const head = queue[0]!;
    const { lo, hi } = block(ranked, head.rating);
    if (lo < hi) return { ranked, queue, lo, hi };
    ranked = insert(ranked, lo, head);
    queue = queue.slice(1);
  }
  return { ranked, queue, lo: 0, hi: 0 };
}

function boardOf(session: RankSession): Board {
  return { ranked: session.ranked, queue: session.queue, lo: session.lo, hi: session.hi };
}

/** Builds the writes from `saved` to `board`, and the session after they apply. */
function commit(session: RankSession, board: Board, history: Board[]): Step {
  const target: Record<string, number | null> = {};
  for (const c of session.contenders) target[c.id] = null;
  for (const p of board.ranked) target[p.id] = p.rankOrder;

  const writes: RankWrite[] = [];
  for (const [id, rankOrder] of Object.entries(target)) {
    if ((session.saved[id] ?? null) !== rankOrder) writes.push({ id, rankOrder });
  }
  return { session: { ...session, ...board, saved: target, history }, writes };
}

/**
 * Starts a session for one category. Items with a key that is valid for
 * their rating keep their place. The other items wait in the queue.
 */
export function openSession(contenders: Contender[]): RankSession {
  const ranked: Placed[] = [];
  const queue: Contender[] = [];
  const saved: Record<string, number | null> = {};
  for (const c of contenders) {
    saved[c.id] = c.rankOrder;
    if (c.rankOrder !== null && isPlaced(c.rating, c.rankOrder)) {
      ranked.push({ id: c.id, rating: c.rating, rankOrder: c.rankOrder });
    } else {
      queue.push(c);
    }
  }
  ranked.sort(byRatingThenKey);
  queue.sort(byRatingThenId);
  return { contenders, saved, history: [], ...settle({ ranked, queue, lo: 0, hi: 0 }) };
}

export function currentMatch(session: RankSession): Match | null {
  const challenger = session.queue[0];
  if (!challenger || session.lo >= session.hi) return null;
  const opponent = session.ranked[Math.floor((session.lo + session.hi) / 2)]!;
  return { challenger: challenger.id, opponent: opponent.id };
}

/**
 * Records the winner of the current match. "opponent" also serves for
 * "too close to call": the challenger then goes below the opponent.
 * With no current match, the step only flushes pending writes.
 */
export function pick(session: RankSession, winner: Winner): Step {
  const challenger = session.queue[0];
  if (!currentMatch(session) || !challenger) return commit(session, boardOf(session), session.history);

  const mid = Math.floor((session.lo + session.hi) / 2);
  const lo = winner === "challenger" ? session.lo : mid + 1;
  const hi = winner === "challenger" ? mid : session.hi;
  const board =
    lo >= hi
      ? settle({ ranked: insert(session.ranked, lo, challenger), queue: session.queue.slice(1), lo: 0, hi: 0 })
      : { ranked: session.ranked, queue: session.queue, lo, hi };
  const history = [...session.history, boardOf(session)].slice(-HISTORY_LIMIT);
  return commit(session, board, history);
}

/** Goes back one match. The writes put back the keys from before that match. */
export function undo(session: RankSession): Step {
  const previous = session.history[session.history.length - 1];
  if (!previous) return commit(session, boardOf(session), session.history);
  return commit(session, previous, session.history.slice(0, -1));
}

export function canUndo(session: RankSession): boolean {
  return session.history.length > 0;
}

/** Clears every place in this category and starts again. */
export function restart(session: RankSession): Step {
  const queue = session.contenders.map((c) => ({ ...c, rankOrder: null })).sort(byRatingThenId);
  return commit(session, settle({ ranked: [], queue, lo: 0, hi: 0 }), []);
}

/** Ids of the placed items, best first. */
export function standings(session: RankSession): string[] {
  return session.ranked.map((p) => p.id);
}

export function progress(session: RankSession): { placed: number; total: number } {
  return { placed: session.ranked.length, total: session.contenders.length };
}
