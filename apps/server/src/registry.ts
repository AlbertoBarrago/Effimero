import type { Redis } from "ioredis";

/**
 * Explicit registry of the sites Effimero is allowed to collect for.
 *
 * Ingest (`/collect`) is public and self-asserts its `siteId`, so without a
 * registry anyone can inject or pollute stats for any site. The registry is
 * the source of truth: only registered sites are accepted.
 *
 * `allowedOrigins` is stored here already but NOT yet enforced — per-site CORS
 * / Origin validation is a later task. Persisting it now keeps the data model
 * stable so that change needs no migration.
 */
export interface SiteConfig {
  siteId: string;
  /** Origins permitted to send hits for this site. Empty means "any" (not yet enforced). */
  allowedOrigins: string[];
  active: boolean;
  /** ISO-8601 UTC timestamp of registration. */
  createdAt: string;
}

/** Redis set holding every registered siteId, for enumeration. */
const REGISTRY_SET = "site:registry";

function configKey(siteId: string): string {
  return `site:config:${siteId}`;
}

/**
 * Registers a site (or overwrites an existing config). Returns the stored
 * config. `createdAt` is caller-supplied so the module stays clock-free and
 * testable; the route passes `new Date().toISOString()`.
 */
export async function registerSite(
  redis: Redis,
  siteId: string,
  allowedOrigins: string[],
  createdAt: string,
): Promise<SiteConfig> {
  const config: SiteConfig = { siteId, allowedOrigins, active: true, createdAt };
  await redis
    .pipeline()
    .hset(configKey(siteId), {
      allowedOrigins: JSON.stringify(allowedOrigins),
      active: "1",
      createdAt,
    })
    .sadd(REGISTRY_SET, siteId)
    .exec();
  return config;
}

/** Returns the stored config for a site, or null if it was never registered. */
export async function getSiteConfig(redis: Redis, siteId: string): Promise<SiteConfig | null> {
  const raw = await redis.hgetall(configKey(siteId));
  if (!raw || Object.keys(raw).length === 0) return null;
  return {
    siteId,
    allowedOrigins: parseOrigins(raw.allowedOrigins),
    active: raw.active === "1",
    createdAt: raw.createdAt ?? "",
  };
}

/** True only for a site that is both registered and active. */
export async function isRegistered(redis: Redis, siteId: string): Promise<boolean> {
  const active = await redis.hget(configKey(siteId), "active");
  return active === "1";
}

/** All registered site configs, ordered by siteId. */
export async function listSites(redis: Redis): Promise<SiteConfig[]> {
  const ids = (await redis.smembers(REGISTRY_SET)).sort();
  const configs = await Promise.all(ids.map((id) => getSiteConfig(redis, id)));
  return configs.filter((c): c is SiteConfig => c !== null);
}

/** Removes a site from the registry. Returns true if it existed. */
export async function removeSite(redis: Redis, siteId: string): Promise<boolean> {
  const [[, removed]] = (await redis
    .pipeline()
    .srem(REGISTRY_SET, siteId)
    .del(configKey(siteId))
    .exec()) as Array<[Error | null, number]>;
  return removed > 0;
}

function parseOrigins(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === "string") : [];
  } catch {
    return [];
  }
}
