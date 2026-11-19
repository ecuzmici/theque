function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** 2 = exact title, 1 = one title contains the other, 0 = unrelated. */
export function titleScore(candidate: string, wanted: string): number {
  const a = normalize(candidate);
  const b = normalize(wanted);
  if (!a || !b) return 0;
  if (a === b) return 2;
  return a.includes(b) || b.includes(a) ? 1 : 0;
}

function nameTokens(name: string): string[] {
  return normalize(name)
    .split(" ")
    .filter((token) => token.length >= 2);
}

/**
 * True when the two author lists share a person. Names match on the surname
 * (the last word of a name in `a`) found anywhere in a name in `b`, so
 * "Ursula K. Le Guin" matches "Ursula Le Guin" and "Liu Cixin" matches
 * "Cixin Liu". An empty list on either side gives false.
 */
export function authorsOverlap(a: string[], b: string[]): boolean {
  const bTokens = new Set(b.flatMap(nameTokens));
  return a.some((name) => {
    const tokens = nameTokens(name);
    const surname = tokens[tokens.length - 1];
    return surname !== undefined && bTokens.has(surname);
  });
}
