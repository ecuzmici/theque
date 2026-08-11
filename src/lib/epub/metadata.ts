import "server-only";

import { XMLBuilder, XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

const CONTAINER_PATH = "META-INF/container.xml";
const MIMETYPE_PATH = "mimetype";
const EPUB_MIMETYPE = "application/epub+zip";
const XHTML_MEDIA_TYPE = "application/xhtml+xml";
const SERIES_KEY = "calibre:series";
/** The manifest property a Kobo reads to find the cover of a KEPUB. */
const COVER_IMAGE_PROPERTY = "cover-image";
const SERIES_INDEX_KEY = "calibre:series_index";

/** Shared options so a parse/build round trip keeps attributes and prefixes. */
const XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
} as const;

export type EpubMetadata = {
  title: string | null;
  creators: string[];
  description: string | null;
  language: string | null;
  series: string | null;
  seriesIndex: number | null;
};

export type EpubMetadataPatch = {
  title?: string | null;
  creators?: string[] | null;
  description?: string | null;
  series?: string | null;
  seriesIndex?: number | null;
};

/** Thrown when the archive is not a readable EPUB. Callers reject the upload. */
export class EpubFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EpubFormatError";
  }
}

type XmlNode = Record<string, unknown>;

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * fast-xml-parser gives a string for text-only nodes and an object otherwise.
 * A repeated element becomes an array. EPUB 3 allows more than one `dc:title`,
 * and a publisher writes the subtitle as a second one. The first entry is the
 * main title, so read the first entry that holds text.
 */
function textOf(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const entry of node) {
      const text = textOf(entry);
      if (text) return text;
    }
    return null;
  }
  if (typeof node === "string") return node.trim() || null;
  if (node && typeof node === "object") {
    const text = (node as XmlNode)["#text"];
    if (typeof text === "string") return text.trim() || null;
  }
  return null;
}

function attrOf(node: unknown, name: string): string | null {
  if (!node || typeof node !== "object") return null;
  const value = (node as XmlNode)[`@_${name}`];
  return typeof value === "string" ? value : null;
}

function firstKey(node: XmlNode, candidates: string[]): string | null {
  for (const key of candidates) {
    if (key in node) return key;
  }
  return null;
}

/** OPF documents in the wild use `dc:` or a default-namespaced bare name. */
function dcKey(metadata: XmlNode, local: string): string {
  return firstKey(metadata, [`dc:${local}`, local]) ?? `dc:${local}`;
}

function parseIndex(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Open the archive. The KEPUB converter opens the same way. */
export async function loadEpubZip(bytes: Uint8Array): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(bytes);
  } catch {
    throw new EpubFormatError("not_a_zip");
  }
}

async function readOpfPath(zip: JSZip): Promise<string> {
  const container = zip.file(CONTAINER_PATH);
  if (!container) throw new EpubFormatError("missing_container");

  const parser = new XMLParser(XML_OPTIONS);
  const doc = parser.parse(await container.async("string")) as XmlNode;
  const rootfiles = (doc.container as XmlNode | undefined)?.rootfiles as XmlNode | undefined;
  const entries = asArray(rootfiles?.rootfile);

  for (const entry of entries) {
    const path = attrOf(entry, "full-path");
    if (path) return path.replace(/^\/+/, "");
  }
  throw new EpubFormatError("missing_rootfile");
}

async function readOpf(zip: JSZip): Promise<{ path: string; doc: XmlNode; metadata: XmlNode }> {
  const path = await readOpfPath(zip);
  const file = zip.file(path);
  if (!file) throw new EpubFormatError("missing_opf");

  const parser = new XMLParser(XML_OPTIONS);
  const doc = parser.parse(await file.async("string")) as XmlNode;

  const packageKey = firstKey(doc, ["package", "opf:package"]);
  if (!packageKey) throw new EpubFormatError("missing_package");
  const pkg = doc[packageKey] as XmlNode;

  const metadataKey = firstKey(pkg, ["metadata", "opf:metadata"]);
  if (!metadataKey) throw new EpubFormatError("missing_metadata");

  return { path, doc, metadata: pkg[metadataKey] as XmlNode };
}

/**
 * Join an OPF-relative href onto the OPF directory. An href is URI encoded and
 * can carry a fragment, so decode it and drop the fragment first.
 */
function resolveHref(opfPath: string, href: string): string | null {
  const bare = href.split("#")[0].split("?")[0];
  if (!bare) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    // A malformed escape means the href does not name an entry we can find.
    decoded = bare;
  }

  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")).split("/") : [];
  const parts = decoded.startsWith("/") ? [] : base;
  const out = [...parts];

  for (const segment of decoded.replace(/^\/+/, "").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return out.join("/") || null;
}

/**
 * List the XHTML content documents in spine and manifest order.
 * The KEPUB converter rewrites these entries and nothing else, so the OPF, the
 * NCX, the images and the fonts stay untouched.
 */
export async function readContentDocumentPaths(zip: JSZip): Promise<string[]> {
  const { path, doc } = await readOpf(zip);

  const packageKey = firstKey(doc, ["package", "opf:package"]);
  if (!packageKey) throw new EpubFormatError("missing_package");
  const pkg = doc[packageKey] as XmlNode;

  const manifestKey = firstKey(pkg, ["manifest", "opf:manifest"]);
  if (!manifestKey) return [];
  const manifest = pkg[manifestKey] as XmlNode;

  const out: string[] = [];
  for (const entry of asArray(manifest.item)) {
    if (attrOf(entry, "media-type") !== XHTML_MEDIA_TYPE) continue;
    const href = attrOf(entry, "href");
    if (!href) continue;
    const resolved = resolveHref(path, href);
    // Skip an href that no entry answers. A stale manifest must not stop the
    // conversion of the documents that do exist.
    if (resolved && zip.file(resolved) && !out.includes(resolved)) out.push(resolved);
  }
  return out;
}

/** Read the `<meta name="calibre:*">` pair calibre and Kobo both understand. */
function readSeries(metadata: XmlNode): { series: string | null; seriesIndex: number | null } {
  let series: string | null = null;
  let seriesIndex: number | null = null;

  for (const entry of asArray(metadata.meta)) {
    const name = attrOf(entry, "name");
    if (name === SERIES_KEY) series = attrOf(entry, "content");
    if (name === SERIES_INDEX_KEY) seriesIndex = parseIndex(attrOf(entry, "content"));
  }
  return { series, seriesIndex };
}

/** Read the metadata a Kobo displays. Throws EpubFormatError on a broken file. */
export async function readEpubMetadata(bytes: Uint8Array): Promise<EpubMetadata> {
  const zip = await loadEpubZip(bytes);
  const { metadata } = await readOpf(zip);
  const { series, seriesIndex } = readSeries(metadata);

  return {
    title: textOf(metadata[dcKey(metadata, "title")]),
    creators: asArray(metadata[dcKey(metadata, "creator")])
      .map(textOf)
      .filter((value): value is string => Boolean(value)),
    description: textOf(metadata[dcKey(metadata, "description")]),
    language: textOf(metadata[dcKey(metadata, "language")]),
    series,
    seriesIndex,
  };
}

/** Replace every `<meta name="X">` with a single entry, or drop them all. */
function setNamedMeta(metadata: XmlNode, name: string, content: string | null): void {
  const kept = asArray(metadata.meta).filter((entry) => attrOf(entry, "name") !== name);
  if (content !== null) kept.push({ "@_name": name, "@_content": content });
  if (kept.length === 0) delete metadata.meta;
  else metadata.meta = kept;
}

function applyPatch(metadata: XmlNode, patch: EpubMetadataPatch): void {
  if (patch.title !== undefined) {
    const key = dcKey(metadata, "title");
    if (patch.title === null) delete metadata[key];
    else metadata[key] = patch.title;
  }

  if (patch.creators !== undefined) {
    const key = dcKey(metadata, "creator");
    if (patch.creators === null || patch.creators.length === 0) delete metadata[key];
    else metadata[key] = patch.creators.length === 1 ? patch.creators[0] : [...patch.creators];
  }

  if (patch.description !== undefined) {
    const key = dcKey(metadata, "description");
    if (patch.description === null) delete metadata[key];
    else metadata[key] = patch.description;
  }

  if (patch.series !== undefined) {
    setNamedMeta(metadata, SERIES_KEY, patch.series);
    // An index without a series name is meaningless, so clear it together.
    if (patch.series === null) setNamedMeta(metadata, SERIES_INDEX_KEY, null);
  }

  if (patch.seriesIndex !== undefined) {
    const index = patch.seriesIndex;
    setNamedMeta(metadata, SERIES_INDEX_KEY, index === null ? null : String(index));
  }
}

/**
 * Rebuild the archive with `mimetype` first and uncompressed. The EPUB spec
 * requires that entry order, and Kobo rejects files that break it.
 *
 * `replacements` maps an entry path to its new text. Every other entry keeps
 * its bytes. This is the only archive writer. A second writer would lose the
 * entry-order fix and the createFolders fix below.
 */
export async function rebuildEpub(zip: JSZip, replacements: Map<string, string>): Promise<Uint8Array> {
  const out = new JSZip();
  // createFolders:false everywhere. JSZip otherwise invents parent directory
  // entries the source archive never had, which changes the entry list.
  out.file(MIMETYPE_PATH, EPUB_MIMETYPE, { compression: "STORE", createFolders: false });

  const paths = Object.keys(zip.files).filter((path) => path !== MIMETYPE_PATH);
  for (const path of paths) {
    const entry = zip.files[path];
    if (entry.dir) {
      out.file(path, "", { dir: true, createFolders: false, date: entry.date });
      continue;
    }
    const replacement = replacements.get(path);
    const content = replacement === undefined ? await entry.async("uint8array") : replacement;
    out.file(path, content, { compression: "DEFLATE", createFolders: false, date: entry.date });
  }

  return out.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function hasCoverImageProperty(item: unknown): boolean {
  const properties = attrOf(item, "properties");
  return properties !== null && properties.split(/\s+/).includes(COVER_IMAGE_PROPERTY);
}

function isImageItem(item: unknown): boolean {
  return (attrOf(item, "media-type") ?? "").startsWith("image/");
}

/** The value of `<meta name="cover">`, which holds the id of the cover item. */
function namedCoverValue(metadata: XmlNode): string | null {
  for (const entry of asArray(metadata.meta)) {
    if (attrOf(entry, "name") !== "cover") continue;
    const content = attrOf(entry, "content");
    if (content) return content;
  }
  return null;
}

/**
 * Find the manifest item that holds the cover image.
 *
 * The steps run in the order a reader would try them:
 * 1. the id that `<meta name="cover">` names;
 * 2. an href equal to that value, because a malformed OPF puts the file name
 *    where the id belongs;
 * 3. an image the manifest itself calls a cover, for a file with no usable
 *    `<meta name="cover">` at all.
 *
 * Each step also tests that the archive holds the file. A property that points
 * at a missing file gives the device a broken cover instead of a placeholder.
 */
function findCoverItem(
  items: unknown[],
  metadata: XmlNode,
  opfPath: string,
  hasEntry: (path: string) => boolean,
): XmlNode | null {
  const images = items.filter(isImageItem);

  const usable = (item: unknown): boolean => {
    const href = attrOf(item, "href");
    if (!href) return false;
    const resolved = resolveHref(opfPath, href);
    return resolved !== null && hasEntry(resolved);
  };

  const named = namedCoverValue(metadata);
  if (named) {
    const byId = images.find((item) => attrOf(item, "id") === named);
    if (byId && usable(byId)) return byId as XmlNode;

    const target = resolveHref(opfPath, named);
    const byHref = images.find((item) => {
      const href = attrOf(item, "href");
      return href !== null && target !== null && resolveHref(opfPath, href) === target;
    });
    if (byHref && usable(byHref)) return byHref as XmlNode;
  }

  const byName = images.find((item) =>
    /cover/i.test(`${attrOf(item, "id") ?? ""} ${attrOf(item, "href") ?? ""}`),
  );
  return byName && usable(byName) ? (byName as XmlNode) : null;
}

/**
 * Mark the cover image in the OPF manifest with `properties="cover-image"`.
 *
 * A Kobo reads that property and ignores the older `<meta name="cover">`, so a
 * book that declares its cover the EPUB 2 way shows a placeholder tile even as
 * a KEPUB. This function adds the property the device looks for.
 *
 * It returns the OPF path and the new XML, so the caller writes one archive.
 * It returns null when the file already holds the property, and when no
 * manifest item answers as the cover.
 */
export async function coverImageFix(zip: JSZip): Promise<{ path: string; xml: string } | null> {
  const { path, doc, metadata } = await readOpf(zip);

  const packageKey = firstKey(doc, ["package", "opf:package"]);
  if (!packageKey) return null;
  const pkg = doc[packageKey] as XmlNode;

  const manifestKey = firstKey(pkg, ["manifest", "opf:manifest"]);
  if (!manifestKey) return null;
  const items = asArray((pkg[manifestKey] as XmlNode).item);

  // A second property would leave the device two covers to choose from.
  if (items.some(hasCoverImageProperty)) return null;

  const target = findCoverItem(items, metadata, path, (entry) => zip.file(entry) !== null);
  if (!target) return null;

  const properties = attrOf(target, "properties");
  target["@_properties"] = properties ? `${properties} ${COVER_IMAGE_PROPERTY}` : COVER_IMAGE_PROPERTY;

  const builder = new XMLBuilder({ ...XML_OPTIONS, format: false, suppressEmptyNode: true });
  const xml = builder.build(doc) as string;
  return { path, xml: xml.startsWith("<?xml") ? xml : `<?xml version="1.0" encoding="utf-8"?>${xml}` };
}

/**
 * Write metadata into a copy of the EPUB and return the new bytes.
 * An omitted field stays untouched; an explicit null removes it.
 */
export async function writeEpubMetadata(
  bytes: Uint8Array,
  patch: EpubMetadataPatch,
): Promise<Uint8Array> {
  const zip = await loadEpubZip(bytes);
  const { path, doc, metadata } = await readOpf(zip);

  applyPatch(metadata, patch);

  const builder = new XMLBuilder({ ...XML_OPTIONS, format: false, suppressEmptyNode: true });
  const xml = builder.build(doc) as string;
  const declared = xml.startsWith("<?xml") ? xml : `<?xml version="1.0" encoding="utf-8"?>${xml}`;

  return rebuildEpub(zip, new Map([[path, declared]]));
}
