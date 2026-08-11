import "server-only";

import { parse } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";

import { coverImageFix, loadEpubZip, readContentDocumentPaths, rebuildEpub } from "@/lib/epub/metadata";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
type TextNode = DefaultTreeAdapterTypes.TextNode;

/**
 * The stylesheet Kobo itself injects, minus the parts kepubify drops.
 * The device pairs it with the `book-inner` wrapper below.
 */
const KOBO_STYLE =
  '<style type="text/css" class="kobostylehacks">div#book-inner { margin-top: 0; margin-bottom: 0;}</style>';

const KOBO_DIVS_OPEN = '<div id="book-columns"><div id="book-inner">';
const KOBO_DIVS_CLOSE = "</div></div>";

const SPAN_CLASS = "koboSpan";

/** These elements keep their text as it is. A span inside them changes layout. */
const SKIP_TAGS = new Set(["script", "style", "pre", "audio", "video", "svg", "math"]);

/** Each of these starts a new paragraph number, but only if it holds a span. */
const PARAGRAPH_TAGS = new Set(["p", "ol", "ul", "table", "h1", "h2", "h3", "h4", "h5", "h6"]);

/** Thrown when the archive is an EPUB but no document converted. */
export class KepubConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KepubConversionError";
  }
}

type Insertion = { offset: number; order: number; text: string };

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function isText(node: Node): node is TextNode {
  return node.nodeName === "#text";
}

function childrenOf(node: Node): Node[] {
  return "childNodes" in node ? node.childNodes : [];
}

/** Find the first element with this tag name, in document order. */
function findElement(root: Node, tagName: string): Element | null {
  for (const child of childrenOf(root)) {
    if (isElement(child) && child.tagName === tagName) return child;
    const found = findElement(child, tagName);
    if (found) return found;
  }
  return null;
}

/** True when any element below the node carries the class as a whole token. */
function hasClass(root: Node, wanted: string): boolean {
  for (const child of childrenOf(root)) {
    if (isElement(child)) {
      for (const attr of child.attrs) {
        if (attr.name === "class" && attr.value.split(/[\s]+/).includes(wanted)) return true;
      }
    }
    if (hasClass(child, wanted)) return true;
  }
  return false;
}

// The sentence splitter classes each character into one of four inputs. The
// state machine below then cuts after the trailing whitespace of a sentence.
const INPUT_PUNCT = 0;
const INPUT_EXTRA = 1;
const INPUT_SPACE = 2;
const INPUT_ANY = 3;
const INPUT_END = 4;

const STATE_DEFAULT = 0;
const STATE_AFTER_PUNCT = 1;
const STATE_AFTER_PUNCT_EXTRA = 2;
const STATE_AFTER_SPACE = 3;

const PUNCT = new Set([".", "!", "?"]);
const EXTRA = new Set(["'", '"', "”", "’", "“", "…"]);
// Kobo treats only ASCII whitespace as a sentence gap, so U+00A0 is not here.
const SPACE = new Set(["\t", "\n", "\f", "\r", " "]);

function classify(character: string | undefined): number {
  if (character === undefined) return INPUT_END;
  if (PUNCT.has(character)) return INPUT_PUNCT;
  if (EXTRA.has(character)) return INPUT_EXTRA;
  if (SPACE.has(character)) return INPUT_SPACE;
  return INPUT_ANY;
}

/**
 * Split one text run into sentence ranges, as Kobo does.
 * A sentence keeps the punctuation, one optional quote mark and the whitespace
 * that follows, because the reader highlights the whole run.
 *
 * The scan runs over the raw source, which still holds entity references such
 * as `&amp;`. An entity never holds whitespace, so a cut never lands inside
 * one. An entity that stands for a stop, such as `&#46;`, reads as plain
 * characters here and joins the sentence it sits in. That gives one span more
 * text, and it never breaks the markup.
 */
export function splitSentences(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  let index = 0;
  let state: number = STATE_DEFAULT;

  for (;;) {
    const character = text.codePointAt(start + index);
    const rune = character === undefined ? undefined : String.fromCodePoint(character);
    const width = rune === undefined ? 0 : rune.length;
    const input = classify(rune);

    if (input === INPUT_END) {
      // Emit the tail. An empty tail counts only when nothing came before it.
      if (start !== text.length || out.length === 0) out.push([start, text.length]);
      return out;
    }

    let cut = false;
    switch (state) {
      case STATE_AFTER_PUNCT:
        if (input === INPUT_PUNCT) state = STATE_AFTER_PUNCT;
        else if (input === INPUT_EXTRA) state = STATE_AFTER_PUNCT_EXTRA;
        else if (input === INPUT_SPACE) state = STATE_AFTER_SPACE;
        else state = STATE_DEFAULT;
        break;
      case STATE_AFTER_PUNCT_EXTRA:
        if (input === INPUT_PUNCT) state = STATE_AFTER_PUNCT;
        else if (input === INPUT_SPACE) state = STATE_AFTER_SPACE;
        else state = STATE_DEFAULT;
        break;
      case STATE_AFTER_SPACE:
        if (input === INPUT_SPACE) {
          state = STATE_AFTER_SPACE;
        } else {
          cut = true;
          state = input === INPUT_PUNCT ? STATE_AFTER_PUNCT : STATE_DEFAULT;
        }
        break;
      default:
        state = input === INPUT_PUNCT ? STATE_AFTER_PUNCT : STATE_DEFAULT;
        break;
    }

    if (cut) {
      out.push([start, start + index]);
      start += index;
      index = width;
    } else {
      index += width;
    }
  }
}

/**
 * Elements whose content the HTML parser reads as raw text. A start tag for one
 * of these ends only at its own end tag.
 */
const RAW_TEXT_PATTERN =
  /<(script|style|textarea|title|iframe|noscript|noframes|xmp)((?:"[^"]*"|'[^']*'|[^>"'])*?)\/>/gi;

/**
 * Replace every XML self-closing raw-text element with spaces of equal length.
 *
 * XHTML allows `<script src="a.js"/>`. The HTML parser reads that as an open
 * tag, so it takes the rest of the file as script text and finds no body.
 * The replacement keeps the length of the file, so every offset the parser
 * reports still points at the same byte of the original source. The converter
 * adds no span to a script or a style, so nothing is lost.
 */
function blankSelfClosingRawText(source: string): string {
  return source.replace(RAW_TEXT_PATTERN, (match) => " ".repeat(match.length));
}

/** Whitespace-only runs keep their place in the markup and get no span. */
function isSpaceOnly(text: string): boolean {
  return text.trim() === "";
}

function spanOpen(paragraph: number, segment: number): string {
  return `<span class="${SPAN_CLASS}" id="kobo.${paragraph}.${segment}">`;
}

/**
 * Add the Kobo spans, the Kobo stylesheet and the Kobo wrapper divs to one
 * XHTML content document. The function only inserts text. Every other byte of
 * the source survives, so entities, attribute quoting and self-closing tags
 * stay as the publisher wrote them.
 *
 * The function returns the source unchanged when the document already holds
 * Kobo spans. A second pass would nest a span inside a span.
 */
export function transformContentDocument(source: string): string {
  // Parse a scratch copy of the same length, so every offset stays valid.
  const doc = parse(blankSelfClosingRawText(source), { sourceCodeLocationInfo: true });

  const body = findElement(doc, "body");
  if (!body) throw new KepubConversionError("missing_body");
  if (hasClass(body, SPAN_CLASS)) return source;

  const insertions: Insertion[] = [];
  let order = 0;
  const add = (offset: number, text: string): void => {
    insertions.push({ offset, order: order++, text });
  };

  // The style goes last in the head. Skip it when the source has no `</head>`,
  // because parse5 then reports no place to put it.
  const head = findElement(doc, "head");
  const headEnd = head?.sourceCodeLocation?.endTag;
  if (headEnd) add(headEnd.startOffset, KOBO_STYLE);

  // The wrapper divs need both body tags. Skip the pair when either is absent,
  // so the document never gets an unbalanced div.
  const bodyStart = body.sourceCodeLocation?.startTag;
  const bodyEnd = body.sourceCodeLocation?.endTag;
  const wrap = Boolean(bodyStart && bodyEnd);
  if (wrap && bodyStart) add(bodyStart.endOffset, KOBO_DIVS_OPEN);

  let paragraph = 0;
  let segment = 0;
  let nextParagraph = false;

  // Depth-first, document order. The stack takes children in reverse.
  const stack: Node[] = [body];
  while (stack.length > 0) {
    const current = stack.pop() as Node;

    if (isText(current)) {
      const location = current.sourceCodeLocation;
      if (!location) continue;
      const raw = source.slice(location.startOffset, location.endOffset);
      // A text run can never hold `<`. When it does, the parser merged this run
      // across a tag, which happens for text that follows `</body>`. A span
      // there would cross the tag and break the markup, so leave the run alone.
      if (raw.includes("<")) continue;
      const parent = current.parentNode;
      const parentTag = parent && isElement(parent) ? parent.tagName : "";

      for (const [from, to] of splitSentences(raw)) {
        const part = raw.slice(from, to);
        if (part === "") continue;
        // Kobo wraps blank runs only under a `p`, where they carry spacing.
        if (isSpaceOnly(part) && parentTag !== "p") continue;

        if (nextParagraph) {
          paragraph += 1;
          segment = 0;
          nextParagraph = false;
        }
        segment += 1;
        add(location.startOffset + from, spanOpen(paragraph, segment));
        add(location.startOffset + to, "</span>");
      }
      continue;
    }

    if (!isElement(current)) continue;
    const tag = current.tagName;

    if (tag === "img") {
      const location = current.sourceCodeLocation;
      if (location) {
        // An image always opens its own paragraph, because Kobo pages on it.
        paragraph += 1;
        segment = 1;
        nextParagraph = false;
        add(location.startOffset, spanOpen(paragraph, segment));
        add(location.endOffset, "</span>");
      }
      continue;
    }

    if (SKIP_TAGS.has(tag)) continue;
    if (PARAGRAPH_TAGS.has(tag)) nextParagraph = true;

    const children = childrenOf(current);
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }

  if (wrap && bodyEnd) add(bodyEnd.startOffset, KOBO_DIVS_CLOSE);

  if (insertions.length === 0) return source;

  // Sort by position, then by the order the walk found them. Two insertions at
  // one offset then keep the nesting the walk built.
  insertions.sort((a, b) => a.offset - b.offset || a.order - b.order);

  const parts: string[] = [];
  let cursor = 0;
  for (const insertion of insertions) {
    parts.push(source.slice(cursor, insertion.offset), insertion.text);
    cursor = insertion.offset;
  }
  parts.push(source.slice(cursor));
  return parts.join("");
}

/** Decode as UTF-8 and reject anything else. EPUB 3 content is UTF-8. */
function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export type KepubConversionResult = {
  bytes: Uint8Array;
  /** Documents this run rewrote. */
  converted: number;
  /** Documents this run left as they are, because they already held spans. */
  unchanged: number;
  /** Paths this run left as they are, with the reason. */
  skipped: Array<{ path: string; reason: string }>;
  /** True when this run marked the cover image for the device. */
  coverMarked: boolean;
};

/**
 * Convert an EPUB into a KEPUB and return the new bytes.
 *
 * A Kobo shows a placeholder tile instead of the cover for a plain EPUB, even
 * when the OPF declares the cover. The KEPUB format is what makes the device
 * read the cover, so every book takes this step before it reaches Drive.
 *
 * One document that fails to convert does not fail the book. The reader still
 * opens that chapter, and it only loses the per-sentence positions. A run that
 * converts no document at all does throw, because a file named `.kepub.epub`
 * with no Kobo spans lies about what it holds.
 */
export async function convertEpubToKepub(bytes: Uint8Array): Promise<KepubConversionResult> {
  const zip = await loadEpubZip(bytes);
  const paths = await readContentDocumentPaths(zip);
  if (paths.length === 0) throw new KepubConversionError("no_content_documents");

  const replacements = new Map<string, string>();
  const skipped: Array<{ path: string; reason: string }> = [];
  let converted = 0;
  let unchanged = 0;

  for (const path of paths) {
    const entry = zip.file(path);
    if (!entry) continue;

    const source = decodeUtf8(await entry.async("uint8array"));
    if (source === null) {
      skipped.push({ path, reason: "not_utf8" });
      continue;
    }

    let output: string;
    try {
      output = transformContentDocument(source);
    } catch {
      skipped.push({ path, reason: "parse_failed" });
      continue;
    }

    if (output === source) {
      // The document already held Kobo spans, or it held nothing to wrap.
      unchanged += 1;
      continue;
    }
    replacements.set(path, output);
    converted += 1;
  }

  if (converted === 0 && unchanged === 0) {
    throw new KepubConversionError("no_document_converted");
  }

  // A Kobo reads the cover from the manifest property, not from the older
  // `<meta name="cover">`. Add the property before the archive is rebuilt, so
  // the cover fix costs no second pass over the entries.
  const cover = await coverImageFix(zip);
  if (cover) replacements.set(cover.path, cover.xml);

  return {
    bytes: await rebuildEpub(zip, replacements),
    converted,
    unchanged,
    skipped,
    coverMarked: cover !== null,
  };
}
