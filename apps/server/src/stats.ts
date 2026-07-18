import type { Redis } from "ioredis";
import { config } from "./config.js";
import type { Dimensions } from "./enrichment.js";

export interface Hit {
  siteId: string;
  visitorHash: string;
  path: string;
  referrer: string | null;
  day: string; // YYYY-MM-DD (UTC)
  hour: number; // 0-23 (UTC)
  dimensions: Dimensions;
}

const RETENTION_SECONDS = config.retentionDays * 86400;
/** Width of each live-visitors window bucket. Two buckets ≈ "last 5 minutes". */
const LIVE_BUCKET_SECONDS = 150;

const DIMENSION_KEYS = ["browser", "os", "device", "language", "country"] as const;
const HASH_FIELDS = ["paths", "referrers", "hours", ...DIMENSION_KEYS] as const;

type HashField = (typeof HASH_FIELDS)[number];
type HashTotals = Record<HashField, Map<string, number>>;

/** Bucket for path/referrer values beyond the per-day cardinality cap. */
export const OVERFLOW_FIELD = "__other__";

/**
 * Decides which hash field a path/referrer value is counted under, bounding
 * distinct fields per day. Already-seen values always keep their own field;
 * new values beyond the cap fold into a single overflow bucket, so an attacker
 * cannot grow the hash without limit.
 */
export function cappedField(field: string, exists: boolean, currentLen: number, cap: number): string {
  if (exists || cap <= 0 || currentLen < cap) return field;
  return OVERFLOW_FIELD;
}

/**
 * Records a hit using only aggregate structures:
 * - HyperLogLog of visitor hashes → unique visitors (~0.81% std error)
 * - plain counters → pageviews, hour-of-day histogram
 * - Redis hashes → per-path, per-referrer, per-dimension counts
 * - short-lived HLLs → live visitors (last ~5 minutes)
 * No individual event or hash is ever stored verbatim outside the HLLs.
 */
export async function recordHit(redis: Redis, hit: Hit): Promise<void> {
  const prefix = `site:${hit.siteId}:${hit.day}`;

  // Pre-read cardinality so unbounded, attacker-controlled path/referrer values
  // fold into a single overflow bucket instead of growing the hash forever.
  const pre = redis.pipeline();
  pre.hlen(`${prefix}:paths`);
  pre.hexists(`${prefix}:paths`, hit.path);
  if (hit.referrer) {
    pre.hlen(`${prefix}:referrers`);
    pre.hexists(`${prefix}:referrers`, hit.referrer);
  }
  const pre_res = (await pre.exec()) ?? [];
  const pathField = cappedField(
    hit.path,
    pre_res[1]?.[1] === 1,
    Number(pre_res[0]?.[1] ?? 0),
    config.maxDistinctPaths,
  );
  const referrerField = hit.referrer
    ? cappedField(hit.referrer, pre_res[3]?.[1] === 1, Number(pre_res[2]?.[1] ?? 0), config.maxDistinctReferrers)
    : null;

  const pipeline = redis.pipeline();
  const expiring: string[] = [];

  pipeline.pfadd(`${prefix}:uniques`, hit.visitorHash);
  pipeline.incr(`${prefix}:pageviews`);
  pipeline.hincrby(`${prefix}:paths`, pathField, 1);
  pipeline.hincrby(`${prefix}:hours`, String(hit.hour), 1);
  expiring.push(`${prefix}:uniques`, `${prefix}:pageviews`, `${prefix}:paths`, `${prefix}:hours`);

  if (referrerField) {
    pipeline.hincrby(`${prefix}:referrers`, referrerField, 1);
    expiring.push(`${prefix}:referrers`);
  }

  for (const dim of DIMENSION_KEYS) {
    pipeline.hincrby(`${prefix}:${dim}`, hit.dimensions[dim], 1);
    expiring.push(`${prefix}:${dim}`);
  }

  for (const key of expiring) pipeline.expire(key, RETENTION_SECONDS);

  // Registry of known sites for the dashboard picker, scored by last-seen.
  pipeline.zadd("sites", Date.now(), hit.siteId);

  const liveKey = currentLiveKey(hit.siteId);
  pipeline.pfadd(liveKey, hit.visitorHash);
  pipeline.expire(liveKey, LIVE_BUCKET_SECONDS * 3);

  await pipeline.exec();
}

/** Known site ids, most recently active first. Prunes ids idle past retention. */
export async function getSites(redis: Redis): Promise<string[]> {
  await redis.zremrangebyscore("sites", "-inf", Date.now() - RETENTION_SECONDS * 1000);
  return redis.zrevrange("sites", 0, -1);
}

/** Unique visitors seen in the current + previous live bucket (~last 5 min). */
export async function getLiveVisitors(redis: Redis, siteId: string): Promise<number> {
  const bucket = Math.floor(Date.now() / 1000 / LIVE_BUCKET_SECONDS);
  return redis.pfcount(
    `site:${siteId}:live:${bucket}`,
    `site:${siteId}:live:${bucket - 1}`,
  );
}

function currentLiveKey(siteId: string): string {
  const bucket = Math.floor(Date.now() / 1000 / LIVE_BUCKET_SECONDS);
  return `site:${siteId}:live:${bucket}`;
}

export interface DayStats {
  day: string;
  uniques: number;
  pageviews: number;
}

export interface SiteStats {
  days: DayStats[];
  totals: { uniques: number; pageviews: number; pagesPerVisitor: number };
  topPaths: Array<{ path: string; count: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
  /** Pageviews per UTC hour of day, index 0-23, summed over the range. */
  hours: number[];
  browsers: Array<{ label: string; count: number }>;
  os: Array<{ label: string; count: number }>;
  devices: Array<{ label: string; count: number }>;
  languages: Array<{ label: string; count: number }>;
  countries: Array<{ label: string; count: number }>;
}

/** Aggregates stats for the last `rangeDays` days, ending today (UTC). */
export async function getStats(redis: Redis, siteId: string, rangeDays: number): Promise<SiteStats> {
  const days = lastDays(rangeDays);

  const pipeline = redis.pipeline();
  for (const day of days) {
    const prefix = `site:${siteId}:${day}`;
    pipeline.pfcount(`${prefix}:uniques`);
    pipeline.get(`${prefix}:pageviews`);
    for (const field of HASH_FIELDS) pipeline.hgetall(`${prefix}:${field}`);
  }
  pipeline.pfcount(...days.map((day) => `site:${siteId}:${day}:uniques`));
  const results = (await pipeline.exec()) ?? [];

  const dayStats: DayStats[] = [];
  const totals = emptyHashTotals();
  const resultsPerDay = 2 + HASH_FIELDS.length;

  days.forEach((day, i) => {
    const base = i * resultsPerDay;
    dayStats.push({
      day,
      uniques: Number(results[base]?.[1] ?? 0),
      pageviews: Number(results[base + 1]?.[1] ?? 0),
    });
    HASH_FIELDS.forEach((field, fieldIndex) => {
      accumulate(totals[field], results[base + 2 + fieldIndex]?.[1]);
    });
  });

  // Merged PFCOUNT across all days: still daily-salted, so this is NOT
  // cross-day uniques — it's an upper bound used only for the ratio.
  const mergedUniques = Number(results[days.length * resultsPerDay]?.[1] ?? 0);
  const totalPageviews = dayStats.reduce((sum, d) => sum + d.pageviews, 0);

  const hours = Array.from({ length: 24 }, (_, h) => totals.hours.get(String(h)) ?? 0);

  return {
    days: dayStats,
    totals: {
      uniques: mergedUniques,
      pageviews: totalPageviews,
      pagesPerVisitor: mergedUniques > 0 ? Number((totalPageviews / mergedUniques).toFixed(2)) : 0,
    },
    topPaths: top(totals.paths, 10).map(([path, count]) => ({ path, count })),
    topReferrers: top(totals.referrers, 10).map(([referrer, count]) => ({ referrer, count })),
    hours,
    browsers: toLabelled(totals.browser),
    os: toLabelled(totals.os),
    devices: toLabelled(totals.device),
    languages: toLabelled(totals.language),
    countries: toLabelled(totals.country),
  };
}

function emptyHashTotals(): HashTotals {
  return Object.fromEntries(HASH_FIELDS.map((field) => [field, new Map<string, number>()])) as HashTotals;
}

function toLabelled(map: Map<string, number>): Array<{ label: string; count: number }> {
  return top(map, 10).map(([label, count]) => ({ label, count }));
}

function lastDays(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function accumulate(target: Map<string, number>, hash: unknown): void {
  if (!hash || typeof hash !== "object") return;
  for (const [key, value] of Object.entries(hash as Record<string, string>)) {
    target.set(key, (target.get(key) ?? 0) + Number(value));
  }
}

function top(map: Map<string, number>, n: number): Array<[string, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
