import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison of the cron bearer token against CRON_SECRET. */
export function hasValidCronSecret(bearer: string | null, secret: string | undefined): boolean {
  if (!bearer || !secret) return false;
  const bearerBuffer = Buffer.from(bearer);
  const secretBuffer = Buffer.from(secret);
  return bearerBuffer.length === secretBuffer.length && timingSafeEqual(bearerBuffer, secretBuffer);
}
