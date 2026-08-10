import "server-only";

import { XMLBuilder, XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

const CONTAINER_PATH = "META-INF/container.xml";
const MIMETYPE_PATH = "mimetype";
const EPUB_MIMETYPE = "application/epub+zip";
const SERIES_KEY = "calibre:series";
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

/** fast-xml-parser gives a string for text-only nodes and an object otherwise. */
function textOf(node: unknown): string | null {
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

async function loadZip(bytes: Uint8Array): Promise<JSZip> {
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
  const zip = await loadZip(bytes);
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
 */
async function rebuild(zip: JSZip, opfPath: string, opfXml: string): Promise<Uint8Array> {
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
    const content = path === opfPath ? opfXml : await entry.async("uint8array");
    out.file(path, content, { compression: "DEFLATE", createFolders: false, date: entry.date });
  }

  return out.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/**
 * Write metadata into a copy of the EPUB and return the new bytes.
 * An omitted field stays untouched; an explicit null removes it.
 */
export async function writeEpubMetadata(
  bytes: Uint8Array,
  patch: EpubMetadataPatch,
): Promise<Uint8Array> {
  const zip = await loadZip(bytes);
  const { path, doc, metadata } = await readOpf(zip);

  applyPatch(metadata, patch);

  const builder = new XMLBuilder({ ...XML_OPTIONS, format: false, suppressEmptyNode: true });
  const xml = builder.build(doc) as string;
  const declared = xml.startsWith("<?xml") ? xml : `<?xml version="1.0" encoding="utf-8"?>${xml}`;

  return rebuild(zip, path, declared);
}
