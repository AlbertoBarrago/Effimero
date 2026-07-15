import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { Redis } from "ioredis";
import {
  collectSchema,
  statsSchema,
  liveSchema,
  healthSchema,
  sitesSchema,
  registerSiteSchema,
  listSitesSchema,
  deleteSiteSchema,
  rotateTokenSchema,
  updateSiteSchema,
} from "./schemas.js";
import { resolveStatsKey, requireStatsKey, authorizeRead, hashToken } from "./auth.js";
import { config } from "./config.js";
import { getDailySalt } from "./salt.js";
import { visitorHash } from "./hash.js";
import { recordHit, getStats, getLiveVisitors, getSites } from "./stats.js";
import {
  registerSite,
  listSites,
  removeSite,
  isRegistered,
  setReadToken,
  getSiteConfig,
  updateAllowedOrigins,
} from "./registry.js";
import { isOriginAllowed } from "./origins.js";
import { deriveDimensions } from "./enrichment.js";
import { privacyLogger } from "./logging.js";
import { normalizePath, normalizeReferrer } from "./normalization.js";

const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });

const app = Fastify({
  logger: privacyLogger,
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
      { name: "admin", description: "Site registry management (registered sites only can collect)" },
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

  // Drop silently (204, not 404) for unregistered/inactive sites or a request
  // Origin outside the site's allow-list, so the endpoint leaks nothing and
  // cannot be used to inject or enumerate stats.
  const site = await getSiteConfig(redis, siteId);
  if (!site?.active || !isOriginAllowed(req.headers.origin, site.allowedOrigins)) {
    return reply.code(204).send();
  }

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
const adminAuth = requireStatsKey(statsKey);
const readAuth = authorizeRead(redis, statsKey);

app.get<{ Params: { siteId: string }; Querystring: { range?: number } }>(
  "/stats/:siteId",
  { schema: statsSchema, preHandler: readAuth },
  async (req) => {
    const range = Math.min(Math.max(Number(req.query.range ?? 30), 1), config.retentionDays);
    return getStats(redis, req.params.siteId, range);
  },
);

app.get<{ Params: { siteId: string } }>(
  "/live/:siteId",
  { schema: liveSchema, preHandler: readAuth },
  async (req) => {
    return { live: await getLiveVisitors(redis, req.params.siteId) };
  },
);

app.get("/sites", { schema: sitesSchema, preHandler: readAuth }, async (req) => {
  const sites = await getSites(redis);
  // A site-scoped token only sees its own site; the admin key sees all.
  const scope = req.siteScope;
  const visible = scope === "all" || scope === undefined ? sites : sites.filter((s) => scope.includes(s));
  return { sites: visible };
});

// Site registry management. Requires the admin key (STATS_API_KEY); a site's
// own read token cannot manage the registry.
app.post<{ Body: { siteId: string; allowedOrigins?: string[] } }>(
  "/admin/sites",
  { schema: registerSiteSchema, preHandler: adminAuth },
  async (req, reply) => {
    const config = await registerSite(
      redis,
      req.body.siteId,
      req.body.allowedOrigins ?? [],
      new Date().toISOString(),
    );
    const readToken = randomBytes(24).toString("base64url");
    await setReadToken(redis, config.siteId, hashToken(readToken));
    // readToken is returned once here and never stored in plaintext.
    return reply.code(201).send({ ...config, readToken });
  },
);

app.get("/admin/sites", { schema: listSitesSchema, preHandler: adminAuth }, async () => {
  return { sites: await listSites(redis) };
});

app.delete<{ Params: { siteId: string } }>(
  "/admin/sites/:siteId",
  { schema: deleteSiteSchema, preHandler: adminAuth },
  async (req, reply) => {
    const removed = await removeSite(redis, req.params.siteId);
    if (!removed) return reply.code(404).send({ error: "site not registered" });
    return reply.code(204).send();
  },
);

// Update a site's allowed origins without rotating its read token.
app.patch<{ Params: { siteId: string }; Body: { allowedOrigins: string[] } }>(
  "/admin/sites/:siteId",
  { schema: updateSiteSchema, preHandler: adminAuth },
  async (req, reply) => {
    const updated = await updateAllowedOrigins(redis, req.params.siteId, req.body.allowedOrigins);
    if (!updated) return reply.code(404).send({ error: "site not registered" });
    const config = await getSiteConfig(redis, req.params.siteId);
    return reply.code(200).send(config);
  },
);

// Rotate a site's read token: issues a new one and invalidates the previous.
app.post<{ Params: { siteId: string } }>(
  "/admin/sites/:siteId/token",
  { schema: rotateTokenSchema, preHandler: adminAuth },
  async (req, reply) => {
    if (!(await isRegistered(redis, req.params.siteId))) {
      return reply.code(404).send({ error: "site not registered" });
    }
    const readToken = randomBytes(24).toString("base64url");
    await setReadToken(redis, req.params.siteId, hashToken(readToken));
    return reply.code(200).send({ siteId: req.params.siteId, readToken });
  },
);

app.get("/health", { schema: healthSchema }, async () => {
  const redisOk = await redis.ping().then(() => true).catch(() => false);
  return { status: redisOk ? "ok" : "degraded", redis: redisOk };
});

// Serve the built snippet (and dashboard, if bundled) from ../public in production.
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
if (existsSync(publicDir)) {
  await app.register(fastifyStatic, { root: publicDir });
}

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
