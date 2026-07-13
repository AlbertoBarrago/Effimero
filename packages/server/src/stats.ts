import type { Redis } from "ioredis";
import { config } from "./config.js";

export interface Hit {
  siteId: string;
  visitorHash: string;
  path: string;
  referrer: string | null;
  day: string; // YYYY-MM-DD (UTC)
}

const RETENTION_SECONDS = config.retentionDays * 86400;

/**
 * Records a hit using only aggregate structures:
 * - HyperLogLog of visitor hashes → unique visitors (~0.81% std error)
 * - plain counter → pageviews
 * - sorted-ish hashes → per-path and per-referrer counts
 * No individual event or hash is ever stored verbatim outside the HLL.
 */
export async function recordHit(redis: Redis, hit: Hit): Promise<void> {
  const prefix = `site:${hit.siteId}:${hit.day}`;
  const pipeline = redis.pipeline();

  pipeline.pfadd(`${prefix}:uniques`, hit.visitorHash);
  pipeline.incr(`${prefix}:pageviews`);
  pipeline.hincrby(`${prefix}:paths`, hit.path, 1);
  if (hit.referrer) pipeline.hincrby(`${prefix}:referrers`, hit.referrer, 1);

  for (const key of [`${prefix}:uniques`, `${prefix}:pageviews`, `${prefix}:paths`, `${prefix}:referrers`]) {
    pipeline.expire(key, RETENTION_SECONDS);
  }

  await pipeline.exec();
}

export interface DayStats {
  day: string;
  uniques: number;
  pageviews: number;
}

export interface SiteStats {
  days: DayStats[];
  topPaths: Array<{ path: string; count: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
}

/** Aggregates stats for the last `rangeDays` days, ending today (UTC). */
export async function getStats(redis: Redis, siteId: string, rangeDays: number): Promise<SiteStats> {
  const days = lastDays(rangeDays);

  const pipeline = redis.pipeline();
  for (const day of days) {
    const prefix = `site:${siteId}:${day}`;
    pipeline.pfcount(`${prefix}:uniques`);
    pipeline.get(`${prefix}:pageviews`);
    pipeline.hgetall(`${prefix}:paths`);
    pipeline.hgetall(`${prefix}:referrers`);
  }
  const results = (await pipeline.exec()) ?? [];

  const dayStats: DayStats[] = [];
  const pathTotals = new Map<string, number>();
  const referrerTotals = new Map<string, number>();

  days.forEach((day, i) => {
    const base = i * 4;
    const uniques = Number(results[base]?.[1] ?? 0);
    const pageviews = Number(results[base + 1]?.[1] ?? 0);
    dayStats.push({ day, uniques, pageviews });

    accumulate(pathTotals, results[base + 2]?.[1] as Record<string, string> | null);
    accumulate(referrerTotals, results[base + 3]?.[1] as Record<string, string> | null);
  });

  return {
    days: dayStats,
    topPaths: top(pathTotals, 10).map(([path, count]) => ({ path, count })),
    topReferrers: top(referrerTotals, 10).map(([referrer, count]) => ({ referrer, count })),
  };
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

function accumulate(target: Map<string, number>, hash: Record<string, string> | null | undefined): void {
  if (!hash) return;
  for (const [key, value] of Object.entries(hash)) {
    target.set(key, (target.get(key) ?? 0) + Number(value));
  }
}

function top(map: Map<string, number>, n: number): Array<[string, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
