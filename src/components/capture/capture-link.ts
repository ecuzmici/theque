import type { ItemSource } from "@/lib/database.types";

/** Sources the web capture sheet sends to `/api/capture`. */
export type CaptureSource = Extract<ItemSource, "manual" | "mobile_share_extension">;

export type ClipboardLink =
  | { state: "found"; url: string }
  | { state: "none" }
  | { state: "denied" };

/**
 * Returns the clipboard text as a link when the whole text is one http(s) URL.
 * Text with other words around a URL returns null, so the sheet never offers
 * a link the user did not copy on purpose.
 */
export function linkFromClipboardText(text: string): string | null {
  const trimmed = text.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null;
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

/** Short host label for a link: "imdb.com" for "https://www.imdb.com/title/…". */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

/** Unique http(s) links in pasted text, in order. */
export function parseUrlLines(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/\s+/)
        .map((line) => line.trim())
        .filter((line) => /^https?:\/\//i.test(line)),
    ),
  );
}

type ClipboardReader = Pick<Clipboard, "readText">;

/**
 * Reads the clipboard and looks for one link. Call it inside the click handler
 * that opens the sheet: some browsers allow the read only during a user gesture.
 * A missing API, a refused permission, or any other error gives "denied".
 */
export async function readClipboardLink(
  clipboard: ClipboardReader | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.clipboard,
): Promise<ClipboardLink> {
  if (!clipboard?.readText) return { state: "denied" };
  try {
    const url = linkFromClipboardText(await clipboard.readText());
    return url ? { state: "found", url } : { state: "none" };
  } catch {
    return { state: "denied" };
  }
}

export type SaveLinkResult =
  | { ok: true; itemId: string | null; created: boolean }
  | { ok: false; error: string };

/** Saves one link through `POST /api/capture` with the session cookie. */
export async function saveLink(input: {
  url: string;
  note?: string;
  source: CaptureSource;
}): Promise<SaveLinkResult> {
  try {
    const res = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: input.url,
        source: input.source,
        note: input.note || undefined,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      code?: string;
      item?: { id: string };
      created?: boolean;
    };
    if (!res.ok) return { ok: false, error: body.code ?? "Could not save link." };
    return { ok: true, itemId: body.item?.id ?? null, created: body.created !== false };
  } catch {
    return { ok: false, error: "Network error." };
  }
}
