import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { csvImporterFromPreset, detectCsvPreset } from "@/lib/import/csv-engine";
import { CSV_PRESETS, raindropPreset } from "@/lib/import/presets";
import type { ImportInput } from "@/lib/import/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fixture(name: string): ImportInput {
  return {
    text: readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8"),
    filename: name,
  };
}

const importer = csvImporterFromPreset(raindropPreset);

describe("raindrop preset", () => {
  it("is detected from the lower-case column set", () => {
    expect(detectCsvPreset(fixture("raindrop.csv"), CSV_PRESETS)?.id).toBe("raindrop");
  });

  it("leaves the category to the classifier", async () => {
    const result = await importer.parse(fixture("raindrop.csv"));
    // A Raindrop export mixes recipes, gear and articles in one file.
    expect(result.rows.every((row) => row.category === null)).toBe(true);
  });

  it("keeps note as the verdict and excerpt as the description", async () => {
    const result = await importer.parse(fixture("raindrop.csv"));
    expect(result.rows[0]).toMatchObject({
      url: "https://example.com/pan-sauce",
      title: "Cast iron pan sauce",
      verdict: "Try this with the shallots",
      description: "A quick pan sauce built on fond",
      image_url: "https://cdn.example.com/pan-sauce.jpg",
      created_at_hint: "2024-03-02T18:04:11.482Z",
      status: "want",
    });
    expect(result.rows[0].source_ref.external_id).toBe("812345678");
  });

  it("splits tags and the nested collection path into labels", async () => {
    const result = await importer.parse(fixture("raindrop.csv"));
    expect(result.rows[0].labels).toEqual(["cooking", "sauces", "Recipes", "Weeknight"]);
    expect(result.rows[1].labels).toEqual(["gear", "Kitchen"]);
  });

  it("reports an unquoted multiline row as skips instead of importing garbage", async () => {
    const result = await importer.parse(fixture("raindrop.csv"));
    // The continuation line arrives as its own record with the columns shifted,
    // so neither half yields a usable URL and both are reported.
    expect(result.rows).toHaveLength(2);
    expect(result.skipped.map((skip) => skip.reason)).toEqual(["missing_url", "invalid_url"]);
  });
});
