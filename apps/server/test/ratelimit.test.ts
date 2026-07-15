import assert from "node:assert/strict";
import test from "node:test";
import type { Redis } from "ioredis";
import { checkRateLimit } from "../src/ratelimit.js";

/** In-memory Redis covering INCR and EXPIRE. */
class MemoryRedis {
  readonly counters = new Map<string, number>();
  readonly ttls = new Map<string, number>();

  async incr(key: string) {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async expire(key: string, seconds: number) {
    this.ttls.set(key, seconds);
    return 1;
  }
}

function fresh(): { redis: Redis; mem: MemoryRedis } {
  const mem = new MemoryRedis();
  return { redis: mem as unknown as Redis, mem };
}

const NOW = 1_000_000_000_000; // fixed instant within a window

test("checkRateLimit allows requests up to the limit, then blocks", async () => {
  const { redis } = fresh();
  const results: boolean[] = [];
  for (let i = 0; i < 4; i++) {
    results.push(await checkRateLimit(redis, "1.2.3.4", 3, 60, NOW));
  }
  assert.deepEqual(results, [true, true, true, false]);
});

test("checkRateLimit sets the TTL once, on the first hit of a window", async () => {
  const { redis, mem } = fresh();
  await checkRateLimit(redis, "1.2.3.4", 5, 60, NOW);
  await checkRateLimit(redis, "1.2.3.4", 5, 60, NOW);
  assert.equal(mem.ttls.size, 1);
  assert.equal([...mem.ttls.values()][0], 60);
});

test("checkRateLimit resets in a new window", async () => {
  const { redis } = fresh();
  assert.equal(await checkRateLimit(redis, "1.2.3.4", 1, 60, NOW), true);
  assert.equal(await checkRateLimit(redis, "1.2.3.4", 1, 60, NOW), false);
  // 60s later → next window, counter starts fresh.
  assert.equal(await checkRateLimit(redis, "1.2.3.4", 1, 60, NOW + 60_000), true);
});

test("checkRateLimit is disabled when the limit is zero", async () => {
  const { redis, mem } = fresh();
  assert.equal(await checkRateLimit(redis, "1.2.3.4", 0, 60, NOW), true);
  assert.equal(mem.counters.size, 0); // no Redis work at all
});

test("checkRateLimit tracks identifiers independently", async () => {
  const { redis } = fresh();
  assert.equal(await checkRateLimit(redis, "a", 1, 60, NOW), true);
  assert.equal(await checkRateLimit(redis, "a", 1, 60, NOW), false);
  assert.equal(await checkRateLimit(redis, "b", 1, 60, NOW), true);
});
