/**
 * Pure helpers for the command palette. Kept free of React/router/icon
 * dependencies so the matching behavior can be unit-tested in isolation.
 */

/** Matches the same "is this a saveable link" rule the Add page uses. */
const URL_RE = /^https?:\/\//i;

export function looksLikeUrl(value: string): boolean {
  return URL_RE.test(value.trim());
}

export type FilterableCommand = {
  id: string;
  label: string;
  /** Extra terms (synonyms, shelf names) that should also match a query. */
  keywords?: string[];
};

/**
 * Filters commands by a free-text query. Empty query returns everything; a
 * multi-word query is an AND match (every term must appear somewhere in the
 * label or keywords), which keeps "go books" → the Books shelf without a
 * heavyweight fuzzy library.
 */
export function filterCommands<T extends FilterableCommand>(
  commands: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  const terms = q.split(/\s+/);
  return commands.filter((command) => {
    const haystack = [command.label, ...(command.keywords ?? [])]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
