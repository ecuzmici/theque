// Display-only cleanup of titles that leak page-title text from the source site.
// The stored title stays as it is. Enrichment fixes belong in the pipeline.

// IMDb title kinds that come before the year: "(TV Series 1990–1991)".
const IMDB_KINDS = [
  "TV Mini[- ]Series",
  "TV Series",
  "TV Movie",
  "TV Special",
  "TV Short",
  "TV Episode",
  "TV Pilot",
  "Video Game",
  "Video",
  "Short",
  "Podcast Series",
  "Podcast Episode",
  "Music Video",
].join("|");

// "(1990)", "(TV Series 1990–1991)", "(TV Series 2011– )", "(I) (2004)" at the end.
const IMDB_YEAR_PAREN = new RegExp(
  String.raw`\s*(?:\([IVX]+\)\s*)?\((?:(?:${IMDB_KINDS})\s+)?\d{4}(?:\s*[–—-]\s*(?:\d{4})?\s*)?\)\s*$`,
  "i",
);

// " - IMDb", " | IMDb", " – IMDbPro" at the end.
const IMDB_SUFFIX = /\s*[-–—|:]\s*IMDb(?:\s?Pro)?\s*$/i;

// "⭐ 8.7 | Crime, Drama" and everything after the star.
const IMDB_RATING_TAIL = /\s*⭐.*$/u;

// " | Crime, Drama" after an IMDb year paren. Genres are single words such as "Sci-Fi".
const IMDB_GENRE_TAIL = /^(.*\))\s*\|\s*[A-Za-z-]+(?:\s*,\s*[A-Za-z-]+)*\s*$/;

// Goodreads series marker "(Dune, #1)" or "(Discworld, #4.5)" at the end.
const GOODREADS_SERIES = /\s*\([^()]*#\d+(?:\.\d+)?\)\s*$/;

const GOODREADS_SUFFIX = /\s*\|\s*Goodreads\s*$/i;

// "GitHub - owner/repo: description" keeps "owner/repo".
const GITHUB_TITLE = /^GitHub\s+-\s+([\w.-]+\/[\w.-]+)(?::\s.*)?$/;

/**
 * Removes leaked site junk from an item title for display.
 * "Twin Peaks (TV Series 1990–1991) ⭐ 8.7 | Crime, Drama" becomes "Twin Peaks".
 * A title without a known pattern comes back trimmed and otherwise unchanged.
 */
export function cleanDisplayTitle(title: string): string {
  const original = title.replace(/\s+/g, " ").trim();
  let t = original;

  t = t.replace(IMDB_SUFFIX, "");
  t = t.replace(IMDB_RATING_TAIL, "");

  const genre = IMDB_GENRE_TAIL.exec(t);
  if (genre?.[1] && IMDB_YEAR_PAREN.test(genre[1])) t = genre[1];

  t = t.replace(IMDB_YEAR_PAREN, "");
  t = t.replace(GOODREADS_SUFFIX, "");
  t = t.replace(GOODREADS_SERIES, "");

  const gh = GITHUB_TITLE.exec(t);
  if (gh?.[1]) t = gh[1];

  t = t.trim();
  return t || original;
}
