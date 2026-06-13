import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";

const TIMEOUT_MS = 8000;
const REPO_RE = /^\/([^/]+)\/([^/]+)\/?$/;

function parseRepo(url: string): { owner: string; repo: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase().replace(/^www\./, "") !== "github.com") return null;
  const m = parsed.pathname.match(REPO_RE);
  if (!m) return null;
  // Exclude reserved owner paths that look like repos.
  if (["explore", "topics", "trending", "marketplace", "sponsors"].includes(m[1].toLowerCase())) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

/** Apps resolver — GitHub REST API (no key, 60/hr/IP). Repo owner, description, language. */
export const resolveApp: CategoryResolver = async (input) => {
  const repo = parseRepo(input.canonicalUrl);
  if (!repo) return null;

  const url = new URL(`https://api.github.com/repos/${repo.owner}/${repo.repo}`);
  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  let body: { description?: unknown; language?: unknown; owner?: { login?: unknown; avatar_url?: unknown } };
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    body = (await res.json()) as typeof body;
  } catch {
    return null;
  }

  const structured: Record<string, unknown> = {};
  if (typeof body.owner?.login === "string" && body.owner.login.trim()) {
    structured.developer = body.owner.login.trim();
  }
  if (typeof body.language === "string" && body.language.trim()) {
    structured.category_tag = body.language.trim();
  }

  const patch: ResolverPatch = { source: "github" };
  if (Object.keys(structured).length) patch.structured = structured;
  if (typeof body.description === "string" && body.description.trim()) {
    patch.description = body.description.trim();
  }
  if (typeof body.owner?.avatar_url === "string" && body.owner.avatar_url) {
    patch.image_url = body.owner.avatar_url;
  }

  if (!patch.structured && !patch.description && !patch.image_url) return null;
  return patch;
};
