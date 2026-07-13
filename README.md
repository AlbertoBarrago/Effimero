# Margin

Privacy-first web analytics — no cookies, no localStorage, no fingerprinting, no consent banner needed.

## How it works

Unique visitors are counted with a **daily rotating salted hash**:

```
visitorHash = SHA-256(IP | User-Agent | dailySalt | siteId)
```

- The salt is random, generated once per UTC day, kept only in Redis, and never logged. When it rotates, yesterday's hashes become uncorrelatable with today's — cross-day tracking is impossible **by construction**, not by policy.
- The raw IP is used only in memory to compute the hash and is never stored.
- Hashes are fed into a Redis **HyperLogLog**, so not even the hash itself is stored verbatim — only a probabilistic cardinality sketch (~0.81% standard error).
- Nothing is written on the visitor's device.

### Known trade-offs (by design)

- No returning-visitor or cross-day unique metrics.
- No multi-touch attribution or session stitching.
- Visitors sharing IP + identical User-Agent within a day count as one.
- Unique counts are probabilistic (HyperLogLog).

## Quick start (self-hosted)

```sh
docker compose up -d
```

Then add the snippet to your site:

```html
<script src="https://your-host/margin.js"
        data-site="my-site"
        data-endpoint="https://your-host/collect" defer></script>
```

View stats at `GET /stats/my-site?range=30` or through the dashboard.

## Development

```sh
pnpm install
docker run -d -p 6379:6379 redis:7-alpine   # or your own Redis
pnpm --filter @margin/server dev            # API on :3000
pnpm --filter @margin/dashboard dev         # dashboard on :5173 (proxies /stats)
pnpm --filter @margin/snippet build         # builds dist/margin.js
```

## Configuration (env vars)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS origins |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy so the real client IP is read from `X-Forwarded-For` |
| `RETENTION_DAYS` | `90` | Days of aggregate stats kept in Redis |

> **Important:** if Margin runs behind nginx/Caddy/Traefik, set `TRUST_PROXY=true`, otherwise every visitor appears to come from the proxy's IP and unique counts collapse to ~1.

## Packages

- `packages/server` — Fastify ingest + stats API
- `packages/snippet` — ~1 KB browser snippet (SPA-aware, respects DNT/GPC)
- `packages/dashboard` — React dashboard (uniques/day, pageviews, top pages/referrers)

## Credits

Approach inspired by [Margin's blog post on tracking unique visitors without cookies](https://inmargin.io/blog/tracking-unique-visitors-without-cookies).
