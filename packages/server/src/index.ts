import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { getDailySalt } from "./salt.js";
import { visitorHash } from "./hash.js";
import { recordHit, getStats } from "./stats.js";

const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });

const app = Fastify({
  logger: true,
  trustProxy: config.trustProxy,
});

await app.register(cors, {
  origin: config.allowedOrigins === "*" ? true : config.allowedOrigins.split(","),
  methods: ["GET", "POST"],
});

interface CollectBody {
  siteId?: string;
  path?: string;
  referrer?: string;
}

const SITE_ID_RE = /^[a-zA-Z0-9._-]{1,64}$/;

app.post<{ Body: CollectBody }>("/collect", async (req, reply) => {
  const { siteId, path, referrer } = req.body ?? {};

  if (!siteId || !SITE_ID_RE.test(siteId)) {
    return reply.code(400).send({ error: "invalid siteId" });
  }
  if (!path || typeof path !== "string" || path.length > 512) {
    return reply.code(400).send({ error: "invalid path" });
  }

  const now = new Date();
  const salt = await getDailySalt(redis, now);
  // req.ip honors X-Forwarded-For only when trustProxy is enabled.
  const hash = visitorHash(req.ip, req.headers["user-agent"] ?? "", salt, siteId);

  await recordHit(redis, {
    siteId,
    visitorHash: hash,
    path: normalizePath(path),
    referrer: normalizeReferrer(referrer),
    day: now.toISOString().slice(0, 10),
  });

  // 204 keeps the beacon response as small as possible.
  return reply.code(204).send();
});

app.get<{ Params: { siteId: string }; Querystring: { range?: string } }>(
  "/stats/:siteId",
  async (req, reply) => {
    const { siteId } = req.params;
    if (!SITE_ID_RE.test(siteId)) {
      return reply.code(400).send({ error: "invalid siteId" });
    }
    const range = Math.min(Math.max(Number(req.query.range ?? 30), 1), config.retentionDays);
    return getStats(redis, siteId, range);
  },
);

app.get("/health", async () => ({ status: "ok" }));

// Serve the built snippet (and dashboard, if bundled) from ../public in production.
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
if (existsSync(publicDir)) {
  await app.register(fastifyStatic, { root: publicDir });
}

/** Strips query string and fragment; analytics only needs the path. */
function normalizePath(path: string): string {
  const cut = path.split(/[?#]/)[0] || "/";
  return cut.startsWith("/") ? cut : `/${cut}`;
}

/** Reduces referrer to its hostname to avoid storing full external URLs. */
function normalizeReferrer(referrer: string | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname || null;
  } catch {
    return null;
  }
}

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
