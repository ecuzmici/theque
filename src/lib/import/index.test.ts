import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { IMPORTERS, detectImporter, getImporter } from "@/lib/import";
import type { ImportInput } from "@/lib/import/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

function input(text: string, filename?: string): ImportInput {
  return { text, filename: filename ?? null };
}

describe("detectImporter", () => {
  it("routes each fixture to the right importer", () => {
    expect(detectImporter(input(loadFixture("chrome-bookmarks.html"), "bookmarks.html"))?.id).toBe(
      "netscape-bookmarks",
    );
    expect(detectImporter(input(loadFixture("safari-bookmarks.html"), "Safari Bookmarks.html"))?.id).toBe(
      "netscape-bookmarks",
    );
    expect(detectImporter(input(loadFixture("pocket-part.csv"), "part_000000.csv"))?.id).toBe(
      "pocket-csv",
    );
    expect(detectImporter(input("url\nhttps://example.com/a", "links.csv"))?.id).toBe("url-list");
  });

  it("prefers Pocket's HTML export over the broader bookmark parser", () => {
    // Pocket's file is bookmark-shaped but flat; letting the Netscape detector
    // claim it would lose the Unread/Archive status split.
    const pocket = input(loadFixture("pocket-export.html"), "ril_export.html");
    expect(detectImporter(pocket)?.id).toBe("pocket-html");
    expect(IMPORTERS[0].id).toBe("pocket-html");
  });

  it("falls back to content sniffing when the extension misleads", () => {
    expect(detectImporter(input(loadFixture("chrome-bookmarks.html"), "bookmarks.txt"))?.id).toBe(
      "netscape-bookmarks",
    );
  });

  it("returns null when nothing recognises the file", () => {
    expect(detectImporter(input("alpha\tbeta\n1\t2", "mystery.dat"))).toBeNull();
  });

  it("survives an importer whose detector throws", () => {
    const exploding = {
      id: "boom",
      label: "Boom",
      accepts: [".csv"],
      detect: () => {
        throw new Error("nope");
      },
      parse: async () => ({ rows: [], skipped: [], warnings: [] }),
    };
    expect(() => detectImporter(input("url\nhttps://example.com/a"), [exploding])).not.toThrow();
    expect(detectImporter(input("url\nhttps://example.com/a"), [exploding])).toBeNull();
  });
});

describe("registry", () => {
  it("exposes importers by id with unique ids", () => {
    expect(getImporter("netscape-bookmarks")?.label).toContain("bookmarks");
    expect(getImporter("nope")).toBeNull();
    expect(new Set(IMPORTERS.map((i) => i.id)).size).toBe(IMPORTERS.length);
  });

  it("gives every importer at least one accepted extension", () => {
    for (const importer of IMPORTERS) {
      expect(importer.accepts.length).toBeGreaterThan(0);
      for (const extension of importer.accepts) {
        expect(extension.startsWith(".")).toBe(true);
        expect(extension).toBe(extension.toLowerCase());
      }
    }
  });
});
