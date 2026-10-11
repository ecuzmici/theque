import type { CaptureSource } from "@/components/capture/capture-link";
import { extractSharedUrl } from "@/lib/url/shared-url";

export type AddPrefill = {
  url: string | null;
  note: string;
  source: CaptureSource;
};

/**
 * Turns the share-target query (`?url=`, `?text=`, `?title=`) into a capture
 * prefill. Android can put the link in any of the three fields. The title
 * becomes the note, except when it only repeats the link.
 */
export function addPrefill(params: {
  url?: string | null;
  text?: string | null;
  title?: string | null;
}): AddPrefill {
  const url = extractSharedUrl(params);
  const title = params.title?.trim() ?? "";
  const titleIsLink = url !== null && title.includes(url);
  return {
    url,
    note: title && !titleIsLink ? title : "",
    source: url ? "mobile_share_extension" : "manual",
  };
}
