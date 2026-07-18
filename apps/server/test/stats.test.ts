import assert from "node:assert/strict";
import test from "node:test";
import type { Redis } from "ioredis";
import { cappedField, getStats, OVERFLOW_FIELD } from "../src/stats.js";

class StatsRedis {
  readonly hashes = new Map<string, Record<string, string>>();
  readonly hlls = new Map<string, number>();
  readonly strings = new Map<string, string>();

  pipeline() {
    const operations: Array<() => unknown> = [];
    const chain = {
      pfcount: (...keys: string[]) => {
        operations.push(() => keys.reduce((total, key) => total + (this.hlls.get(key) ?? 0), 0));
        return chain;
      },
      get: (key: string) => {
        operations.push(() => this.strings.get(key) ?? null);
        return chain;
      },
      hgetall: (key: string) => {
        operations.push(() => this.hashes.get(key) ?? {});
        return chain;
      },
      exec: async () => operations.map((operation) => [null, operation()] as const),
    };
    return chain;
  }
}

function dayWithOffset(offset: number): string {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset))
    .toISOString()
    .slice(0, 10);
}

test("cappedField keeps a value already present in the hash, even at the cap", () => {
  assert.equal(cappedField("/pricing", true, 2000, 2000), "/pricing");
});

test("cappedField keeps new values while under the cap", () => {
  assert.equal(cappedField("/new", false, 1999, 2000), "/new");
});

test("cappedField folds new values into the overflow bucket at the cap", () => {
  assert.equal(cappedField("/flood-123", false, 2000, 2000), OVERFLOW_FIELD);
  assert.equal(cappedField("/flood-124", false, 5000, 2000), OVERFLOW_FIELD);
});

test("cappedField treats a non-positive cap as disabled", () => {
  assert.equal(cappedField("/anything", false, 999999, 0), "/anything");
});

test("getStats decodes and aggregates every Redis field by name", async () => {
  const store = new StatsRedis();
  const siteId = "site-a";
  const yesterday = dayWithOffset(-1);
  const today = dayWithOffset(0);
  const yesterdayPrefix = `site:${siteId}:${yesterday}`;
  const todayPrefix = `site:${siteId}:${today}`;

  store.hlls.set(`${yesterdayPrefix}:uniques`, 3);
  store.hlls.set(`${todayPrefix}:uniques`, 4);
  store.strings.set(`${yesterdayPrefix}:pageviews`, "6");
  store.strings.set(`${todayPrefix}:pageviews`, "9");

  store.hashes.set(`${yesterdayPrefix}:paths`, { "/": "4", "/pricing": "2" });
  store.hashes.set(`${todayPrefix}:paths`, { "/": "5", "/docs": "4" });
  store.hashes.set(`${yesterdayPrefix}:referrers`, { "example.com": "2" });
  store.hashes.set(`${todayPrefix}:referrers`, { "search.example": "3" });
  store.hashes.set(`${yesterdayPrefix}:hours`, { "0": "2", "23": "1" });
  store.hashes.set(`${todayPrefix}:hours`, { "0": "3" });
  store.hashes.set(`${yesterdayPrefix}:browser`, { Chrome: "6" });
  store.hashes.set(`${todayPrefix}:browser`, { Firefox: "9" });
  store.hashes.set(`${yesterdayPrefix}:os`, { macOS: "6" });
  store.hashes.set(`${todayPrefix}:os`, { Linux: "9" });
  store.hashes.set(`${yesterdayPrefix}:device`, { desktop: "6" });
  store.hashes.set(`${todayPrefix}:device`, { mobile: "9" });
  store.hashes.set(`${yesterdayPrefix}:language`, { it: "6" });
  store.hashes.set(`${todayPrefix}:language`, { en: "9" });
  store.hashes.set(`${yesterdayPrefix}:country`, { IT: "6" });
  store.hashes.set(`${todayPrefix}:country`, { US: "9" });

  const stats = await getStats(store as unknown as Redis, siteId, 2);

  assert.deepEqual(stats.days, [
    { day: yesterday, uniques: 3, pageviews: 6 },
    { day: today, uniques: 4, pageviews: 9 },
  ]);
  assert.deepEqual(stats.totals, { uniques: 7, pageviews: 15, pagesPerVisitor: 2.14 });
  assert.deepEqual(stats.topPaths, [
    { path: "/", count: 9 },
    { path: "/docs", count: 4 },
    { path: "/pricing", count: 2 },
  ]);
  assert.deepEqual(stats.topReferrers, [
    { referrer: "search.example", count: 3 },
    { referrer: "example.com", count: 2 },
  ]);
  assert.equal(stats.hours[0], 5);
  assert.equal(stats.hours[23], 1);
  assert.deepEqual(stats.browsers, [
    { label: "Firefox", count: 9 },
    { label: "Chrome", count: 6 },
  ]);
  assert.deepEqual(stats.os, [
    { label: "Linux", count: 9 },
    { label: "macOS", count: 6 },
  ]);
  assert.deepEqual(stats.devices, [
    { label: "mobile", count: 9 },
    { label: "desktop", count: 6 },
  ]);
  assert.deepEqual(stats.languages, [
    { label: "en", count: 9 },
    { label: "it", count: 6 },
  ]);
  assert.deepEqual(stats.countries, [
    { label: "US", count: 9 },
    { label: "IT", count: 6 },
  ]);
});
