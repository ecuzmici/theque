// @vitest-environment node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import JSZip from "jszip";

import { convertEpubToKepub, KepubConversionError, splitSentences, transformContentDocument } from "@/lib/epub/kepub";

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:1234</dc:identifier>
    <dc:title>Test Book</dc:title>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="cover" href="images/cover.jpg" media-type="image/jpeg"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
  </spine>
</package>`;

const CHAPTER = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
\t<head>
\t\t<title>Chapter</title>
\t</head>
\t<body>
\t\t<h2>Chapter One</h2>
\t\t<p>First line. Second line! <i>Third</i> tail &amp; more.</p>
\t</body>
</html>`;

const COVER_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

async function buildEpub(chapter = CHAPTER): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", CONTAINER, { createFolders: false });
  zip.file("OEBPS/content.opf", OPF, { createFolders: false });
  zip.file("OEBPS/ch1.xhtml", chapter, { createFolders: false });
  zip.file("OEBPS/style.css", "p { margin: 0; }", { createFolders: false });
  zip.file("OEBPS/toc.ncx", "<ncx><head/></ncx>", { createFolders: false });
  zip.file("OEBPS/images/cover.jpg", COVER_BYTES, { createFolders: false });
  return zip.generateAsync({ type: "uint8array" });
}

/** Read the text of each range the splitter reports. */
function sentences(text: string): string[] {
  return splitSentences(text).map(([from, to]) => text.slice(from, to));
}

function spanIds(html: string): string[] {
  return [...html.matchAll(/<span class="koboSpan" id="(kobo\.\d+\.\d+)">/g)].map((match) => match[1]);
}

const STYLE_MARKUP =
  '<style type="text/css" class="kobostylehacks">div#book-inner { margin-top: 0; margin-bottom: 0;}</style>';
const DIVS_OPEN = '<div id="book-columns"><div id="book-inner">';
const DIVS_CLOSE = "</div></div>";
const SPAN_CLOSE = "</span>";

/** True when every character of `part` appears in `whole`, in the same order. */
function isSubsequence(part: string, whole: string): boolean {
  let index = 0;
  for (const character of whole) {
    if (character === part[index]) index += 1;
    if (index === part.length) return true;
  }
  return index === part.length;
}

/** Total length of the markup the converter inserts into one document. */
function insertedLength(html: string): number {
  const opens = [...html.matchAll(/<span class="koboSpan" id="kobo\.\d+\.\d+">/g)];
  const spans = opens.reduce((sum, match) => sum + match[0].length + SPAN_CLOSE.length, 0);
  const style = html.includes(STYLE_MARKUP) ? STYLE_MARKUP.length : 0;
  const divs = html.includes(DIVS_OPEN) ? DIVS_OPEN.length + DIVS_CLOSE.length : 0;
  return spans + style + divs;
}

describe("splitSentences", () => {
  it("cuts after the whitespace that follows a full stop", () => {
    expect(sentences("First line. Second line.")).toEqual(["First line. ", "Second line."]);
  });

  it("cuts on an exclamation mark and a question mark", () => {
    expect(sentences("Yes! No? Maybe.")).toEqual(["Yes! ", "No? ", "Maybe."]);
  });

  it("keeps one closing quote with the sentence it ends", () => {
    expect(sentences('"Is that so?" I said.')).toEqual(['"Is that so?" ', "I said."]);
  });

  it("does not cut on a colon", () => {
    expect(sentences("She continued: yes.")).toEqual(["She continued: yes."]);
  });

  it("does not cut a stop that no space follows", () => {
    expect(sentences("theque.app is a site.")).toEqual(["theque.app is a site."]);
  });

  it("keeps every space of a wide gap with the sentence before it", () => {
    expect(sentences("One.   Two.")).toEqual(["One.   ", "Two."]);
  });

  it("returns one empty range for an empty string", () => {
    expect(splitSentences("")).toEqual([[0, 0]]);
  });

  it("returns ranges that rebuild the input exactly", () => {
    const text = "A. B! C? “D.” E";
    expect(sentences(text).join("")).toBe(text);
  });
});

describe("transformContentDocument", () => {
  it("numbers paragraphs per block and segments per run", () => {
    const out = transformContentDocument(CHAPTER);
    expect(spanIds(out)).toEqual(["kobo.1.1", "kobo.2.1", "kobo.2.2", "kobo.2.3", "kobo.2.4"]);
  });

  it("keeps entity references exactly as the publisher wrote them", () => {
    const out = transformContentDocument(CHAPTER);
    expect(out).toContain("&amp;");
    expect(out).not.toContain(" & more");
  });

  it("adds the Kobo stylesheet at the end of the head", () => {
    const out = transformContentDocument(CHAPTER);
    expect(out).toContain('<style type="text/css" class="kobostylehacks">div#book-inner');
    expect(out.indexOf("kobostylehacks")).toBeLessThan(out.indexOf("</head>"));
  });

  it("wraps the body contents in the Kobo divs", () => {
    const out = transformContentDocument(CHAPTER);
    expect(out).toContain('<body><div id="book-columns"><div id="book-inner">');
    expect(out).toContain("</div></div></body>");
  });

  it("gives each image its own paragraph", () => {
    const source = '<html><head></head><body><div><img src="a.jpg"/></div><p>Text.</p></body></html>';
    expect(spanIds(transformContentDocument(source))).toEqual(["kobo.1.1", "kobo.2.1"]);
  });

  it("adds no span inside script, style or pre", () => {
    const source =
      "<html><head></head><body><script>var a = 1;</script><style>p { color: red; }</style>" +
      "<pre>kept as is.</pre><p>Wrapped.</p></body></html>";
    const out = transformContentDocument(source);

    expect(spanIds(out)).toEqual(["kobo.1.1"]);
    expect(out).toContain("<pre>kept as is.</pre>");
    expect(out).toContain("<script>var a = 1;</script>");
  });

  it("survives an XML self-closing script tag", () => {
    const source =
      '<html><head><script src="kobo.js"/></head><body><p>Still wrapped.</p></body></html>';
    const out = transformContentDocument(source);

    expect(spanIds(out)).toEqual(["kobo.1.1"]);
    // The tag itself keeps its original spelling.
    expect(out).toContain('<script src="kobo.js"/>');
  });

  it("keeps an XML self-closing element inside the body", () => {
    const source = '<html><head></head><body><h2><span id="page_7"/>Chapter 1</h2></body></html>';
    const out = transformContentDocument(source);

    expect(out).toContain('<span id="page_7"/>');
    expect(out).toContain('<span class="koboSpan" id="kobo.1.1">Chapter 1</span>');
  });

  it("leaves a run that follows the body end tag alone", () => {
    const source = "<html><head></head><body><p>Inside.</p>\n</body>\n</html>";
    const out = transformContentDocument(source);

    expect(out).toContain("</div></div></body>\n</html>");
    expect(spanIds(out)).toEqual(["kobo.1.1"]);
  });

  it("returns the source unchanged when the document already holds Kobo spans", () => {
    const once = transformContentDocument(CHAPTER);
    expect(transformContentDocument(once)).toBe(once);
  });

  it("adds no span to whitespace between blocks", () => {
    const out = transformContentDocument(CHAPTER);
    expect(out).not.toContain('id="kobo.1.1">\n');
  });
});

describe("convertEpubToKepub", () => {
  let plain: Uint8Array;

  beforeAll(async () => {
    plain = await buildEpub();
  });

  it("writes Kobo spans into the content document", async () => {
    const result = await convertEpubToKepub(plain);
    const zip = await JSZip.loadAsync(result.bytes);
    const chapter = await zip.file("OEBPS/ch1.xhtml")!.async("string");

    expect(result.converted).toBe(1);
    expect(spanIds(chapter).length).toBe(5);
  });

  it("keeps mimetype first and uncompressed", async () => {
    const zip = await JSZip.loadAsync((await convertEpubToKepub(plain)).bytes);

    expect(Object.keys(zip.files)[0]).toBe("mimetype");
    expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");
  });

  it("keeps the entry list unchanged", async () => {
    const before = Object.keys((await JSZip.loadAsync(plain)).files);
    const after = Object.keys((await JSZip.loadAsync((await convertEpubToKepub(plain)).bytes)).files);

    expect(after).toEqual(before);
  });

  it("keeps every entry that is not an XHTML document byte for byte", async () => {
    const before = await JSZip.loadAsync(plain);
    const after = await JSZip.loadAsync((await convertEpubToKepub(plain)).bytes);

    for (const path of Object.keys(before.files)) {
      // The converter rewrites the XHTML documents, and it marks the cover
      // image in the OPF. Every other entry keeps its bytes.
      if (path.endsWith(".xhtml") || path.endsWith(".opf")) continue;
      expect(await after.file(path)!.async("uint8array"), path).toEqual(await before.file(path)!.async("uint8array"));
    }
  });

  it("leaves the NCX untouched", async () => {
    const before = await JSZip.loadAsync(plain);
    const after = await JSZip.loadAsync((await convertEpubToKepub(plain)).bytes);

    expect(await after.file("OEBPS/toc.ncx")!.async("string")).toBe(await before.file("OEBPS/toc.ncx")!.async("string"));
  });

  it("marks the cover image so the device draws it", async () => {
    // A Kobo reads `properties="cover-image"` and ignores `<meta name="cover">`,
    // so a book without the property shows a placeholder tile.
    const result = await convertEpubToKepub(plain);
    const opf = await (await JSZip.loadAsync(result.bytes)).file("OEBPS/content.opf")!.async("string");

    expect(result.coverMarked).toBe(true);
    expect(opf).toContain('href="images/cover.jpg"');
    expect(opf).toMatch(/<item[^>]*id="cover"[^>]*properties="cover-image"|<item[^>]*properties="cover-image"[^>]*id="cover"/);
    // The property lands on the cover, and on nothing else.
    expect(opf.match(/cover-image/g)).toHaveLength(1);
  });

  it("changes the OPF only by adding the property", async () => {
    const before = await (await JSZip.loadAsync(plain)).file("OEBPS/content.opf")!.async("string");
    const after = await (await JSZip.loadAsync((await convertEpubToKepub(plain)).bytes))
      .file("OEBPS/content.opf")!
      .async("string");

    // The parse and build round trip drops the indentation between elements, so
    // compare without it. Remove the added attribute and the rest is identical.
    const flatten = (xml: string) => xml.replace(/>\s+</g, "><").trim();
    expect(flatten(after.replace(' properties="cover-image"', ""))).toBe(flatten(before));
  });

  it("adds no second property to a book that already carries one", async () => {
    const once = await convertEpubToKepub(plain);
    const twice = await convertEpubToKepub(once.bytes);
    const opf = await (await JSZip.loadAsync(twice.bytes)).file("OEBPS/content.opf")!.async("string");

    expect(twice.coverMarked).toBe(false);
    expect(opf.match(/cover-image/g)).toHaveLength(1);
  });

  it("converts a book only once", async () => {
    const once = await convertEpubToKepub(plain);
    const twice = await convertEpubToKepub(once.bytes);

    const first = await (await JSZip.loadAsync(once.bytes)).file("OEBPS/ch1.xhtml")!.async("string");
    const second = await (await JSZip.loadAsync(twice.bytes)).file("OEBPS/ch1.xhtml")!.async("string");

    expect(twice.converted).toBe(0);
    expect(second).toBe(first);
  });

  it("rejects an archive that is not a zip", async () => {
    await expect(convertEpubToKepub(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow("not_a_zip");
  });

  it("rejects a book whose manifest lists no XHTML document", async () => {
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file("META-INF/container.xml", CONTAINER);
    zip.file("OEBPS/content.opf", OPF.replace('media-type="application/xhtml+xml"', 'media-type="text/plain"'));
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(convertEpubToKepub(bytes)).rejects.toBeInstanceOf(KepubConversionError);
  });

  it("skips a content document that is not UTF-8 and keeps its bytes", async () => {
    const broken = new Uint8Array([0xff, 0xfe, 0x3c, 0x00]);
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file("META-INF/container.xml", CONTAINER, { createFolders: false });
    zip.file("OEBPS/content.opf", OPF, { createFolders: false });
    zip.file("OEBPS/ch1.xhtml", CHAPTER, { createFolders: false });
    zip.file("OEBPS/broken.xhtml", broken, { createFolders: false });
    zip.file(
      "OEBPS/content.opf",
      OPF.replace(
        '<item id="css"',
        '<item id="broken" href="broken.xhtml" media-type="application/xhtml+xml"/>\n    <item id="css"',
      ),
      { createFolders: false },
    );
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const result = await convertEpubToKepub(bytes);
    const after = await JSZip.loadAsync(result.bytes);

    expect(result.converted).toBe(1);
    expect(result.skipped).toEqual([{ path: "OEBPS/broken.xhtml", reason: "not_utf8" }]);
    expect(await after.file("OEBPS/broken.xhtml")!.async("uint8array")).toEqual(broken);
  });
});

// A real book from Project Gutenberg. A synthetic archive passed while this file
// exposed a bug in the archive writer, so the round trip runs on both.
describe("convertEpubToKepub with a real EPUB", () => {
  let source: Uint8Array;
  let output: Uint8Array;

  beforeAll(async () => {
    const path = fileURLToPath(new URL("./fixtures/frankenstein.epub", import.meta.url));
    source = new Uint8Array(await readFile(path));
    output = (await convertEpubToKepub(source)).bytes;
  });

  it("keeps the entry list and the entry order", async () => {
    const before = Object.keys((await JSZip.loadAsync(source)).files);
    const after = Object.keys((await JSZip.loadAsync(output)).files);

    expect(before.length).toBe(41);
    expect(after).toEqual(before);
  });

  it("keeps mimetype first and uncompressed", async () => {
    const zip = await JSZip.loadAsync(output);

    expect(Object.keys(zip.files)[0]).toBe("mimetype");
    expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");
  });

  it("keeps every entry that is not an XHTML document byte for byte", async () => {
    const before = await JSZip.loadAsync(source);
    const after = await JSZip.loadAsync(output);

    for (const path of Object.keys(before.files)) {
      if (before.files[path].dir || path.endsWith(".xhtml")) continue;
      expect(await after.file(path)!.async("uint8array"), path).toEqual(await before.file(path)!.async("uint8array"));
    }
  });

  it("writes Kobo spans into every content document", async () => {
    const zip = await JSZip.loadAsync(output);
    const paths = Object.keys(zip.files).filter((path) => path.endsWith(".xhtml"));
    let total = 0;

    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const html = await zip.file(path)!.async("string");
      total += spanIds(html).length;
      // Every document gets the Kobo stylesheet and the Kobo wrapper divs.
      expect(html, path).toContain("kobostylehacks");
      expect(html, path).toContain('<div id="book-columns"><div id="book-inner">');
      // The cover page holds one SVG image and no text, and Kobo adds no span
      // inside an SVG. Every other document holds text.
      if (path !== "OEBPS/wrap0000.xhtml") expect(spanIds(html).length, path).toBeGreaterThan(0);
    }
    expect(total).toBeGreaterThan(1000);
  });

  it("adds text and removes none", async () => {
    const before = await JSZip.loadAsync(source);
    const after = await JSZip.loadAsync(output);
    const paths = Object.keys(before.files).filter((path) => path.endsWith(".xhtml"));

    for (const path of paths) {
      const original = await before.file(path)!.async("string");
      const converted = await after.file(path)!.async("string");

      // Every character of the source still appears, in the same order.
      expect(isSubsequence(original, converted), path).toBe(true);
      // The converted file grew by exactly the inserted markup and no more.
      expect(converted.length - original.length, path).toBe(insertedLength(converted));
    }
  });
});
