export const MAX_URL_LENGTH = 4096;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_TITLE_LENGTH = 300;
export const MAX_TAG_NAME_LENGTH = 64;
export const MAX_TAGS_PER_ITEM = 50;
export const MAX_COLLECTION_IDS_PER_ITEM = 100;
export const MAX_COLLECTION_NAME_LENGTH = 100;
export const MAX_COLLECTION_DESCRIPTION_LENGTH = 1000;
export const MAX_CAPTURE_TOKEN_NAME_LENGTH = 100;
export const MAX_SEARCH_QUERY_LENGTH = 200;
export const MAX_BOOK_FILE_BYTES = 30 * 1024 * 1024;

export function hasMaxLength(value: string, maxLength: number): boolean {
  return value.length <= maxLength;
}

export function hasMaxItems(value: unknown[], maxItems: number): boolean {
  return value.length <= maxItems;
}

export function normalizeLimitedTagNames(names: string[]): string[] | null {
  const set = new Set<string>();
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    if (!hasMaxLength(name, MAX_TAG_NAME_LENGTH)) return null;
    set.add(name);
  }
  return [...set];
}
