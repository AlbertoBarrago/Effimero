import type { Redis } from "ioredis";

/**
 * Fixed-window rate limiter backed by Redis.
 *
 * Each (identifier, window) pair is a counter that expires with the window, so
 * there is nothing to clean up. `nowMs` is injected for testability. A limit of
 * 0 (or less) disables the check entirely.
 *
 * Returns true when the request is within the limit, false when it exceeds it.
 */
export async function checkRateLimit(
  redis: Redis,
  identifier: string,
  limit: number,
  windowSeconds: number,
  nowMs: number,
): Promise<boolean> {
  if (limit <= 0) return true;

  const window = Math.floor(nowMs / 1000 / windowSeconds);
  const key = `rl:${identifier}:${window}`;
  const count = await redis.incr(key);
  // Set the TTL only when the counter is first created this window.
  if (count === 1) await redis.expire(key, windowSeconds);
  return count <= limit;
}
