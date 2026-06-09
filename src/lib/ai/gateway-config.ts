/**
 * Gateway config helpers that are safe to import anywhere — no "server-only",
 * no AI SDK. The actual model calls live in ./gateway (which is server-only);
 * these pure env/string helpers are split out so client-imported modules
 * (e.g. recommend-config, consumed by RecommendButton) can use them without
 * pulling "server-only" into the client bundle.
 */

/** True when the AI Gateway can authenticate (local key or Vercel OIDC). */
export function isGatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

/** Parse a comma-separated env var into a trimmed, non-empty model list. */
export function parseModelList(value: string | undefined, fallback: string[]): string[] {
  const parsed = (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}
