import { describe, expect, it } from "vitest";

import { extractImdbTitleId, hintsFromUrl } from "@/lib/enrichment/url-hints";

describe("hintsFromUrl", () => {
  it("extracts place name from maps.google.com host", () => {
    const hints = hintsFromUrl(
      "https://maps.google.com/maps/place/Test+Cafe/@1,2,3z",
    );
    expect(hints.place_name).toBe("Test Cafe");
  });

  it("extracts Google Maps place name from path", () => {
    const hints = hintsFromUrl(
      "https://www.google.com/maps/place/Caf%C3%A9+de+Flore/@48.8541604,2.3325599,17z",
    );
    expect(hints.place_name).toBe("Café de Flore");
    expect(hints.title_hint).toBe("Café de Flore");
  });

  it("extracts TripAdvisor place name from path", () => {
    const hints = hintsFromUrl(
      "https://www.tripadvisor.com/Restaurant_Review-g187147-d194001-Reviews-Cafe_de_Flore-Paris.html",
    );
    expect(hints.place_name).toBe("Cafe de Flore");
  });
});

describe("extractImdbTitleId", () => {
  it("parses tt id from imdb title url", () => {
    expect(extractImdbTitleId("https://www.imdb.com/title/tt1375666/")).toBe("tt1375666");
  });
});
