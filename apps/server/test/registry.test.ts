import assert from "node:assert/strict";
import test from "node:test";
import type { Redis } from "ioredis";
import { registerSite, getSiteConfig, isRegistered, listSites, removeSite } from "../src/registry.js";

/**
 * Minimal in-memory Redis covering the hash/set commands the registry uses,
 * including the pipeline() form. Mirrors the fake in salt.test.ts.
 */
class MemoryRedis {
  readonly hashes = new Map<string, Map<string, string>>();
  readonly sets = new Map<string, Set<string>>();

  private hashOf(key: string): Map<string, string> {
    let h = this.hashes.get(key);
    if (!h) this.hashes.set(key, (h = new Map()));
    return h;
  }

  async hset(key: string, obj: Record<string, string>) {
    const h = this.hashOf(key);
    for (const [k, v] of Object.entries(obj)) h.set(k, v);
    return Object.keys(obj).length;
  }

  async hget(key: string, field: string) {
    return this.hashes.get(key)?.get(field) ?? null;
  }

  async hgetall(key: string) {
    return Object.fromEntries(this.hashes.get(key) ?? new Map());
  }

  async sadd(key: string, member: string) {
    let s = this.sets.get(key);
    if (!s) this.sets.set(key, (s = new Set()));
    const had = s.has(member);
    s.add(member);
    return had ? 0 : 1;
  }

  async srem(key: string, member: string) {
    const s = this.sets.get(key);
    return s?.delete(member) ? 1 : 0;
  }

  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }

  async del(key: string) {
    return this.hashes.delete(key) ? 1 : 0;
  }

  pipeline() {
    const ops: Array<() => Promise<unknown>> = [];
    const chain = {
      hset: (k: string, o: Record<string, string>) => (ops.push(() => this.hset(k, o)), chain),
      sadd: (k: string, m: string) => (ops.push(() => this.sadd(k, m)), chain),
      srem: (k: string, m: string) => (ops.push(() => this.srem(k, m)), chain),
      del: (k: string) => (ops.push(() => this.del(k)), chain),
      exec: async () => {
        const out: Array<[null, unknown]> = [];
        for (const op of ops) out.push([null, await op()]);
        return out;
      },
    };
    return chain;
  }
}

function fresh(): Redis {
  return new MemoryRedis() as unknown as Redis;
}

const CREATED_AT = "2026-07-15T10:00:00.000Z";

test("registerSite persists config and marks the site active", async () => {
  const redis = fresh();

  const config = await registerSite(redis, "site-a", ["https://a.example"], CREATED_AT);

  assert.deepEqual(config, {
    siteId: "site-a",
    allowedOrigins: ["https://a.example"],
    active: true,
    createdAt: CREATED_AT,
  });
  assert.equal(await isRegistered(redis, "site-a"), true);
});

test("isRegistered is false for unknown sites", async () => {
  const redis = fresh();
  assert.equal(await isRegistered(redis, "ghost"), false);
});

test("getSiteConfig round-trips allowedOrigins", async () => {
  const redis = fresh();
  const origins = ["https://a.example", "https://b.example"];

  await registerSite(redis, "multi", origins, CREATED_AT);
  const config = await getSiteConfig(redis, "multi");

  assert.deepEqual(config?.allowedOrigins, origins);
});

test("getSiteConfig returns null for an unregistered site", async () => {
  const redis = fresh();
  assert.equal(await getSiteConfig(redis, "nope"), null);
});

test("listSites returns every registered config sorted by id", async () => {
  const redis = fresh();
  await registerSite(redis, "zeta", [], CREATED_AT);
  await registerSite(redis, "alpha", [], CREATED_AT);

  const sites = await listSites(redis);

  assert.deepEqual(
    sites.map((s) => s.siteId),
    ["alpha", "zeta"],
  );
});

test("removeSite deletes the config and reports existence", async () => {
  const redis = fresh();
  await registerSite(redis, "site-a", [], CREATED_AT);

  assert.equal(await removeSite(redis, "site-a"), true);
  assert.equal(await isRegistered(redis, "site-a"), false);
  assert.equal(await getSiteConfig(redis, "site-a"), null);
  assert.equal(await removeSite(redis, "site-a"), false);
});
