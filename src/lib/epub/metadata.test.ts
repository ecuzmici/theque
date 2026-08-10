// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import JSZip from "jszip";

import { EpubFormatError, readEpubMetadata, writeEpubMetadata } from "@/lib/epub/metadata";

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

function opf(metadataInner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">${metadataInner}</metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="nav"/>
    <itemref idref="ch1"/>
  </spine>
</package>`;
}

const PLAIN = `
    <dc:identifier id="bookid">urn:uuid:1234</dc:identifier>
    <dc:title>Old Title</dc:title>
    <dc:creator>Old Author</dc:creator>
    <dc:language>en</dc:language>
    <dc:description>Old blurb.</dc:description>
  `;

const WITH_SERIES = `
    <dc:identifier id="bookid">urn:uuid:1234</dc:identifier>
    <dc:title>Leviathan Wakes</dc:title>
    <dc:creator>James S. A. Corey</dc:creator>
    <dc:language>en</dc:language>
    <meta name="calibre:series" content="Old Series"/>
    <meta name="calibre:series_index" content="7"/>
    <meta name="cover" content="cover-image"/>
  `;

async function buildEpub(metadataInner: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", CONTAINER);
  zip.file("OEBPS/content.opf", opf(metadataInner));
  zip.file("OEBPS/nav.xhtml", "<html><body><nav/></body></html>");
  zip.file("OEBPS/ch1.xhtml", "<html><body><p>Chapter one.</p></body></html>");
  zip.file("OEBPS/cover.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
  return zip.generateAsync({ type: "uint8array" });
}

let plain: Uint8Array;
let withSeries: Uint8Array;

beforeAll(async () => {
  plain = await buildEpub(PLAIN);
  withSeries = await buildEpub(WITH_SERIES);
});

describe("readEpubMetadata", () => {
  it("reads the fields a Kobo displays", async () => {
    expect(await readEpubMetadata(plain)).toEqual({
      title: "Old Title",
      creators: ["Old Author"],
      description: "Old blurb.",
      language: "en",
      series: null,
      seriesIndex: null,
    });
  });

  it("reads an existing calibre series pair", async () => {
    const meta = await readEpubMetadata(withSeries);
    expect(meta.series).toBe("Old Series");
    expect(meta.seriesIndex).toBe(7);
  });

  it("reads multiple creators", async () => {
    const bytes = await buildEpub("<dc:title>T</dc:title><dc:creator>A</dc:creator><dc:creator>B</dc:creator>");
    expect((await readEpubMetadata(bytes)).creators).toEqual(["A", "B"]);
  });

  it("rejects a file that is not a zip", async () => {
    await expect(readEpubMetadata(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(EpubFormatError);
  });

  it("rejects a zip without container.xml", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "hi");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(readEpubMetadata(bytes)).rejects.toThrow("missing_container");
  });

  it("rejects a container that points at a missing OPF", async () => {
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file("META-INF/container.xml", CONTAINER);
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(readEpubMetadata(bytes)).rejects.toThrow("missing_opf");
  });
});

describe("writeEpubMetadata", () => {
  it("round trips a full patch", async () => {
    const out = await writeEpubMetadata(plain, {
      title: "Leviathan Wakes",
      creators: ["James S. A. Corey"],
      description: "A new blurb.",
      series: "The Expanse",
      seriesIndex: 1,
    });

    expect(await readEpubMetadata(out)).toEqual({
      title: "Leviathan Wakes",
      creators: ["James S. A. Corey"],
      description: "A new blurb.",
      language: "en",
      series: "The Expanse",
      seriesIndex: 1,
    });
  });

  it("leaves omitted fields untouched", async () => {
    const out = await writeEpubMetadata(plain, { series: "The Expanse" });
    const meta = await readEpubMetadata(out);

    expect(meta.title).toBe("Old Title");
    expect(meta.description).toBe("Old blurb.");
    expect(meta.series).toBe("The Expanse");
  });

  it("replaces an existing series instead of duplicating it", async () => {
    const out = await writeEpubMetadata(withSeries, { series: "The Expanse", seriesIndex: 1 });
    const xml = await (await JSZip.loadAsync(out)).file("OEBPS/content.opf")!.async("string");

    expect(xml.match(/calibre:series"/g)?.length).toBe(1);
    expect(xml).toContain('content="The Expanse"');
    expect(xml).not.toContain("Old Series");
  });

  it("keeps unrelated meta entries", async () => {
    const out = await writeEpubMetadata(withSeries, { series: "The Expanse" });
    const xml = await (await JSZip.loadAsync(out)).file("OEBPS/content.opf")!.async("string");

    expect(xml).toContain('name="cover"');
  });

  it("clears the series index when the series is removed", async () => {
    const out = await writeEpubMetadata(withSeries, { series: null });
    const meta = await readEpubMetadata(out);

    expect(meta.series).toBeNull();
    expect(meta.seriesIndex).toBeNull();
  });

  it("writes multiple creators", async () => {
    const out = await writeEpubMetadata(plain, { creators: ["Neil Gaiman", "Terry Pratchett"] });
    expect((await readEpubMetadata(out)).creators).toEqual(["Neil Gaiman", "Terry Pratchett"]);
  });

  it("keeps mimetype first and uncompressed", async () => {
    const out = await writeEpubMetadata(plain, { title: "New" });
    const zip = await JSZip.loadAsync(out);

    expect(Object.keys(zip.files)[0]).toBe("mimetype");
    expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");
  });

  it("preserves every other entry byte for byte", async () => {
    const before = await JSZip.loadAsync(plain);
    const after = await JSZip.loadAsync(await writeEpubMetadata(plain, { title: "New" }));

    expect(Object.keys(after.files).sort()).toEqual(Object.keys(before.files).sort());
    expect(await after.file("OEBPS/cover.jpg")!.async("uint8array")).toEqual(
      await before.file("OEBPS/cover.jpg")!.async("uint8array"),
    );
    expect(await after.file("OEBPS/ch1.xhtml")!.async("string")).toBe(
      await before.file("OEBPS/ch1.xhtml")!.async("string"),
    );
  });

  it("keeps the manifest and spine intact", async () => {
    const out = await writeEpubMetadata(plain, { title: "New" });
    const xml = await (await JSZip.loadAsync(out)).file("OEBPS/content.opf")!.async("string");

    expect(xml).toContain('idref="nav"');
    expect(xml).toContain('idref="ch1"');
    expect(xml).toContain('href="ch1.xhtml"');
    expect(xml.startsWith("<?xml")).toBe(true);
  });

  it("does not invent directory entries for nested paths", async () => {
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file("META-INF/container.xml", CONTAINER);
    zip.file("OEBPS/content.opf", opf(PLAIN), { createFolders: false });
    zip.file("OEBPS/images/deep/pic.jpg", new Uint8Array([1, 2, 3]), { createFolders: false });
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const before = Object.keys((await JSZip.loadAsync(bytes)).files).sort();
    const out = await writeEpubMetadata(bytes, { title: "New" });
    const after = Object.keys((await JSZip.loadAsync(out)).files).sort();

    expect(after).toEqual(before);
  });

  it("keeps explicit directory entries the source had", async () => {
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file("META-INF/container.xml", CONTAINER);
    zip.folder("OEBPS");
    zip.file("OEBPS/content.opf", opf(PLAIN));
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const out = await writeEpubMetadata(bytes, { title: "New" });
    const after = await JSZip.loadAsync(out);

    expect(after.files["OEBPS/"]?.dir).toBe(true);
  });
});
