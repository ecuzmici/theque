import { createHash } from "node:crypto";

export function fingerprint(canonicalUrl: string): string {
  return createHash("sha256").update(canonicalUrl, "utf8").digest("hex");
}
