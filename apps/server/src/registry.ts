import type { Redis } from "ioredis";

/**
 * Explicit registry of the sites Effimero is allowed to collect for.
 *
 * Ingest (`/collect`) is public and self-asserts its `siteId`, so without a
 * registry anyone can inject or pollute stats for any site. The registry is
 * the source of truth: only registered sites are accepted.
 *
 * `allowedOrigins` restricts ingest to requests whose Origin matches the
 * configured per-site allow-list. An empty list accepts any origin.
 */
export interface SiteConfig {
  siteId: string;
  /** Origins permitted to send hits for this site. Empty means "any". */
  allowedOrigins: string[];
  active: boolean;
  /** ISO-8601 UTC timestamp of registration. */
  createdAt: string;
  /** SHA-256 of the site's read token, or undefined if none was issued. Never exposed. */
  readTokenHash?: string;
}

/** Redis set holding every registered siteId, for enumeration. */
const REGISTRY_SET = "site:registry";

function configKey(siteId: string): string {
  return `site:config:${siteId}`;
}

/** Reverse index: hashed read token → the single siteId it grants access to. */
function tokenKey(tokenHash: string): string {
  return `readtoken:${tokenHash}`;
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
    readTokenHash: raw.readTokenHash || undefined,
  };
}

/**
 * Assigns a read token (by its SHA-256 hash) to a site, replacing any previous
 * one. Updates both the site config and the reverse index, and drops the old
 * reverse entry so the previous token stops working immediately.
 */
export async function setReadToken(redis: Redis, siteId: string, tokenHash: string): Promise<void> {
  const previous = await redis.hget(configKey(siteId), "readTokenHash");
  const pipeline = redis.pipeline();
  if (previous && previous !== tokenHash) pipeline.del(tokenKey(previous));
  pipeline.hset(configKey(siteId), { readTokenHash: tokenHash });
  pipeline.set(tokenKey(tokenHash), siteId);
  await pipeline.exec();
}

/** Resolves a hashed read token to the siteId it grants access to, or null. */
export async function resolveTokenSite(redis: Redis, tokenHash: string): Promise<string | null> {
  return redis.get(tokenKey(tokenHash));
}

/** True only for a site that is both registered and active. */
export async function isRegistered(redis: Redis, siteId: string): Promise<boolean> {
  const active = await redis.hget(configKey(siteId), "active");
  return active === "1";
}

/**
 * Updates a registered site's allowed origins without touching its read token.
 * Returns false if the site was never registered.
 */
export async function updateAllowedOrigins(
  redis: Redis,
  siteId: string,
  allowedOrigins: string[],
): Promise<boolean> {
  if (!(await isRegistered(redis, siteId))) return false;
  await redis.hset(configKey(siteId), { allowedOrigins: JSON.stringify(allowedOrigins) });
  return true;
}

/** All registered site configs, ordered by siteId. */
export async function listSites(redis: Redis): Promise<SiteConfig[]> {
  const ids = (await redis.smembers(REGISTRY_SET)).sort();
  const configs = await Promise.all(ids.map((id) => getSiteConfig(redis, id)));
  return configs.filter((c): c is SiteConfig => c !== null);
}

/** Removes a site from the registry, invalidating its read token. Returns true if it existed. */
export async function removeSite(redis: Redis, siteId: string): Promise<boolean> {
  const tokenHash = await redis.hget(configKey(siteId), "readTokenHash");
  const pipeline = redis.pipeline();
  pipeline.srem(REGISTRY_SET, siteId);
  pipeline.del(configKey(siteId));
  if (tokenHash) pipeline.del(tokenKey(tokenHash));
  const results = (await pipeline.exec()) as Array<[Error | null, number]>;
  const configDeleted = results[1]?.[1] ?? 0;
  return configDeleted > 0;
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
