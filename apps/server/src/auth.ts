import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

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

/** Fastify preHandler enforcing `Authorization: Bearer <key>` on read routes. */
export function requireStatsKey(key: string | null) {
  return (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    if (key === null) return done();

    const header = req.headers.authorization ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (safeEqual(presented, key)) return done();

    reply.code(401).send({ error: "missing or invalid access key" });
  };
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
