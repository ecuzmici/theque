import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// No-op when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are absent (dev/local).
// Returns { ok: true } so all requests pass through in development.

let _ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  if (_ratelimit !== null) return _ratelimit;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token });
  _ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(1, "1 s"), prefix: "@upstash/ratelimit" });
  return _ratelimit;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean; retryAfter?: number }> {
  const instance = getRatelimit();
  if (!instance) return { ok: true };

  // Each call site supplies its own limit + window; create an ephemeral instance scoped to that config.
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const redis = new Redis({ url, token });
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    prefix: "theque:rl",
  });

  const result = await rl.limit(key);
  if (result.success) return { ok: true };

  const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
  return { ok: false, retryAfter: retryAfter > 0 ? retryAfter : 1 };
}
