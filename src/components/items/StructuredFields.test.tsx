import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { StructuredFields } from "./StructuredFields";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("StructuredFields", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("renders enum-like metadata as user-friendly labels", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <StructuredFields
          category={null}
          structured={{
            category: "movies_and_tv",
            status: "want",
            category_source: "schema_org",
            source: "chrome_extension",
          }}
        />,
      );
    });

    expect(container.textContent).toContain("Movies & TV");
    expect(container.textContent).toContain("Want");
    expect(container.textContent).toContain("Schema.org");
    expect(container.textContent).toContain("Chrome extension");
    expect(container.textContent).not.toContain("movies_and_tv");
    expect(container.textContent).not.toContain("schema_org");
    expect(container.textContent).not.toContain("chrome_extension");
  });
});
