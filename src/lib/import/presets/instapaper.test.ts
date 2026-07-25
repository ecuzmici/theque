import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { csvImporterFromPreset, detectCsvPreset } from "@/lib/import/csv-engine";
import { CSV_PRESETS, instapaperPreset } from "@/lib/import/presets";
import type { ImportInput } from "@/lib/import/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fixture(name: string): ImportInput {
  return {
    text: readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8"),
    filename: name,
  };
}

const importer = csvImporterFromPreset(instapaperPreset);

describe("instapaper preset", () => {
  it("wins over the url-list fallback for both column variants", () => {
    expect(detectCsvPreset(fixture("instapaper.csv"), CSV_PRESETS)?.id).toBe("instapaper");
    const short: ImportInput = {
      text: "URL,Title,Selection,Folder\nhttps://example.com/a,Alpha,,Unread",
      filename: "instapaper-export.csv",
    };
    expect(detectCsvPreset(short, CSV_PRESETS)?.id).toBe("instapaper");
  });

  it("maps Archive to done and every other folder to want", async () => {
    const result = await importer.parse(fixture("instapaper.csv"));
    expect(result.rows.map((row) => row.status)).toEqual(["done", "want", "want", "want"]);
  });

  it("puts Selection in description, never in verdict", async () => {
    const result = await importer.parse(fixture("instapaper.csv"));
    // The article's highlighted excerpt is not the reader's opinion of it.
    expect(result.rows[0].description).toBe(
      "The tools have not changed much, but the expectations have.",
    );
    expect(result.rows[0].verdict).toBeNull();
  });

  it("reads Timestamp as Unix seconds", async () => {
    const result = await importer.parse(fixture("instapaper.csv"));
    expect(result.rows[0].created_at_hint).toBe("2020-09-13T12:26:40.000Z");
  });

  it("splits the JSON tag array and survives a malformed one", async () => {
    const result = await importer.parse(fixture("instapaper.csv"));
    expect(result.rows[0].labels).toEqual(["design", "tools"]);
    // `[]` means no tags, not a tag called "[]".
    expect(result.rows[1].labels).toEqual([]);
    // Custom folders stay as labels; Unread/Archive are reading state.
    expect(result.rows[2].labels).toEqual(["systems", "Reading queue"]);
    // A truncated array still yields the tag it can see.
    expect(result.rows[3].labels).toEqual(["half", "Starred"]);
  });

  it("parses the four-column variant that has no Timestamp or Tags", async () => {
    const text = [
      "URL,Title,Selection,Folder",
      "https://example.com/a,Alpha,An excerpt,Archive",
      "https://example.com/b,Beta,,Unread",
    ].join("\n");
    const result = await importer.parse({ text, filename: "instapaper-export.csv" });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      status: "done",
      description: "An excerpt",
      created_at_hint: null,
      labels: [],
      category: "articles",
    });
  });
});
