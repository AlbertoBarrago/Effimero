import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { Redis } from "ioredis";
import { collectSchema, statsSchema, liveSchema, healthSchema, sitesSchema } from "./schemas.js";
import { resolveStatsKey, requireStatsKey } from "./auth.js";
import { config } from "./config.js";
import { getDailySalt } from "./salt.js";
import { visitorHash } from "./hash.js";
import { recordHit, getStats, getLiveVisitors, getSites } from "./stats.js";
import { deriveDimensions } from "./enrichment.js";

const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });

const app = Fastify({
  logger: true,
  trustProxy: config.trustProxy,
});

await app.register(cors, {
  origin: config.allowedOrigins === "*" ? true : config.allowedOrigins.split(","),
  methods: ["GET", "POST"],
});

// The snippet posts JSON as text/plain: JSON content types force a CORS
// preflight that browsers refuse to pair with sendBeacon, dropping hits.
app.addContentTypeParser(["text/plain"], { parseAs: "string" }, (_req, body, done) => {
  try {
    done(null, JSON.parse(body as string));
  } catch {
    done(null, undefined);
  }
});

await app.register(swagger, {
  openapi: {
    info: {
      title: "Effimero API",
      description:
        "Privacy-first web analytics. Visitor identity is a daily-salted hash " +
        "computed in memory and never stored; only aggregate counters and " +
        "HyperLogLog sketches persist.",
      version: "0.1.0",
      license: { name: "AGPL-3.0-only", url: "https://www.gnu.org/licenses/agpl-3.0.html" },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "The STATS_API_KEY value" },
      },
    },
    tags: [
      { name: "ingest", description: "Beacon endpoint used by the snippet" },
      { name: "stats", description: "Aggregate read endpoints for dashboards" },
      { name: "system", description: "Health and diagnostics" },
    ],
  },
});
await app.register(swaggerUi, { routePrefix: "/docs/api" });

interface CollectBody {
  siteId: string;
  path: string;
  referrer?: string;
}

app.post<{ Body: CollectBody }>("/collect", { schema: collectSchema }, async (req, reply) => {
  const { siteId, path, referrer } = req.body;

  const now = new Date();
  const salt = await getDailySalt(redis, now);
  const userAgent = req.headers["user-agent"] ?? "";
  // req.ip honors X-Forwarded-For only when trustProxy is enabled.
  const hash = visitorHash(req.ip, userAgent, salt, siteId);

  await recordHit(redis, {
    siteId,
    visitorHash: hash,
    path: normalizePath(path),
    referrer: normalizeReferrer(referrer),
    day: now.toISOString().slice(0, 10),
    hour: now.getUTCHours(),
    dimensions: deriveDimensions(req.ip, userAgent, req.headers["accept-language"]),
  });

  // 204 keeps the beacon response as small as possible.
  return reply.code(204).send();
});

const statsKey = resolveStatsKey(app.log);
const statsAuth = requireStatsKey(statsKey);

app.get<{ Params: { siteId: string }; Querystring: { range?: number } }>(
  "/stats/:siteId",
  { schema: statsSchema, preHandler: statsAuth },
  async (req) => {
    const range = Math.min(Math.max(Number(req.query.range ?? 30), 1), config.retentionDays);
    return getStats(redis, req.params.siteId, range);
  },
);

app.get<{ Params: { siteId: string } }>(
  "/live/:siteId",
  { schema: liveSchema, preHandler: statsAuth },
  async (req) => {
    return { live: await getLiveVisitors(redis, req.params.siteId) };
  },
);

app.get("/sites", { schema: sitesSchema, preHandler: statsAuth }, async () => {
  return { sites: await getSites(redis) };
});

app.get("/health", { schema: healthSchema }, async () => {
  const redisOk = await redis.ping().then(() => true).catch(() => false);
  return { status: redisOk ? "ok" : "degraded", redis: redisOk };
});

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
