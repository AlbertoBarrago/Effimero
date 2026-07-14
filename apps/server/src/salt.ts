import { randomBytes } from "node:crypto";
import type { Redis } from "ioredis";

/**
 * Returns the salt for the current UTC day, generating it atomically if absent.
 *
 * The salt lives only in Redis with a TTL slightly past midnight UTC, is never
 * logged or persisted elsewhere, and is not derivable from the date. Rotating
 * it daily is what makes visitor hashes incomparable across days.
 */
export async function getDailySalt(redis: Redis, now: Date = new Date()): Promise<string> {
  const day = now.toISOString().slice(0, 10);
  const key = `salt:${day}`;

  const candidate = randomBytes(32).toString("hex");
  // NX ensures a single winner when multiple requests race at midnight.
  const created = await redis.set(key, candidate, "EX", secondsUntilEndOfDay(now) + 3600, "NX");
  if (created === "OK") return candidate;

  const existing = await redis.get(key);
  if (!existing) throw new Error(`Daily salt for ${day} disappeared between SET NX and GET`);
  return existing;
}

function secondsUntilEndOfDay(now: Date): number {
  const endOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.floor((endOfDay - now.getTime()) / 1000));
}
