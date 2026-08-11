/**
 * Reveal gate for the book file field (the "Kobo file" block on item detail).
 *
 * The field stays hidden until a fixed instant, so the gift stays a surprise.
 * The check runs on the server only. A wrong clock or timezone on the client
 * cannot open the field early.
 *
 * Default instant: 17:30 Warsaw time (CEST, UTC+2) on 2026-08-12.
 * That instant is 2026-08-12T15:30:00Z.
 *
 * `BOOK_FILE_REVEAL_AT` overrides the default:
 * - unset: use the default instant.
 * - `now`: reveal the field for everybody.
 * - an ISO instant, for example `2026-08-12T15:30:00Z`: use that instant.
 *
 * `BOOK_FILE_REVEAL_EMAILS` lists the emails that see the field before the
 * instant. Use a comma to separate two or more emails.
 */
const DEFAULT_REVEAL_AT_ISO = "2026-08-12T15:30:00Z";

const DEFAULT_REVEAL_EMAILS = "ecuzmici@gmail.com";

function revealAtMs(env: NodeJS.ProcessEnv): number | null {
  const raw = env.BOOK_FILE_REVEAL_AT?.trim();
  if (raw && raw.toLowerCase() === "now") return null;

  const parsed = Date.parse(raw || DEFAULT_REVEAL_AT_ISO);
  return Number.isNaN(parsed) ? null : parsed;
}

function earlyRevealEmails(env: NodeJS.ProcessEnv): Set<string> {
  const raw = env.BOOK_FILE_REVEAL_EMAILS ?? DEFAULT_REVEAL_EMAILS;
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True when this viewer can see the book file field. */
export function isBookFileRevealed(
  email: string | null | undefined,
  now = Date.now(),
  env = process.env,
): boolean {
  const at = revealAtMs(env);
  if (at === null || now >= at) return true;

  return earlyRevealEmails(env).has((email ?? "").trim().toLowerCase());
}
