import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import { resolveTokenSite } from "./registry.js";

/** Access scope granted by a credential: every site, or a specific set. */
export type SiteScope = "all" | string[];

declare module "fastify" {
  interface FastifyRequest {
    /** Set by authorizeRead: which sites the presented credential may read. */
    siteScope?: SiteScope;
  }
}

/**
 * Resolves the stats access key. Secure by default: when STATS_API_KEY is not
 * set, a random key is generated and logged once at boot instead of leaving
 * the read endpoints open. Auth can only be disabled explicitly with
 * STATS_API_KEY=disabled.
 */
export function resolveStatsKey(log: { warn: (msg: string) => void; info: (msg: string) => void }): string | null {
  const configured = process.env.STATS_API_KEY;

  if (configured === "disabled") {
    log.warn("STATS_API_KEY=disabled: /stats and /live are publicly readable");
    return null;
  }
  if (configured) return configured;

  const generated = randomBytes(24).toString("base64url");
  log.info(`STATS_API_KEY not set, generated one for this run: ${generated}`);
  log.info("Set STATS_API_KEY explicitly to keep a stable key across restarts");
  return generated;
}

/**
 * Fastify preHandler for admin routes: requires the global STATS_API_KEY.
 * When the key is disabled (null) the whole instance is unauthenticated by the
 * operator's explicit choice, so admin routes are open too.
 */
export function requireStatsKey(key: string | null) {
  return (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    if (key === null) return done();
    if (safeEqual(bearerToken(req), key)) return done();
    reply.code(401).send({ error: "missing or invalid access key" });
  };
}

/** SHA-256 of a read token; only the hash is ever stored or looked up. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Resolves the presented bearer credential to a read scope, or null if it is
 * not recognized. Pure except for the injected `lookup`, so the decision logic
 * is unit-testable without Fastify or Redis.
 *
 * - adminKey disabled (null) → everything is public.
 * - matches the admin key → full access ("all").
 * - matches a site's read token → access to just that site.
 */
export async function resolveScope(
  presented: string,
  adminKey: string | null,
  lookup: (tokenHash: string) => Promise<string | null>,
): Promise<SiteScope | null> {
  if (adminKey === null) return "all";
  if (presented === "") return null;
  if (safeEqual(presented, adminKey)) return "all";

  const siteId = await lookup(hashToken(presented));
  return siteId ? [siteId] : null;
}

/**
 * Fastify preHandler for read routes. Attaches the caller's scope to the
 * request and, for routes carrying a `:siteId` param, rejects (403) a token
 * that is not authorized for that site.
 */
export function authorizeRead(redis: Redis, adminKey: string | null) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const scope = await resolveScope(bearerToken(req), adminKey, (hash) =>
      resolveTokenSite(redis, hash),
    );
    if (scope === null) {
      return reply.code(401).send({ error: "missing or invalid access key" });
    }
    req.siteScope = scope;

    const siteId = (req.params as { siteId?: string } | undefined)?.siteId;
    if (siteId && scope !== "all" && !scope.includes(siteId)) {
      return reply.code(403).send({ error: "token not authorized for this site" });
    }
  };
}

/** Extracts the bearer token from the Authorization header, or "" if absent. */
function bearerToken(req: FastifyRequest): string {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

/** Constant-time comparison; length mismatch handled without early return. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare b against itself to keep timing independent of the mismatch.
    timingSafeEqual(bufB, bufB);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
