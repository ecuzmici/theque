import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_BOOK_FILE_BYTES } from "@/lib/input-limits";

import { BookFileField, type BookFile } from "./BookFileField";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const ATTACHED: BookFile = {
  name: "dune.epub",
  bytes: 1_468_006,
  uploaded_at: "2026-06-12T10:00:00.000Z",
};

function makeFile(name: string, size: number): File {
  const file = new File(["x"], name, { type: "application/epub+zip" });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function errorResponse(status: number, code: string) {
  return { ok: false, status, json: async () => ({ error: code }) };
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not found");
  return input;
}

function buttonWithText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find((el) =>
    el.textContent?.includes(text),
  );
  if (!button) throw new Error(`button "${text}" not found`);
  return button;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** The dialog copy of a control: the last button on the page with that text. */
function dialogButtonWithText(text: string): HTMLButtonElement {
  const matches = Array.from(document.querySelectorAll("button")).filter((el) =>
    el.textContent?.includes(text),
  );
  if (!matches.length) throw new Error(`button "${text}" not found`);
  return matches[matches.length - 1];
}

/** Accessible name of the file input, from its associated <label>. */
function inputLabelText(input: HTMLInputElement): string {
  const label = document.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`);
  return label?.textContent?.trim() ?? "";
}

function describedByText(input: HTMLInputElement): string {
  const ids = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  return ids
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
    .join(" ");
}

describe("BookFileField", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  async function render(props: Partial<Parameters<typeof BookFileField>[0]> = {}) {
    await act(async () => {
      root?.render(<BookFileField itemId="item-1" category="books" {...props} />);
    });
  }

  /** Choose a file the way a user does: pick one, then fire the change event. */
  async function choose(file: File) {
    const input = fileInput();
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("renders the empty state with a way to choose a file", async () => {
    await render();

    expect(container?.textContent).toContain("Kobo file");
    expect(container?.textContent).toContain("Up to 30 MB");
    expect(buttonWithText("Choose EPUB")).toBeTruthy();
    expect(container?.textContent).toContain("No file yet.");
    expect(fileInput().getAttribute("accept")).toBe(".epub,application/epub+zip");
  });

  it("renders the attached file with a human-readable size", async () => {
    await render({ initialFile: ATTACHED });

    expect(container?.textContent).toContain("dune.epub");
    expect(container?.textContent).toContain("1.4 MB");
    expect(buttonWithText("Replace file")).toBeTruthy();
    expect(buttonWithText("Remove file")).toBeTruthy();
    // The Drive file id is never part of the props, so nothing can leak it.
    expect(container?.textContent).not.toContain("drive");
  });

  it("renders nothing for a non-book item", async () => {
    await render({ category: "movies_and_tv", initialFile: ATTACHED });

    expect(container?.innerHTML).toBe("");
  });

  it("uploads the chosen file and shows it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ file: { name: "dune.epub", bytes: 2_097_152, uploaded_at: "2026-06-12T10:00:00.000Z" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await render();

    await choose(makeFile("dune.epub", 2_097_152));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/items/item-1/file");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect((body.get("file") as File).name).toBe("dune.epub");
    expect(container?.textContent).toContain("dune.epub");
    expect(container?.textContent).toContain("2 MB");
    expect(refresh).toHaveBeenCalled();
  });

  it("refuses a file over the size cap without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await render();

    await choose(makeFile("huge.epub", MAX_BOOK_FILE_BYTES + 1));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("bigger than 30 MB");
  });

  it("refuses a file that is not an EPUB without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await render();

    await choose(makeFile("dune.pdf", 1024));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("ends in .epub");
  });

  const UPLOAD_ERRORS: Array<[string, number, string]> = [
    ["unauthorized", 401, "Your session ended"],
    ["not_found", 404, "no longer in your library"],
    ["missing_file", 400, "No file arrived"],
    ["file_too_large", 413, "bigger than 30 MB"],
    ["invalid_epub", 422, "not a readable EPUB"],
    ["drive_not_configured", 503, "Kobo sync is not set up on this server yet"],
    ["upload_failed", 502, "did not reach Google Drive"],
  ];

  it.each(UPLOAD_ERRORS)("explains the %s upload error in plain words", async (code, status, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(status, code)));
    await render();

    await choose(makeFile("dune.epub", 1024));

    expect(container?.textContent).toContain(message);
    expect(container?.textContent).not.toContain(code);
  });

  it("explains the delete_failed error in plain words", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(502, "delete_failed")));
    await render({ initialFile: ATTACHED });

    await click(buttonWithText("Remove file"));
    await click(dialogButtonWithText("Remove file"));

    expect(document.body.textContent).toContain("still on Google Drive");
    expect(document.body.textContent).not.toContain("delete_failed");
  });

  it("disables every control while a request is in flight", async () => {
    let release: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await render({ initialFile: ATTACHED });

    await choose(makeFile("other.epub", 1024));

    expect(fileInput().disabled).toBe(true);
    expect(buttonWithText("Uploading…").disabled).toBe(true);
    expect(buttonWithText("Remove file").disabled).toBe(true);

    // A second change event while busy must not start a second upload.
    await choose(makeFile("third.epub", 1024));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.(okResponse({ file: { name: "other.epub", bytes: 1024, uploaded_at: ATTACHED.uploaded_at } }));
    });

    expect(buttonWithText("Replace file").disabled).toBe(false);
  });

  it("asks for confirmation, then removes the file", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ file: null }));
    vi.stubGlobal("fetch", fetchMock);
    await render({ initialFile: ATTACHED });

    await click(buttonWithText("Remove file"));

    expect(document.body.textContent).toContain("Remove this file?");
    expect(fetchMock).not.toHaveBeenCalled();

    await click(dialogButtonWithText("Remove file"));

    expect(fetchMock).toHaveBeenCalledWith("/api/items/item-1/file", { method: "DELETE" });
    expect(container?.textContent).not.toContain("dune.epub");
    expect(buttonWithText("Choose EPUB")).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it("sends no request when the user cancels the removal", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await render({ initialFile: ATTACHED });

    await click(buttonWithText("Remove file"));
    await click(dialogButtonWithText("Cancel"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("dune.epub");
  });

  it("labels the file input and links the hint and the error to it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(422, "invalid_epub")));
    await render();

    const input = fileInput();
    expect(inputLabelText(input)).toBe("EPUB file");
    expect(describedByText(input)).toContain("next WiFi sync");

    await choose(makeFile("dune.epub", 1024));

    expect(describedByText(fileInput())).toContain("not a readable EPUB");
    expect(document.querySelector('[role="status"]')).toBeTruthy();
  });
});
