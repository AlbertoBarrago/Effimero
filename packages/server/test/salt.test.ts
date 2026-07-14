import assert from "node:assert/strict";
import test from "node:test";
import type { Redis } from "ioredis";
import { getDailySalt } from "../src/salt.js";

class MemoryRedis {
  readonly store = new Map<string, string>();
  readonly ttls = new Map<string, number>();

  async set(key: string, value: string, _mode: "EX", seconds: number, condition: "NX") {
    assert.equal(condition, "NX");
    this.ttls.set(key, seconds);
    if (this.store.has(key)) return null;
    this.store.set(key, value);
    return "OK";
  }

  async get(key: string) {
    return this.store.get(key) ?? null;
  }
}

test("getDailySalt reuses the same random salt within a UTC day", async () => {
  const redis = new MemoryRedis();
  const now = new Date("2026-07-14T10:00:00.000Z");

  const first = await getDailySalt(redis as unknown as Redis, now);
  const second = await getDailySalt(redis as unknown as Redis, now);

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("getDailySalt creates separate keys per UTC day with bounded TTL", async () => {
  const redis = new MemoryRedis();

  const first = await getDailySalt(redis as unknown as Redis, new Date("2026-07-14T23:59:30.000Z"));
  const second = await getDailySalt(redis as unknown as Redis, new Date("2026-07-15T00:00:30.000Z"));

  assert.notEqual(first, second);
  assert.equal(redis.store.size, 2);
  assert.equal(redis.ttls.get("salt:2026-07-14"), 3630);
  assert.equal(redis.ttls.get("salt:2026-07-15"), 89970);
});
